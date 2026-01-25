# 一键部署到阿里云 ECS

## 部署方式

本项目支持两种部署方式：
1. **Docker 部署（推荐）** - 解决 glibc 版本兼容问题，适用于 CentOS 7
2. **传统部署** - 直接在服务器上运行 Node.js

---

## 🐳 Docker 部署（推荐）

### 前置要求

1. **本地环境**
   - Docker Desktop 或 Docker Engine
   - docker-compose（或 Docker Compose V2）
   - SSH 客户端

2. **ECS 服务器环境**
   - Docker Engine
   - docker-compose（或 Docker Compose V2）

### 快速开始

#### 1. 配置部署信息

```bash
# 复制配置文件模板
cp deploy.config.example deploy.config

# 编辑配置文件，填写你的 ECS 信息
vim deploy.config
```

配置文件示例：
```bash
ECS_HOST="47.xxx.xxx.xxx"
ECS_USER="root"
ECS_SSH_PORT="22"
ECS_SSH_KEY="/path/to/your/private/key"
ECS_DEPLOY_PATH="/opt/testapp"
```

#### 2. 在 ECS 上安装 Docker

```bash
# SSH 登录到 ECS
ssh root@your-ecs-ip

# CentOS 7 安装 Docker
yum install -y yum-utils
yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
yum install -y docker-ce docker-ce-cli containerd.io

# 启动 Docker
systemctl start docker
systemctl enable docker

# 安装 docker-compose
curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# 或者使用 Docker Compose V2（推荐）
# Docker Compose V2 已包含在 Docker Desktop 中，或通过以下方式安装：
# yum install -y docker-compose-plugin
```

#### 3. 配置环境变量

在本地创建或编辑 `backend/.env` 文件：

```bash
# 数据库配置
DB_HOST=rm-j6c7eon23tb4755xzlo.mysql.cnhk.rds.aliyuncs.com
DB_PORT=3306
DB_USER=tms
DB_PASSWORD=Wsdf345SDFG!@
DB_NAME=testapp

# JWT 配置
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# 默认管理员密码
DEFAULT_ADMIN_PASSWORD=admin123

# 服务端口
PORT=3001

# AI Agent 配置（可选）
DASHSCOPE_API_KEY=your-api-key
```

#### 4. 执行 Docker 部署

```bash
# 给部署脚本添加执行权限
chmod +x deploy-docker.sh

# 执行部署
./deploy-docker.sh
```

### Docker 部署流程

脚本会自动执行以下步骤：

1. ✅ 构建 Docker 镜像（包含前端和后端）
2. ✅ 导出镜像为 tar 文件
3. ✅ 上传到 ECS
4. ✅ 在 ECS 上加载镜像并启动容器

### Docker 管理命令

```bash
# SSH 登录到 ECS
ssh root@your-ecs-ip
cd /opt/testapp

# 查看容器状态
docker-compose ps
# 或
docker compose ps

# 查看日志
docker-compose logs -f
# 或
docker compose logs -f

# 重启容器
docker-compose restart
# 或
docker compose restart

# 停止容器
docker-compose down
# 或
docker compose down

# 进入容器
docker exec -it testapp sh

# 查看容器资源使用
docker stats testapp
```

### Docker 部署优势

- ✅ **解决 glibc 版本问题**：使用 Node.js 20 Alpine 镜像，不依赖系统 glibc
- ✅ **环境一致性**：开发、测试、生产环境完全一致
- ✅ **易于回滚**：只需切换镜像版本
- ✅ **资源隔离**：应用运行在独立容器中
- ✅ **简化部署**：无需在服务器上安装 Node.js、npm 等

---

## 📦 传统部署（不推荐，仅作参考）

### 前置要求

1. **本地环境**
   - Node.js >= 18.0.0
   - npm
   - SSH 客户端

2. **ECS 服务器环境**
   - Node.js >= 18.0.0（CentOS 7 需要使用 Node.js 16 或使用 Docker）
   - npm
   - PM2（推荐，用于进程管理）
   - Nginx（可选，用于反向代理）

### 快速开始

#### 1. 配置部署信息

```bash
# 复制配置文件模板
cp deploy.config.example deploy.config

# 编辑配置文件，填写你的 ECS 信息
vim deploy.config
```

#### 2. 配置 SSH 免密登录（推荐）

```bash
# 生成 SSH 密钥对（如果还没有）
ssh-keygen -t rsa -b 4096

# 将公钥复制到 ECS
ssh-copy-id -i ~/.ssh/id_rsa.pub root@your-ecs-ip
```

#### 3. 在 ECS 上安装必要软件

**⚠️ 注意：CentOS 7 的 glibc 版本较低，建议使用 Docker 部署**

```bash
# SSH 登录到 ECS
ssh root@your-ecs-ip

# 安装 Node.js（CentOS 7 需要使用 Node.js 16）
# 方法1: 使用 NVM（推荐）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 16
nvm use 16
nvm alias default 16

# 方法2: 使用预编译二进制文件
cd /opt
wget -q https://nodejs.org/dist/v16.20.2/node-v16.20.2-linux-x64.tar.xz
tar -xf node-v16.20.2-linux-x64.tar.xz
mv node-v16.20.2-linux-x64 nodejs
ln -sf /opt/nodejs/bin/node /usr/local/bin/node
ln -sf /opt/nodejs/bin/npm /usr/local/bin/npm

# 安装 PM2
npm install -g pm2

# 安装 Nginx（可选）
yum install -y nginx
```

#### 4. 执行部署

```bash
# 给部署脚本添加执行权限
chmod +x deploy.sh

# 执行部署
./deploy.sh
```

### 传统部署流程

脚本会自动执行以下步骤：

1. ✅ 清理旧的构建文件
2. ✅ 安装依赖
3. ✅ 构建前端
4. ✅ 构建后端
5. ✅ 创建部署包
6. ✅ 上传到 ECS
7. ✅ 在 ECS 上解压并启动服务

---

## 配置 Nginx（可选）

如果需要使用 Nginx 作为反向代理：

```bash
# 在 ECS 上
cp nginx.conf.example /etc/nginx/sites-available/testapp
# 编辑配置文件，修改域名和路径
vim /etc/nginx/sites-available/testapp

# 创建软链接
ln -s /etc/nginx/sites-available/testapp /etc/nginx/sites-enabled/

# 测试配置
nginx -t

# 重启 Nginx
systemctl restart nginx
```

## 环境变量配置

在 ECS 上创建或编辑 `backend/.env` 文件：

```bash
# 数据库配置
DB_HOST=rm-j6c7eon23tb4755xzlo.mysql.cnhk.rds.aliyuncs.com
DB_PORT=3306
DB_USER=tms
DB_PASSWORD=Wsdf345SDFG!@
DB_NAME=testapp

# JWT 配置
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# 默认管理员密码
DEFAULT_ADMIN_PASSWORD=admin123

# 服务端口
PORT=3001

# AI Agent 配置（可选）
DASHSCOPE_API_KEY=your-api-key
```

## 故障排查

### 1. Docker 部署问题

```bash
# 查看容器日志
docker-compose logs -f

# 检查容器状态
docker-compose ps

# 检查镜像是否存在
docker images | grep testapp

# 重新构建镜像
docker-compose build --no-cache
docker-compose up -d
```

### 2. 部署失败：SSH 连接失败

- 检查 ECS 的 IP 和端口是否正确
- 检查防火墙是否开放 SSH 端口
- 检查 SSH 密钥路径是否正确

### 3. 应用无法启动

**Docker 部署：**
```bash
docker-compose logs -f
```

**传统部署：**
```bash
# 查看 PM2 日志
pm2 logs testapp-backend

# 检查端口是否被占用
netstat -tlnp | grep 3001
```

### 4. 数据库连接失败

- 检查 ECS 安全组是否允许访问 RDS
- 检查 RDS 白名单是否包含 ECS IP
- 检查数据库配置是否正确

### 5. 前端资源加载失败

- 检查 Nginx 配置是否正确（如果使用 Nginx）
- 检查前端构建文件是否存在
- 检查文件权限

## 回滚

### Docker 部署回滚

```bash
# SSH 登录到 ECS
ssh root@your-ecs-ip
cd /opt/testapp

# 停止当前容器
docker-compose down

# 加载旧镜像（如果有备份）
docker load < testapp-image-backup.tar.gz

# 启动旧版本
docker-compose up -d
```

### 传统部署回滚

```bash
# SSH 登录到 ECS
ssh root@your-ecs-ip
cd /opt/testapp

# 查看备份目录
ls -la backup_*

# 回滚到指定备份
mv app app_current
mv backup_20240101_120000 app
cd app
./start.sh
```

## 注意事项

1. **推荐使用 Docker 部署**，特别是 CentOS 7 系统
2. **数据库连接**：确保 ECS 可以访问阿里云 RDS
3. **文件权限**：确保应用目录有正确的读写权限
4. **端口占用**：确保 3001 端口未被其他程序占用
5. **防火墙**：确保 ECS 安全组开放了必要的端口（80, 443, 3001）
6. **Docker 镜像大小**：首次构建可能需要较长时间，请耐心等待

## 自动化部署（可选）

可以配置 Git Hooks 或 CI/CD 实现自动部署：

```bash
# 在 .git/hooks/post-receive 中添加
#!/bin/bash
./deploy-docker.sh
```

或者使用 GitHub Actions、GitLab CI 等 CI/CD 工具。
