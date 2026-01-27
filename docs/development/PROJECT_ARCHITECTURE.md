# 登途云项目架构说明

> 本文档整理项目的核心架构信息，作为开发时的快速参考。

---

## 1. 项目概述

**登途云** 是一个物流金融服务平台，连接三方角色：
- **平台方**：系统运营方，管理合同和资金
- **资金方**：提供融资资金的金融机构
- **融资方/物流商**：需要融资服务的物流企业

---

## 2. 技术栈

### 后端
| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | 22.x | 运行环境 |
| TypeScript | 5.x | 类型系统 |
| Express.js | 4.x | Web框架 |
| MySQL | 8.x | 数据库 |
| mysql2 | - | 数据库驱动 |
| jsonwebtoken | - | JWT认证 |
| node-cron | - | 定时任务 |

### 前端
| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.x | UI框架 |
| TypeScript | 5.x | 类型系统 |
| Vite | 5.x | 构建工具 |
| Ant Design | 5.x | UI组件库 |
| ECharts | 5.x | 图表 |
| React Router | 6.x | 路由 |
| i18next | - | 国际化 |
| dayjs | - | 日期处理 |

---

## 3. 目录结构

```
├── backend/
│   └── src/
│       ├── index.ts              # 应用入口
│       ├── routes.ts             # 主路由（API端点）
│       ├── store.ts              # 核心数据存储层
│       ├── db.ts                 # 数据库连接
│       ├── types.ts              # 类型定义
│       ├── auth.ts               # 认证中间件
│       │
│       ├── contract-loan-store.ts      # 合同放款管理
│       ├── commission-calculation.ts   # 抽成计算
│       ├── settlement-scheduler.ts     # 结算调度器
│       ├── settlements-store.ts        # 结算数据管理
│       ├── directed-pay-*.ts           # 定向支付相关
│       ├── revenue-*.ts                # 收益管理相关
│       │
│       ├── migrations/           # 数据库迁移
│       └── crawler/              # TMS数据爬虫
│
├── frontend/
│   └── src/
│       ├── App.tsx               # 应用入口和路由
│       ├── api.ts                # API调用封装
│       ├── types.ts              # 类型定义
│       ├── auth.tsx              # 认证上下文
│       ├── i18n.tsx              # 国际化
│       │
│       ├── layouts/
│       │   └── AppLayout.tsx     # 主布局（菜单、Tab管理）
│       │
│       ├── pages/                # 页面组件
│       │   ├── Workbench.tsx           # 工作台
│       │   ├── Contracts.tsx           # 三方融资合同
│       │   ├── BrokerageContracts.tsx  # 撮合业务合同
│       │   ├── NewContracts.tsx        # 抽成合同
│       │   ├── DirectedPayContracts.tsx # 定向支付合同
│       │   ├── SettlementDashboard.tsx # 结算仪表板
│       │   ├── Waybills.tsx            # 运单数据
│       │   └── ...
│       │
│       └── components/           # 通用组件
│
└── docs/
    ├── development/              # 开发日志
    │   ├── DEVELOPMENT_LOG.md    # 功能开发记录
    │   ├── ERROR_HANDLING_LOG.md # 错误处理记录
    │   └── PROJECT_ARCHITECTURE.md # 本文档
    │
    ├── products/                 # 产品文档
    └── testing/                  # 测试文档
```

---

## 4. 核心业务模块

### 4.1 合同管理

| 合同类型 | 说明 | 核心表 |
|----------|------|--------|
| 三方融资 | 平台+资金方+融资方三方合同 | `contracts` (type=financing) |
| 撮合业务 | 平台为融资方撮合业务 | `contracts` (type=brokerage) |
| 抽成合同 | 按运单抽取费用 | `commission_contracts` |
| 定向支付 | 资金方定向支付给司机 | `directed_pay_contracts` |

### 4.2 结算中心

| 结算类型 | 说明 | 触发方式 |
|----------|------|----------|
| 融资还款 | 融资方还本付息 | 定时任务 + 手动 |
| 定向支付结算 | 汇总支付记录生成账单 | 定时任务 + 手动 |
| 抽成结算 | 按合同配置计算抽成 | 定时任务 + 手动 |
| 分润结算 | 撮合业务分润 | 手动 |

### 4.3 定向支付

```
[运单] ──▶ [创建支付申请] ──▶ [平台审批] ──▶ [资金方审批] ──▶ [执行支付]
                                   │              │
                                   ▼              ▼
                               [平台拒绝]     [资金方拒绝]
```

---

## 5. 数据库核心表

### 用户与权限
- `users` - 用户
- `groups` - 用户组
- `permissions` - 权限
- `org_units` - 组织单元

### 业务主体
- `funders` - 资金方档案
- `financiers` - 融资方档案

### 合同
- `contracts` - 融资/撮合合同
- `commission_contracts` - 抽成合同
- `directed_pay_contracts` - 定向支付合同
- `payment_category_configs` - 支付类别配置

### 业务数据
- `waybills` - 运单
- `contract_disbursements` - 放款记录
- `contract_repayments` - 还款记录
- `contract_interest_accruals` - 利息台账

### 结算
- `settlements` - 通用结算单
- `directed_pay_settlements` - 定向支付结算单
- `directed_pay_settlement_items` - 结算明细

### 支付
- `directed_payment_requests` - 定向支付申请
- `payment_ledger` - 支付流水

---

## 6. 利息计算规则

### 三方融资
```
日利息 = 未还本金 × (年利率 / 360)
```

### 定向支付
```
利息 = 支付本金 × 年利率 × (计息天数 / 360)
计息天数 = 结算日 - 支付日
```

---

## 7. 定时任务

| 任务 | 执行时间 | 功能 |
|------|----------|------|
| 结算调度器 | 每日 02:00 | 利息计算、逾期检查、结算单生成 |
| 收益计算 | 每日 01:00 | 平台收益统计 |
| 爬虫同步 | 按配置 | TMS运单数据同步 |

---

## 8. 开发规范

### 命名约定
- 文件名：`kebab-case` (如 `commission-calculation.ts`)
- 类型/接口：`PascalCase` (如 `CommissionContract`)
- 函数/变量：`camelCase` (如 `calculateInterest`)
- 数据库字段：`snake_case` (如 `interest_amount`)
- 常量：`UPPER_SNAKE_CASE` (如 `DEFAULT_RATE`)

### 新增页面检查清单
1. [ ] 创建页面组件 `frontend/src/pages/XxxPage.tsx`
2. [ ] 在 `App.tsx` 添加 Route
3. [ ] 在 `AppLayout.tsx` 添加菜单项
4. [ ] 在 `AppLayout.tsx` 添加 TabConfig
5. [ ] 如需权限控制，添加权限检查

### 新增 API 检查清单
1. [ ] 在 `routes.ts` 添加路由处理
2. [ ] 在 `frontend/src/api.ts` 添加 API 调用函数
3. [ ] 添加必要的类型定义
4. [ ] 添加权限验证 `requirePermissions()`

---

## 9. 快速参考

### 启动开发环境
```bash
# 后端
cd backend && npm run dev

# 前端
cd frontend && npm run dev

# 数据库 (Docker)
docker-compose up -d mysql
```

### 默认登录
- 用户名: `admin`
- 密码: `admin123`

### API 地址
- 开发环境: `http://localhost:3001/api`
