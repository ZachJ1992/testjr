/**
 * 合同放款管理 - 数据存储层
 * 
 * 包含：
 * - 放款记录 CRUD
 * - 还款记录 CRUD
 * - 利息台账管理
 * - 合同放款状态更新
 */

import { pool } from "./db.js";
import { RowDataPacket } from "mysql2";
import { v4 as uuidv4 } from "uuid";
import { LoanStatus, LoanStatusType } from "./migrations/contract-loan-tables.js";

// ==================== 类型定义 ====================

export interface ContractDisbursement {
  id: string;
  contractId: string;
  amount: number;
  disbursementDate: string;
  operatorId?: string;
  operatorName?: string;
  remark?: string;
  status: 'active' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

export interface ContractRepayment {
  id: string;
  contractId: string;
  principalAmount: number;
  interestAmount: number;
  totalAmount: number;
  repaymentDate: string;
  operatorId?: string;
  operatorName?: string;
  remark?: string;
  status: 'confirmed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

export interface ContractInterestAccrual {
  id: string;
  contractId: string;
  accrualDate: string;
  principalBase: number;
  annualRate: number;
  dailyRate: number;
  interestAmount: number;
  status: 'pending' | 'settled';
  settledAt?: string;
  settledBy?: string;
  createdAt: string;
}

export interface ContractLoanSummary {
  contractId: string;
  creditLimit: number;
  totalDisbursed: number;
  totalRepaidPrincipal: number;
  totalRepaidInterest: number;
  outstandingPrincipal: number;
  accruedInterest: number;
  availableCredit: number;
  loanStatus: LoanStatusType;
  firstDisbursementDate?: string;
  lastDisbursementDate?: string;
  lastRepaymentDate?: string;
}

// ==================== 放款记录 ====================

export async function createDisbursement(input: {
  contractId: string;
  amount: number;
  disbursementDate: string;
  operatorId?: string;
  operatorName?: string;
  remark?: string;
}): Promise<ContractDisbursement> {
  const id = uuidv4();
  
  await pool.query(
    `INSERT INTO contract_disbursements 
     (id, contract_id, amount, disbursement_date, operator_id, operator_name, remark, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
    [id, input.contractId, input.amount, input.disbursementDate, 
     input.operatorId, input.operatorName, input.remark]
  );

  // 更新合同汇总数据
  await updateContractLoanSummary(input.contractId);

  return getDisbursementById(id) as Promise<ContractDisbursement>;
}

export async function getDisbursementById(id: string): Promise<ContractDisbursement | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM contract_disbursements WHERE id = ?`,
    [id]
  );
  return rows[0] ? mapDisbursementRow(rows[0]) : null;
}

export async function getDisbursementsByContract(contractId: string): Promise<ContractDisbursement[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM contract_disbursements 
     WHERE contract_id = ? AND status = 'active'
     ORDER BY disbursement_date DESC, created_at DESC`,
    [contractId]
  );
  return rows.map(mapDisbursementRow);
}

export async function cancelDisbursement(id: string): Promise<void> {
  const disbursement = await getDisbursementById(id);
  if (!disbursement) throw new Error("放款记录不存在");
  
  await pool.query(
    `UPDATE contract_disbursements SET status = 'cancelled' WHERE id = ?`,
    [id]
  );
  
  await updateContractLoanSummary(disbursement.contractId);
}

function mapDisbursementRow(row: RowDataPacket): ContractDisbursement {
  return {
    id: row.id,
    contractId: row.contract_id,
    amount: Number(row.amount),
    disbursementDate: row.disbursement_date,
    operatorId: row.operator_id,
    operatorName: row.operator_name,
    remark: row.remark,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ==================== 还款记录 ====================

export async function createRepayment(input: {
  contractId: string;
  principalAmount: number;
  interestAmount: number;
  repaymentDate: string;
  operatorId?: string;
  operatorName?: string;
  remark?: string;
}): Promise<ContractRepayment> {
  const id = uuidv4();
  const totalAmount = input.principalAmount + input.interestAmount;
  
  await pool.query(
    `INSERT INTO contract_repayments 
     (id, contract_id, principal_amount, interest_amount, total_amount, 
      repayment_date, operator_id, operator_name, remark, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')`,
    [id, input.contractId, input.principalAmount, input.interestAmount, totalAmount,
     input.repaymentDate, input.operatorId, input.operatorName, input.remark]
  );

  // 如果还息，标记利息台账为已结算
  if (input.interestAmount > 0) {
    await settleInterestAccruals(input.contractId, input.interestAmount, input.operatorId);
  }

  // 更新合同汇总数据
  await updateContractLoanSummary(input.contractId);

  return getRepaymentById(id) as Promise<ContractRepayment>;
}

export async function getRepaymentById(id: string): Promise<ContractRepayment | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM contract_repayments WHERE id = ?`,
    [id]
  );
  return rows[0] ? mapRepaymentRow(rows[0]) : null;
}

export async function getRepaymentsByContract(contractId: string): Promise<ContractRepayment[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM contract_repayments 
     WHERE contract_id = ? AND status = 'confirmed'
     ORDER BY repayment_date DESC, created_at DESC`,
    [contractId]
  );
  return rows.map(mapRepaymentRow);
}

export async function cancelRepayment(id: string): Promise<void> {
  const repayment = await getRepaymentById(id);
  if (!repayment) throw new Error("还款记录不存在");
  
  await pool.query(
    `UPDATE contract_repayments SET status = 'cancelled' WHERE id = ?`,
    [id]
  );
  
  // TODO: 如果取消还款，需要恢复利息台账状态
  
  await updateContractLoanSummary(repayment.contractId);
}

function mapRepaymentRow(row: RowDataPacket): ContractRepayment {
  return {
    id: row.id,
    contractId: row.contract_id,
    principalAmount: Number(row.principal_amount),
    interestAmount: Number(row.interest_amount),
    totalAmount: Number(row.total_amount),
    repaymentDate: row.repayment_date,
    operatorId: row.operator_id,
    operatorName: row.operator_name,
    remark: row.remark,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ==================== 利息台账 ====================

/**
 * 计算单个合同某一天的利息
 */
export async function calculateDailyInterest(
  contractId: string, 
  date: string
): Promise<ContractInterestAccrual | null> {
  // 获取合同信息
  const [contractRows] = await pool.query<RowDataPacket[]>(
    `SELECT id, annual_interest_rate, overdue_rate, outstanding_principal, end_date
     FROM contracts WHERE id = ?`,
    [contractId]
  );
  
  if (!contractRows[0]) return null;
  
  const contract = contractRows[0];
  const outstandingPrincipal = Number(contract.outstanding_principal);
  
  // 如果没有未还本金，不计息
  if (outstandingPrincipal <= 0) return null;
  
  // 判断是否逾期（超过合同到期日）
  const isOverdue = new Date(date) > new Date(contract.end_date);
  const annualRate = isOverdue && contract.overdue_rate 
    ? Number(contract.overdue_rate) 
    : Number(contract.annual_interest_rate);
  
  // 日利率 = 年利率(%) / 100 / 360
  const dailyRate = annualRate / 100 / 360;
  const interestAmount = outstandingPrincipal * dailyRate;
  
  // 检查是否已计算过
  const [existingRows] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM contract_interest_accruals 
     WHERE contract_id = ? AND accrual_date = ?`,
    [contractId, date]
  );
  
  if (existingRows[0]) {
    // 已存在，更新
    await pool.query(
      `UPDATE contract_interest_accruals 
       SET principal_base = ?, annual_rate = ?, daily_rate = ?, interest_amount = ?
       WHERE contract_id = ? AND accrual_date = ?`,
      [outstandingPrincipal, annualRate, dailyRate, interestAmount, contractId, date]
    );
    return getInterestAccrualByContractAndDate(contractId, date);
  }
  
  // 新增记录
  const id = uuidv4();
  await pool.query(
    `INSERT INTO contract_interest_accruals 
     (id, contract_id, accrual_date, principal_base, annual_rate, daily_rate, interest_amount, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [id, contractId, date, outstandingPrincipal, annualRate, dailyRate, interestAmount]
  );
  
  // 更新合同累计利息
  await pool.query(
    `UPDATE contracts SET accrued_interest = (
       SELECT COALESCE(SUM(interest_amount), 0) 
       FROM contract_interest_accruals 
       WHERE contract_id = ? AND status = 'pending'
     ) WHERE id = ?`,
    [contractId, contractId]
  );
  
  return getInterestAccrualById(id);
}

export async function getInterestAccrualById(id: string): Promise<ContractInterestAccrual | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM contract_interest_accruals WHERE id = ?`,
    [id]
  );
  return rows[0] ? mapInterestAccrualRow(rows[0]) : null;
}

export async function getInterestAccrualByContractAndDate(
  contractId: string, 
  date: string
): Promise<ContractInterestAccrual | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM contract_interest_accruals 
     WHERE contract_id = ? AND accrual_date = ?`,
    [contractId, date]
  );
  return rows[0] ? mapInterestAccrualRow(rows[0]) : null;
}

export async function getInterestAccrualsByContract(
  contractId: string,
  options?: { status?: 'pending' | 'settled'; startDate?: string; endDate?: string }
): Promise<ContractInterestAccrual[]> {
  let query = `SELECT * FROM contract_interest_accruals WHERE contract_id = ?`;
  const params: any[] = [contractId];
  
  if (options?.status) {
    query += ` AND status = ?`;
    params.push(options.status);
  }
  if (options?.startDate) {
    query += ` AND accrual_date >= ?`;
    params.push(options.startDate);
  }
  if (options?.endDate) {
    query += ` AND accrual_date <= ?`;
    params.push(options.endDate);
  }
  
  query += ` ORDER BY accrual_date DESC`;
  
  const [rows] = await pool.query<RowDataPacket[]>(query, params);
  return rows.map(mapInterestAccrualRow);
}

/**
 * 结算利息台账（还款时调用）
 */
async function settleInterestAccruals(
  contractId: string, 
  interestPaid: number,
  operatorId?: string
): Promise<void> {
  // 按日期从早到晚结算，直到还清
  let remainingToPay = interestPaid;
  
  const [pendingRows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM contract_interest_accruals 
     WHERE contract_id = ? AND status = 'pending'
     ORDER BY accrual_date ASC`,
    [contractId]
  );
  
  for (const row of pendingRows) {
    if (remainingToPay <= 0) break;
    
    const accrualAmount = Number(row.interest_amount);
    if (remainingToPay >= accrualAmount) {
      // 完全结算这条记录
      await pool.query(
        `UPDATE contract_interest_accruals 
         SET status = 'settled', settled_at = NOW(), settled_by = ?
         WHERE id = ?`,
        [operatorId, row.id]
      );
      remainingToPay -= accrualAmount;
    }
    // 如果还款金额不足以结算整条记录，暂不处理（简化逻辑）
  }
  
  // 更新合同累计利息
  await pool.query(
    `UPDATE contracts SET accrued_interest = (
       SELECT COALESCE(SUM(interest_amount), 0) 
       FROM contract_interest_accruals 
       WHERE contract_id = ? AND status = 'pending'
     ) WHERE id = ?`,
    [contractId, contractId]
  );
}

function mapInterestAccrualRow(row: RowDataPacket): ContractInterestAccrual {
  return {
    id: row.id,
    contractId: row.contract_id,
    accrualDate: row.accrual_date,
    principalBase: Number(row.principal_base),
    annualRate: Number(row.annual_rate),
    dailyRate: Number(row.daily_rate),
    interestAmount: Number(row.interest_amount),
    status: row.status,
    settledAt: row.settled_at,
    settledBy: row.settled_by,
    createdAt: row.created_at,
  };
}

// ==================== 合同汇总更新 ====================

/**
 * 更新合同的放款汇总数据
 */
export async function updateContractLoanSummary(contractId: string): Promise<void> {
  // 计算总放款
  const [disbursementSum] = await pool.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(amount), 0) as total 
     FROM contract_disbursements 
     WHERE contract_id = ? AND status = 'active'`,
    [contractId]
  );
  const totalDisbursed = Number(disbursementSum[0].total);

  // 计算总还款（本金 + 利息）
  const [repaymentSum] = await pool.query<RowDataPacket[]>(
    `SELECT 
       COALESCE(SUM(principal_amount), 0) as total_principal,
       COALESCE(SUM(interest_amount), 0) as total_interest
     FROM contract_repayments 
     WHERE contract_id = ? AND status = 'confirmed'`,
    [contractId]
  );
  const totalRepaidPrincipal = Number(repaymentSum[0].total_principal);
  const totalRepaidInterest = Number(repaymentSum[0].total_interest);

  // 计算剩余本金
  const outstandingPrincipal = totalDisbursed - totalRepaidPrincipal;

  // 获取首次/最后放款日期
  const [dateInfo] = await pool.query<RowDataPacket[]>(
    `SELECT 
       MIN(disbursement_date) as first_date,
       MAX(disbursement_date) as last_date
     FROM contract_disbursements 
     WHERE contract_id = ? AND status = 'active'`,
    [contractId]
  );

  // 获取最后还款日期
  const [lastRepayment] = await pool.query<RowDataPacket[]>(
    `SELECT MAX(repayment_date) as last_date
     FROM contract_repayments 
     WHERE contract_id = ? AND status = 'confirmed'`,
    [contractId]
  );

  // 获取合同授信额度
  const [contractInfo] = await pool.query<RowDataPacket[]>(
    `SELECT credit_limit FROM contracts WHERE id = ?`,
    [contractId]
  );
  const creditLimit = Number(contractInfo[0]?.credit_limit || 0);

  // 确定放款状态
  let loanStatus: LoanStatusType = LoanStatus.NOT_DISBURSED;
  if (totalDisbursed > 0) {
    if (outstandingPrincipal <= 0) {
      loanStatus = LoanStatus.FULLY_REPAID;
    } else if (totalRepaidPrincipal > 0) {
      loanStatus = LoanStatus.REPAYING;
    } else if (totalDisbursed >= creditLimit) {
      loanStatus = LoanStatus.FULLY_DISBURSED;
    } else {
      loanStatus = LoanStatus.PARTIALLY_DISBURSED;
    }
  }

  // 更新合同
  await pool.query(
    `UPDATE contracts SET 
       total_disbursed = ?,
       total_repaid_principal = ?,
       total_repaid_interest = ?,
       outstanding_principal = ?,
       loan_status = ?,
       first_disbursement_date = ?,
       last_disbursement_date = ?,
       last_repayment_date = ?
     WHERE id = ?`,
    [
      totalDisbursed,
      totalRepaidPrincipal,
      totalRepaidInterest,
      outstandingPrincipal,
      loanStatus,
      dateInfo[0]?.first_date || null,
      dateInfo[0]?.last_date || null,
      lastRepayment[0]?.last_date || null,
      contractId,
    ]
  );
}

/**
 * 获取合同放款汇总信息
 */
export async function getContractLoanSummary(contractId: string): Promise<ContractLoanSummary | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 
       id as contract_id,
       credit_limit,
       total_disbursed,
       total_repaid_principal,
       total_repaid_interest,
       outstanding_principal,
       accrued_interest,
       loan_status,
       first_disbursement_date,
       last_disbursement_date,
       last_repayment_date
     FROM contracts WHERE id = ?`,
    [contractId]
  );
  
  if (!rows[0]) return null;
  
  const row = rows[0];
  const creditLimit = Number(row.credit_limit);
  const outstandingPrincipal = Number(row.outstanding_principal);
  
  return {
    contractId: row.contract_id,
    creditLimit,
    totalDisbursed: Number(row.total_disbursed),
    totalRepaidPrincipal: Number(row.total_repaid_principal),
    totalRepaidInterest: Number(row.total_repaid_interest),
    outstandingPrincipal,
    accruedInterest: Number(row.accrued_interest),
    availableCredit: creditLimit - outstandingPrincipal,
    loanStatus: row.loan_status,
    firstDisbursementDate: row.first_disbursement_date,
    lastDisbursementDate: row.last_disbursement_date,
    lastRepaymentDate: row.last_repayment_date,
  };
}

// ==================== 批量利息计算（定时任务用） ====================

/**
 * 计算所有有未还本金合同的当日利息
 */
export async function calculateAllContractsDailyInterest(date: string): Promise<{
  processed: number;
  totalInterest: number;
}> {
  // 获取所有有未还本金的合同
  const [contracts] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM contracts 
     WHERE outstanding_principal > 0 
       AND status = 'active'
       AND type = 'financing'`
  );
  
  let processed = 0;
  let totalInterest = 0;
  
  for (const contract of contracts) {
    const accrual = await calculateDailyInterest(contract.id, date);
    if (accrual) {
      processed++;
      totalInterest += accrual.interestAmount;
    }
  }
  
  return { processed, totalInterest };
}
