import { randomUUID } from "crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { pool } from "./db.js";

// =============================================
// 类型定义
// =============================================

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

// 运单状态类型
export type WaybillStatus = 
  | "created" | "dispatched" | "loading" | "in_transit" 
  | "delivered" | "signed" | "settled" | "completed";

export interface PaymentCategoryConfig {
  id: string;
  contractId: string;
  categoryCode: string;
  categoryName: string;
  paymentRatio: number;  // 支付比例 (0-100)，如80表示最多支付原始金额的80%
  minAmount?: number;
  maxAmount?: number;
  dailyLimit?: number;
  requirePlatformApproval: boolean;
  requireFunderApproval: boolean;
  platformApprovalThreshold?: number;
  funderApprovalThreshold?: number;
  autoPaymentEnabled: boolean;
  isEnabled: boolean;
  unlockStatus: WaybillStatus;  // 解锁状态：达到此状态后可申请该费用
  createdAt: string;
  updatedAt?: string;
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

// =============================================
// 辅助函数
// =============================================

// 生成合同编号
function generateContractNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DPC${date}${random}`;
}

// 映射数据库行到 DirectedPayContract
function mapContractRow(row: any): DirectedPayContract {
  return {
    id: row.id,
    contractNumber: row.contract_number,
    funderId: row.funder_id,
    funderName: row.funder_name,
    financierId: row.financier_id,
    financierName: row.financier_name,
    funderAccountId: row.funder_account_id || undefined,
    creditLimit: parseFloat(row.credit_limit) || 0,
    usedAmount: parseFloat(row.used_amount) || 0,
    availableAmount: parseFloat(row.available_amount) || 0,
    annualInterestRate: parseFloat(row.annual_interest_rate) || 0,
    interestCalcBase: row.interest_calc_base || 360,
    startDate: row.start_date,
    endDate: row.end_date,
    settlementCycle: row.settlement_cycle as SettlementCycle,
    settlementDay: row.settlement_day,
    gracePeriodDays: row.grace_period_days || 3,
    autoPaymentEnabled: Boolean(row.auto_payment_enabled),
    status: row.status as DirectedPayContractStatus,
    remark: row.remark || undefined,
    createdBy: row.created_by || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// 映射数据库行到 PaymentCategoryConfig
function mapCategoryRow(row: any): PaymentCategoryConfig {
  return {
    id: row.id,
    contractId: row.contract_id,
    categoryCode: row.category_code,
    categoryName: row.category_name,
    paymentRatio: parseFloat(row.payment_ratio) || 100,  // 默认100%全额支付
    minAmount: row.min_amount ? parseFloat(row.min_amount) : undefined,
    maxAmount: row.max_amount ? parseFloat(row.max_amount) : undefined,
    dailyLimit: row.daily_limit ? parseFloat(row.daily_limit) : undefined,
    requirePlatformApproval: Boolean(row.require_platform_approval),
    requireFunderApproval: Boolean(row.require_funder_approval),
    platformApprovalThreshold: row.platform_approval_threshold 
      ? parseFloat(row.platform_approval_threshold) : undefined,
    funderApprovalThreshold: row.funder_approval_threshold 
      ? parseFloat(row.funder_approval_threshold) : undefined,
    autoPaymentEnabled: Boolean(row.auto_payment_enabled),
    isEnabled: Boolean(row.is_enabled),
    unlockStatus: (row.unlock_status as WaybillStatus) || "created",  // 解锁状态，默认"已创建"
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =============================================
// 确保表存在
// =============================================

export async function ensureDirectedPayContractsTables(): Promise<void> {
  // 创建定向支付合同表
  await pool.query(`
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
      INDEX idx_dpc_dates (start_date, end_date),
      INDEX idx_dpc_deleted_at (deleted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 创建支付类别配置表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_category_configs (
      id VARCHAR(36) PRIMARY KEY,
      contract_id VARCHAR(36) NOT NULL,
      category_code VARCHAR(50) NOT NULL,
      category_name VARCHAR(100) NOT NULL,
      payment_ratio DECIMAL(5,2) NOT NULL DEFAULT 100,
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

// =============================================
// 合同 CRUD
// =============================================

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
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT dpc.*, 
            f.name as funder_name, 
            fin.enterprise_name as financier_name
     FROM directed_pay_contracts dpc
     LEFT JOIN funders f ON dpc.funder_id = f.id
     LEFT JOIN financiers fin ON dpc.financier_id = fin.id
     WHERE dpc.id = ? AND dpc.deleted_at IS NULL`,
    [id]
  );
  return rows[0] ? mapContractRow(rows[0]) : undefined;
}

// 获取合同列表
export async function getDirectedPayContracts(filters?: {
  funderId?: string;
  financierId?: string;
  status?: DirectedPayContractStatus;
  keyword?: string;
}): Promise<DirectedPayContract[]> {
  let query = `
    SELECT dpc.*, 
           f.name as funder_name, 
           fin.enterprise_name as financier_name
    FROM directed_pay_contracts dpc
    LEFT JOIN funders f ON dpc.funder_id = f.id
    LEFT JOIN financiers fin ON dpc.financier_id = fin.id
    WHERE dpc.deleted_at IS NULL
  `;
  const values: any[] = [];

  if (filters?.funderId) {
    query += " AND dpc.funder_id = ?";
    values.push(filters.funderId);
  }
  if (filters?.financierId) {
    query += " AND dpc.financier_id = ?";
    values.push(filters.financierId);
  }
  if (filters?.status) {
    query += " AND dpc.status = ?";
    values.push(filters.status);
  }
  if (filters?.keyword) {
    query += " AND (dpc.contract_number LIKE ? OR f.name LIKE ? OR fin.enterprise_name LIKE ?)";
    const kw = `%${filters.keyword}%`;
    values.push(kw, kw, kw);
  }

  query += " ORDER BY dpc.created_at DESC";

  const [rows] = await pool.query<RowDataPacket[]>(query, values);
  return rows.map(mapContractRow);
}

// 根据资金方获取有合同关系的融资方列表
export async function getDirectedPayContractsByFunder(
  funderId: string
): Promise<{ financierId: string }[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT financier_id 
     FROM directed_pay_contracts 
     WHERE funder_id = ? AND status = 'active' AND deleted_at IS NULL`,
    [funderId]
  );
  return rows.map(row => ({ financierId: row.financier_id }));
}

// 根据融资方获取生效中的合同
export async function getActiveContractByFinancier(financierId: string): Promise<DirectedPayContract | undefined> {
  const today = new Date().toISOString().split('T')[0];
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT dpc.*, 
            f.name as funder_name, 
            fin.enterprise_name as financier_name
     FROM directed_pay_contracts dpc
     LEFT JOIN funders f ON dpc.funder_id = f.id
     LEFT JOIN financiers fin ON dpc.financier_id = fin.id
     WHERE dpc.financier_id = ? 
       AND dpc.status = 'active' 
       AND dpc.start_date <= ?
       AND dpc.end_date >= ?
       AND dpc.deleted_at IS NULL
     LIMIT 1`,
    [financierId, today, today]
  );
  return rows[0] ? mapContractRow(rows[0]) : undefined;
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
  // 获取当前合同信息
  const contract = await getDirectedPayContractById(id);
  if (!contract) throw new Error("合同不存在");

  const updates: string[] = [];
  const values: any[] = [];

  if (input.funderAccountId !== undefined) {
    updates.push("funder_account_id = ?");
    values.push(input.funderAccountId);
  }
  if (input.creditLimit !== undefined) {
    // 如果修改授信额度，需要重新计算可用额度
    const diff = input.creditLimit - contract.creditLimit;
    updates.push("credit_limit = ?");
    updates.push("available_amount = available_amount + ?");
    values.push(input.creditLimit, diff);
  }
  if (input.annualInterestRate !== undefined) {
    updates.push("annual_interest_rate = ?");
    values.push(input.annualInterestRate);
  }
  if (input.endDate !== undefined) {
    updates.push("end_date = ?");
    values.push(input.endDate);
  }
  if (input.settlementCycle !== undefined) {
    updates.push("settlement_cycle = ?");
    values.push(input.settlementCycle);
  }
  if (input.settlementDay !== undefined) {
    updates.push("settlement_day = ?");
    values.push(input.settlementDay);
  }
  if (input.gracePeriodDays !== undefined) {
    updates.push("grace_period_days = ?");
    values.push(input.gracePeriodDays);
  }
  if (input.autoPaymentEnabled !== undefined) {
    updates.push("auto_payment_enabled = ?");
    values.push(input.autoPaymentEnabled ? 1 : 0);
  }
  if (input.remark !== undefined) {
    updates.push("remark = ?");
    values.push(input.remark);
  }

  if (updates.length > 0) {
    values.push(id);
    await pool.query(
      `UPDATE directed_pay_contracts SET ${updates.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
      values
    );
  }

  const updated = await getDirectedPayContractById(id);
  if (!updated) throw new Error("更新合同失败");
  return updated;
}

// 更新合同状态
export async function updateDirectedPayContractStatus(
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
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE directed_pay_contracts 
     SET used_amount = used_amount + ?, available_amount = available_amount - ?
     WHERE id = ? AND available_amount >= ? AND status = 'active' AND deleted_at IS NULL`,
    [amount, amount, contractId, amount]
  );
  
  if (result.affectedRows === 0) {
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

// =============================================
// 支付类别配置 CRUD
// =============================================

// 添加支付类别
export async function addPaymentCategory(
  contractId: string,
  input: {
    categoryCode: string;
    categoryName: string;
    paymentRatio?: number;  // 支付比例 (0-100)
    minAmount?: number;
    maxAmount?: number;
    dailyLimit?: number;
    requirePlatformApproval?: boolean;
    requireFunderApproval?: boolean;
    platformApprovalThreshold?: number;
    funderApprovalThreshold?: number;
    autoPaymentEnabled?: boolean;
    unlockStatus?: WaybillStatus;  // 解锁状态
  }
): Promise<PaymentCategoryConfig> {
  const id = randomUUID();

  await pool.query(
    `INSERT INTO payment_category_configs 
     (id, contract_id, category_code, category_name, payment_ratio,
      min_amount, max_amount, daily_limit,
      require_platform_approval, require_funder_approval,
      platform_approval_threshold, funder_approval_threshold,
      auto_payment_enabled, unlock_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, contractId, input.categoryCode, input.categoryName,
      input.paymentRatio ?? 100,  // 默认100%全额支付
      input.minAmount || null, input.maxAmount || null, input.dailyLimit || null,
      input.requirePlatformApproval !== false ? 1 : 0,
      input.requireFunderApproval !== false ? 1 : 0,
      input.platformApprovalThreshold || null, input.funderApprovalThreshold || null,
      input.autoPaymentEnabled ? 1 : 0,
      input.unlockStatus || "created"  // 默认"已创建"
    ]
  );

  const category = await getPaymentCategoryById(id);
  if (!category) throw new Error("添加支付类别失败");
  return category;
}

// 获取支付类别
export async function getPaymentCategoryById(id: string): Promise<PaymentCategoryConfig | undefined> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM payment_category_configs WHERE id = ?`,
    [id]
  );
  return rows[0] ? mapCategoryRow(rows[0]) : undefined;
}

// 获取合同的所有支付类别
export async function getPaymentCategoriesByContract(contractId: string): Promise<PaymentCategoryConfig[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM payment_category_configs WHERE contract_id = ? ORDER BY created_at`,
    [contractId]
  );
  return rows.map(mapCategoryRow);
}

// 更新支付类别
export async function updatePaymentCategory(
  id: string,
  input: Partial<{
    categoryName: string;
    paymentRatio: number;  // 支付比例 (0-100)
    minAmount: number | null;
    maxAmount: number | null;
    dailyLimit: number | null;
    requirePlatformApproval: boolean;
    requireFunderApproval: boolean;
    platformApprovalThreshold: number | null;
    funderApprovalThreshold: number | null;
    autoPaymentEnabled: boolean;
    isEnabled: boolean;
    unlockStatus: WaybillStatus;  // 解锁状态
  }>
): Promise<PaymentCategoryConfig> {
  const updates: string[] = [];
  const values: any[] = [];

  if (input.categoryName !== undefined) {
    updates.push("category_name = ?");
    values.push(input.categoryName);
  }
  if (input.paymentRatio !== undefined) {
    updates.push("payment_ratio = ?");
    values.push(input.paymentRatio);
  }
  if (input.minAmount !== undefined) {
    updates.push("min_amount = ?");
    values.push(input.minAmount);
  }
  if (input.maxAmount !== undefined) {
    updates.push("max_amount = ?");
    values.push(input.maxAmount);
  }
  if (input.dailyLimit !== undefined) {
    updates.push("daily_limit = ?");
    values.push(input.dailyLimit);
  }
  if (input.requirePlatformApproval !== undefined) {
    updates.push("require_platform_approval = ?");
    values.push(input.requirePlatformApproval ? 1 : 0);
  }
  if (input.requireFunderApproval !== undefined) {
    updates.push("require_funder_approval = ?");
    values.push(input.requireFunderApproval ? 1 : 0);
  }
  if (input.platformApprovalThreshold !== undefined) {
    updates.push("platform_approval_threshold = ?");
    values.push(input.platformApprovalThreshold);
  }
  if (input.funderApprovalThreshold !== undefined) {
    updates.push("funder_approval_threshold = ?");
    values.push(input.funderApprovalThreshold);
  }
  if (input.autoPaymentEnabled !== undefined) {
    updates.push("auto_payment_enabled = ?");
    values.push(input.autoPaymentEnabled ? 1 : 0);
  }
  if (input.isEnabled !== undefined) {
    updates.push("is_enabled = ?");
    values.push(input.isEnabled ? 1 : 0);
  }
  if (input.unlockStatus !== undefined) {
    updates.push("unlock_status = ?");
    values.push(input.unlockStatus);
  }

  if (updates.length > 0) {
    values.push(id);
    await pool.query(
      `UPDATE payment_category_configs SET ${updates.join(", ")} WHERE id = ?`,
      values
    );
  }

  const updated = await getPaymentCategoryById(id);
  if (!updated) throw new Error("更新支付类别失败");
  return updated;
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
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT auto_payment_enabled FROM payment_category_configs 
     WHERE contract_id = ? AND category_code = ? AND is_enabled = 1`,
    [contractId, categoryCode]
  );
  return rows[0]?.auto_payment_enabled === 1;
}

// =============================================
// 统计函数
// =============================================

export interface DirectedPayContractStats {
  totalCount: number;
  activeCount: number;
  suspendedCount: number;
  expiredCount: number;
  totalCreditLimit: number;
  totalUsedAmount: number;
  totalAvailableAmount: number;
}

export async function getDirectedPayContractStats(): Promise<DirectedPayContractStats> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 
       COUNT(*) as total_count,
       SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
       SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) as suspended_count,
       SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired_count,
       SUM(credit_limit) as total_credit_limit,
       SUM(used_amount) as total_used_amount,
       SUM(available_amount) as total_available_amount
     FROM directed_pay_contracts
     WHERE deleted_at IS NULL`
  );

  const row = rows[0];
  return {
    totalCount: row.total_count || 0,
    activeCount: row.active_count || 0,
    suspendedCount: row.suspended_count || 0,
    expiredCount: row.expired_count || 0,
    totalCreditLimit: parseFloat(row.total_credit_limit) || 0,
    totalUsedAmount: parseFloat(row.total_used_amount) || 0,
    totalAvailableAmount: parseFloat(row.total_available_amount) || 0,
  };
}
