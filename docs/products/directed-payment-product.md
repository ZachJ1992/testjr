# 资金定向支付产品设计方案

## 一、产品概述

### 1.1 产品定位
资金定向支付是一款供应链金融产品，通过平台为物流企业（融资方）提供运营资金支持，实现对司机运费、油费、ETC、工资等费用的定向支付，确保资金流向可控、用途合规。

### 1.2 核心价值
- **对资金方**：资金用途可控，回款路径安全，风险可追溯
- **对融资方**：获得运营资金支持，提升运力管理效率
- **对司机**：快速收到运费，支持多种收款方式
- **对平台**：交易闭环，数据沉淀，服务费收入

### 1.3 业务角色

| 角色 | 说明 |
|------|------|
| 资金方 | 提供授信额度的金融机构，拥有账户体系 |
| 融资方 | 物流企业/车队，使用授信进行定向支付 |
| 司机 | 运费接收方，使用TMS司机端 |
| 平台 | 提供系统支持，进行风控和结算 |

### 1.4 资金安全设计

> **核心原则**：资金方为融资方建立专门账户，运单运费回款至该账户，保证回款安全。

```
┌─────────────────────────────────────────────────────────────────────┐
│                         资金流向示意图                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌──────────┐         ┌──────────────┐         ┌──────────┐       │
│   │  资金方   │────────>│ 融资方专属账户 │────────>│   司机    │       │
│   │ 账户体系  │  授信    │ (资金方体系内) │  定向支付 │          │       │
│   └──────────┘         └──────────────┘         └──────────┘       │
│        ▲                      ▲                                     │
│        │                      │                                     │
│        │                      │ 运费回款                            │
│        │                      │ (后续实现)                          │
│        │               ┌──────────────┐                             │
│        └───────────────│   货主付款    │                             │
│           额度恢复      └──────────────┘                             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

当前阶段：仅实现放款流程
后续阶段：实现回款归集和额度恢复
```

---

## 二、业务流程

### 2.1 整体流程图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              资金定向支付业务流程                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐             │
│  │ 1.签约   │───>│ 2.授信   │───>│ 3.运单   │───>│ 4.支付   │             │
│  │ 合同配置  │    │ 额度生效  │    │ 数据匹配  │    │ 申请发起  │             │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘             │
│       │                               │               │                    │
│       ▼                               ▼               ▼                    │
│  ┌──────────┐                   ┌──────────┐    ┌──────────┐             │
│  │ 支付类别  │                   │ 费用提取  │    │ 双重审批  │             │
│  │ 费率配置  │                   │ 自动识别  │    │平台+资金方│             │
│  └──────────┘                   └──────────┘    └──────────┘             │
│                                                       │                    │
│                                                       ▼                    │
│                                 ┌──────────┐    ┌──────────┐             │
│                                 │ 5.执行   │───>│ 6.结算   │             │
│                                 │ 定向支付  │    │ 账单生成  │             │
│                                 └──────────┘    └──────────┘             │
│                                      │               │                    │
│                                      ▼               ▼                    │
│                                 ┌──────────┐    ┌──────────┐             │
│                                 │ 司机收款  │    │ 还款结算  │             │
│                                 │ 多种方式  │    │ 利息计算  │             │
│                                 └──────────┘    └──────────┘             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 审批流程

```
┌─────────────────────────────────────────────────────────────────┐
│                        支付申请审批流程                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌────────┐  │
│   │ 发起申请  │───>│ 平台审批  │───>│ 资金方审批 │───>│ 执行支付 │  │
│   └──────────┘    └──────────┘    └──────────┘    └────────┘  │
│                        │               │                       │
│                        ▼               ▼                       │
│                   ┌────────┐     ┌────────┐                   │
│                   │  拒绝   │     │  拒绝   │                   │
│                   └────────┘     └────────┘                   │
│                                                                 │
│   注：admin 用户拥有全部审批权限，可跳过审批流程                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 收款方式

| 方式 | 代码 | 说明 |
|------|------|------|
| 银行卡直付 | `bank_transfer` | 直接转账到司机银行卡 |
| 虚拟账户 | `virtual_account` | 充值到平台虚拟账户 |
| **平台直付** | `payment_code` | 平台直接支付，生成付款码同步到TMS |
| 油卡充值 | `oil_card` | 充值到指定油卡 |
| ETC充值 | `etc_recharge` | 充值到ETC账户 |

#### 付款码模式详细设计

```
┌─────────────────────────────────────────────────────────────────┐
│                        付款码工作流程                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   1. 平台生成付款码                                              │
│      ┌──────────────────────────────────────────┐               │
│      │ PaymentCode {                            │               │
│      │   code: "DPY20260114xxxxx",             │               │
│      │   amount: 5000.00,                      │               │
│      │   expireAt: "2026-01-15 12:00:00",      │  有效期24小时  │
│      │   status: "active",                      │               │
│      │   driverId: "xxx",                       │               │
│      │   waybillId: "xxx"                       │               │
│      │ }                                        │               │
│      └──────────────────────────────────────────┘               │
│                         │                                       │
│                         ▼                                       │
│   2. 通过API推送到TMS司机端                                       │
│      POST /tms/api/payment-codes                                │
│      {                                                          │
│        "driverId": "xxx",                                       │
│        "code": "DPY20260114xxxxx",                             │
│        "amount": 5000.00,                                       │
│        "expireAt": "2026-01-15 12:00:00",                      │
│        "waybillNumber": "WB20260114001"                        │
│      }                                                          │
│                         │                                       │
│                         ▼                                       │
│   3. 司机在TMS端查看并使用付款码                                   │
│      - 展示付款码和金额                                          │
│      - 展示有效期倒计时                                          │
│      - 支持扫码核销或手动输入核销                                  │
│                         │                                       │
│                         ▼                                       │
│   4. 核销后完成支付                                              │
│      - 付款码状态变为 "used"                                     │
│      - 资金实际划转                                              │
│      - 记录支付流水                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 三、数据模型设计

### 3.1 实体关系图

```
┌─────────────────────┐
│ DirectedPayContract │ 定向支付合同
├─────────────────────┤
│ id                  │
│ contractNumber      │
│ funderId            │───────┐
│ financierId         │───┐   │
│ funderAccountId     │   │   │  资金方为融资方开设的专属账户
│ creditLimit         │   │   │
│ usedAmount          │   │   │
│ availableAmount     │   │   │
│ annualInterestRate  │   │   │
│ status              │   │   │
└─────────────────────┘   │   │
         │                │   │
         │ 1:N            │   │
         ▼                │   │
┌─────────────────────┐   │   │
│ PaymentCategory     │   │   │      ┌─────────────┐
│ Config              │   │   │      │   Funder    │
├─────────────────────┤   │   └─────>│   (资金方)   │
│ contractId          │   │          │ + 账户体系   │
│ categoryCode        │   │          └─────────────┘
│ serviceRate         │   │
│ requireApproval     │   │          ┌─────────────┐
└─────────────────────┘   └─────────>│  Financier  │
         │                           │  (融资方)    │
         │                           └─────────────┘
         ▼
┌─────────────────────┐      ┌─────────────────────┐
│ DirectedPayment     │      │    VirtualAccount   │
│ Request             │      │    (虚拟账户)        │
├─────────────────────┤      ├─────────────────────┤
│ requestNumber       │      │ id                  │
│ contractId          │      │ accountNumber       │
│ waybillId           │      │ ownerType           │ driver/financier
│ categoryCode        │      │ ownerId             │
│ paymentAmount       │      │ balance             │
│ receiverType        │      │ frozenAmount        │
│ platformApproval    │      │ status              │
│ funderApproval      │      └─────────────────────┘
│ status              │               │
└─────────────────────┘               │
         │                            │
         │                            ▼
         │                   ┌─────────────────────┐
         │                   │ VirtualAccountTxn   │
         │                   │ (账户流水)           │
         │                   ├─────────────────────┤
         ▼                   │ accountId           │
┌─────────────────────┐      │ txnType             │
│ PaymentCode         │      │ amount              │
│ (付款码)            │      │ balanceBefore       │
├─────────────────────┤      │ balanceAfter        │
│ code                │      │ relatedId           │
│ requestId           │      └─────────────────────┘
│ amount              │
│ expireAt            │
│ status              │
│ usedAt              │
└─────────────────────┘
```

### 3.2 数据表结构

#### directed_pay_contracts (定向支付合同表)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(36) | 主键 |
| contract_number | VARCHAR(50) | 合同编号 |
| funder_id | VARCHAR(36) | 资金方ID |
| financier_id | VARCHAR(36) | 融资方ID |
| funder_account_id | VARCHAR(100) | 资金方为融资方开设的专属账户ID |
| credit_limit | DECIMAL(18,2) | 授信总额度 |
| used_amount | DECIMAL(18,2) | 已用额度 |
| available_amount | DECIMAL(18,2) | 可用额度 |
| annual_interest_rate | DECIMAL(5,4) | 年化利率 |
| interest_calc_base | INT | 计息基数 (360/365) |
| start_date | DATE | 合同开始日期 |
| end_date | DATE | 合同结束日期 |
| settlement_cycle | VARCHAR(20) | 结算周期 |
| settlement_day | INT | 结算日 |
| grace_period_days | INT | 宽限期天数 |
| status | VARCHAR(20) | 状态 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |
| deleted_at | DATETIME | 软删除时间 |

**状态枚举 (DirectedPayContractStatus)**:
```typescript
type DirectedPayContractStatus = 
  | "draft"            // 草稿
  | "pending_approval" // 待审批
  | "active"           // 生效中
  | "suspended"        // 已暂停
  | "expired"          // 已到期
  | "terminated";      // 已终止
```

#### payment_category_configs (支付类别配置表)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(36) | 主键 |
| contract_id | VARCHAR(36) | 合同ID |
| category_code | VARCHAR(50) | 类别代码 |
| category_name | VARCHAR(100) | 类别名称 |
| payment_ratio | DECIMAL(5,2) | 支付比例(0-100)，如80表示最多支付原始金额的80% |
| min_amount | DECIMAL(18,2) | 单笔最小金额 |
| max_amount | DECIMAL(18,2) | 单笔最大金额 |
| daily_limit | DECIMAL(18,2) | 日累计限额 |
| require_platform_approval | TINYINT(1) | 是否需要平台审批 |
| require_funder_approval | TINYINT(1) | 是否需要资金方审批 |
| platform_approval_threshold | DECIMAL(18,2) | 平台审批阈值 |
| funder_approval_threshold | DECIMAL(18,2) | 资金方审批阈值 |
| is_enabled | TINYINT(1) | 是否启用 |
| created_at | DATETIME | 创建时间 |

**预设支付类别**:
```typescript
const PAYMENT_CATEGORIES = [
  { code: "FREIGHT", name: "运费", description: "支付给司机的运费" },
  { code: "OIL_CARD", name: "油卡", description: "油卡充值" },
  { code: "ETC", name: "ETC", description: "ETC充值/代扣" },
  { code: "SALARY", name: "工资", description: "司机工资" },
  { code: "INSURANCE", name: "保险", description: "货运保险费" },
  { code: "MAINTENANCE", name: "维修", description: "车辆维修费" },
  { code: "TOLL", name: "路桥费", description: "路桥通行费" },
  { code: "OTHER", name: "其他", description: "其他费用" }
];
```

#### directed_payment_requests (定向支付申请表)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(36) | 主键 |
| request_number | VARCHAR(50) | 申请编号 |
| contract_id | VARCHAR(36) | 合同ID |
| waybill_id | VARCHAR(36) | 运单ID |
| waybill_number | VARCHAR(50) | 运单号 |
| category_code | VARCHAR(50) | 支付类别 |
| payment_amount | DECIMAL(18,2) | 支付金额 |
| service_fee | DECIMAL(18,2) | 服务费 |
| interest_start_time | DATETIME | 计息开始时间 |
| receiver_type | VARCHAR(20) | 收款方式 |
| receiver_name | VARCHAR(100) | 收款方名称 |
| receiver_account | VARCHAR(100) | 收款账号 |
| receiver_bank | VARCHAR(100) | 收款银行 |
| driver_id | VARCHAR(36) | 司机ID |
| remark | TEXT | 备注 |
| status | VARCHAR(20) | 状态 |
| platform_approval_status | VARCHAR(20) | 平台审批状态 |
| platform_approved_by | VARCHAR(36) | 平台审批人 |
| platform_approved_at | DATETIME | 平台审批时间 |
| platform_approval_remark | TEXT | 平台审批备注 |
| funder_approval_status | VARCHAR(20) | 资金方审批状态 |
| funder_approved_by | VARCHAR(36) | 资金方审批人 |
| funder_approved_at | DATETIME | 资金方审批时间 |
| funder_approval_remark | TEXT | 资金方审批备注 |
| created_by | VARCHAR(36) | 申请人 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

**收款方式枚举**:
```typescript
type ReceiverType = 
  | "bank_transfer"    // 银行卡直付
  | "virtual_account"  // 虚拟账户
  | "payment_code"     // 平台直付
  | "oil_card"         // 油卡充值
  | "etc_recharge";    // ETC充值
```

**状态枚举**:
```typescript
type PaymentRequestStatus = 
  | "pending"          // 待处理
  | "platform_pending" // 待平台审批
  | "funder_pending"   // 待资金方审批
  | "approved"         // 审批通过
  | "rejected"         // 已拒绝
  | "processing"       // 处理中
  | "success"          // 支付成功
  | "failed"           // 支付失败
  | "cancelled";       // 已取消

type ApprovalStatus = 
  | "pending"          // 待审批
  | "approved"         // 已通过
  | "rejected";        // 已拒绝
```

#### payment_codes (付款码表)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(36) | 主键 |
| code | VARCHAR(50) | 付款码（唯一） |
| request_id | VARCHAR(36) | 关联的支付申请ID |
| driver_id | VARCHAR(36) | 司机ID |
| amount | DECIMAL(18,2) | 金额 |
| expire_at | DATETIME | 过期时间 |
| status | VARCHAR(20) | 状态 |
| used_at | DATETIME | 使用时间 |
| tms_sync_status | VARCHAR(20) | TMS同步状态 |
| tms_sync_time | DATETIME | TMS同步时间 |
| tms_sync_response | JSON | TMS同步响应 |
| created_at | DATETIME | 创建时间 |

**状态枚举**:
```typescript
type PaymentCodeStatus = 
  | "active"   // 有效
  | "used"     // 已使用
  | "expired"  // 已过期
  | "cancelled"; // 已取消
```

#### virtual_accounts (虚拟账户表)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(36) | 主键 |
| account_number | VARCHAR(50) | 账户号（唯一） |
| owner_type | VARCHAR(20) | 所有者类型 |
| owner_id | VARCHAR(36) | 所有者ID |
| owner_name | VARCHAR(100) | 所有者名称 |
| balance | DECIMAL(18,2) | 可用余额 |
| frozen_amount | DECIMAL(18,2) | 冻结金额 |
| total_income | DECIMAL(18,2) | 累计入账 |
| total_expense | DECIMAL(18,2) | 累计支出 |
| status | VARCHAR(20) | 状态 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

**所有者类型**:
```typescript
type AccountOwnerType = 
  | "driver"     // 司机
  | "financier"  // 融资方
  | "platform";  // 平台
```

#### virtual_account_transactions (虚拟账户流水表)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(36) | 主键 |
| transaction_number | VARCHAR(50) | 流水号 |
| account_id | VARCHAR(36) | 账户ID |
| txn_type | VARCHAR(20) | 交易类型 |
| amount | DECIMAL(18,2) | 交易金额 |
| balance_before | DECIMAL(18,2) | 交易前余额 |
| balance_after | DECIMAL(18,2) | 交易后余额 |
| related_type | VARCHAR(50) | 关联业务类型 |
| related_id | VARCHAR(36) | 关联业务ID |
| remark | TEXT | 备注 |
| created_at | DATETIME | 创建时间 |

**交易类型**:
```typescript
type TransactionType = 
  | "credit"      // 入账
  | "debit"       // 出账
  | "freeze"      // 冻结
  | "unfreeze"    // 解冻
  | "withdraw";   // 提现
```

#### payment_executions (支付执行记录表)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(36) | 主键 |
| request_id | VARCHAR(36) | 申请ID |
| execution_time | DATETIME | 执行时间 |
| transaction_id | VARCHAR(100) | 交易流水号 |
| channel | VARCHAR(50) | 支付渠道 |
| channel_request | JSON | 渠道请求数据 |
| channel_response | JSON | 渠道响应数据 |
| status | VARCHAR(20) | 状态 |
| failure_reason | TEXT | 失败原因 |
| created_at | DATETIME | 创建时间 |

**支付渠道（预留扩展）**:
```typescript
type PaymentChannel = 
  | "mock"              // 模拟支付（当前）
  | "funder_account"    // 资金方账户体系（后续）
  | "platform_account"  // 平台账户体系（后续）
  | "bank_gateway";     // 银行网关（后续）
```

#### directed_pay_settlements (定向支付结算单表)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | VARCHAR(36) | 主键 |
| settlement_number | VARCHAR(50) | 结算单号 |
| contract_id | VARCHAR(36) | 合同ID |
| period_start | DATE | 结算周期开始 |
| period_end | DATE | 结算周期结束 |
| payment_count | INT | 支付笔数 |
| principal_amount | DECIMAL(18,2) | 本金总额 |
| interest_amount | DECIMAL(18,2) | 利息总额 |
| service_amount | DECIMAL(18,2) | 服务费总额 |
| total_amount | DECIMAL(18,2) | 应还总额 |
| due_date | DATE | 应还日期 |
| actual_paid_amount | DECIMAL(18,2) | 实际还款金额 |
| paid_at | DATETIME | 还款时间 |
| status | VARCHAR(20) | 状态 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

---

## 四、利息计算规则

### 4.1 计息规则

```
规则1：从支付时刻开始计息
规则2：按日计息
规则3：不满一天按一天计算
规则4：计息基数默认360天
```

### 4.2 利息计算公式

```typescript
/**
 * 计算单笔支付的利息
 * @param principal 本金
 * @param annualRate 年化利率（如 0.12 表示12%）
 * @param paymentTime 支付时间
 * @param settlementTime 结算时间
 * @param calcBase 计息基数（360 或 365）
 */
function calculateInterest(
  principal: number,
  annualRate: number,
  paymentTime: Date,
  settlementTime: Date,
  calcBase: number = 360
): number {
  // 计算天数（不满一天按一天）
  const diffMs = settlementTime.getTime() - paymentTime.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  
  // 日利率
  const dailyRate = annualRate / calcBase;
  
  // 利息 = 本金 × 日利率 × 天数
  const interest = principal * dailyRate * diffDays;
  
  // 保留两位小数（四舍五入）
  return Math.round(interest * 100) / 100;
}

// 示例
// 本金 10000，年化利率 12%，支付后15天结算
// 利息 = 10000 × (0.12 / 360) × 15 = 50 元
```

### 4.3 结算单利息汇总

```typescript
async function calculateSettlementInterest(
  contractId: string,
  settlementTime: Date
): Promise<number> {
  // 获取本期所有成功的支付记录
  const payments = await getSuccessPayments(contractId, settlementTime);
  
  // 获取合同利率配置
  const contract = await getContract(contractId);
  
  let totalInterest = 0;
  
  for (const payment of payments) {
    const interest = calculateInterest(
      payment.paymentAmount,
      contract.annualInterestRate,
      payment.interestStartTime, // 计息开始时间（支付成功时间）
      settlementTime,
      contract.interestCalcBase
    );
    totalInterest += interest;
  }
  
  return totalInterest;
}
```

---

## 五、TMS 对接接口

### 5.1 付款码推送接口

```typescript
// 平台调用 TMS 接口推送付款码
POST {TMS_BASE_URL}/api/payment-codes

// 请求体
{
  "platformCode": "DENGTU",              // 平台标识
  "driverId": "driver_123",              // 司机ID（TMS系统中的ID）
  "driverPhone": "13800138000",          // 司机手机号（备用匹配）
  "paymentCode": "DPY20260114123456",    // 付款码
  "amount": 5000.00,                     // 金额
  "expireAt": "2026-01-15T12:00:00Z",    // 过期时间
  "waybillNumber": "WB20260114001",      // 关联运单号
  "categoryName": "运费",                 // 支付类别
  "remark": "运单WB20260114001运费支付"   // 备注
}

// 响应
{
  "success": true,
  "data": {
    "tmsCodeId": "tms_code_xxx",  // TMS系统中的付款码ID
    "receivedAt": "2026-01-14T12:00:00Z"
  }
}
```

### 5.2 付款码状态回调

```typescript
// TMS 调用平台接口回调付款码状态
POST /api/directed-pay/payment-codes/callback

// 请求体
{
  "paymentCode": "DPY20260114123456",
  "status": "used",                      // used/expired/cancelled
  "usedAt": "2026-01-14T14:30:00Z",
  "usedLocation": "上海市浦东新区xxx"     // 使用地点（可选）
}

// 响应
{
  "success": true,
  "message": "状态更新成功"
}
```

### 5.3 付款码查询接口

```typescript
// TMS 调用平台接口查询付款码
GET /api/directed-pay/payment-codes/{code}

// 响应
{
  "success": true,
  "data": {
    "code": "DPY20260114123456",
    "amount": 5000.00,
    "status": "active",
    "expireAt": "2026-01-15T12:00:00Z",
    "waybillNumber": "WB20260114001",
    "categoryName": "运费"
  }
}
```

---

## 六、功能模块设计

### 6.1 合同管理

| 功能 | 说明 | 权限 |
|------|------|------|
| 创建合同 | 新建定向支付合同 | manage_directed_pay_contracts |
| 配置支付类别 | 配置支持的支付类别及费率 | manage_directed_pay_contracts |
| 审批合同 | 合同审批（平台+资金方） | approve_directed_pay_contracts |
| 变更合同 | 修改额度、费率等 | manage_directed_pay_contracts |
| 终止合同 | 提前终止合同 | manage_directed_pay_contracts |

### 6.2 支付申请

| 功能 | 说明 | 权限 |
|------|------|------|
| 发起支付 | 针对运单发起定向支付 | create_directed_payment |
| 批量支付 | 批量发起支付申请 | create_directed_payment |
| 平台审批 | 平台审批支付申请 | approve_directed_payment_platform |
| 资金方审批 | 资金方审批支付申请 | approve_directed_payment_funder |
| 撤销申请 | 撤销未执行的申请 | create_directed_payment |

### 6.3 虚拟账户

| 功能 | 说明 | 权限 |
|------|------|------|
| 开户 | 为司机/融资方开设虚拟账户 | manage_virtual_accounts |
| 查询余额 | 查询账户余额 | view_virtual_accounts |
| 查询流水 | 查询账户交易流水 | view_virtual_accounts |
| 冻结/解冻 | 冻结或解冻账户资金 | manage_virtual_accounts |

### 6.4 结算管理

| 功能 | 说明 | 权限 |
|------|------|------|
| 生成结算单 | 按周期生成结算单 | manage_directed_pay_settlements |
| 确认结算单 | 确认结算单金额 | manage_directed_pay_settlements |
| 还款处理 | 处理融资方还款 | manage_directed_pay_settlements |

---

## 七、权限设计

### 7.1 权限码

```typescript
const DIRECTED_PAY_PERMISSIONS = [
  // 父权限
  { code: "manage_directed_pay", name: "定向支付管理" },
  
  // 合同管理
  { code: "manage_directed_pay_contracts", name: "合同管理", parent: "manage_directed_pay" },
  { code: "approve_directed_pay_contracts", name: "合同审批", parent: "manage_directed_pay" },
  
  // 支付申请
  { code: "create_directed_payment", name: "发起支付", parent: "manage_directed_pay" },
  { code: "approve_directed_payment_platform", name: "平台审批支付", parent: "manage_directed_pay" },
  { code: "approve_directed_payment_funder", name: "资金方审批支付", parent: "manage_directed_pay" },
  
  // 虚拟账户
  { code: "manage_virtual_accounts", name: "虚拟账户管理", parent: "manage_directed_pay" },
  { code: "view_virtual_accounts", name: "查看虚拟账户", parent: "manage_directed_pay" },
  
  // 结算
  { code: "manage_directed_pay_settlements", name: "结算管理", parent: "manage_directed_pay" },
  { code: "view_directed_pay_settlements", name: "查看结算", parent: "manage_directed_pay" },
];
```

### 7.2 admin 权限

admin 用户拥有所有定向支付相关权限，包括：
- 跳过审批流程直接执行支付
- 管理所有合同和结算
- 管理虚拟账户

---

## 八、前端页面设计

### 8.1 页面列表

| 路径 | 页面名称 | 说明 |
|------|----------|------|
| /directed-pay/contracts | 合同列表 | 定向支付合同管理 |
| /directed-pay/contracts/create | 创建合同 | 新建定向支付合同（多步骤） |
| /directed-pay/contracts/:id | 合同详情 | 查看合同详情、支付记录 |
| /directed-pay/requests | 支付申请 | 支付申请列表 |
| /directed-pay/requests/create | 发起支付 | 创建支付申请 |
| /directed-pay/approvals | 待审批 | 待我审批的支付申请 |
| /directed-pay/settlements | 结算管理 | 结算单列表 |
| /directed-pay/virtual-accounts | 虚拟账户 | 虚拟账户管理 |

### 8.2 菜单结构

```
定向支付
├── 合同管理
│   ├── 合同列表
│   └── 创建合同
├── 支付管理
│   ├── 支付申请
│   ├── 发起支付
│   └── 待审批
├── 虚拟账户
│   └── 账户管理
└── 结算管理
    └── 结算单
```

---

## 九、API 接口清单

### 9.1 合同管理

```
POST   /api/directed-pay/contracts              创建合同
GET    /api/directed-pay/contracts              获取合同列表
GET    /api/directed-pay/contracts/:id          获取合同详情
PUT    /api/directed-pay/contracts/:id          更新合同
DELETE /api/directed-pay/contracts/:id          删除合同
POST   /api/directed-pay/contracts/:id/approve  审批合同
POST   /api/directed-pay/contracts/:id/suspend  暂停合同
POST   /api/directed-pay/contracts/:id/resume   恢复合同
POST   /api/directed-pay/contracts/:id/terminate 终止合同

GET    /api/directed-pay/contracts/:id/categories        获取支付类别
POST   /api/directed-pay/contracts/:id/categories        添加支付类别
PUT    /api/directed-pay/contracts/:id/categories/:catId 更新支付类别
DELETE /api/directed-pay/contracts/:id/categories/:catId 删除支付类别
```

### 9.2 支付申请

```
POST   /api/directed-pay/requests                        创建支付申请
GET    /api/directed-pay/requests                        获取申请列表
GET    /api/directed-pay/requests/:id                    获取申请详情
POST   /api/directed-pay/requests/:id/platform-approve   平台审批通过
POST   /api/directed-pay/requests/:id/platform-reject    平台审批拒绝
POST   /api/directed-pay/requests/:id/funder-approve     资金方审批通过
POST   /api/directed-pay/requests/:id/funder-reject      资金方审批拒绝
POST   /api/directed-pay/requests/:id/cancel             取消申请
POST   /api/directed-pay/requests/:id/execute            执行支付
POST   /api/directed-pay/requests/batch                  批量创建申请
GET    /api/directed-pay/requests/pending-approvals      获取待审批列表
```

### 9.3 付款码

```
POST   /api/directed-pay/payment-codes/callback          TMS回调
GET    /api/directed-pay/payment-codes/:code             查询付款码
POST   /api/directed-pay/payment-codes/:code/cancel      取消付款码
```

### 9.4 虚拟账户

```
POST   /api/virtual-accounts                    创建账户
GET    /api/virtual-accounts                    获取账户列表
GET    /api/virtual-accounts/:id                获取账户详情
GET    /api/virtual-accounts/:id/transactions   获取账户流水
POST   /api/virtual-accounts/:id/freeze         冻结资金
POST   /api/virtual-accounts/:id/unfreeze       解冻资金
```

### 9.5 结算

```
POST   /api/directed-pay/settlements/generate   生成结算单
GET    /api/directed-pay/settlements            获取结算单列表
GET    /api/directed-pay/settlements/:id        获取结算单详情
POST   /api/directed-pay/settlements/:id/confirm 确认结算单
POST   /api/directed-pay/settlements/:id/pay    还款
```

---

## 十、开发计划

### Phase 1：基础架构（1周）
- [ ] 数据库表结构创建
- [ ] TypeScript 类型定义
- [ ] 基础 store 函数

### Phase 2：合同管理（1周）
- [ ] 合同 CRUD API
- [ ] 支付类别配置
- [ ] 合同审批流程
- [ ] 合同列表/创建页面

### Phase 3：支付申请（1.5周）
- [ ] 支付申请 API
- [ ] 双重审批流程
- [ ] 付款码生成与管理
- [ ] 支付申请页面
- [ ] 审批页面

### Phase 4：支付执行（1周）
- [ ] 模拟支付渠道
- [ ] 额度扣减/回滚
- [ ] 利息计算
- [ ] TMS 接口对接

### Phase 5：虚拟账户（1周）
- [ ] 虚拟账户 CRUD
- [ ] 账户流水记录
- [ ] 账户管理页面

### Phase 6：结算管理（1周）
- [ ] 结算单生成
- [ ] 结算单确认/还款
- [ ] 与结算中心集成
- [ ] 结算管理页面

### Phase 7：完善优化（0.5周）
- [ ] 权限控制完善
- [ ] 操作日志
- [ ] 界面优化
- [ ] 文档完善

---

*设计文档版本: v2.0*  
*更新时间: 2026-01-14*
