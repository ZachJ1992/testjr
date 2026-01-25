# 系统管理模块任务 - 资金定向支付

## 模块职责

你负责为「资金定向支付」产品提供系统基础设施支持，包括：
1. 权限定义和配置
2. 虚拟账户基础设施
3. 付款码表和基础功能

---

## 背景信息

请先阅读产品设计文档：
- `docs/products/directed-payment-product.md` - 完整产品设计

你的工作基于已有的系统管理架构：
- `docs/system-management-architecture.md` - 系统管理架构文档

---

## 任务清单

### 任务1：权限定义

**目标**：在权限系统中添加定向支付相关权限

**文件**：`backend/src/store.ts`

**操作**：在 `DEFAULT_PERMISSION_SEED` 数组中添加以下权限：

```typescript
// 定向支付权限（添加到 DEFAULT_PERMISSION_SEED）
{ code: "manage_directed_pay", name: "定向支付管理", parentCode: null },
{ code: "manage_directed_pay_contracts", name: "合同管理", parentCode: "manage_directed_pay" },
{ code: "approve_directed_pay_contracts", name: "合同审批", parentCode: "manage_directed_pay" },
{ code: "create_directed_payment", name: "发起支付", parentCode: "manage_directed_pay" },
{ code: "approve_directed_payment_platform", name: "平台审批支付", parentCode: "manage_directed_pay" },
{ code: "approve_directed_payment_funder", name: "资金方审批支付", parentCode: "manage_directed_pay" },
{ code: "manage_virtual_accounts", name: "虚拟账户管理", parentCode: "manage_directed_pay" },
{ code: "view_virtual_accounts", name: "查看虚拟账户", parentCode: "manage_directed_pay" },
{ code: "manage_directed_pay_settlements", name: "定向支付结算管理", parentCode: "manage_directed_pay" },
{ code: "view_directed_pay_settlements", name: "查看定向支付结算", parentCode: "manage_directed_pay" },
```

**文件**：`backend/src/types.ts`

**操作**：在 `Permission` 类型中添加新权限码

---

### 任务2：虚拟账户数据库表

**目标**：创建虚拟账户相关的数据库表

**文件**：`backend/src/store.ts` 的 `initSchema` 函数

**添加表结构**：

```sql
-- 虚拟账户表
CREATE TABLE IF NOT EXISTS virtual_accounts (
  id VARCHAR(36) PRIMARY KEY,
  account_number VARCHAR(50) NOT NULL UNIQUE,
  owner_type VARCHAR(20) NOT NULL,
  owner_id VARCHAR(36) NOT NULL,
  owner_name VARCHAR(100) NOT NULL,
  balance DECIMAL(18,2) NOT NULL DEFAULT 0,
  frozen_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_income DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_expense DECIMAL(18,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  INDEX idx_va_owner (owner_type, owner_id),
  INDEX idx_va_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 虚拟账户流水表
CREATE TABLE IF NOT EXISTS virtual_account_transactions (
  id VARCHAR(36) PRIMARY KEY,
  transaction_number VARCHAR(50) NOT NULL UNIQUE,
  account_id VARCHAR(36) NOT NULL,
  txn_type VARCHAR(20) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  balance_before DECIMAL(18,2) NOT NULL,
  balance_after DECIMAL(18,2) NOT NULL,
  related_type VARCHAR(50),
  related_id VARCHAR(36),
  remark TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_vat_account (account_id),
  INDEX idx_vat_type (txn_type),
  INDEX idx_vat_related (related_type, related_id),
  FOREIGN KEY (account_id) REFERENCES virtual_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### 任务3：虚拟账户 Store 函数

**目标**：实现虚拟账户的数据操作函数

**文件**：创建新文件 `backend/src/virtual-accounts-store.ts`

**实现以下函数**：

```typescript
import { randomUUID } from "crypto";
import { pool } from "./db.js";
import type { RowDataPacket } from "mysql2";

// 类型定义
export type AccountOwnerType = "driver" | "financier" | "platform";
export type AccountStatus = "active" | "frozen" | "closed";
export type TransactionType = "credit" | "debit" | "freeze" | "unfreeze" | "withdraw";

export interface VirtualAccount {
  id: string;
  accountNumber: string;
  ownerType: AccountOwnerType;
  ownerId: string;
  ownerName: string;
  balance: number;
  frozenAmount: number;
  totalIncome: number;
  totalExpense: number;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
}

export interface VirtualAccountTransaction {
  id: string;
  transactionNumber: string;
  accountId: string;
  txnType: TransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  relatedType?: string;
  relatedId?: string;
  remark?: string;
  createdAt: string;
}

// 生成账户号
function generateAccountNumber(): string {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `VA${timestamp}${random}`;
}

// 生成流水号
function generateTransactionNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TXN${date}${random}`;
}

// 创建虚拟账户
export async function createVirtualAccount(input: {
  ownerType: AccountOwnerType;
  ownerId: string;
  ownerName: string;
}): Promise<VirtualAccount> {
  // 检查是否已存在
  const existing = await getVirtualAccountByOwner(input.ownerType, input.ownerId);
  if (existing) {
    throw new Error("该用户已有虚拟账户");
  }

  const id = randomUUID();
  const accountNumber = generateAccountNumber();

  await pool.query(
    `INSERT INTO virtual_accounts (id, account_number, owner_type, owner_id, owner_name, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [id, accountNumber, input.ownerType, input.ownerId, input.ownerName]
  );

  const account = await getVirtualAccountById(id);
  if (!account) throw new Error("创建虚拟账户失败");
  return account;
}

// 根据ID获取账户
export async function getVirtualAccountById(id: string): Promise<VirtualAccount | undefined> {
  // 实现查询逻辑
}

// 根据所有者获取账户
export async function getVirtualAccountByOwner(
  ownerType: AccountOwnerType,
  ownerId: string
): Promise<VirtualAccount | undefined> {
  // 实现查询逻辑
}

// 获取账户列表
export async function getVirtualAccounts(filters?: {
  ownerType?: AccountOwnerType;
  status?: AccountStatus;
  keyword?: string;
}): Promise<VirtualAccount[]> {
  // 实现查询逻辑
}

// 入账（充值/收款）
export async function creditAccount(
  accountId: string,
  amount: number,
  relatedType?: string,
  relatedId?: string,
  remark?: string
): Promise<VirtualAccountTransaction> {
  // 1. 锁定账户记录
  // 2. 获取当前余额
  // 3. 更新余额
  // 4. 记录流水
  // 实现入账逻辑
}

// 出账（扣款/消费）
export async function debitAccount(
  accountId: string,
  amount: number,
  relatedType?: string,
  relatedId?: string,
  remark?: string
): Promise<VirtualAccountTransaction> {
  // 1. 锁定账户记录
  // 2. 检查余额是否充足
  // 3. 更新余额
  // 4. 记录流水
  // 实现出账逻辑
}

// 冻结资金
export async function freezeAmount(
  accountId: string,
  amount: number,
  relatedType?: string,
  relatedId?: string,
  remark?: string
): Promise<VirtualAccountTransaction> {
  // 实现冻结逻辑
}

// 解冻资金
export async function unfreezeAmount(
  accountId: string,
  amount: number,
  relatedType?: string,
  relatedId?: string,
  remark?: string
): Promise<VirtualAccountTransaction> {
  // 实现解冻逻辑
}

// 获取账户流水
export async function getAccountTransactions(
  accountId: string,
  filters?: {
    txnType?: TransactionType;
    startDate?: string;
    endDate?: string;
  }
): Promise<VirtualAccountTransaction[]> {
  // 实现查询逻辑
}
```

---

### 任务4：付款码数据库表

**目标**：创建付款码相关的数据库表

**文件**：`backend/src/store.ts` 的 `initSchema` 函数

**添加表结构**：

```sql
-- 付款码表
CREATE TABLE IF NOT EXISTS payment_codes (
  id VARCHAR(36) PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  request_id VARCHAR(36) NOT NULL,
  driver_id VARCHAR(36),
  driver_name VARCHAR(100),
  driver_phone VARCHAR(20),
  amount DECIMAL(18,2) NOT NULL,
  expire_at DATETIME NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  used_at DATETIME,
  used_location VARCHAR(255),
  tms_sync_status VARCHAR(20) DEFAULT 'pending',
  tms_sync_time DATETIME,
  tms_sync_response JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pc_code (code),
  INDEX idx_pc_request (request_id),
  INDEX idx_pc_driver (driver_id),
  INDEX idx_pc_status (status),
  INDEX idx_pc_expire (expire_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### 任务5：付款码 Store 函数

**目标**：实现付款码的数据操作函数

**文件**：创建新文件 `backend/src/payment-codes-store.ts`

**实现以下函数**：

```typescript
import { randomUUID } from "crypto";
import { pool } from "./db.js";

export type PaymentCodeStatus = "active" | "used" | "expired" | "cancelled";
export type TmsSyncStatus = "pending" | "synced" | "failed";

export interface PaymentCode {
  id: string;
  code: string;
  requestId: string;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  amount: number;
  expireAt: string;
  status: PaymentCodeStatus;
  usedAt?: string;
  usedLocation?: string;
  tmsSyncStatus: TmsSyncStatus;
  tmsSyncTime?: string;
  createdAt: string;
}

// 生成付款码
function generatePaymentCode(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DPY${date}${random}`;
}

// 创建付款码
export async function createPaymentCode(input: {
  requestId: string;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  amount: number;
  expireHours?: number; // 默认24小时
}): Promise<PaymentCode> {
  const id = randomUUID();
  const code = generatePaymentCode();
  const expireHours = input.expireHours || 24;
  const expireAt = new Date(Date.now() + expireHours * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO payment_codes 
     (id, code, request_id, driver_id, driver_name, driver_phone, amount, expire_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    [id, code, input.requestId, input.driverId, input.driverName, input.driverPhone, input.amount, expireAt]
  );

  const paymentCode = await getPaymentCodeById(id);
  if (!paymentCode) throw new Error("创建付款码失败");
  return paymentCode;
}

// 根据ID获取
export async function getPaymentCodeById(id: string): Promise<PaymentCode | undefined> {
  // 实现查询
}

// 根据code获取
export async function getPaymentCodeByCode(code: string): Promise<PaymentCode | undefined> {
  // 实现查询
}

// 使用付款码
export async function usePaymentCode(
  code: string,
  usedLocation?: string
): Promise<PaymentCode> {
  const paymentCode = await getPaymentCodeByCode(code);
  if (!paymentCode) throw new Error("付款码不存在");
  if (paymentCode.status !== "active") throw new Error("付款码状态无效");
  if (new Date(paymentCode.expireAt) < new Date()) throw new Error("付款码已过期");

  await pool.query(
    `UPDATE payment_codes SET status = 'used', used_at = NOW(), used_location = ? WHERE code = ?`,
    [usedLocation, code]
  );

  return (await getPaymentCodeByCode(code))!;
}

// 取消付款码
export async function cancelPaymentCode(code: string): Promise<void> {
  await pool.query(
    `UPDATE payment_codes SET status = 'cancelled' WHERE code = ? AND status = 'active'`,
    [code]
  );
}

// 更新TMS同步状态
export async function updateTmsSyncStatus(
  code: string,
  status: TmsSyncStatus,
  response?: any
): Promise<void> {
  await pool.query(
    `UPDATE payment_codes SET tms_sync_status = ?, tms_sync_time = NOW(), tms_sync_response = ? WHERE code = ?`,
    [status, JSON.stringify(response), code]
  );
}

// 获取过期的付款码（用于定时任务）
export async function getExpiredPaymentCodes(): Promise<PaymentCode[]> {
  // 查询 status = 'active' 且 expire_at < NOW() 的记录
}

// 批量过期付款码
export async function expirePaymentCodes(ids: string[]): Promise<void> {
  // 批量更新状态为 expired
}
```

---

### 任务6：虚拟账户 API 路由

**目标**：实现虚拟账户相关的API接口

**文件**：创建新文件 `backend/src/routes/virtual-accounts.ts` 或在 `routes.ts` 中添加

**实现以下API**：

```typescript
// POST /api/virtual-accounts - 创建账户
// GET /api/virtual-accounts - 获取账户列表
// GET /api/virtual-accounts/:id - 获取账户详情
// GET /api/virtual-accounts/:id/transactions - 获取账户流水
// POST /api/virtual-accounts/:id/freeze - 冻结资金
// POST /api/virtual-accounts/:id/unfreeze - 解冻资金
```

---

### 任务7：付款码 API 路由

**目标**：实现付款码相关的API接口

**实现以下API**：

```typescript
// GET /api/directed-pay/payment-codes/:code - 查询付款码
// POST /api/directed-pay/payment-codes/callback - TMS回调
// POST /api/directed-pay/payment-codes/:code/cancel - 取消付款码
```

---

## 验收标准

1. 权限定义完成，admin用户可在权限管理页面看到新权限
2. 虚拟账户表创建成功，CRUD功能正常
3. 虚拟账户入账/出账/冻结/解冻功能正常
4. 付款码表创建成功，生成/使用/取消功能正常
5. API接口可通过Postman/curl测试

---

## 注意事项

1. 虚拟账户操作需要事务保证
2. 付款码需要唯一性校验
3. 所有金额使用 DECIMAL(18,2) 类型
4. 记得添加必要的索引
5. 遵循项目现有的代码风格

---

*任务文档版本: v1.0*
