# 登途云项目部署指南

## 导出文件说明

| 文件 | 说明 | 大小 |
|------|------|------|
| `testjr_database_20260128.sql` | MySQL 数据库完整备份 | ~12MB |
| `testjr_project_20260128.tar.gz` | 项目代码（不含 node_modules） | ~6MB |

---

## 部署步骤

### 1. 环境要求

- **Node.js**: 22.x 或更高版本
- **MySQL**: 8.0
- **Docker**（可选，用于运行 MySQL）

### 2. 解压项目代码

```bash
tar -xzf testjr_project_20260128.tar.gz
cd testjr-main-9b793b5608664745eeffdc2c70e618be1ac850b4
```

### 3. 启动 MySQL 数据库

**方式一：使用 Docker（推荐）**

```bash
docker run -d \
  --name testjr-mysql \
  -e MYSQL_ROOT_PASSWORD=root123 \
  -e MYSQL_DATABASE=testjr \
  -p 3307:3306 \
  mysql:8.0
```

**方式二：使用本地 MySQL**

确保 MySQL 已安装并运行，然后创建数据库：

```sql
CREATE DATABASE testjr CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 4. 导入数据库

```bash
# Docker 方式
docker exec -i testjr-mysql mysql -uroot -proot123 testjr < testjr_database_20260128.sql

# 本地 MySQL 方式
mysql -u root -p testjr < testjr_database_20260128.sql
```

### 5. 配置后端环境变量

创建 `backend/.env` 文件：

```ini
# 数据库配置
DB_HOST=127.0.0.1
DB_PORT=3307          # Docker 默认映射端口，本地 MySQL 改为 3306
DB_USER=root
DB_PASSWORD=root123
DB_NAME=testjr

# AI 相关配置（可选）
DASHSCOPE_API_KEY=sk-placeholder
```

### 6. 安装依赖

```bash
npm install
```

### 7. 启动服务

**开发模式**

```bash
# 终端 1: 启动后端
npm run dev:backend

# 终端 2: 启动前端
npm run dev:frontend
```

**生产模式**

```bash
# 构建前端
npm run build:frontend

# 启动后端（会同时提供前端静态文件）
npm run start:backend
```

### 8. 访问系统

- **前端开发服务器**: http://localhost:5173
- **后端 API**: http://localhost:3001
- **默认管理员账号**: admin / admin123

---

## 常见问题

### Q: 数据库连接失败
确保 MySQL 容器正在运行，端口映射正确：
```bash
docker ps | grep mysql
```

### Q: npm install 失败
尝试清除缓存重新安装：
```bash
rm -rf node_modules package-lock.json
npm install
```

### Q: 前端无法访问后端 API
检查 `.env` 配置是否正确，确保后端服务已启动。

---

## 技术栈

- **后端**: Node.js + Express + TypeScript + MySQL
- **前端**: React + Vite + Ant Design + ECharts
- **数据库**: MySQL 8.0

---

*导出时间: 2026-01-28*
