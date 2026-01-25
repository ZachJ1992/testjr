# 系统管理模块架构文档

## 一、模块概述

系统管理模块是整个金融平台的基础设施，负责用户身份认证、权限控制、组织架构管理等核心功能。该模块采用 **RBAC（基于角色的访问控制）** 模型，结合 **多租户数据隔离** 机制，实现精细化的权限管理。

### 技术栈
- **后端**: Express.js + TypeScript + MySQL
- **前端**: React 19 + Ant Design 6 + TypeScript
- **认证**: JWT (JSON Web Token)
- **国际化**: 自定义 i18n 方案

---

## 二、数据模型

### 2.1 核心实体关系图

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   OrgUnit   │────<│    User     │>────│    Role     │
│   (组织)     │     │   (用户)    │     │   (角色)    │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Funder    │     │  UserGroup  │     │ Permission  │
│  (资金方)    │     │  (用户组)   │     │   (权限)    │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │
       │                   │
       ▼                   ▼
┌─────────────┐     ┌─────────────┐
│  Financier  │     │ GroupPerm   │
│  (融资方)    │     │ (组权限)    │
└─────────────┘     └─────────────┘
```

### 2.2 数据表结构

#### users (用户表)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(36) | 主键 UUID |
| username | VARCHAR(100) | 用户名（唯一） |
| display_name | VARCHAR(255) | 显示名称 |
| password_hash | VARCHAR(255) | 密码哈希 |
| org_id | VARCHAR(36) | 所属组织ID |
| is_active | TINYINT(1) | 是否启用 |
| deleted_at | DATETIME | 软删除时间 |
| created_at | DATETIME | 创建时间 |

#### roles (角色表)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(36) | 主键 UUID |
| name | VARCHAR(100) | 角色名称（唯一） |
| description | VARCHAR(255) | 角色描述 |
| permission_codes | TEXT | 权限码列表(JSON) |
| created_at | DATETIME | 创建时间 |

#### permissions (权限表)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(36) | 主键 UUID |
| code | VARCHAR(100) | 权限码（唯一） |
| name | VARCHAR(200) | 权限名称 |
| description | TEXT | 权限描述 |
| parent_id | VARCHAR(36) | 父权限ID（树形结构） |
| deleted_at | DATETIME | 软删除时间 |

#### user_groups (用户组表)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(36) | 主键 UUID |
| name | VARCHAR(100) | 组名称 |
| description | TEXT | 组描述 |
| deleted_at | DATETIME | 软删除时间 |
| created_at | DATETIME | 创建时间 |

#### org_units (组织表)
| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(36) | 主键 UUID |
| name | VARCHAR(100) | 组织名称 |
| parent_id | VARCHAR(36) | 父组织ID |
| **type** | VARCHAR(20) | 组织类型: platform/funder/financier |
| **related_entity_id** | VARCHAR(36) | 关联实体ID（资金方/融资方ID） |
| is_active | TINYINT(1) | 是否启用 |
| deleted_at | DATETIME | 软删除时间 |
| created_at | DATETIME | 创建时间 |

#### 关联表
- **user_roles**: 用户-角色关联 (user_id, role_id)
- **user_group_members**: 用户-用户组关联 (group_id, user_id)
- **user_group_permissions**: 用户组-权限关联 (group_id, permission_code)

---

## 三、权限体系

### 3.1 权限码定义

权限采用树形结构，定义在 `backend/src/store.ts` 的 `DEFAULT_PERMISSION_SEED` 中：

```typescript
// 一级权限（模块）
manage_funders        // 资金方管理
manage_financiers     // 融资方管理  
manage_contracts      // 合同管理
manage_waybills       // 运单管理
manage_settlements    // 结算管理
manage_fund_pool      // 资金池监控
manage_users          // 用户管理
manage_roles          // 角色管理
manage_permissions    // 权限管理
manage_groups         // 用户组管理
manage_orgs           // 组织管理
manage_system_params  // 系统参数
view_operation_logs   // 操作日志
manage_i18n           // 多语言管理
```

### 3.2 权限计算逻辑

用户的最终权限 = 角色权限 ∪ 用户组权限

```typescript
// backend/src/store.ts - toSafeUser 函数
async function toSafeUser(user: User): Promise<SafeUser> {
  // 1. 获取用户角色的权限
  const rolePermissions = await getRolePermissions(user.roleIds);
  
  // 2. 获取用户组的权限
  const groupPermissions = await getGroupPermissions(user.groupIds);
  
  // 3. 合并去重
  const allPermissions = [...new Set([...rolePermissions, ...groupPermissions])];
  
  return { ...user, permissions: allPermissions };
}
```

### 3.3 权限中间件

```typescript
// backend/src/auth.ts

// 要求用户拥有所有指定权限
requirePermissions(["manage_users", "manage_roles"])

// 要求用户拥有任意一个权限
requireAnyPermission(["manage_contracts", "view_contracts"])
```

---

## 四、多租户数据隔离

### 4.1 组织类型

| 类型 | 说明 | 数据可见性 |
|------|------|------------|
| platform | 平台组织 | 可见所有数据 |
| funder | 资金方组织 | 仅可见与自己相关的合同、结算 |
| financier | 融资方组织 | 仅可见自己的运单、合同、结算 |

### 4.2 组织上下文

认证时自动设置组织上下文：

```typescript
// backend/src/auth.ts
interface OrgContext {
  orgId?: string;
  orgType?: OrgType;          // "platform" | "funder" | "financier"
  relatedEntityId?: string;   // 关联的资金方/融资方ID
  isPlatformUser: boolean;
}
```

### 4.3 数据过滤辅助函数

```typescript
// 获取数据过滤条件
getOrgDataFilter(req): {
  isPlatformUser: boolean;
  orgType?: OrgType;
  funderId?: string;      // 资金方用户时有值
  financierId?: string;   // 融资方用户时有值
}

// 检查访问权限
canAccessFunder(req, funderId): boolean
canAccessFinancier(req, financierId): boolean
```

### 4.4 自动组织创建

创建资金方/融资方时自动创建对应组织：

```typescript
// backend/src/funders-store.ts - createFunder
// 1. 创建资金方记录
// 2. 自动创建 type="funder" 的组织
// 3. 更新资金方的 org_id 字段

// backend/src/financiers-store.ts - createFinancier  
// 同理
```

---

## 五、API 接口

### 5.1 认证接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/login | 用户登录，返回 JWT token |
| GET | /api/me | 获取当前用户信息 |

### 5.2 用户管理接口

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /api/users | manage_users | 获取用户列表 |
| POST | /api/users | manage_users | 创建用户 |
| PUT | /api/users/:id | manage_users | 更新用户 |
| DELETE | /api/users/:id | manage_users | 删除用户 |

### 5.3 角色管理接口

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /api/roles | manage_roles | 获取角色列表 |
| POST | /api/roles | manage_roles | 创建角色 |
| PUT | /api/roles/:id | manage_roles | 更新角色 |
| DELETE | /api/roles/:id | manage_roles | 删除角色 |

### 5.4 权限管理接口

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /api/permissions | manage_permissions | 获取权限树 |
| POST | /api/permissions | manage_permissions | 创建权限 |
| PUT | /api/permissions/:id | manage_permissions | 更新权限 |
| DELETE | /api/permissions/:id | manage_permissions | 删除权限 |

### 5.5 用户组管理接口

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /api/groups | manage_groups | 获取用户组列表 |
| POST | /api/groups | manage_groups | 创建用户组 |
| PUT | /api/groups/:id | manage_groups | 更新用户组 |
| DELETE | /api/groups/:id | manage_groups | 删除用户组 |
| PUT | /api/groups/:id/members | manage_groups | 更新组成员 |
| PUT | /api/groups/:id/permissions | manage_groups | 更新组权限 |

### 5.6 组织管理接口

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /api/orgs | manage_orgs | 获取组织列表 |
| POST | /api/orgs | manage_orgs | 创建组织 |
| PUT | /api/orgs/:id | manage_orgs | 更新组织 |
| DELETE | /api/orgs/:id | manage_orgs | 删除组织 |

### 5.7 系统参数接口

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /api/system-params | manage_system_params | 获取系统参数 |
| PUT | /api/system-params | manage_system_params | 更新系统参数 |

### 5.8 操作日志接口

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /api/operation-logs | view_operation_logs | 获取操作日志 |

### 5.9 多语言管理接口

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /api/i18n/entries | manage_i18n | 获取翻译条目 |
| POST | /api/i18n/entries | manage_i18n | 创建翻译条目 |
| PUT | /api/i18n/entries/:id | manage_i18n | 更新翻译条目 |
| DELETE | /api/i18n/entries/:id | manage_i18n | 删除翻译条目 |

---

## 六、前端页面

### 6.1 页面列表

| 路径 | 组件文件 | 说明 |
|------|----------|------|
| /users | `pages/Users.tsx` | 用户管理（独立页面） |
| /groups | `pages/Groups.tsx` | 用户组管理 |
| /permissions | `pages/Permissions.tsx` | 权限管理 |
| /orgs | `pages/Orgs.tsx` | 组织管理（含员工管理） |
| /system-parameters | `pages/SystemParameters.tsx` | 系统参数配置 |
| /operation-logs | `pages/OperationLogs.tsx` | 操作日志 |
| /i18n-admin | `pages/I18nAdmin.tsx` | 多语言管理 |

### 6.2 菜单配置

菜单在 `frontend/src/layouts/AppLayout.tsx` 中配置：

```tsx
// 系统管理菜单
{
  key: "system",
  icon: <SettingOutlined />,
  label: t("menu.system", "系统管理"),
  children: [
    // 用户管理 - manage_users 权限
    // 用户组管理 - manage_groups 权限
    // 权限管理 - manage_permissions 权限
    // 组织管理 - manage_orgs 权限
    // 系统参数 - manage_system_params 权限
    // 操作日志 - view_operation_logs 权限
    // 多语言管理 - manage_i18n 权限
  ]
}
```

### 6.3 通用组件

- `DataTable.tsx`: 通用数据表格，支持排序、过滤、分页
- `TabManager.tsx`: 多标签页管理器

---

## 七、关键文件清单

### 后端文件

| 文件路径 | 说明 |
|----------|------|
| `backend/src/store.ts` | 核心数据存储层，包含用户、角色、权限、组织等 CRUD |
| `backend/src/auth.ts` | 认证中间件、权限中间件、组织上下文 |
| `backend/src/routes.ts` | API 路由定义 |
| `backend/src/types.ts` | TypeScript 类型定义 |
| `backend/src/funders-store.ts` | 资金方数据存储（含自动组织创建） |
| `backend/src/financiers-store.ts` | 融资方数据存储（含自动组织创建） |
| `backend/src/i18n.ts` | 国际化支持 |
| `backend/src/migrations/` | 数据库迁移脚本 |

### 前端文件

| 文件路径 | 说明 |
|----------|------|
| `frontend/src/auth.tsx` | 认证 Context 和 Hook |
| `frontend/src/api.ts` | API 请求封装 |
| `frontend/src/types.ts` | TypeScript 类型定义 |
| `frontend/src/layouts/AppLayout.tsx` | 主布局，含菜单和 TabManager |
| `frontend/src/pages/Users.tsx` | 用户管理页面 |
| `frontend/src/pages/Groups.tsx` | 用户组管理页面 |
| `frontend/src/pages/Permissions.tsx` | 权限管理页面 |
| `frontend/src/pages/Orgs.tsx` | 组织管理页面 |
| `frontend/src/pages/SystemParameters.tsx` | 系统参数页面 |
| `frontend/src/pages/OperationLogs.tsx` | 操作日志页面 |
| `frontend/src/pages/I18nAdmin.tsx` | 多语言管理页面 |

---

## 八、待完善功能

### 8.1 已实现
- [x] 用户管理 CRUD
- [x] 角色管理 CRUD
- [x] 权限管理（树形结构）
- [x] 用户组管理
- [x] 组织管理（树形结构）
- [x] 多租户组织类型（platform/funder/financier）
- [x] 自动组织创建（创建资金方/融资方时）
- [x] JWT 认证
- [x] 权限中间件
- [x] 组织上下文设置
- [x] 系统参数配置
- [x] 操作日志（基础）
- [x] 多语言管理

### 8.2 待实现
- [ ] 在各业务 API 中应用 `getOrgDataFilter()` 实现数据隔离
- [ ] 用户密码重置功能
- [ ] 用户登录日志
- [ ] 权限变更审计
- [ ] 角色权限批量导入导出
- [ ] 组织架构拖拽调整
- [ ] 用户批量导入
- [ ] 更完善的操作日志记录

---

## 九、开发指南

### 9.1 添加新权限

1. 在 `backend/src/store.ts` 的 `DEFAULT_PERMISSION_SEED` 中添加：
```typescript
{ code: "new_permission", name: "新权限", parentCode: "parent_permission" }
```

2. 在 `backend/src/types.ts` 的 `Permission` 类型中添加

3. 重启后端自动同步到数据库

### 9.2 添加新菜单

1. 在 `frontend/src/layouts/AppLayout.tsx` 的菜单配置中添加
2. 在 `tabConfigs` 中添加对应的 Tab 配置
3. 确保有对应的权限控制

### 9.3 实现数据隔离

在需要数据隔离的 API 中使用：

```typescript
import { getOrgDataFilter, canAccessFunder } from "./auth.js";

router.get("/some-data", authenticate, async (req, res) => {
  const filter = getOrgDataFilter(req);
  
  if (filter.isPlatformUser) {
    // 平台用户：返回所有数据
  } else if (filter.funderId) {
    // 资金方用户：过滤数据
  } else if (filter.financierId) {
    // 融资方用户：过滤数据
  }
});
```

---

## 十、默认账号

| 用户名 | 密码 | 角色 | 说明 |
|--------|------|------|------|
| admin | admin123 | admin | 系统管理员，拥有所有权限 |

---

## 十一、环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| JWT_SECRET | dev-secret-change-me | JWT 密钥 |
| JWT_EXPIRES_IN | 7d | Token 过期时间 |
| DEFAULT_ADMIN_PASSWORD | admin123 | 默认管理员密码 |
| DB_HOST | localhost | 数据库主机 |
| DB_PORT | 3306 | 数据库端口 |
| DB_USER | root | 数据库用户 |
| DB_PASSWORD | - | 数据库密码 |
| DB_NAME | testjr | 数据库名称 |

---

*文档更新时间: 2026-01-14*
