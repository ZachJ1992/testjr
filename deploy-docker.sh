#!/bin/bash

# Docker 一键部署到阿里云 ECS 脚本（在服务器上构建镜像）

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

echo -e "${GREEN}开始 Docker 部署到阿里云 ECS（在服务器上构建）...${NC}"

# 确定 SSH 选项（使用数组避免空格问题）
SSH_OPTS=()
if [ -n "$ECS_SSH_KEY" ]; then
    SSH_OPTS+=(-i "$ECS_SSH_KEY")
fi
# 如果端口不是默认的 22，才添加 -p 选项
if [ -n "$ECS_SSH_PORT" ] && [ "$ECS_SSH_PORT" != "22" ]; then
    SSH_OPTS+=(-p "$ECS_SSH_PORT")
fi

# 1. 创建源代码包
echo -e "${YELLOW}[1/4] 准备源代码包...${NC}"
SOURCE_PACKAGE="testapp-source.tar.gz"
rm -f $SOURCE_PACKAGE

# 使用 tar 创建源代码包，排除不需要的文件
tar --exclude='node_modules' \
    --exclude='dist' \
    --exclude='build' \
    --exclude='.git' \
    --exclude='.idea' \
    --exclude='.vscode' \
    --exclude='*.log' \
    --exclude='.DS_Store' \
    --exclude='deploy-package' \
    --exclude='deploy-package.tar.gz' \
    --exclude='testapp-image.tar.gz' \
    --exclude='testapp-source.tar.gz' \
    --exclude='coverage' \
    -czf $SOURCE_PACKAGE \
    frontend/ backend/ shared/ \
    package.json package-lock.json \
    tsconfig.base.json \
    Dockerfile docker-compose.yml .dockerignore

echo -e "${GREEN}源代码包创建完成: $SOURCE_PACKAGE${NC}"

# 2. 上传源代码到 ECS
echo -e "${YELLOW}[2/4] 上传源代码到 ECS ($ECS_HOST)...${NC}"
ssh "${SSH_OPTS[@]}" $ECS_USER@$ECS_HOST "mkdir -p $ECS_DEPLOY_PATH/backend"
scp "${SSH_OPTS[@]}" $SOURCE_PACKAGE $ECS_USER@$ECS_HOST:$ECS_DEPLOY_PATH/
if [ -f "backend/.env" ]; then
    scp "${SSH_OPTS[@]}" backend/.env $ECS_USER@$ECS_HOST:$ECS_DEPLOY_PATH/backend/.env
fi

# 3. 在 ECS 上构建并部署
echo -e "${YELLOW}[3/4] 在 ECS 上构建 Docker 镜像...${NC}"

ssh "${SSH_OPTS[@]}" $ECS_USER@$ECS_HOST << EOF
set -e
cd $ECS_DEPLOY_PATH

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo "错误: 未安装 Docker，请先安装 Docker"
    exit 1
fi

# 检查 docker-compose 是否安装
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "错误: 未安装 docker-compose，请先安装 docker-compose"
    exit 1
fi

# 配置 Docker 镜像加速器（解决国内访问 Docker Hub 超时问题）
echo "配置 Docker 镜像加速器..."
DOCKER_DAEMON_JSON="/etc/docker/daemon.json"
MIRROR_URL="https://docker.m.daocloud.io"

# 检查是否需要更新镜像加速器配置
NEED_UPDATE=false
if [ ! -f "\$DOCKER_DAEMON_JSON" ]; then
    NEED_UPDATE=true
elif ! grep -q "m.daocloud.io" "\$DOCKER_DAEMON_JSON" 2>/dev/null; then
    NEED_UPDATE=true
fi

if [ "\$NEED_UPDATE" = true ]; then
    echo "配置 Docker 镜像加速器: \$MIRROR_URL"
    sudo mkdir -p /etc/docker
    # 备份现有配置
    if [ -f "\$DOCKER_DAEMON_JSON" ]; then
        sudo cp "\$DOCKER_DAEMON_JSON" "\$DOCKER_DAEMON_JSON.bak"
    fi
    # 配置 DaoCloud 镜像加速器
    sudo tee "\$DOCKER_DAEMON_JSON" > /dev/null << DOCKER_EOF
{
  "registry-mirrors": ["\$MIRROR_URL"]
}
DOCKER_EOF
    # 重启 Docker 服务使配置生效
    sudo systemctl daemon-reload
    sudo systemctl restart docker
    echo "Docker 镜像加速器配置完成，等待 Docker 服务就绪..."
    sleep 3
else
    echo "Docker 镜像加速器已配置"
fi

# 备份旧版本（如果存在）
if [ -d "source" ]; then
    echo "备份旧版本..."
    BACKUP_DIR="source_backup_\$(date +%Y%m%d_%H%M%S)"
    # 停止旧容器
    cd source
    if command -v docker-compose &> /dev/null; then
        docker-compose down 2>/dev/null || true
    else
        docker compose down 2>/dev/null || true
    fi
    cd ..
    mv source "\$BACKUP_DIR"
    # 只保留最近 2 个备份
    ls -dt source_backup_* 2>/dev/null | tail -n +3 | xargs rm -rf 2>/dev/null || true
fi

# 解压源代码
echo "解压源代码..."
mkdir -p source
tar -xzf $SOURCE_PACKAGE -C source
cd source

# 复制 .env 文件（如果存在）
if [ -f "../backend/.env" ]; then
    cp ../backend/.env backend/.env
    # 从 .env 文件加载环境变量（用于 docker-compose）
    set -a
    source backend/.env
    set +a
fi

# 设置默认值（如果环境变量未设置）
export DB_PORT=\${DB_PORT:-3306}
export JWT_SECRET=\${JWT_SECRET:-dev-secret-change-me}
export JWT_EXPIRES_IN=\${JWT_EXPIRES_IN:-7d}
export DEFAULT_ADMIN_PASSWORD=\${DEFAULT_ADMIN_PASSWORD:-admin123}

# 创建上传目录
mkdir -p backend/uploads

# 构建 Docker 镜像
echo "构建 Docker 镜像（这可能需要几分钟）..."
docker build -t testapp:latest .

# 启动新容器
echo "启动新容器..."
if command -v docker-compose &> /dev/null; then
    docker-compose up -d
else
    docker compose up -d
fi

# 查看容器状态
echo "容器状态:"
if command -v docker-compose &> /dev/null; then
    docker-compose ps
else
    docker compose ps
fi

# 清理未使用的镜像（保留最近使用的）
echo "清理未使用的镜像..."
docker image prune -f || true

echo "部署完成！"
EOF

# 4. 清理本地临时文件
echo -e "${YELLOW}[4/4] 清理本地临时文件...${NC}"
rm -f $SOURCE_PACKAGE

echo -e "${GREEN}✅ Docker 部署成功！${NC}"
echo -e "${GREEN}应用已部署到: $ECS_HOST${NC}"
echo ""
echo -e "${YELLOW}常用命令:${NC}"
echo -e "  查看日志: ${BLUE}ssh $ECS_USER@$ECS_HOST 'cd $ECS_DEPLOY_PATH/source && docker-compose logs -f'${NC}"
echo -e "  查看状态: ${BLUE}ssh $ECS_USER@$ECS_HOST 'cd $ECS_DEPLOY_PATH/source && docker-compose ps'${NC}"
echo -e "  重启容器: ${BLUE}ssh $ECS_USER@$ECS_HOST 'cd $ECS_DEPLOY_PATH/source && docker-compose restart'${NC}"
