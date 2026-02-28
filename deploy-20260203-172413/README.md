# 登途云 - 物流金融服务平台 部署指南

## 系统要求

- **Node.js**: 20.x 或更高版本（推荐 22.x）
- **MySQL**: 8.x
- **操作系统**: Linux / macOS / Windows

## 目录结构

```
deploy/
├── frontend/          # 前端静态文件（已构建）
├── backend/           # 后端源码
│   ├── src/          # TypeScript 源码
│   ├── package.json  # 依赖配置
│   └── tsconfig.json # TS 配置
├── .env.example      # 环境变量示例
├── start.sh          # Linux/macOS 启动脚本
└── README.md         # 本文件
```

## 部署步骤

### 1. 配置数据库

创建 MySQL 数据库：

```sql
CREATE DATABASE testjr_main CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2. 配置环境变量

复制并修改环境配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=testjr_main
JWT_SECRET=your_jwt_secret_key_at_least_32_chars
PORT=3001
```

### 3. 安装依赖

```bash
cd backend
npm install
```

### 4. 启动后端服务

```bash
cd backend
npx tsx src/index.ts
```

或使用 PM2 进行进程管理：

```bash
npm install -g pm2
pm2 start "npx tsx src/index.ts" --name "dengtuyun-api"
```

### 5. 配置前端

前端已构建为静态文件，可使用 Nginx 托管：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # 前端静态文件
    root /path/to/deploy/frontend;
    index index.html;
    
    # SPA 路由支持
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # API 代理
    location /api {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 默认账号

首次启动后，系统会自动创建默认管理员账号：

- **用户名**: admin
- **密码**: admin123

⚠️ 请在生产环境中立即修改默认密码！

## 常见问题

### Q: 启动时报 "EADDRINUSE" 错误
A: 端口 3001 已被占用，可以修改 `.env` 中的 PORT 配置，或停止占用该端口的进程。

### Q: 数据库连接失败
A: 检查 `.env` 中的数据库配置是否正确，确保 MySQL 服务已启动。

### Q: 前端页面空白
A: 检查 Nginx 配置中的 root 路径是否正确，确保指向 frontend 目录。

## 技术支持

北京登途云物流科技有限公司
