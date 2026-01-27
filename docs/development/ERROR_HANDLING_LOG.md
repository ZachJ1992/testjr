# 登途云错误处理日志

> 本文档记录开发过程中遇到的错误及其解决方案，方便后续参考。

---

## 2026-01-26: MySQL 数据库连接超时 (ETIMEDOUT)

### 错误现象
- 后端启动时报错 `connect ETIMEDOUT`
- 所有数据库相关操作失败
- 前端可以访问但无数据

### 错误原因

**问题1**：默认数据库配置指向阿里云 RDS 远程数据库，远程服务不可达

**问题2**：创建了本地 `.env` 文件但环境变量未加载

`dotenv.config()` 在 `index.ts` 第 28 行调用，但 `routes.ts`（包含 `db.ts`）在第 3 行就被导入。ES modules 的 import 是静态提升的，导致 `db.ts` 创建连接池时 `process.env` 仍是空的。

```typescript
// index.ts 导入顺序问题
import apiRouter from "./routes.js";  // 第3行，db.ts 已执行
// ...
dotenv.config();  // 第28行，太晚了
```

### 解决方案

**步骤1**：创建 `backend/.env` 切换到本地 Docker MySQL

```env
DB_HOST=127.0.0.1
DB_PORT=3307
DB_USER=root
DB_PASSWORD=root123
DB_NAME=testjr
```

**步骤2**：在 `db.ts` 中直接加载 dotenv

```typescript
// backend/src/db.ts
import mysql from "mysql2/promise";
import dotenv from "dotenv";

// 确保环境变量加载
dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST || "...",
  // ...
});
```

### 经验总结

**规范：在 ES modules 项目中，需要环境变量的模块应自行加载 dotenv**

原因：ES modules 的 import 是静态提升的，无法保证 dotenv.config() 在其他模块导入前执行。

检查清单：
- [ ] 数据库配置模块 (`db.ts`) 需要自行 `dotenv.config()`
- [ ] 创建 `.env` 后需要重启服务
- [ ] 检查 Docker MySQL 容器是否运行 (`docker ps`)

---

## 2026-01-25: 结算仪表板路由问题

### 错误现象
- 菜单中能看到"结算仪表板"选项
- 点击后页面无法进入/显示空白

### 错误原因
`App.tsx` 中缺少结算仪表板的路由配置。虽然在 `AppLayout.tsx` 的 TabConfig 中配置了组件，但 React Router 的 Routes 中没有对应的 Route。

### 解决方案
在 `frontend/src/App.tsx` 中添加：

```typescript
// 1. 导入组件
import SettlementDashboardPage from "./pages/SettlementDashboard";

// 2. 添加路由
<Route path="/settlement-dashboard" element={<SettlementDashboardPage />} />
```

### 经验总结
在本项目中添加新页面需要同时修改：
1. `App.tsx` - 添加 Route
2. `AppLayout.tsx` - 添加菜单项 (menuItems) 和 Tab配置 (tabConfigs)

---

## 2026-01-25: 合同删除后刷新数据仍存在

### 错误现象
- 删除合同后显示"删除成功"
- 刷新页面后，被删除的数据仍然存在
- 问题不是每次都发生

### 错误原因
前端删除操作后调用 `refresh()` 时没有使用 `await`，导致异步时序问题：

```typescript
// 错误写法
message.success("合同删除成功");
refresh();  // 没有 await，可能在后端完成前就返回了

// 正确写法
message.success("合同删除成功");
await refresh();  // 等待刷新完成
```

### 解决方案
全局修复所有页面中删除/更新操作后的 `refresh()` 调用，添加 `await`：

**修复的文件：**
- `frontend/src/pages/Contracts.tsx` - 删除、编辑、状态切换
- `frontend/src/pages/BrokerageContracts.tsx` - 删除、状态切换
- `frontend/src/pages/NewContracts.tsx` - 删除、状态切换
- `frontend/src/pages/DirectedPayContracts.tsx` - 删除、状态变更

### 经验总结
**规范：在 async 函数中，所有会改变数据的操作后调用 `refresh()` 都必须使用 `await`**

检查清单：
- [ ] 删除操作后：`await refresh()`
- [ ] 创建操作后：`await refresh()`
- [ ] 更新操作后：`await refresh()`
- [ ] 状态变更后：`await refresh()`

---

## 常见错误类型索引

### 路由相关
- [结算仪表板路由问题](#2026-01-25-结算仪表板路由问题)

### 异步/刷新相关
- [合同删除后刷新数据仍存在](#2026-01-25-合同删除后刷新数据仍存在)

### 类型错误
（待补充）

### 数据库相关
- [MySQL 数据库连接超时](#2026-01-26-mysql-数据库连接超时-etimedout)

### API 相关
（待补充）

---

## 模板：错误记录

### [日期]: [错误简述]

#### 错误现象
- 具体表现
- 复现步骤

#### 错误原因
- 根本原因分析

#### 解决方案
- 代码修改
- 配置调整

#### 经验总结
- 避免方法
- 检查清单
