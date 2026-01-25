#!/bin/bash

# 一键部署到阿里云 ECS 脚本
# 使用方法: ./deploy.sh

set -e  # 遇到错误立即退出

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
rm -rf $DEPLOY_DIR
mkdir -p $DEPLOY_DIR

# 复制必要文件
cp -r backend/dist $DEPLOY_DIR/backend/
cp -r frontend/dist $DEPLOY_DIR/frontend/
cp backend/package.json $DEPLOY_DIR/backend/
cp package.json $DEPLOY_DIR/
cp package-lock.json $DEPLOY_DIR/ 2>/dev/null || true

# 复制配置文件（如果存在）
if [ -f "backend/.env" ]; then
    cp backend/.env $DEPLOY_DIR/backend/
fi

# 复制 PM2 配置文件
if [ -f "ecosystem.config.js" ]; then
    cp ecosystem.config.js $DEPLOY_DIR/
fi

# 创建启动脚本
cat > $DEPLOY_DIR/start.sh << 'EOF'
#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "安装生产依赖..."
npm install --production

cd backend
echo "安装后端依赖..."
npm install --production

echo "启动服务..."
if command -v pm2 &> /dev/null; then
    cd ..
    pm2 restart ecosystem.config.js || pm2 start ecosystem.config.js
    pm2 save
else
    echo "未安装 PM2，使用 node 直接启动..."
    export NODE_ENV=production
    node dist/index.js
fi
EOF

chmod +x $DEPLOY_DIR/start.sh

# 创建部署包
tar -czf deploy-package.tar.gz $DEPLOY_DIR/
echo -e "${GREEN}部署包创建完成: deploy-package.tar.gz${NC}"

# 6. 上传到 ECS
echo -e "${YELLOW}[6/7] 上传到 ECS ($ECS_HOST)...${NC}"

# 确定 SSH 选项（使用数组避免空格问题）
SSH_OPTS=()
if [ -n "$ECS_SSH_KEY" ]; then
    SSH_OPTS+=(-i "$ECS_SSH_KEY")
fi
# 如果端口不是默认的 22，才添加 -p 选项
if [ -n "$ECS_SSH_PORT" ] && [ "$ECS_SSH_PORT" != "22" ]; then
    SSH_OPTS+=(-p "$ECS_SSH_PORT")
fi

# 创建远程目录
ssh "${SSH_OPTS[@]}" $ECS_USER@$ECS_HOST "mkdir -p $ECS_DEPLOY_PATH"

# 上传部署包
scp "${SSH_OPTS[@]}" deploy-package.tar.gz $ECS_USER@$ECS_HOST:$ECS_DEPLOY_PATH/

# 7. 在 ECS 上部署
echo -e "${YELLOW}[7/7] 在 ECS 上部署...${NC}"

ssh "${SSH_OPTS[@]}" $ECS_USER@$ECS_HOST << EOF
set -e
cd $ECS_DEPLOY_PATH

# 备份旧版本（如果存在）
if [ -d "app" ]; then
    echo "备份旧版本..."
    BACKUP_DIR="backup_\$(date +%Y%m%d_%H%M%S)"
    mv app "\$BACKUP_DIR"
    # 只保留最近 3 个备份
    ls -dt backup_* | tail -n +4 | xargs rm -rf 2>/dev/null || true
fi

# 解压新版本
echo "解压部署包..."
tar -xzf deploy-package.tar.gz
mv deploy-package app

# 进入应用目录并启动
cd app
chmod +x start.sh
./start.sh

echo "部署完成！"
EOF

# 清理本地临时文件
echo -e "${YELLOW}清理本地临时文件...${NC}"
rm -rf $DEPLOY_DIR
rm -f deploy-package.tar.gz

echo -e "${GREEN}✅ 部署成功！${NC}"
echo -e "${GREEN}应用已部署到: $ECS_HOST:$ECS_DEPLOY_PATH/app${NC}"
