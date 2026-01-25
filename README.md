# Test App (React 19 + Ant Design + Express)

统一的 TypeScript 前后端项目，包含 React 19 + Ant Design 的前端和 Express 的后端。

## 安装

```bash
npm install
```

## 常用脚本

- 启动前端开发：`npm run dev:frontend` (默认端口 5173)
- 启动后端开发：`npm run dev:backend` (默认端口 3001)
- 构建前端：`npm run build:frontend`
- 构建后端：`npm run build:backend`
- 类型检查：`npm run lint`

## 目录结构

- `frontend/` React 19 + Ant Design + Vite
- `backend/` Express + TypeScript
- `tsconfig.base.json` 前后端共享的 TypeScript 配置基线

## 数据库

- 连接默认指向阿里云 RDS：`rm-j6c7eon23tb4755xzlo.mysql.cnhk.rds.aliyuncs.com:3306`
- 默认账号：`tms`，密码：`Wsdf345SDFG!@`，数据库：`testapp`
- 可用环境变量覆盖：`DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME`

## 账号 / 权限 / 组织

- 默认管理员：`admin` / `admin123`（可通过环境变量 `DEFAULT_ADMIN_PASSWORD` 覆盖）
- 使用 JWT 鉴权，请求时在 Header 里传 `Authorization: Bearer <token>`
- 核心权限：`manage_users`、`manage_roles`、`manage_groups`、`manage_orgs`、`view_orgs`、`manage_permissions`
- 主要接口（前缀 `/api`）：
  - `POST /auth/login` 登录获取 token
  - `GET /auth/me` 获取当前用户信息
  - `GET/POST /users` 管理用户
  - `GET/POST /roles` 管理角色
  - `GET/POST /groups` 管理用户组
  - `GET/POST /orgs` 管理组织架构
  - `POST /groups/:groupId/users/:userId` 将用户加入用户组
  - `POST /users/:userId/roles/:roleId` 为用户分配角色
  - `GET/POST/PUT/DELETE /permissions` 管理权限（仅 `manage_permissions`）

## 说明

- 前端入口：`frontend/src/main.tsx`
- 后端入口：`backend/src/index.ts`
- 健康检查接口：`GET /api/health`

