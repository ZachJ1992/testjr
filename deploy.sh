#!/bin/bash

# 一键部署到阿里云 ECS 脚本
# 使用方法: ./deploy.sh

set -euo pipefail

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 加载配置文件
if [ ! -f "deploy.config" ]; then
    echo -e "${RED}错误: 未找到 deploy.config 配置文件${NC}"
    echo "请复制 deploy.config.example 为 deploy.config 并填写配置信息"
    exit 1
fi

source deploy.config

# 检查必要的配置
if [ -z "$ECS_HOST" ] || [ -z "$ECS_USER" ] || [ -z "$ECS_DEPLOY_PATH" ]; then
    echo -e "${RED}错误: deploy.config 中缺少必要配置${NC}"
    exit 1
fi

echo -e "${GREEN}开始部署到阿里云 ECS...${NC}"

# 1. 清理旧的构建文件
echo -e "${YELLOW}[1/7] 清理旧的构建文件...${NC}"
rm -rf dist
rm -rf frontend/dist
rm -rf backend/dist
rm -rf "deploy-package"
rm -rf deploy-package.tar.gz

# 2. 安装依赖
echo -e "${YELLOW}[2/7] 安装依赖...${NC}"
npm install

# 3. 构建前端
echo -e "${YELLOW}[3/7] 构建前端...${NC}"
npm run build:frontend

# 4. 构建后端
echo -e "${YELLOW}[4/7] 构建后端...${NC}"
npm run build:backend

# 5. 创建部署包
echo -e "${YELLOW}[5/7] 创建部署包...${NC}"
DEPLOY_DIR="deploy-package"
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"

# 复制必要文件
mkdir -p "$DEPLOY_DIR/backend/dist"
mkdir -p "$DEPLOY_DIR/frontend/dist"
cp -r backend/dist/* "$DEPLOY_DIR/backend/dist/"
cp -r frontend/dist/* "$DEPLOY_DIR/frontend/dist/"
cp -r shared "$DEPLOY_DIR/shared/"
cp backend/package.json "$DEPLOY_DIR/backend/"
cp package.json "$DEPLOY_DIR/"
cp package-lock.json "$DEPLOY_DIR/" 2>/dev/null || true

# 不打包本地 backend/.env，避免覆盖线上数据库配置
# 线上环境变量应由服务器本地维护（/opt/testapp/app/backend/.env）

# 复制 PM2 配置文件
if [ -f "ecosystem.config.js" ]; then
    cp ecosystem.config.js "$DEPLOY_DIR/"
fi

# 创建启动脚本
cat > "$DEPLOY_DIR/start.sh" << 'EOF'
#!/bin/bash
set -euo pipefail

APP_NAME="testapp-backend"
HEALTH_URL="http://127.0.0.1:3001/api/health"

cd "$(dirname "$0")"

if [ ! -f "backend/.env" ]; then
    echo "错误: 缺少 backend/.env，拒绝启动"
    exit 1
fi

if [ ! -f "backend/dist/backend/src/index.js" ]; then
    echo "错误: 缺少后端构建产物 backend/dist/backend/src/index.js"
    exit 1
fi

mkdir -p backend/logs
mkdir -p backend/uploads

echo "安装生产依赖..."
npm install --production

echo "启动服务..."
if command -v pm2 >/dev/null 2>&1; then
    pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
    pm2 start ecosystem.config.js --only "$APP_NAME"
    pm2 save
else
    echo "未安装 PM2，使用 node 直接启动..."
    export NODE_ENV=production
    node backend/dist/backend/src/index.js
fi

echo "等待服务就绪..."
for i in $(seq 1 20); do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
        echo "服务健康检查通过"
        exit 0
    fi
    sleep 2
done

echo "错误: 服务健康检查失败"
exit 1
EOF

chmod +x "$DEPLOY_DIR/start.sh"

# 创建部署包
tar -czf deploy-package.tar.gz "$DEPLOY_DIR/"
echo -e "${GREEN}部署包创建完成: deploy-package.tar.gz${NC}"

# 6. 上传到 ECS
echo -e "${YELLOW}[6/7] 上传到 ECS ($ECS_HOST)...${NC}"

# 确定 SSH 选项（使用数组避免空格问题）
SSH_OPTS=()
if [ -n "${ECS_SSH_KEY:-}" ]; then
    SSH_OPTS+=(-i "$ECS_SSH_KEY")
fi
# 如果端口不是默认的 22，才添加 -p 选项
if [ -n "${ECS_SSH_PORT:-}" ] && [ "${ECS_SSH_PORT:-}" != "22" ]; then
    SSH_OPTS+=(-p "$ECS_SSH_PORT")
fi

run_ssh() {
    if [ "${#SSH_OPTS[@]}" -gt 0 ]; then
        ssh "${SSH_OPTS[@]}" "$@"
    else
        ssh "$@"
    fi
}

run_scp() {
    if [ "${#SSH_OPTS[@]}" -gt 0 ]; then
        scp "${SSH_OPTS[@]}" "$@"
    else
        scp "$@"
    fi
}

REMOTE_TMP_PACKAGE="/tmp/testapp-deploy-package.tar.gz"

# 创建远程目录
run_ssh "$ECS_USER@$ECS_HOST" "mkdir -p \"$ECS_DEPLOY_PATH\""

# 上传部署包到远端固定临时路径，避免 scp 直接拼接动态目标目录带来的转义歧义
run_scp deploy-package.tar.gz "$ECS_USER@$ECS_HOST:$REMOTE_TMP_PACKAGE"

# 7. 在 ECS 上部署
echo -e "${YELLOW}[7/7] 在 ECS 上部署...${NC}"

run_ssh "$ECS_USER@$ECS_HOST" bash -s -- "$ECS_DEPLOY_PATH" << 'EOF'
set -euo pipefail

ECS_DEPLOY_PATH="$1"
BACKUP_DIR=""
RUNTIME_DIR=".runtime-keep"
REMOTE_PACKAGE_TMP="/tmp/testapp-deploy-package.tar.gz"

on_error() {
    echo "部署失败，请手动检查远端状态。"
    if [ -n "$BACKUP_DIR" ]; then
        echo "当前备份目录: $BACKUP_DIR"
        echo "手动回滚命令:"
        echo "cd \"$ECS_DEPLOY_PATH\" && rm -rf app && mv \"$BACKUP_DIR\" app"
    fi
}

trap on_error ERR

cd "$ECS_DEPLOY_PATH"

mv "$REMOTE_PACKAGE_TMP" ./deploy-package.tar.gz

rm -rf "$RUNTIME_DIR"
mkdir -p "$RUNTIME_DIR"

# 备份旧版本（如果存在）
if [ -d "app" ]; then
    echo "保存运行时文件..."
    if [ -f "app/backend/.env" ]; then
        cp "app/backend/.env" "$RUNTIME_DIR/backend.env"
    fi
    if [ -d "app/backend/uploads" ]; then
        mkdir -p "$RUNTIME_DIR/uploads"
        cp -R app/backend/uploads/. "$RUNTIME_DIR/uploads/"
    fi

    echo "备份旧版本..."
    BACKUP_DIR="backup_\$(date +%Y%m%d_%H%M%S)"
    mv app "\$BACKUP_DIR"
    # 只保留最近 3 个备份
    ls -dt backup_* | tail -n +4 | xargs rm -rf 2>/dev/null || true
fi

# 解压新版本
echo "解压部署包..."
rm -rf deploy-package
tar -xzf deploy-package.tar.gz
mv deploy-package app

# 恢复运行时文件
echo "恢复运行时文件..."
mkdir -p app/backend
mkdir -p app/backend/uploads
mkdir -p app/backend/logs

if [ -f "$RUNTIME_DIR/backend.env" ]; then
    cp "$RUNTIME_DIR/backend.env" app/backend/.env
fi
if [ -d "$RUNTIME_DIR/uploads" ]; then
    cp -R "$RUNTIME_DIR/uploads/." app/backend/uploads/
fi

# 进入应用目录并启动
cd app
chmod +x start.sh
./start.sh

rm -rf "../$RUNTIME_DIR"
rm -f ../deploy-package.tar.gz
trap - ERR

echo "部署完成！"
EOF

# 清理本地临时文件
echo -e "${YELLOW}清理本地临时文件...${NC}"
rm -rf "$DEPLOY_DIR"
rm -f deploy-package.tar.gz

echo -e "${GREEN}✅ 部署成功！${NC}"
echo -e "${GREEN}应用已部署到: $ECS_HOST:$ECS_DEPLOY_PATH/app${NC}"
