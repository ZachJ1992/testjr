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

---

## 2026-01-28: 资金方访问结算仪表板报"未授权"

### 错误现象
- 资金方用户登录后访问结算仪表板页面
- 页面弹出"未授权"错误提示
- 页面无法正常加载数据

### 错误原因

**问题**：结算仪表板页面同时调用了两组 API：

1. `/settlements/stats` 和 `/settlements` - 需要 `manage_settlements` 权限
2. `/directed-pay/settlements/stats` 和 `/directed-pay/settlements` - 需要 `view_directed_pay_settlements` 权限

资金方用户只有 `view_directed_pay_settlements` 权限，但页面使用 `Promise.all` 同时调用了两组 API，导致第一组 API 返回 403 未授权错误，整个请求失败。

```typescript
// 原代码 - 无条件调用所有 API
const [generalStatsData, generalSettlementsData, dpStatsData, dpSettlementsData] = 
  await Promise.all([
    fetchSettlementStats(token),        // 需要 manage_settlements
    fetchSettlements(token, ...),       // 需要 manage_settlements
    fetchDirectedPaySettlementStats(token),  // 需要 view_directed_pay_settlements
    fetchDirectedPaySettlements(token, ...)  // 需要 view_directed_pay_settlements
  ]);
```

### 解决方案

**修改 `frontend/src/pages/SettlementDashboard.tsx`**：

1. **添加权限检查变量**：
```typescript
const canManageSettlements = user?.permissions?.includes("*") || 
  user?.permissions?.includes("manage_settlements");
const canViewDirectedPaySettlements = user?.permissions?.includes("*") || 
  user?.permissions?.includes("manage_directed_pay_settlements") || 
  user?.permissions?.includes("view_directed_pay_settlements");
```

2. **按权限动态调用 API**：
```typescript
const promises: Promise<any>[] = [];
if (canManageSettlements) {
  promises.push(fetchSettlementStats(token));
  promises.push(fetchSettlements(token, { status: "pending" }));
}
if (canViewDirectedPaySettlements) {
  promises.push(fetchDirectedPaySettlementStats(token));
  promises.push(fetchDirectedPaySettlements(token, { status: "pending" }));
}
const results = await Promise.all(promises);
```

3. **按权限显示 UI 内容**：
- 分类统计卡片根据权限条件渲染
- Tabs 标签页根据权限动态生成

### 经验总结

- 前端页面在调用 API 前应先检查用户权限
- 不同权限的 API 调用应该分开处理，避免一个失败导致全部失败
- 菜单可见性和页面实际权限检查应保持一致
- 使用条件渲染只显示用户有权限访问的内容

---

## 2026-01-28: 融资还款结算页面权限优化

### 问题描述

融资还款结算页面的"新增"功能需要调用 `fetchFinanciers` 和 `fetchContracts` API，这些 API 需要 `manage_contracts` 权限。但菜单仅要求 `manage_settlements` 权限，导致权限不匹配。

### 解决方案

在 `frontend/src/pages/FinancingRepaymentSettlement.tsx` 中添加权限检查：

```typescript
// 权限检查 - 新增功能需要 manage_contracts 权限
const canAddSettlement = user?.permissions?.includes("*") || 
  user?.permissions?.includes("manage_contracts");
```

根据权限控制"新增"按钮的显示：

```typescript
{canAddSettlement && (
  <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenAddModal}>
    {t("financing_repayment.add", "新增")}
  </Button>
)}
```

### 经验总结

- 功能按钮的显示应该与其依赖的 API 权限匹配
- 不要假设有菜单权限就一定有所有子功能的权限
- 按钮级别的权限控制可以提供更好的用户体验

---

### 模板：新错误记录

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
