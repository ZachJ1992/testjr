# 合同管理模块任务 - 资金定向支付

## 模块职责

你负责为「资金定向支付」产品实现合同管理功能，包括：
1. 定向支付合同的 CRUD
2. 支付类别配置
3. 自动支付配置

---

## 背景信息

请先阅读产品设计文档：
- `docs/products/directed-payment-product.md` - 完整产品设计（重点阅读数据模型部分）

现有合同管理页面：
- `frontend/src/pages/Contracts.tsx` - 合同列表
- `frontend/src/pages/CreateFinancingContract.tsx` - 创建三方融资合同（可参考）

---

## 任务清单

### 任务1：定向支付合同数据库表

**目标**：创建定向支付合同相关的数据库表

**文件**：`backend/src/store.ts` 的 `initSchema` 函数

**添加表结构**：

```sql
-- 定向支付合同表
CREATE TABLE IF NOT EXISTS directed_pay_contracts (
  id VARCHAR(36) PRIMARY KEY,
  contract_number VARCHAR(50) NOT NULL UNIQUE,
  funder_id VARCHAR(36) NOT NULL,
  financier_id VARCHAR(36) NOT NULL,
  funder_account_id VARCHAR(100),
  credit_limit DECIMAL(18,2) NOT NULL,
  used_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  available_amount DECIMAL(18,2) NOT NULL,
  annual_interest_rate DECIMAL(5,4) NOT NULL,
  interest_calc_base INT NOT NULL DEFAULT 360,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  settlement_cycle VARCHAR(20) NOT NULL,
  settlement_day INT NOT NULL,
  grace_period_days INT NOT NULL DEFAULT 3,
  auto_payment_enabled TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  remark TEXT,
  created_by VARCHAR(36),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  INDEX idx_dpc_funder (funder_id),
  INDEX idx_dpc_financier (financier_id),
  INDEX idx_dpc_status (status),
  INDEX idx_dpc_dates (start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 支付类别配置表
CREATE TABLE IF NOT EXISTS payment_category_configs (
  id VARCHAR(36) PRIMARY KEY,
  contract_id VARCHAR(36) NOT NULL,
  category_code VARCHAR(50) NOT NULL,
  category_name VARCHAR(100) NOT NULL,
  service_rate DECIMAL(5,4) NOT NULL DEFAULT 0,
  min_amount DECIMAL(18,2),
  max_amount DECIMAL(18,2),
  daily_limit DECIMAL(18,2),
  require_platform_approval TINYINT(1) NOT NULL DEFAULT 1,
  require_funder_approval TINYINT(1) NOT NULL DEFAULT 1,
  platform_approval_threshold DECIMAL(18,2),
  funder_approval_threshold DECIMAL(18,2),
  auto_payment_enabled TINYINT(1) NOT NULL DEFAULT 0,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pcc_contract (contract_id),
  INDEX idx_pcc_category (category_code),
  UNIQUE KEY uk_contract_category (contract_id, category_code),
  FOREIGN KEY (contract_id) REFERENCES directed_pay_contracts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### 任务2：定向支付合同 Store 函数

**目标**：实现定向支付合同的数据操作函数

**文件**：创建新文件 `backend/src/directed-pay-contracts-store.ts`

**实现以下函数**：

```typescript
import { randomUUID } from "crypto";
import { pool } from "./db.js";

// 类型定义
export type DirectedPayContractStatus = 
  | "draft" | "pending_approval" | "active" | "suspended" | "expired" | "terminated";

export type SettlementCycle = "monthly" | "biweekly" | "weekly";

export interface DirectedPayContract {
  id: string;
  contractNumber: string;
  funderId: string;
  funderName?: string;
  financierId: string;
  financierName?: string;
  funderAccountId?: string;
  creditLimit: number;
  usedAmount: number;
  availableAmount: number;
  annualInterestRate: number;
  interestCalcBase: number;
  startDate: string;
  endDate: string;
  settlementCycle: SettlementCycle;
  settlementDay: number;
  gracePeriodDays: number;
  autoPaymentEnabled: boolean;
  status: DirectedPayContractStatus;
  remark?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentCategoryConfig {
  id: string;
  contractId: string;
  categoryCode: string;
  categoryName: string;
  serviceRate: number;
  minAmount?: number;
  maxAmount?: number;
  dailyLimit?: number;
  requirePlatformApproval: boolean;
  requireFunderApproval: boolean;
  platformApprovalThreshold?: number;
  funderApprovalThreshold?: number;
  autoPaymentEnabled: boolean;
  isEnabled: boolean;
  createdAt: string;
}

// 预设支付类别
export const PAYMENT_CATEGORY_TEMPLATES = [
  { code: "FREIGHT", name: "运费" },
  { code: "OIL_CARD", name: "油卡" },
  { code: "ETC", name: "ETC" },
  { code: "SALARY", name: "工资" },
  { code: "INSURANCE", name: "保险" },
  { code: "MAINTENANCE", name: "维修" },
  { code: "TOLL", name: "路桥费" },
  { code: "OTHER", name: "其他" },
];

// 生成合同编号
function generateContractNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DPC${date}${random}`;
}

// ==================== 合同 CRUD ====================

// 创建合同
export async function createDirectedPayContract(input: {
  funderId: string;
  financierId: string;
  funderAccountId?: string;
  creditLimit: number;
  annualInterestRate: number;
  interestCalcBase?: number;
  startDate: string;
  endDate: string;
  settlementCycle: SettlementCycle;
  settlementDay: number;
  gracePeriodDays?: number;
  remark?: string;
  createdBy?: string;
}): Promise<DirectedPayContract> {
  const id = randomUUID();
  const contractNumber = generateContractNumber();

  await pool.query(
    `INSERT INTO directed_pay_contracts 
     (id, contract_number, funder_id, financier_id, funder_account_id,
      credit_limit, available_amount, annual_interest_rate, interest_calc_base,
      start_date, end_date, settlement_cycle, settlement_day, grace_period_days,
      remark, created_by, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
    [
      id, contractNumber, input.funderId, input.financierId, input.funderAccountId || null,
      input.creditLimit, input.creditLimit, // available_amount 初始等于 credit_limit
      input.annualInterestRate, input.interestCalcBase || 360,
      input.startDate, input.endDate, input.settlementCycle, input.settlementDay,
      input.gracePeriodDays || 3, input.remark || null, input.createdBy || null
    ]
  );

  const contract = await getDirectedPayContractById(id);
  if (!contract) throw new Error("创建合同失败");
  return contract;
}

// 获取合同详情
export async function getDirectedPayContractById(id: string): Promise<DirectedPayContract | undefined> {
  // 实现查询，需要JOIN funder和financier表获取名称
}

// 获取合同列表
export async function getDirectedPayContracts(filters?: {
  funderId?: string;
  financierId?: string;
  status?: DirectedPayContractStatus;
  keyword?: string;
}): Promise<DirectedPayContract[]> {
  // 实现查询
}

// 根据融资方获取生效中的合同
export async function getActiveContractByFinancier(financierId: string): Promise<DirectedPayContract | undefined> {
  // 查询 status = 'active' 且在有效期内的合同
}

// 更新合同
export async function updateDirectedPayContract(
  id: string,
  input: Partial<{
    funderAccountId: string;
    creditLimit: number;
    annualInterestRate: number;
    endDate: string;
    settlementCycle: SettlementCycle;
    settlementDay: number;
    gracePeriodDays: number;
    autoPaymentEnabled: boolean;
    remark: string;
  }>
): Promise<DirectedPayContract> {
  // 实现更新逻辑
  // 注意：如果修改 creditLimit，需要同步更新 availableAmount
}

// 更新合同状态
export async function updateContractStatus(
  id: string,
  status: DirectedPayContractStatus
): Promise<void> {
  await pool.query(
    `UPDATE directed_pay_contracts SET status = ? WHERE id = ? AND deleted_at IS NULL`,
    [status, id]
  );
}

// 扣减合同额度
export async function deductContractCredit(
  contractId: string,
  amount: number
): Promise<void> {
  // 1. 检查可用额度是否充足
  // 2. 更新 used_amount 和 available_amount
  const [result] = await pool.query(
    `UPDATE directed_pay_contracts 
     SET used_amount = used_amount + ?, available_amount = available_amount - ?
     WHERE id = ? AND available_amount >= ? AND status = 'active' AND deleted_at IS NULL`,
    [amount, amount, contractId, amount]
  );
  
  if ((result as any).affectedRows === 0) {
    throw new Error("扣减额度失败：额度不足或合同状态异常");
  }
}

// 恢复合同额度（还款后）
export async function restoreContractCredit(
  contractId: string,
  amount: number
): Promise<void> {
  await pool.query(
    `UPDATE directed_pay_contracts 
     SET used_amount = used_amount - ?, available_amount = available_amount + ?
     WHERE id = ? AND deleted_at IS NULL`,
    [amount, amount, contractId]
  );
}

// 删除合同（软删除）
export async function deleteDirectedPayContract(id: string): Promise<void> {
  await pool.query(
    `UPDATE directed_pay_contracts SET deleted_at = NOW() WHERE id = ?`,
    [id]
  );
}

// ==================== 支付类别配置 ====================

// 添加支付类别
export async function addPaymentCategory(
  contractId: string,
  input: {
    categoryCode: string;
    categoryName: string;
    serviceRate?: number;
    minAmount?: number;
    maxAmount?: number;
    dailyLimit?: number;
    requirePlatformApproval?: boolean;
    requireFunderApproval?: boolean;
    platformApprovalThreshold?: number;
    funderApprovalThreshold?: number;
    autoPaymentEnabled?: boolean;
  }
): Promise<PaymentCategoryConfig> {
  const id = randomUUID();

  await pool.query(
    `INSERT INTO payment_category_configs 
     (id, contract_id, category_code, category_name, service_rate,
      min_amount, max_amount, daily_limit,
      require_platform_approval, require_funder_approval,
      platform_approval_threshold, funder_approval_threshold,
      auto_payment_enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, contractId, input.categoryCode, input.categoryName,
      input.serviceRate || 0,
      input.minAmount || null, input.maxAmount || null, input.dailyLimit || null,
      input.requirePlatformApproval !== false ? 1 : 0,
      input.requireFunderApproval !== false ? 1 : 0,
      input.platformApprovalThreshold || null, input.funderApprovalThreshold || null,
      input.autoPaymentEnabled ? 1 : 0
    ]
  );

  const category = await getPaymentCategoryById(id);
  if (!category) throw new Error("添加支付类别失败");
  return category;
}

// 获取支付类别
export async function getPaymentCategoryById(id: string): Promise<PaymentCategoryConfig | undefined> {
  // 实现查询
}

// 获取合同的所有支付类别
export async function getPaymentCategoriesByContract(contractId: string): Promise<PaymentCategoryConfig[]> {
  // 实现查询
}

// 更新支付类别
export async function updatePaymentCategory(
  id: string,
  input: Partial<PaymentCategoryConfig>
): Promise<PaymentCategoryConfig> {
  // 实现更新
}

// 删除支付类别
export async function deletePaymentCategory(id: string): Promise<void> {
  await pool.query(`DELETE FROM payment_category_configs WHERE id = ?`, [id]);
}

// 获取支付类别模板
export function getPaymentCategoryTemplates() {
  return PAYMENT_CATEGORY_TEMPLATES;
}

// 检查类别是否支持自动支付
export async function isCategoryAutoPaymentEnabled(
  contractId: string,
  categoryCode: string
): Promise<boolean> {
  const [rows] = await pool.query<any[]>(
    `SELECT auto_payment_enabled FROM payment_category_configs 
     WHERE contract_id = ? AND category_code = ? AND is_enabled = 1`,
    [contractId, categoryCode]
  );
  return rows[0]?.auto_payment_enabled === 1;
}
```

---

### 任务3：合同管理 API 路由

**目标**：实现合同管理相关的API接口

**文件**：在 `backend/src/routes.ts` 中添加，或创建独立路由文件

**实现以下API**：

```typescript
import { Router } from "express";
import { authenticate, requirePermissions } from "./auth.js";
import * as contractStore from "./directed-pay-contracts-store.js";

const router = Router();

// 获取合同列表
router.get("/directed-pay/contracts", 
  authenticate, 
  requirePermissions("manage_directed_pay_contracts"),
  async (req, res) => {
    const { funderId, financierId, status, keyword } = req.query;
    const contracts = await contractStore.getDirectedPayContracts({
      funderId: funderId as string,
      financierId: financierId as string,
      status: status as any,
      keyword: keyword as string,
    });
    res.json({ contracts });
  }
);

// 获取合同详情
router.get("/directed-pay/contracts/:id",
  authenticate,
  requirePermissions("manage_directed_pay_contracts"),
  async (req, res) => {
    const contract = await contractStore.getDirectedPayContractById(req.params.id);
    if (!contract) {
      return res.status(404).json({ error: "合同不存在" });
    }
    res.json({ contract });
  }
);

// 创建合同
router.post("/directed-pay/contracts",
  authenticate,
  requirePermissions("manage_directed_pay_contracts"),
  async (req, res) => {
    const contract = await contractStore.createDirectedPayContract({
      ...req.body,
      createdBy: req.currentUser?.id,
    });
    res.json({ contract });
  }
);

// 更新合同
router.put("/directed-pay/contracts/:id",
  authenticate,
  requirePermissions("manage_directed_pay_contracts"),
  async (req, res) => {
    const contract = await contractStore.updateDirectedPayContract(req.params.id, req.body);
    res.json({ contract });
  }
);

// 删除合同
router.delete("/directed-pay/contracts/:id",
  authenticate,
  requirePermissions("manage_directed_pay_contracts"),
  async (req, res) => {
    await contractStore.deleteDirectedPayContract(req.params.id);
    res.json({ success: true });
  }
);

// 审批合同（状态变更为 active）
router.post("/directed-pay/contracts/:id/approve",
  authenticate,
  requirePermissions("approve_directed_pay_contracts"),
  async (req, res) => {
    await contractStore.updateContractStatus(req.params.id, "active");
    res.json({ success: true });
  }
);

// 暂停合同
router.post("/directed-pay/contracts/:id/suspend",
  authenticate,
  requirePermissions("manage_directed_pay_contracts"),
  async (req, res) => {
    await contractStore.updateContractStatus(req.params.id, "suspended");
    res.json({ success: true });
  }
);

// 恢复合同
router.post("/directed-pay/contracts/:id/resume",
  authenticate,
  requirePermissions("manage_directed_pay_contracts"),
  async (req, res) => {
    await contractStore.updateContractStatus(req.params.id, "active");
    res.json({ success: true });
  }
);

// 终止合同
router.post("/directed-pay/contracts/:id/terminate",
  authenticate,
  requirePermissions("manage_directed_pay_contracts"),
  async (req, res) => {
    await contractStore.updateContractStatus(req.params.id, "terminated");
    res.json({ success: true });
  }
);

// ========== 支付类别配置 ==========

// 获取支付类别模板
router.get("/directed-pay/category-templates",
  authenticate,
  async (req, res) => {
    res.json({ templates: contractStore.getPaymentCategoryTemplates() });
  }
);

// 获取合同的支付类别
router.get("/directed-pay/contracts/:id/categories",
  authenticate,
  async (req, res) => {
    const categories = await contractStore.getPaymentCategoriesByContract(req.params.id);
    res.json({ categories });
  }
);

// 添加支付类别
router.post("/directed-pay/contracts/:id/categories",
  authenticate,
  requirePermissions("manage_directed_pay_contracts"),
  async (req, res) => {
    const category = await contractStore.addPaymentCategory(req.params.id, req.body);
    res.json({ category });
  }
);

// 更新支付类别
router.put("/directed-pay/contracts/:id/categories/:catId",
  authenticate,
  requirePermissions("manage_directed_pay_contracts"),
  async (req, res) => {
    const category = await contractStore.updatePaymentCategory(req.params.catId, req.body);
    res.json({ category });
  }
);

// 删除支付类别
router.delete("/directed-pay/contracts/:id/categories/:catId",
  authenticate,
  requirePermissions("manage_directed_pay_contracts"),
  async (req, res) => {
    await contractStore.deletePaymentCategory(req.params.catId);
    res.json({ success: true });
  }
);

export default router;
```

---

### 任务4：合同列表前端页面

**目标**：创建定向支付合同列表页面

**文件**：创建 `frontend/src/pages/DirectedPayContracts.tsx`

**页面功能**：
- 合同列表展示（表格）
- 筛选：资金方、融资方、状态、关键字
- 操作：查看详情、编辑、审批、暂停/恢复、终止、删除
- 统计卡片：总合同数、生效中、已暂停、已到期

**参考**：`frontend/src/pages/Contracts.tsx`

---

### 任务5：创建合同前端页面（多步骤）

**目标**：创建定向支付合同的多步骤表单页面

**文件**：创建 `frontend/src/pages/CreateDirectedPayContract.tsx`

**步骤设计**：

**第一步：基本信息**
- 选择资金方（Select，从 funders 列表）
- 选择融资方（Select，从 financiers 列表）
- 授信总额度（InputNumber）
- 年化利率（InputNumber，百分比）
- 合同有效期（RangePicker）

**第二步：支付类别配置**
- 支付类别列表（可多选）
- 每个类别可配置：
  - 服务费率
  - 单笔限额（最小/最大）
  - 日累计限额
  - 是否需要平台审批 + 审批阈值
  - 是否需要资金方审批 + 审批阈值
  - 是否启用自动支付

**第三步：结算配置**
- 结算周期（月结/双周结/周结）
- 结算日（每月/每周第几天）
- 宽限期（天数）
- 计息基数（360/365）

**第四步：确认提交**
- 预览所有配置信息
- 提交按钮

**参考**：`frontend/src/pages/CreateFinancingContract.tsx`

---

### 任务6：合同详情页面

**目标**：创建合同详情页面

**文件**：创建 `frontend/src/pages/DirectedPayContractDetail.tsx`

**页面内容**：
- 合同基本信息卡片
- 支付类别配置表格
- 额度使用情况（进度条）
- 支付记录列表（分页）
- 操作按钮：编辑、审批、暂停/恢复、终止

---

### 任务7：菜单和路由配置

**目标**：将定向支付合同页面集成到系统菜单

**文件**：
- `frontend/src/App.tsx` - 添加路由
- `frontend/src/layouts/AppLayout.tsx` - 添加菜单项和 TabManager 配置

**菜单结构**：
```
合同管理
├── 三方融资合同
├── 撮合业务合同
├── 抽成合同
└── 定向支付合同  <-- 新增
    ├── 合同列表
    └── 创建合同
```

---

## 验收标准

1. 数据库表创建成功，可正常存取数据
2. 合同 CRUD API 可通过测试
3. 支付类别配置功能正常
4. 合同列表页面可正常展示和筛选
5. 创建合同页面各步骤正常工作
6. 合同详情页面信息完整
7. 菜单和路由配置正确

---

## 注意事项

1. 合同编号需要唯一
2. available_amount = credit_limit - used_amount
3. 状态流转：draft → pending_approval → active ⇄ suspended → expired/terminated
4. 前端表单需要完整的校验
5. 遵循项目现有的代码风格和组件使用方式

---

*任务文档版本: v1.0*
