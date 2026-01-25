# 登途云 - 物流金融服务平台 系统设计文档

> 版本: 1.0 | 更新日期: 2026-01-19

## 目录

1. [项目概述](#1-项目概述)
2. [技术栈](#2-技术栈)
3. [系统架构](#3-系统架构)
4. [核心业务模块](#4-核心业务模块)
5. [数据库设计](#5-数据库设计)
6. [API 设计](#6-api-设计)
7. [权限与多租户系统](#7-权限与多租户系统)
8. [前端架构](#8-前端架构)
9. [关键设计决策](#9-关键设计决策)
10. [常见问题与解决方案](#10-常见问题与解决方案)
11. [开发指南](#11-开发指南)

---

## 1. 项目概述

### 1.1 产品定位

登途云是一个 **物流金融服务平台**，连接三方角色：
- **平台 (Platform)**: 登途云运营方，提供技术平台和资金撮合服务
- **资金方 (Funder)**: 银行、保理公司等金融机构，提供资金
- **融资方 (Financier)**: 物流企业，使用资金进行运营

### 1.2 核心业务场景

```
┌─────────────┐      授信      ┌─────────────┐
│   资金方    │ ─────────────► │   融资方    │
│  (银行等)   │                │  (物流企业)  │
└──────┬──────┘                └──────┬──────┘
       │                              │
       │   资金监管                    │ 运单数据
       │   利息收益                    │ 代付申请
       │                              │
       └──────────┬───────────────────┘
                  │
           ┌──────▼──────┐
           │   登途云    │
           │  (平台方)   │
           └─────────────┘
```

### 1.3 支持的合同类型

| 合同类型 | 说明 | 收益模式 |
|---------|------|---------|
| 三方融资合同 | 资金方向融资方授信，平台撮合 | 按日计息 |
| 撮合业务合同 | 平台为融资方撮合业务 | 交易抽成 |
| 定向支付合同 | 资金方定向支付融资方运营费用 | 按日计息 |
| 抽成合同 | 按运单抽取佣金 | 固定/比例抽成 |

---

## 2. 技术栈

### 2.1 后端

| 技术 | 版本 | 用途 |
|-----|------|-----|
| Node.js | 22.x | 运行时 |
| TypeScript | 5.x | 开发语言 |
| Express.js | 4.x | Web框架 |
| MySQL | 8.x | 主数据库 |
| mysql2 | - | 数据库驱动 |
| tsx | - | TypeScript运行 |
| jsonwebtoken | - | JWT认证 |
| bcryptjs | - | 密码加密 |

### 2.2 前端

| 技术 | 版本 | 用途 |
|-----|------|-----|
| React | 18.x | UI框架 |
| TypeScript | 5.x | 开发语言 |
| Vite | 5.x | 构建工具 |
| Ant Design | 5.x | UI组件库 |
| ECharts | 5.x | 数据可视化 |
| React Router | 6.x | 路由管理 |
| i18next | - | 国际化 |

### 2.3 项目结构

```
testjr-main/
├── backend/                # 后端代码
│   ├── src/
│   │   ├── index.ts       # 入口文件
│   │   ├── routes.ts      # 主路由
│   │   ├── auth.ts        # 认证授权
│   │   ├── db.ts          # 数据库连接
│   │   ├── store.ts       # 核心数据存储
│   │   ├── types.ts       # 类型定义
│   │   ├── migrations/    # 数据库迁移
│   │   ├── crawler/       # 爬虫模块
│   │   └── *-store.ts     # 各业务模块存储
│   └── package.json
├── frontend/               # 前端代码
│   ├── src/
│   │   ├── App.tsx        # 应用入口
│   │   ├── api.ts         # API调用
│   │   ├── auth.tsx       # 认证上下文
│   │   ├── pages/         # 页面组件
│   │   ├── components/    # 公共组件
│   │   └── layouts/       # 布局组件
│   └── package.json
├── shared/                 # 前后端共享代码
│   └── src/
│       └── enums.ts       # 共享枚举定义
├── docs/                   # 文档
└── package.json           # 根配置
```

---

## 3. 系统架构

### 3.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 (React + Vite)                       │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  认证   │  │   页面   │  │   组件   │  │   TabManager     │  │
│  │ Context │  │ (Pages)  │  │(Components)│ │  (页面缓存)     │  │
│  └────┬────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │
│       └────────────┴─────────────┴─────────────────┘            │
│                              │ HTTP/REST                         │
└──────────────────────────────┼───────────────────────────────────┘
                               │
┌──────────────────────────────┼───────────────────────────────────┐
│                        后端 (Express.js)                         │
│  ┌─────────────┐  ┌─────────┴─────────┐  ┌───────────────────┐  │
│  │ Auth中间件  │──│   路由 (Routes)    │──│  业务逻辑层      │  │
│  │ ·JWT验证    │  │  ·/api/auth/*     │  │  ·*-store.ts     │  │
│  │ ·权限检查   │  │  ·/api/users/*    │  │  ·*-routes.ts    │  │
│  │ ·orgContext │  │  ·/api/contracts/*│  │  ·*-core.ts      │  │
│  └─────────────┘  └───────────────────┘  └─────────┬─────────┘  │
│                                                     │            │
│  ┌─────────────────────────────────────────────────┼──────────┐ │
│  │                   数据访问层 (store.ts, db.ts)              │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────┬───────────────────────────────────┘
                               │
┌──────────────────────────────┼───────────────────────────────────┐
│                        MySQL 8.x                                 │
│  ┌──────────┐ ┌───────────┐ ┌───────────┐ ┌───────────────────┐ │
│  │ users    │ │ contracts │ │ waybills  │ │ revenue_records   │ │
│  │ roles    │ │ funders   │ │ payments  │ │ settlements       │ │
│  │ org_units│ │ financiers│ │ crawler_* │ │ ...               │ │
│  └──────────┘ └───────────┘ └───────────┘ └───────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 请求处理流程

```
Request → Auth Middleware → Permission Check → Route Handler → Store → DB
                ↓
         [解析JWT]
                ↓
         [获取orgContext]
                ↓
         [设置数据过滤条件]
```

---

## 4. 核心业务模块

### 4.1 用户与权限管理

#### 用户体系

```typescript
interface User {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  orgId?: string;       // 所属组织
  roleIds: string[];    // 角色列表
  groupIds: string[];   // 用户组列表
  isActive: boolean;
}
```

#### 权限模型

采用 **RBAC (基于角色的访问控制)** 模型：

```
用户 ──(属于)──► 角色 ──(拥有)──► 权限
 │
 └──(属于)──► 组织 ──(类型)──► platform/funder/financier
```

### 4.2 组织与多租户

#### 组织类型

| 类型 | 说明 | 数据范围 |
|------|------|---------|
| `platform` | 平台组织 | 可查看所有数据 |
| `funder` | 资金方组织 | 仅能查看本资金方相关数据 |
| `financier` | 融资方组织 | 仅能查看本融资方相关数据 |

#### orgContext 机制

```typescript
interface OrgContext {
  orgId: string;
  orgType: OrgType;           // 'platform' | 'funder' | 'financier'
  relatedEntityId?: string;   // 关联的资金方/融资方ID
  isPlatformUser: boolean;
}
```

**关键代码**: `backend/src/auth.ts`

```typescript
// 在 authMiddleware 中设置 orgContext
if (org.type === 'funder') {
  req.orgContext = {
    orgType: 'funder',
    funderId: org.relatedEntityId,
    isPlatformUser: false,
  };
}
```

### 4.3 合同管理

#### 合同类型定义

```typescript
type ContractType = "financing" | "brokerage";
type DirectedPayContractStatus = "draft" | "pending_approval" | "active" | "suspended" | "expired" | "terminated";
```

#### 合同创建流程

```
创建合同 → 配置支付类别 → 提交审批 → 审批通过 → 合同生效
                ↓
         [设置支付比例]
         [设置审批规则]
         [设置解锁状态]
```

### 4.4 定向支付模块

#### 核心流程

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  创建    │───►│  平台    │───►│  资金方  │───►│  执行    │───►│  完成    │
│  申请    │    │  审批    │    │  审批    │    │  支付    │    │  记录    │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
```

#### 支付类别配置

```typescript
interface PaymentCategoryConfig {
  categoryCode: string;      // 如 "OIL_CARD", "FREIGHT"
  paymentRatio: number;      // 支付比例 0-100%
  requirePlatformApproval: boolean;
  requireFunderApproval: boolean;
  unlockStatus: WaybillStatus;  // 运单达到此状态后可申请
}
```

**解锁状态机制**：只有当关联运单状态 >= `unlockStatus` 时，才能申请该类别支付。

### 4.5 运单管理

#### 运单状态流转

```
created → dispatched → loading → in_transit → delivered → signed → settled → completed
   ↓           ↓           ↓          ↓            ↓          ↓         ↓
[可申请]    [可申请]    [可申请]   [可申请]     [可申请]   [可申请]  [可申请]
[油卡]      [运费]       ...        ...          ...        ...      [全部]
```

#### 数据同步 (Crawler)

系统支持从外部TMS系统自动同步运单数据：

```typescript
interface CrawlerConfig {
  financierId: string;     // 关联融资方
  systemUrl: string;       // TMS系统地址
  apiEndpoint: string;     // API端点
  cookies: string;         // 认证Cookie
  syncEnabled: boolean;    // 是否启用同步
  syncIntervalMinutes: number;  // 同步间隔
}
```

### 4.6 收益管理

#### 收益来源

| 来源类型 | 说明 | 收益方 |
|---------|------|-------|
| `financing_interest` | 三方融资利息 | 资金方收益，融资方支出，平台服务费 |
| `directed_pay_interest` | 定向支付利息 | 资金方收益，融资方支出，平台服务费 |
| `brokerage_commission` | 撮合抽成 | 平台收益 |
| `commission_fee` | 抽成合同费用 | 平台收益 |

#### 收益计算

```typescript
// 日利息计算
const dailyInterest = (principalAmount * annualRate) / 360;

// 平台服务费 (利息的一定比例)
const platformFee = dailyInterest * platformFeeRate;
```

#### 收益记录

```typescript
interface RevenueRecord {
  id: string;
  recordType: 'revenue' | 'expense';
  beneficiaryType: 'platform' | 'funder' | 'financier';
  beneficiaryId?: string;
  sourceType: RevenueSourceType;
  amount: number;
  status: 'pending' | 'confirmed' | 'settled';
  revenueDate: string;
  // ...
}
```

---

## 5. 数据库设计

### 5.1 核心表结构

#### 用户与权限

```sql
-- 用户表
CREATE TABLE users (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100),
  password_hash VARCHAR(255) NOT NULL,
  org_id VARCHAR(36),
  role_ids JSON,
  group_ids JSON,
  is_active BOOLEAN DEFAULT TRUE
);

-- 角色表
CREATE TABLE roles (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  permissions JSON
);

-- 组织表
CREATE TABLE org_units (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  parent_id VARCHAR(36),
  type ENUM('platform', 'funder', 'financier'),
  related_entity_id VARCHAR(36),  -- 关联的资金方/融资方ID
  is_active BOOLEAN DEFAULT TRUE
);
```

#### 业务主体

```sql
-- 资金方
CREATE TABLE funders (
  id VARCHAR(36) PRIMARY KEY,
  org_id VARCHAR(36),              -- 自动创建的组织ID
  institution_name VARCHAR(200) NOT NULL,
  institution_type ENUM('bank', 'factoring', 'platform', 'other'),
  unified_social_credit_code VARCHAR(18) UNIQUE,
  cumulative_credit_limit DECIMAL(20,2),
  current_loan_balance DECIMAL(20,2),
  status ENUM('active', 'disabled')
);

-- 融资方
CREATE TABLE financiers (
  id VARCHAR(36) PRIMARY KEY,
  org_id VARCHAR(36),
  enterprise_name VARCHAR(200) NOT NULL,
  unified_social_credit_code VARCHAR(18) UNIQUE,
  total_credit_limit DECIMAL(20,2),
  remaining_credit_limit DECIMAL(20,2),
  status ENUM('active', 'warning', 'suspended')
);
```

#### 合同

```sql
-- 普通合同
CREATE TABLE contracts (
  id VARCHAR(36) PRIMARY KEY,
  type ENUM('financing', 'brokerage'),
  funder_id VARCHAR(36),
  funder_name VARCHAR(200),
  logistics_provider_id VARCHAR(36),   -- 融资方ID
  logistics_provider_name VARCHAR(200),
  credit_limit DECIMAL(20,2),
  annual_interest_rate DECIMAL(5,2),
  profit_sharing_ratio DECIMAL(5,2),
  status ENUM('active', 'expiring_soon', 'expired', 'disabled')
);

-- 定向支付合同
CREATE TABLE directed_pay_contracts (
  id VARCHAR(36) PRIMARY KEY,
  contract_number VARCHAR(50) UNIQUE,
  funder_id VARCHAR(36) NOT NULL,
  financier_id VARCHAR(36) NOT NULL,
  credit_limit DECIMAL(18,2),
  used_amount DECIMAL(18,2) DEFAULT 0,
  available_amount DECIMAL(18,2),
  annual_interest_rate DECIMAL(5,4),
  status ENUM('draft', 'pending_approval', 'active', 'suspended', 'expired', 'terminated')
);
```

#### 运单与支付

```sql
-- 运单
CREATE TABLE waybills (
  id VARCHAR(36) PRIMARY KEY,
  external_id VARCHAR(255) UNIQUE,    -- 外部系统ID（用于同步去重）
  waybill_number VARCHAR(50) UNIQUE,
  customer_id VARCHAR(36),            -- 融资方ID
  customer_name VARCHAR(200),
  freight_amount DECIMAL(15,2),
  total_payment DECIMAL(15,2),
  status ENUM('created', 'dispatched', 'loading', 'in_transit', 'delivered', 'signed', 'settled', 'completed'),
  waybill_date DATE
);

-- 支付申请
CREATE TABLE directed_payment_requests (
  id VARCHAR(36) PRIMARY KEY,
  request_number VARCHAR(50) UNIQUE,
  contract_id VARCHAR(36) NOT NULL,
  waybill_id VARCHAR(36),
  category_code VARCHAR(50),
  payment_amount DECIMAL(18,2),
  status ENUM('pending', 'platform_pending', 'funder_pending', 'approved', 'rejected', 'processing', 'success', 'failed', 'cancelled'),
  platform_approval_status ENUM('pending', 'approved', 'rejected'),
  funder_approval_status ENUM('pending', 'approved', 'rejected')
);
```

#### 收益

```sql
CREATE TABLE revenue_records (
  id VARCHAR(36) PRIMARY KEY,
  record_type ENUM('revenue', 'expense'),
  beneficiary_type ENUM('platform', 'funder', 'financier'),
  beneficiary_id VARCHAR(36),
  source_type ENUM('financing_interest', 'directed_pay_interest', 'brokerage_commission', 'commission_fee'),
  contract_id VARCHAR(36),
  amount DECIMAL(18,2),
  revenue_date DATE,
  status ENUM('pending', 'confirmed', 'settled')
);
```

### 5.2 数据库迁移

迁移脚本位于 `backend/src/migrations/`：

| 文件 | 功能 |
|-----|------|
| `multi-tenant.ts` | 多租户支持（org_units表结构） |
| `create-orgs-for-existing-entities.ts` | 为现有资金方/融资方创建组织 |
| `directed-payment-tables.ts` | 定向支付相关表 |
| `revenue-tables.ts` | 收益管理表 |
| `crawler-tables.ts` | 爬虫配置表 |

---

## 6. API 设计

### 6.1 认证 API

```
POST /api/auth/login          # 登录
POST /api/auth/logout         # 登出
GET  /api/auth/me             # 获取当前用户信息
POST /api/auth/change-password # 修改密码
```

### 6.2 用户管理 API

```
GET    /api/users             # 用户列表
POST   /api/users             # 创建用户
GET    /api/users/:id         # 用户详情
PUT    /api/users/:id         # 更新用户
DELETE /api/users/:id         # 删除用户

GET    /api/roles             # 角色列表
GET    /api/permissions       # 权限树
GET    /api/org-units         # 组织列表
```

### 6.3 业务主体 API

```
# 资金方
GET    /api/funders
POST   /api/funders
GET    /api/funders/:id
PUT    /api/funders/:id

# 融资方
GET    /api/financiers
POST   /api/financiers
GET    /api/financiers/:id
PUT    /api/financiers/:id
```

### 6.4 合同 API

```
# 普通合同
GET    /api/contracts
POST   /api/contracts
GET    /api/contracts/:id
PUT    /api/contracts/:id

# 定向支付合同
GET    /api/directed-pay/contracts
POST   /api/directed-pay/contracts
GET    /api/directed-pay/contracts/:id
PUT    /api/directed-pay/contracts/:id
GET    /api/directed-pay/contracts/:id/categories  # 支付类别配置
```

### 6.5 定向支付 API

```
# 支付申请
GET    /api/directed-pay/requests
POST   /api/directed-pay/requests
GET    /api/directed-pay/requests/:id
POST   /api/directed-pay/requests/:id/platform-approve  # 平台审批
POST   /api/directed-pay/requests/:id/funder-approve    # 资金方审批
POST   /api/directed-pay/requests/:id/execute           # 执行支付

# 结算
GET    /api/directed-pay/settlements
POST   /api/directed-pay/settlements/:id/confirm
```

### 6.6 收益 API

```
# 平台收益
GET    /api/revenue/platform/stats
GET    /api/revenue/platform/list
GET    /api/revenue/platform/trend
GET    /api/revenue/platform/composition
GET    /api/revenue/platform/ranking

# 资金方收益
GET    /api/revenue/funder/stats
GET    /api/revenue/funder/list

# 融资方支出
GET    /api/revenue/financier/stats
GET    /api/revenue/financier/list
```

### 6.7 运单 API

```
GET    /api/waybills
POST   /api/waybills
GET    /api/waybills/:id
PUT    /api/waybills/:id/status
GET    /api/waybills/stats
```

### 6.8 爬虫 API

```
GET    /api/crawlers
POST   /api/crawlers
PUT    /api/crawlers/:id
DELETE /api/crawlers/:id
POST   /api/crawlers/:id/sync     # 手动触发同步
GET    /api/crawlers/:id/logs     # 同步日志
POST   /api/crawlers/test         # 测试连接
```

---

## 7. 权限与多租户系统

### 7.1 权限检查流程

```typescript
// backend/src/auth.ts

// 1. 验证 JWT
const decoded = jwt.verify(token, JWT_SECRET);

// 2. 获取用户信息和权限
const user = await store.findUserById(decoded.userId);
const permissions = await getPermissionsForRoles(user.roleIds);

// 3. 设置 orgContext
const org = await store.findOrgById(user.orgId);
req.orgContext = buildOrgContext(org);

// 4. 在路由中使用
router.get('/contracts', authMiddleware, (req, res) => {
  const { financierId, funderId, isPlatformUser } = req.orgContext;
  
  if (isPlatformUser) {
    // 返回所有数据
  } else if (financierId) {
    // 只返回该融资方的数据
  } else if (funderId) {
    // 只返回该资金方的数据
  }
});
```

### 7.2 数据隔离实现

**关键原则**: 所有涉及业务数据的查询都必须根据 `orgContext` 过滤。

```typescript
// 示例：获取支付申请列表
async function getPaymentRequests(filters: Filters) {
  const conditions = [];
  
  // 数据隔离条件
  if (filters.financierId) {
    conditions.push(`dpc.financier_id = ?`);
    params.push(filters.financierId);
  }
  if (filters.funderId) {
    conditions.push(`dpc.funder_id = ?`);
    params.push(filters.funderId);
  }
  
  // ... 其他过滤条件
}
```

### 7.3 权限检查装饰模式

```typescript
// 检查用户是否有特定权限
function hasPermission(permissions: string[] | undefined, required: string): boolean {
  if (!permissions) return false;
  if (permissions.includes("*")) return true;  // 超级管理员
  return permissions.includes(required);
}

// 在路由中使用
if (!hasPermission(req.user.permissions, "create_payment_request")) {
  return res.status(403).json({ error: "权限不足" });
}
```

### 7.4 平台用户判断

```typescript
// 判断是否为平台用户的多重条件
const isPlatformUser = 
  user?.permissions?.includes("*") ||           // admin有*权限
  user?.orgContext?.orgType === 'platform' ||   // 组织类型为平台
  hasPermission(user?.permissions, "view_platform_revenue");  // 有平台权限
```

---

## 8. 前端架构

### 8.1 认证上下文

```typescript
// frontend/src/auth.tsx

interface AuthContextType {
  user: SafeUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

// 使用
const { user, login, logout } = useAuth();
```

### 8.2 TabManager (页面缓存)

TabManager 实现了类似浏览器标签页的页面缓存机制：

```typescript
// frontend/src/components/TabManager.tsx

interface TabConfig {
  key: string;
  path: string;
  label: string;
  element: React.ReactNode;
}

// 使用 useMemo 缓存页面组件
const cachedTabs = useMemo(() => {
  return configs.map(config => ({
    ...config,
    element: React.cloneElement(config.element)
  }));
}, [configs]);
```

**注意**: 由于 TabManager 缓存，页面组件不会重新挂载。如需刷新数据：
1. 使用 `refreshKey` state 强制刷新
2. 添加手动刷新按钮

### 8.3 API 调用

```typescript
// frontend/src/api.ts

// 动态 API 地址（支持局域网访问）
const API_BASE = (() => {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3001/api';
  }
  return `http://${hostname}:3001/api`;
})();

// 通用请求函数
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('authToken');
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options?.headers,
    },
  });
  
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}
```

### 8.4 数据可视化

使用 ECharts 实现图表：

```typescript
// 示例：收益趋势图
const chartOption = {
  xAxis: { type: 'category', data: dates },
  yAxis: { type: 'value' },
  series: [
    { name: '总收益', type: 'line', data: amounts },
    { name: '已确认', type: 'line', data: confirmedAmounts },
  ]
};
```

---

## 9. 关键设计决策

### 9.1 为什么使用 orgContext 而不是直接查询 org_units？

**问题**: 每次请求都查询数据库获取组织信息开销大。

**解决**: 在认证中间件中一次性获取并缓存到 `req.orgContext`。

### 9.2 为什么资金方/融资方创建时自动创建组织？

**问题**: 需要为资金方/融资方分配用户，用户需要归属组织。

**解决**: 创建资金方/融资方时自动创建对应组织，并设置 `related_entity_id` 关联。

```typescript
// 创建资金方时
const funderId = randomUUID();
const orgId = randomUUID();

await pool.query(`INSERT INTO org_units (...) VALUES (?, ?, 'funder', ?)`, 
  [orgId, name, funderId]);
await pool.query(`INSERT INTO funders (..., org_id) VALUES (..., ?)`, 
  [...values, orgId]);
```

### 9.3 为什么使用 `unlockStatus` 机制？

**问题**: 不同类型的费用应在运单不同阶段才能申请（如油卡在派单后，运费在签收后）。

**解决**: 每个支付类别配置一个 `unlockStatus`，只有运单状态 >= 此状态才能申请。

```typescript
function isPaymentUnlocked(waybillStatus: WaybillStatus, unlockStatus: WaybillStatus): boolean {
  return WAYBILL_STATUS_ORDER.indexOf(waybillStatus) >= WAYBILL_STATUS_ORDER.indexOf(unlockStatus);
}
```

### 9.4 为什么预估收益基于历史数据而非合同配置？

**问题**: 合同表没有 `used_amount` 字段，无法直接计算。

**解决**: 基于过去30天的平均日收益预估未来30天。

```typescript
// 计算过去30天日均 × 30
const dailyAverage = last30DaysTotal / actualDays;
const estimatedRevenue = dailyAverage * 30;
```

### 9.5 TabManager 缓存导致数据不刷新

**问题**: 切换页面后返回，`useEffect` 不重新执行。

**解决方案**:

1. **手动刷新按钮**:
```typescript
const [refreshKey, setRefreshKey] = useState(0);
useEffect(() => { loadData(); }, [refreshKey]);
<Button onClick={() => setRefreshKey(k => k + 1)}>刷新数据</Button>
```

2. **使用页面焦点检测**:
```typescript
useEffect(() => {
  const handleFocus = () => loadData();
  window.addEventListener('focus', handleFocus);
  return () => window.removeEventListener('focus', handleFocus);
}, []);
```

---

## 10. 常见问题与解决方案

### 10.1 端口被占用 (EADDRINUSE)

```bash
# 查找并杀掉占用端口的进程
lsof -ti:3001 | xargs kill -9
```

### 10.2 数据库连接配置

```bash
# 环境变量
DB_HOST=127.0.0.1
DB_PORT=3307
DB_USER=root
DB_PASSWORD=root123
DB_NAME=testjr
```

### 10.3 局域网无法访问

1. **前端**: Vite 需要 `--host 0.0.0.0` 参数
2. **后端**: Express 监听 `0.0.0.0`
3. **防火墙**: macOS 需要允许 Node.js 接受网络连接

```bash
# 临时关闭防火墙（测试用）
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate off
```

### 10.4 新建的资金方/融资方不显示在下拉列表

**原因**: TabManager 缓存导致页面不刷新。

**解决**: 在合同创建页面添加刷新按钮。

### 10.5 权限检查失效（所有用户都是平台用户）

**原因**: `findOrgById` 没有返回 `type` 和 `related_entity_id` 字段。

**解决**: 确保 SQL 查询包含这些字段：

```sql
SELECT id, name, parent_id, is_active, type, related_entity_id 
FROM org_units WHERE id = ?
```

### 10.6 中文乱码

**原因**: MySQL 客户端/服务端字符集不一致。

**解决**: 确保数据库使用 `utf8mb4`：

```sql
CREATE DATABASE testjr CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

---

## 11. 开发指南

### 11.1 本地开发启动

```bash
# 1. 安装依赖
npm install

# 2. 启动数据库（Docker）
docker-compose up -d mysql

# 3. 启动后端
DB_HOST=127.0.0.1 DB_PORT=3307 DB_USER=root DB_PASSWORD=root123 DB_NAME=testjr npm run dev:backend

# 4. 启动前端
npm run dev:frontend
```

### 11.2 添加新的 API

1. 在 `backend/src/types.ts` 定义类型
2. 创建 `backend/src/xxx-store.ts` 数据存储
3. 在 `backend/src/routes.ts` 或创建 `xxx-routes.ts` 添加路由
4. 在 `frontend/src/api.ts` 添加 API 调用函数
5. 创建前端页面组件

### 11.3 添加数据库迁移

```typescript
// backend/src/migrations/xxx.ts
export async function runMigration() {
  const pool = await import("../db.js").then(m => m.pool);
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS xxx (...)
  `);
  
  console.log("Migration completed");
}
```

在 `backend/src/index.ts` 中调用：

```typescript
import { runMigration } from "./migrations/xxx.js";
await runMigration();
```

### 11.4 添加新页面

1. 创建 `frontend/src/pages/XxxPage.tsx`
2. 在 `frontend/src/layouts/AppLayout.tsx` 添加菜单项
3. 在 `tabConfigs` 中注册页面（如需缓存）

### 11.5 测试账户

| 用户名 | 密码 | 角色 | 说明 |
|-------|------|------|------|
| admin | admin123 | 超级管理员 | 所有权限 |
| funder_user | test123 | 资金方用户 | 仅查看本资金方数据 |
| financier_user | test123 | 融资方用户 | 仅查看本融资方数据 |

---

## 附录

### A. 枚举值速查

```typescript
// 合同状态
ContractStatus: "active" | "expiring_soon" | "expired" | "disabled"

// 运单状态
WaybillStatus: "created" | "dispatched" | "loading" | "in_transit" | "delivered" | "signed" | "settled" | "completed"

// 支付申请状态
PaymentRequestStatus: "pending" | "platform_pending" | "funder_pending" | "approved" | "rejected" | "processing" | "success" | "failed" | "cancelled"

// 收益来源
RevenueSourceType: "financing_interest" | "directed_pay_interest" | "brokerage_commission" | "commission_fee"
```

### B. 重要文件索引

| 功能 | 后端文件 | 前端文件 |
|------|---------|---------|
| 认证 | `auth.ts` | `auth.tsx` |
| 用户管理 | `store.ts` | `Users.tsx` |
| 合同管理 | `routes.ts`, `directed-payment-routes.ts` | `Contracts.tsx`, `DirectedPayContracts.tsx` |
| 支付申请 | `directed-payment-requests-store.ts` | `DirectedPayRequests.tsx` |
| 收益管理 | `revenue-store.ts`, `revenue-routes.ts` | `PlatformRevenue.tsx`, `FunderRevenue.tsx` |
| 运单管理 | `waybills-store.ts` | `Waybills.tsx` |
| 爬虫 | `crawler/` | - |

### C. 环境变量

```bash
# 数据库
DB_HOST=127.0.0.1
DB_PORT=3307
DB_USER=root
DB_PASSWORD=root123
DB_NAME=testjr

# JWT
JWT_SECRET=your-secret-key

# AI (可选)
DASHSCOPE_API_KEY=xxx
OPENAI_API_KEY=xxx
```

---

*文档结束 - 如有疑问请查阅源代码或联系开发团队*
