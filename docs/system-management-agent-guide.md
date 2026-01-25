# 系统管理模块 Agent 工作指南

## 你的职责

你是负责「系统管理」模块的专职 Agent，负责维护和开发以下功能：

1. **用户管理** - 用户的增删改查、启用/禁用
2. **角色管理** - 角色的增删改查、权限分配
3. **权限管理** - 权限树的维护
4. **用户组管理** - 用户组的增删改查、成员和权限管理
5. **组织管理** - 组织架构的维护、员工归属
6. **系统参数** - 全局配置参数
7. **操作日志** - 系统操作记录
8. **多语言管理** - 国际化翻译条目

---

## 快速上手

### 1. 阅读架构文档

首先阅读详细的架构文档：
```
docs/system-management-architecture.md
```

### 2. 关键代码位置

**后端核心**:
- `backend/src/store.ts` - 主要数据层（用户、角色、权限、组织等）
- `backend/src/auth.ts` - 认证和权限中间件
- `backend/src/routes.ts` - API 路由

**前端页面**:
- `frontend/src/pages/Users.tsx`
- `frontend/src/pages/Groups.tsx`
- `frontend/src/pages/Permissions.tsx`
- `frontend/src/pages/Orgs.tsx`
- `frontend/src/pages/SystemParameters.tsx`
- `frontend/src/pages/OperationLogs.tsx`
- `frontend/src/pages/I18nAdmin.tsx`

**布局和菜单**:
- `frontend/src/layouts/AppLayout.tsx`

### 3. 启动开发环境

```bash
# 启动后端（确保 Docker MySQL 已运行）
cd /Users/zac/Desktop/projects/jinrong/testjr-main-9b793b5608664745eeffdc2c70e618be1ac850b4
DB_HOST=127.0.0.1 DB_PORT=3307 DB_USER=root DB_PASSWORD=root123 DB_NAME=testjr npm run dev:backend

# 启动前端（另一个终端）
npm run dev:frontend
```

访问: http://localhost:5173  
登录: admin / admin123

---

## 当前状态

### 已完成的功能

✅ 用户管理 CRUD  
✅ 角色管理 CRUD  
✅ 权限管理（树形结构）  
✅ 用户组管理  
✅ 组织管理（树形结构 + 类型标签）  
✅ 多租户组织类型（platform/funder/financier）  
✅ 自动组织创建（创建资金方/融资方时）  
✅ JWT 认证  
✅ 权限中间件  
✅ 系统参数配置  
✅ 多语言管理  

### 待完善的功能

⬜ 在业务 API 中应用数据隔离过滤  
⬜ 用户密码重置  
⬜ 用户登录日志  
⬜ 权限变更审计  
⬜ 用户批量导入  
⬜ 组织架构拖拽调整  

---

## 开发注意事项

### 1. 权限控制

每个 API 都需要权限控制：
```typescript
router.get("/api/xxx", authenticate, requirePermissions("manage_xxx"), handler);
```

### 2. 软删除

所有实体使用软删除（`deleted_at` 字段），查询时需过滤：
```sql
WHERE deleted_at IS NULL
```

### 3. 表单重置

Modal/Drawer 关闭时必须重置表单：
```tsx
onCancel={() => {
  setModalOpen(false);
  form.resetFields();
}}
```

### 4. 多租户

用户登录后会设置 `req.orgContext`，可用于数据过滤：
```typescript
import { getOrgDataFilter } from "./auth.js";

const filter = getOrgDataFilter(req);
if (!filter.isPlatformUser) {
  // 非平台用户需要过滤数据
}
```

### 5. 国际化

使用 `useI18n` hook：
```tsx
const { t } = useI18n();
<span>{t("key", "默认值")}</span>
```

---

## 常见任务示例

### 添加新权限

1. 编辑 `backend/src/store.ts` 的 `DEFAULT_PERMISSION_SEED`
2. 添加到 `backend/src/types.ts` 的 `Permission` 类型
3. 重启后端自动同步

### 添加新菜单项

1. 编辑 `frontend/src/layouts/AppLayout.tsx`
2. 在 menuItems 中添加菜单
3. 在 tabConfigs 中添加 Tab 配置
4. 确保有权限控制

### 添加新 API

1. 在 `backend/src/routes.ts` 添加路由
2. 在 `backend/src/store.ts` 添加数据操作函数
3. 在 `frontend/src/api.ts` 添加 API 调用函数

---

## 测试账号

| 用户名 | 密码 | 权限 |
|--------|------|------|
| admin | admin123 | 全部权限 |

---

## 联系方式

如有架构层面的问题，可与主 Agent 沟通。

---

*指南更新时间: 2026-01-14*
