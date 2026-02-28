import { randomUUID } from "crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { pool } from "./db.js";

// ==================== 类型定义 ====================

export type DirectedPaySettlementStatus = "pending" | "confirmed" | "partial_paid" | "paid" | "overdue";

export interface DirectedPaySettlement {
  id: string;
  settlementNumber: string;
  contractId: string;
  contractNumber?: string;
  financierName?: string;
  periodStart: string;
  periodEnd: string;
  paymentCount: number;
  principalAmount: number;
  interestAmount: number;
  serviceAmount: number;
  totalAmount: number;
  dueDate: string;
  actualPaidAmount: number;
  paidAt?: string;
  status: DirectedPaySettlementStatus;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DirectedPaySettlementItem {
  id: string;
  settlementId: string;
  paymentRequestId: string;
  paymentAmount: number;
  paymentTime: string;
  interestDays: number;
  interestAmount: number;
  serviceFee: number;
  createdAt: string;
}

export interface DirectedPaySettlementStats {
  totalPending: number;
  totalConfirmed: number;
  totalPaid: number;
  totalOverdue: number;
  totalAmount: number;
  totalPaidAmount: number;
  pendingAmount: number;
  overdueAmount: number;
}

// ==================== 数据库行映射 ====================

interface SettlementRow extends RowDataPacket {
  id: string;
  settlement_number: string;
  contract_id: string;
  contract_number?: string;
  financier_name?: string;
  period_start: string;
  period_end: string;
  payment_count: number;
  principal_amount: string | number;
  interest_amount: string | number;
  service_amount: string | number;
  total_amount: string | number;
  due_date: string;
  actual_paid_amount: string | number;
  paid_at: string | null;
  status: string;
  remark: string | null;
  created_at: string;
  updated_at: string;
}

interface SettlementItemRow extends RowDataPacket {
  id: string;
  settlement_id: string;
  payment_request_id: string;
  payment_amount: string | number;
  payment_time: string;
  interest_days: number;
  interest_amount: string | number;
  service_fee: string | number;
  created_at: string;
}

function mapSettlementRow(row: SettlementRow): DirectedPaySettlement {
  return {
    id: row.id,
    settlementNumber: row.settlement_number,
    contractId: row.contract_id,
    contractNumber: row.contract_number,
    financierName: row.financier_name,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    paymentCount: Number(row.payment_count),
    principalAmount: Number(row.principal_amount),
    interestAmount: Number(row.interest_amount),
    serviceAmount: Number(row.service_amount),
    totalAmount: Number(row.total_amount),
    dueDate: row.due_date,
    actualPaidAmount: Number(row.actual_paid_amount),
    paidAt: row.paid_at || undefined,
    status: row.status as DirectedPaySettlementStatus,
    remark: row.remark || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSettlementItemRow(row: SettlementItemRow): DirectedPaySettlementItem {
  return {
    id: row.id,
    settlementId: row.settlement_id,
    paymentRequestId: row.payment_request_id,
    paymentAmount: Number(row.payment_amount),
    paymentTime: row.payment_time,
    interestDays: Number(row.interest_days),
    interestAmount: Number(row.interest_amount),
    serviceFee: Number(row.service_fee),
    createdAt: row.created_at,
  };
}

// ==================== 确保表存在 ====================

export async function ensureDirectedPaySettlementsTables(): Promise<void> {
  // 定向支付合同表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS directed_pay_contracts (
      id VARCHAR(36) PRIMARY KEY,
      contract_number VARCHAR(50) NOT NULL UNIQUE,
      funder_id VARCHAR(36) NOT NULL,
      financier_id VARCHAR(36) NOT NULL,
      funder_account_id VARCHAR(100),
      credit_limit DECIMAL(18,2) NOT NULL DEFAULT 0,
      used_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      available_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      annual_interest_rate DECIMAL(5,4) NOT NULL,
      interest_calc_base INT NOT NULL DEFAULT 360,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      settlement_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly',
      settlement_day INT DEFAULT 1,
      grace_period_days INT NOT NULL DEFAULT 7,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL,
      INDEX idx_dpc_contract_number (contract_number),
      INDEX idx_dpc_funder (funder_id),
      INDEX idx_dpc_financier (financier_id),
      INDEX idx_dpc_status (status),
      INDEX idx_dpc_deleted_at (deleted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 支付类别配置表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_category_configs (
      id VARCHAR(36) PRIMARY KEY,
      contract_id VARCHAR(36) NOT NULL,
      category_code VARCHAR(50) NOT NULL,
      category_name VARCHAR(100) NOT NULL,
      payment_ratio DECIMAL(5,2) NOT NULL DEFAULT 100,
      min_amount DECIMAL(18,2) DEFAULT 0,
      max_amount DECIMAL(18,2) DEFAULT 0,
      daily_limit DECIMAL(18,2) DEFAULT 0,
      require_platform_approval TINYINT(1) NOT NULL DEFAULT 0,
      require_funder_approval TINYINT(1) NOT NULL DEFAULT 0,
      platform_approval_threshold DECIMAL(18,2) DEFAULT 0,
      funder_approval_threshold DECIMAL(18,2) DEFAULT 0,
      is_enabled TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pcc_contract (contract_id),
      INDEX idx_pcc_category (category_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 定向支付申请表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS directed_payment_requests (
      id VARCHAR(36) PRIMARY KEY,
      request_number VARCHAR(50) NOT NULL UNIQUE,
      contract_id VARCHAR(36) NOT NULL,
      waybill_id VARCHAR(36),
      waybill_number VARCHAR(50),
      category_code VARCHAR(50) NOT NULL,
      payment_amount DECIMAL(18,2) NOT NULL,
      service_fee DECIMAL(18,2) NOT NULL DEFAULT 0,
      interest_start_time DATETIME,
      receiver_type VARCHAR(20) NOT NULL,
      receiver_name VARCHAR(100),
      receiver_account VARCHAR(100),
      receiver_bank VARCHAR(100),
      driver_id VARCHAR(36),
      remark TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      platform_approval_status VARCHAR(20) DEFAULT 'pending',
      platform_approved_by VARCHAR(36),
      platform_approved_at DATETIME,
      platform_approval_remark TEXT,
      funder_approval_status VARCHAR(20) DEFAULT 'pending',
      funder_approved_by VARCHAR(36),
      funder_approved_at DATETIME,
      funder_approval_remark TEXT,
      created_by VARCHAR(36),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_dpr_request_number (request_number),
      INDEX idx_dpr_contract (contract_id),
      INDEX idx_dpr_waybill (waybill_id),
      INDEX idx_dpr_status (status),
      INDEX idx_dpr_platform_status (platform_approval_status),
      INDEX idx_dpr_funder_status (funder_approval_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 定向支付结算单表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS directed_pay_settlements (
      id VARCHAR(36) PRIMARY KEY,
      settlement_number VARCHAR(50) NOT NULL UNIQUE,
      contract_id VARCHAR(36) NOT NULL,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      payment_count INT NOT NULL DEFAULT 0,
      principal_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      interest_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      service_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      total_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      due_date DATE NOT NULL,
      actual_paid_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      paid_at DATETIME,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_dps_settlement_number (settlement_number),
      INDEX idx_dps_contract (contract_id),
      INDEX idx_dps_status (status),
      INDEX idx_dps_period (period_start, period_end),
      INDEX idx_dps_due_date (due_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 结算单明细表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS directed_pay_settlement_items (
      id VARCHAR(36) PRIMARY KEY,
      settlement_id VARCHAR(36) NOT NULL,
      payment_request_id VARCHAR(36) NOT NULL,
      payment_amount DECIMAL(18,2) NOT NULL,
      payment_time DATETIME NOT NULL,
      interest_days INT NOT NULL,
      interest_amount DECIMAL(18,2) NOT NULL,
      service_fee DECIMAL(18,2) NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_dpsi_settlement (settlement_id),
      INDEX idx_dpsi_payment (payment_request_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 支付执行记录表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_executions (
      id VARCHAR(36) PRIMARY KEY,
      request_id VARCHAR(36) NOT NULL,
      execution_time DATETIME NOT NULL,
      transaction_id VARCHAR(100),
      channel VARCHAR(50) NOT NULL DEFAULT 'mock',
      channel_request JSON,
      channel_response JSON,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      failure_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_pe_request (request_id),
      INDEX idx_pe_transaction (transaction_id),
      INDEX idx_pe_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

// ==================== 生成结算单号 ====================

function generateSettlementNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DPS${date}${random}`;
}

// ==================== 利息计算核心逻辑 ====================

/**
 * 计算单笔支付的利息
 * 规则：
 * 1. 从支付时刻开始计息（interest_start_time）
 * 2. 按日计息
 * 3. 不满一天按一天计算
 * 4. 计息基数默认360天（可配置为365）
 * 
 * @param principal 本金
 * @param annualRate 年化利率（如 0.12 表示12%）
 * @param paymentTime 支付时间
 * @param settlementTime 结算时间
 * @param calcBase 计息基数（360 或 365）
 */
export function calculateInterest(
  principal: number,
  annualRate: number,
  paymentTime: Date,
  settlementTime: Date,
  calcBase: number = 360
): { days: number; interest: number } {
  // 计算天数（不满一天按一天）
  const diffMs = settlementTime.getTime() - paymentTime.getTime();
  const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  
  // 日利率
  const dailyRate = annualRate / calcBase;
  
  // 利息 = 本金 × 日利率 × 天数
  const interest = principal * dailyRate * days;
  
  // 保留两位小数（四舍五入）
  return {
    days,
    interest: Math.round(interest * 100) / 100
  };
}

// ==================== 结算单生成 ====================

// 计算周期开始时间
function calculatePeriodStart(periodEnd: Date, cycle: string): Date {
  const start = new Date(periodEnd);
  switch (cycle) {
    case "monthly":
      start.setMonth(start.getMonth() - 1);
      start.setDate(start.getDate() + 1);
      break;
    case "biweekly":
      start.setDate(start.getDate() - 13); // 14天周期
      break;
    case "weekly":
      start.setDate(start.getDate() - 6); // 7天周期
      break;
  }
  return start;
}

// 获取周期内的成功支付记录
async function getSuccessPaymentsInPeriod(
  contractId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<Array<{
  id: string;
  paymentAmount: number;
  serviceFee: number;
  interestStartTime: string;
}>> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, payment_amount, service_fee, interest_start_time
     FROM directed_payment_requests
     WHERE contract_id = ? 
       AND status = 'success'
       AND interest_start_time >= ?
       AND interest_start_time <= ?`,
    [contractId, periodStart.toISOString(), periodEnd.toISOString()]
  );
  return rows.map(row => ({
    id: row.id,
    paymentAmount: Number(row.payment_amount),
    serviceFee: Number(row.service_fee || 0),
    interestStartTime: row.interest_start_time,
  }));
}

// 获取合同信息
interface DirectedPayContract {
  id: string;
  contractNumber: string;
  funderId: string;
  financierId: string;
  financierName?: string;
  annualInterestRate: number;
  interestCalcBase: number;
  gracePeriodDays: number;
  settlementCycle: string;
  status: string;
}

async function getDirectedPayContractById(id: string): Promise<DirectedPayContract | undefined> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.*, f.enterprise_name as financier_name
     FROM directed_pay_contracts c
     LEFT JOIN financiers f ON c.financier_id = f.id
     WHERE c.id = ? AND c.deleted_at IS NULL`,
    [id]
  );
  if (!rows[0]) return undefined;
  return {
    id: rows[0].id,
    contractNumber: rows[0].contract_number,
    funderId: rows[0].funder_id,
    financierId: rows[0].financier_id,
    financierName: rows[0].financier_name,
    annualInterestRate: Number(rows[0].annual_interest_rate),
    interestCalcBase: Number(rows[0].interest_calc_base),
    gracePeriodDays: Number(rows[0].grace_period_days),
    settlementCycle: rows[0].settlement_cycle,
    status: rows[0].status,
  };
}

/**
 * 为指定合同生成结算单
 */
export async function generateSettlement(
  contractId: string,
  periodEnd: Date
): Promise<DirectedPaySettlement> {
  // 1. 获取合同信息
  const contract = await getDirectedPayContractById(contractId);
  if (!contract) throw new Error("合同不存在");
  
  // 2. 计算结算周期开始时间
  const periodStart = calculatePeriodStart(periodEnd, contract.settlementCycle);
  
  // 3. 获取本期所有成功的支付记录
  const payments = await getSuccessPaymentsInPeriod(contractId, periodStart, periodEnd);
  
  if (payments.length === 0) {
    throw new Error("本期无支付记录，无需生成结算单");
  }
  
  // 4. 计算各项金额
  let principalAmount = 0;
  let interestAmount = 0;
  let serviceAmount = 0;
  const items: Array<{
    paymentRequestId: string;
    paymentAmount: number;
    paymentTime: Date;
    interestDays: number;
    interestAmount: number;
    serviceFee: number;
  }> = [];
  
  for (const payment of payments) {
    principalAmount += payment.paymentAmount;
    serviceAmount += payment.serviceFee || 0;
    
    const { days, interest } = calculateInterest(
      payment.paymentAmount,
      contract.annualInterestRate,
      new Date(payment.interestStartTime),
      periodEnd,
      contract.interestCalcBase
    );
    
    interestAmount += interest;
    
    items.push({
      paymentRequestId: payment.id,
      paymentAmount: payment.paymentAmount,
      paymentTime: new Date(payment.interestStartTime),
      interestDays: days,
      interestAmount: interest,
      serviceFee: payment.serviceFee || 0,
    });
  }
  
  const totalAmount = principalAmount + interestAmount + serviceAmount;
  
  // 5. 计算应还日期（周期结束 + 宽限期）
  const dueDate = new Date(periodEnd);
  dueDate.setDate(dueDate.getDate() + contract.gracePeriodDays);
  
  // 6. 创建结算单
  const settlementId = randomUUID();
  const settlementNumber = generateSettlementNumber();
  
  await pool.query(
    `INSERT INTO directed_pay_settlements 
     (id, settlement_number, contract_id, period_start, period_end,
      payment_count, principal_amount, interest_amount, service_amount,
      total_amount, due_date, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      settlementId, settlementNumber, contractId,
      periodStart.toISOString().slice(0, 10),
      periodEnd.toISOString().slice(0, 10),
      payments.length, principalAmount, interestAmount, serviceAmount,
      totalAmount, dueDate.toISOString().slice(0, 10)
    ]
  );
  
  // 7. 创建结算单明细
  for (const item of items) {
    await pool.query(
      `INSERT INTO directed_pay_settlement_items 
       (id, settlement_id, payment_request_id, payment_amount, payment_time,
        interest_days, interest_amount, service_fee)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(), settlementId, item.paymentRequestId,
        item.paymentAmount, item.paymentTime,
        item.interestDays, item.interestAmount, item.serviceFee
      ]
    );
  }
  
  const settlement = await getDirectedPaySettlementById(settlementId);
  if (!settlement) throw new Error("生成结算单失败");
  return settlement;
}

// ==================== 结算单 CRUD ====================

// 获取结算单详情
export async function getDirectedPaySettlementById(id: string): Promise<DirectedPaySettlement | undefined> {
  const [rows] = await pool.query<SettlementRow[]>(
    `SELECT s.*, c.contract_number, f.enterprise_name as financier_name
     FROM directed_pay_settlements s
     LEFT JOIN directed_pay_contracts c ON s.contract_id = c.id
     LEFT JOIN financiers f ON c.financier_id = f.id
     WHERE s.id = ?`,
    [id]
  );
  return rows[0] ? mapSettlementRow(rows[0]) : undefined;
}

// 获取结算单列表
export async function getDirectedPaySettlements(filters?: {
  contractId?: string;
  financierId?: string;
  status?: DirectedPaySettlementStatus;
  startDate?: string;
  endDate?: string;
}): Promise<DirectedPaySettlement[]> {
  let query = `
    SELECT s.*, c.contract_number, f.enterprise_name as financier_name
    FROM directed_pay_settlements s
    LEFT JOIN directed_pay_contracts c ON s.contract_id = c.id
    LEFT JOIN financiers f ON c.financier_id = f.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (filters?.contractId) {
    query += ` AND s.contract_id = ?`;
    params.push(filters.contractId);
  }
  if (filters?.financierId) {
    query += ` AND c.financier_id = ?`;
    params.push(filters.financierId);
  }
  if (filters?.status) {
    query += ` AND s.status = ?`;
    params.push(filters.status);
  }
  if (filters?.startDate) {
    query += ` AND s.period_start >= ?`;
    params.push(filters.startDate);
  }
  if (filters?.endDate) {
    query += ` AND s.period_end <= ?`;
    params.push(filters.endDate);
  }

  query += ` ORDER BY s.created_at DESC`;

  const [rows] = await pool.query<SettlementRow[]>(query, params);
  return rows.map(mapSettlementRow);
}

// 获取结算单明细
export async function getDirectedPaySettlementItems(settlementId: string): Promise<DirectedPaySettlementItem[]> {
  const [rows] = await pool.query<SettlementItemRow[]>(
    `SELECT * FROM directed_pay_settlement_items WHERE settlement_id = ? ORDER BY created_at ASC`,
    [settlementId]
  );
  return rows.map(mapSettlementItemRow);
}

// 确认结算单
export async function confirmDirectedPaySettlement(id: string): Promise<DirectedPaySettlement> {
  const current = await getDirectedPaySettlementById(id);
  if (!current) {
    throw new Error("结算单不存在");
  }
  if (current.status !== "pending") {
    throw new Error("只能确认待处理状态的结算单");
  }

  await pool.query(
    `UPDATE directed_pay_settlements SET status = 'confirmed' WHERE id = ? AND status = 'pending'`,
    [id]
  );

  const updated = await getDirectedPaySettlementById(id);
  if (!updated) {
    throw new Error("确认结算单失败");
  }
  return updated;
}

// 还款处理
export async function processDirectedPayRepayment(
  settlementId: string,
  amount: number
): Promise<DirectedPaySettlement> {
  // 1. 获取结算单
  const settlement = await getDirectedPaySettlementById(settlementId);
  if (!settlement) throw new Error("结算单不存在");
  if (settlement.status === "paid") throw new Error("结算单已结清");
  
  // 2. 计算新的已还金额
  const newPaidAmount = settlement.actualPaidAmount + amount;
  
  // 3. 判断状态
  let newStatus: DirectedPaySettlementStatus;
  if (newPaidAmount >= settlement.totalAmount) {
    newStatus = "paid";
  } else {
    newStatus = "partial_paid";
  }
  
  // 4. 更新结算单
  await pool.query(
    `UPDATE directed_pay_settlements 
     SET actual_paid_amount = ?, status = ?, paid_at = NOW()
     WHERE id = ?`,
    [newPaidAmount, newStatus, settlementId]
  );
  
  // 5. 如果全额还款，恢复合同额度
  if (newStatus === "paid") {
    await restoreContractCredit(settlement.contractId, settlement.principalAmount);
  }
  
  const updated = await getDirectedPaySettlementById(settlementId);
  if (!updated) {
    throw new Error("还款处理失败");
  }
  return updated;
}

// 恢复合同额度
async function restoreContractCredit(contractId: string, amount: number): Promise<void> {
  await pool.query(
    `UPDATE directed_pay_contracts 
     SET used_amount = used_amount - ?, available_amount = available_amount + ?
     WHERE id = ?`,
    [amount, amount, contractId]
  );
}

// 标记逾期
export async function markDirectedPaySettlementOverdue(settlementId: string): Promise<void> {
  await pool.query(
    `UPDATE directed_pay_settlements SET status = 'overdue' 
     WHERE id = ? AND status IN ('pending', 'confirmed', 'partial_paid')`,
    [settlementId]
  );
}

// 批量更新逾期状态（用于定时任务）
export async function updateOverdueDirectedPaySettlements(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE directed_pay_settlements SET status = 'overdue' 
     WHERE status IN ('pending', 'confirmed', 'partial_paid') AND due_date < ?`,
    [today]
  );
  return result.affectedRows;
}

// ==================== 统计 ====================

// 获取结算统计
export async function getDirectedPaySettlementStats(contractId?: string): Promise<DirectedPaySettlementStats> {
  let baseWhere = "WHERE 1=1";
  const params: any[] = [];
  
  if (contractId) {
    baseWhere += " AND contract_id = ?";
    params.push(contractId);
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as total_pending,
       SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as total_confirmed,
       SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as total_paid,
       SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as total_overdue,
       COALESCE(SUM(total_amount), 0) as total_amount,
       COALESCE(SUM(actual_paid_amount), 0) as total_paid_amount,
       COALESCE(SUM(CASE WHEN status = 'pending' THEN total_amount ELSE 0 END), 0) as pending_amount,
       COALESCE(SUM(CASE WHEN status = 'overdue' THEN total_amount - actual_paid_amount ELSE 0 END), 0) as overdue_amount
     FROM directed_pay_settlements
     ${baseWhere}`,
    params
  );

  const row = rows[0];
  return {
    totalPending: Number(row?.total_pending || 0),
    totalConfirmed: Number(row?.total_confirmed || 0),
    totalPaid: Number(row?.total_paid || 0),
    totalOverdue: Number(row?.total_overdue || 0),
    totalAmount: Number(row?.total_amount || 0),
    totalPaidAmount: Number(row?.total_paid_amount || 0),
    pendingAmount: Number(row?.pending_amount || 0),
    overdueAmount: Number(row?.overdue_amount || 0),
  };
}

// ==================== 定向支付合同相关函数 ====================

// 获取定向支付合同列表
export async function getDirectedPayContracts(filters?: {
  funderId?: string;
  financierId?: string;
  status?: string;
}): Promise<DirectedPayContract[]> {
  let query = `
    SELECT c.*, f.enterprise_name as financier_name
    FROM directed_pay_contracts c
    LEFT JOIN financiers f ON c.financier_id = f.id
    WHERE c.deleted_at IS NULL
  `;
  const params: any[] = [];

  if (filters?.funderId) {
    query += ` AND c.funder_id = ?`;
    params.push(filters.funderId);
  }
  if (filters?.financierId) {
    query += ` AND c.financier_id = ?`;
    params.push(filters.financierId);
  }
  if (filters?.status) {
    query += ` AND c.status = ?`;
    params.push(filters.status);
  }

  query += ` ORDER BY c.created_at DESC`;

  const [rows] = await pool.query<RowDataPacket[]>(query, params);
  return rows.map(row => ({
    id: row.id,
    contractNumber: row.contract_number,
    funderId: row.funder_id,
    financierId: row.financier_id,
    financierName: row.financier_name,
    annualInterestRate: Number(row.annual_interest_rate),
    interestCalcBase: Number(row.interest_calc_base),
    gracePeriodDays: Number(row.grace_period_days),
    settlementCycle: row.settlement_cycle,
    status: row.status,
  }));
}
