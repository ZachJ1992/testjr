import { randomUUID } from "crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { pool } from "./db.js";

// 结算单类型
export type SettlementType = "financing_repayment" | "commission" | "profit_sharing";
export type SettlementStatus = "pending" | "confirmed" | "paid" | "invoiced" | "settled" | "overdue";

// 结算单明细项
export interface SettlementDetail {
  fieldKey: string;
  fieldLabel: string;
  amount: number;
}

// 结算单
export interface Settlement {
  id: string;
  settlementNumber: string;
  type: SettlementType;
  contractId: string;
  contractType: string;
  customerId: string;
  customerName: string;
  periodStart: string;
  periodEnd: string;
  repaymentType?: "principal" | "interest";
  principal?: number;
  interest?: number;
  totalDue?: number;
  waybillCount?: number;
  totalAmount?: number;
  details?: SettlementDetail[];
  status: SettlementStatus;
  dueDate: string;
  paymentProofUrl?: string;
  paidDate?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceAmount?: number;
  invoiceRemark?: string;
  invoiceAttachmentUrl?: string;
  settledDate?: string;
  localPartnerName?: string;
  createdAt: string;
  updatedAt: string;
}

// 结算单统计
export interface SettlementStats {
  pendingCount: number;
  pendingAmount: number;
  settledCount: number;
  settledAmount: number;
  overdueCount: number;
  overdueAmount: number;
}

// 数据库行映射
interface SettlementRow extends RowDataPacket {
  id: string;
  settlement_number: string;
  type: string;
  contract_id: string;
  contract_type: string;
  customer_id: string;
  customer_name: string;
  period_start: string;
  period_end: string;
  repayment_type: string | null;
  principal: number | null;
  interest: number | null;
  total_due: number | null;
  waybill_count: number | null;
  total_amount: number | null;
  details: string | null;
  status: string;
  due_date: string;
  payment_proof_url: string | null;
  paid_date: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  invoice_amount: number | null;
  invoice_remark: string | null;
  invoice_attachment_url: string | null;
  settled_date: string | null;
  created_at: string;
  updated_at: string;
}

function mapSettlementRow(row: SettlementRow): Settlement {
  return {
    id: row.id,
    settlementNumber: row.settlement_number,
    type: row.type as SettlementType,
    contractId: row.contract_id,
    contractType: row.contract_type,
    customerId: row.customer_id,
    customerName: row.customer_name,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    repaymentType: row.repayment_type as "principal" | "interest" | undefined,
    principal: row.principal ?? undefined,
    interest: row.interest ?? undefined,
    totalDue: row.total_due ?? undefined,
    waybillCount: row.waybill_count ?? undefined,
    totalAmount: row.total_amount ?? undefined,
    details: row.details ? JSON.parse(row.details) : undefined,
    status: row.status as SettlementStatus,
    dueDate: row.due_date,
    paymentProofUrl: row.payment_proof_url ?? undefined,
    paidDate: row.paid_date ?? undefined,
    invoiceNumber: row.invoice_number ?? undefined,
    invoiceDate: row.invoice_date ?? undefined,
    invoiceAmount: row.invoice_amount != null ? Number(row.invoice_amount) : undefined,
    invoiceRemark: row.invoice_remark ?? undefined,
    invoiceAttachmentUrl: row.invoice_attachment_url ?? undefined,
    settledDate: row.settled_date ?? undefined,
    localPartnerName: (row as any).local_partner_name ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// 确保结算单表存在
export async function ensureSettlementsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settlements (
      id VARCHAR(36) PRIMARY KEY,
      settlement_number VARCHAR(50) NOT NULL UNIQUE,
      type ENUM('financing_repayment', 'commission', 'profit_sharing') NOT NULL,
      contract_id VARCHAR(36) NOT NULL,
      contract_type VARCHAR(50) NOT NULL,
      customer_id VARCHAR(36) NOT NULL,
      customer_name VARCHAR(200) NOT NULL,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      repayment_type ENUM('principal', 'interest') NULL,
      principal DECIMAL(18, 2) NULL,
      interest DECIMAL(18, 2) NULL,
      total_due DECIMAL(18, 2) NULL,
      waybill_count INT NULL,
      total_amount DECIMAL(18, 2) NULL,
      details JSON NULL,
      status ENUM('pending', 'confirmed', 'paid', 'invoiced', 'settled', 'overdue') NOT NULL DEFAULT 'pending',
      due_date DATE NOT NULL,
      payment_proof_url TEXT NULL COMMENT '到账水单URL',
      paid_date DATE NULL COMMENT '到账日期',
      invoice_number VARCHAR(100) NULL COMMENT '发票号',
      invoice_date DATE NULL COMMENT '开票日期',
      invoice_amount DECIMAL(18,2) NULL COMMENT '发票金额',
      invoice_remark TEXT NULL COMMENT '发票备注',
      settled_date DATE NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_settlement_type (type),
      INDEX idx_settlement_status (status),
      INDEX idx_settlement_contract (contract_id),
      INDEX idx_settlement_customer (customer_id),
      INDEX idx_settlement_due_date (due_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 扩展已有表：新增列和状态枚举
  const newColumns = [
    { name: "payment_proof_url", sql: "ADD COLUMN payment_proof_url TEXT NULL COMMENT '到账水单URL' AFTER due_date" },
    { name: "paid_date", sql: "ADD COLUMN paid_date DATE NULL COMMENT '到账日期' AFTER payment_proof_url" },
    { name: "invoice_number", sql: "ADD COLUMN invoice_number VARCHAR(100) NULL COMMENT '发票号' AFTER paid_date" },
    { name: "invoice_date", sql: "ADD COLUMN invoice_date DATE NULL COMMENT '开票日期' AFTER invoice_number" },
    { name: "invoice_amount", sql: "ADD COLUMN invoice_amount DECIMAL(18,2) NULL COMMENT '发票金额' AFTER invoice_date" },
    { name: "invoice_remark", sql: "ADD COLUMN invoice_remark TEXT NULL COMMENT '发票备注' AFTER invoice_amount" },
    { name: "invoice_attachment_url", sql: "ADD COLUMN invoice_attachment_url TEXT NULL COMMENT '发票附件URL' AFTER invoice_remark" },
  ];
  for (const col of newColumns) {
    try {
      await pool.query(`ALTER TABLE settlements ${col.sql}`);
    } catch (e: any) {
      if (!e.message?.includes("Duplicate column")) { /* already exists, ignore */ }
    }
  }
  // 扩展 status ENUM
  try {
    await pool.query(`ALTER TABLE settlements MODIFY COLUMN status ENUM('pending','confirmed','paid','invoiced','settled','overdue') NOT NULL DEFAULT 'pending'`);
  } catch { /* ignore */ }
}

// 生成结算单号
function generateSettlementNumber(type: SettlementType): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  
  const prefix = {
    financing_repayment: "FR",
    commission: "CM",
    profit_sharing: "PS"
  }[type];
  
  return `${prefix}${year}${month}${day}${random}`;
}

// 获取结算单列表
export async function getSettlements(filters?: {
  type?: SettlementType;
  status?: SettlementStatus;
  customerId?: string;
  contractId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<Settlement[]> {
  let query = `
    SELECT s.id, s.settlement_number, s.type, s.contract_id, s.contract_type,
           s.customer_id, s.customer_name, s.period_start, s.period_end,
           s.repayment_type, s.principal, s.interest, s.total_due,
           s.waybill_count, s.total_amount, s.details, s.status, s.due_date,
           s.payment_proof_url, s.paid_date, s.invoice_number, s.invoice_date,
           s.invoice_amount, s.invoice_remark, s.invoice_attachment_url,
           s.settled_date, s.created_at, s.updated_at,
           GROUP_CONCAT(DISTINCT lp.name SEPARATOR '、') as local_partner_name
    FROM settlements s
    LEFT JOIN contract_routes cr ON s.contract_id = cr.contract_id
    LEFT JOIN routes rt ON cr.route_id = rt.id
    LEFT JOIN local_partners lp ON rt.local_partner_id = lp.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (filters?.type) {
    query += ` AND s.type = ?`;
    params.push(filters.type);
  }
  if (filters?.status) {
    query += ` AND s.status = ?`;
    params.push(filters.status);
  }
  if (filters?.customerId) {
    query += ` AND s.customer_id = ?`;
    params.push(filters.customerId);
  }
  if (filters?.contractId) {
    query += ` AND s.contract_id = ?`;
    params.push(filters.contractId);
  }
  if (filters?.startDate) {
    query += ` AND s.due_date >= ?`;
    params.push(filters.startDate);
  }
  if (filters?.endDate) {
    query += ` AND s.due_date <= ?`;
    params.push(filters.endDate);
  }

  query += ` GROUP BY s.id ORDER BY s.created_at DESC`;

  const [rows] = await pool.query<SettlementRow[]>(query, params);
  return rows.map(mapSettlementRow);
}

// 获取单个结算单
export async function getSettlementById(id: string): Promise<Settlement | undefined> {
  const [rows] = await pool.query<SettlementRow[]>(
    `SELECT s.id, s.settlement_number, s.type, s.contract_id, s.contract_type,
            s.customer_id, s.customer_name, s.period_start, s.period_end,
            s.repayment_type, s.principal, s.interest, s.total_due,
            s.waybill_count, s.total_amount, s.details, s.status, s.due_date,
            s.payment_proof_url, s.paid_date, s.invoice_number, s.invoice_date,
            s.invoice_amount, s.invoice_remark, s.invoice_attachment_url,
            s.settled_date, s.created_at, s.updated_at,
            GROUP_CONCAT(DISTINCT lp.name SEPARATOR '、') as local_partner_name
     FROM settlements s
     LEFT JOIN contract_routes cr ON s.contract_id = cr.contract_id
     LEFT JOIN routes rt ON cr.route_id = rt.id
     LEFT JOIN local_partners lp ON rt.local_partner_id = lp.id
     WHERE s.id = ?
     GROUP BY s.id`,
    [id]
  );
  return rows[0] ? mapSettlementRow(rows[0]) : undefined;
}

// 创建结算单
export async function createSettlement(input: {
  type: SettlementType;
  contractId: string;
  contractType: string;
  customerId: string;
  customerName: string;
  periodStart: string;
  periodEnd: string;
  repaymentType?: "principal" | "interest";
  principal?: number;
  interest?: number;
  totalDue?: number;
  waybillCount?: number;
  totalAmount?: number;
  details?: SettlementDetail[];
  dueDate: string;
}): Promise<Settlement> {
  const id = randomUUID();
  const settlementNumber = generateSettlementNumber(input.type);

  await pool.query(
    `INSERT INTO settlements
     (id, settlement_number, type, contract_id, contract_type, customer_id, customer_name,
      period_start, period_end, repayment_type, principal, interest, total_due,
      waybill_count, total_amount, details, due_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      settlementNumber,
      input.type,
      input.contractId,
      input.contractType,
      input.customerId,
      input.customerName,
      input.periodStart,
      input.periodEnd,
      input.repaymentType || null,
      input.principal ?? null,
      input.interest ?? null,
      input.totalDue ?? null,
      input.waybillCount ?? null,
      input.totalAmount ?? null,
      input.details ? JSON.stringify(input.details) : null,
      input.dueDate
    ]
  );

  const settlement = await getSettlementById(id);
  if (!settlement) {
    throw new Error("创建结算单失败");
  }
  return settlement;
}

// 确认结算单
export async function confirmSettlement(id: string): Promise<Settlement> {
  const current = await getSettlementById(id);
  if (!current) {
    throw new Error("结算单不存在");
  }
  if (current.status !== "pending") {
    throw new Error("只能确认待处理状态的结算单");
  }

  await pool.query(
    `UPDATE settlements SET status = 'confirmed', updated_at = NOW() WHERE id = ?`,
    [id]
  );

  const updated = await getSettlementById(id);
  if (!updated) {
    throw new Error("确认结算单失败");
  }
  return updated;
}

// 标记已到账（上传水单）
export async function markSettlementPaid(id: string, paymentProofUrl?: string): Promise<Settlement> {
  const current = await getSettlementById(id);
  if (!current) throw new Error("结算单不存在");
  if (current.status !== "pending" && current.status !== "confirmed") {
    throw new Error("只能对待处理或已确认状态的结算单标记到账");
  }

  const today = new Date().toISOString().split("T")[0];
  await pool.query(
    `UPDATE settlements SET status = 'paid', paid_date = ?, payment_proof_url = ?, updated_at = NOW() WHERE id = ?`,
    [today, paymentProofUrl || null, id]
  );

  const updated = await getSettlementById(id);
  if (!updated) throw new Error("标记到账失败");
  return updated;
}

// 登记发票
export async function registerSettlementInvoice(id: string, input: {
  invoiceNumber: string;
  invoiceDate: string;
  invoiceAmount: number;
  invoiceRemark?: string;
  invoiceAttachmentUrl?: string;
}): Promise<Settlement> {
  const current = await getSettlementById(id);
  if (!current) throw new Error("结算单不存在");
  if (current.status !== "paid") {
    throw new Error("只能对已到账状态的结算单登记发票");
  }

  await pool.query(
    `UPDATE settlements SET status = 'invoiced', invoice_number = ?, invoice_date = ?, invoice_amount = ?, invoice_remark = ?, invoice_attachment_url = ?, updated_at = NOW() WHERE id = ?`,
    [input.invoiceNumber, input.invoiceDate, input.invoiceAmount, input.invoiceRemark || null, input.invoiceAttachmentUrl || null, id]
  );

  const updated = await getSettlementById(id);
  if (!updated) throw new Error("发票登记失败");
  return updated;
}

// 结算结算单（完结）
export async function settleSettlement(id: string): Promise<Settlement> {
  const current = await getSettlementById(id);
  if (!current) {
    throw new Error("结算单不存在");
  }
  if (!["confirmed", "pending", "paid", "invoiced"].includes(current.status)) {
    throw new Error("当前状态无法结算");
  }

  const today = new Date().toISOString().split("T")[0];
  await pool.query(
    `UPDATE settlements SET status = 'settled', settled_date = ?, updated_at = NOW() WHERE id = ?`,
    [today, id]
  );

  const updated = await getSettlementById(id);
  if (!updated) {
    throw new Error("结算结算单失败");
  }
  return updated;
}

// 获取结算统计
export async function getSettlementStats(filters?: {
  type?: SettlementType;
}): Promise<SettlementStats> {
  let baseQuery = `FROM settlements WHERE 1=1`;
  const params: any[] = [];

  if (filters?.type) {
    baseQuery += ` AND type = ?`;
    params.push(filters.type);
  }

  // 待处理
  const [pendingRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(total_due, total_amount, 0)), 0) as amount ${baseQuery} AND status = 'pending'`,
    params
  );

  // 已结算
  const [settledRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(total_due, total_amount, 0)), 0) as amount ${baseQuery} AND status = 'settled'`,
    params
  );

  // 逾期
  const [overdueRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(total_due, total_amount, 0)), 0) as amount ${baseQuery} AND status = 'overdue'`,
    params
  );

  return {
    pendingCount: Number(pendingRows[0]?.count || 0),
    pendingAmount: Number(pendingRows[0]?.amount || 0),
    settledCount: Number(settledRows[0]?.count || 0),
    settledAmount: Number(settledRows[0]?.amount || 0),
    overdueCount: Number(overdueRows[0]?.count || 0),
    overdueAmount: Number(overdueRows[0]?.amount || 0)
  };
}

// 检查并更新逾期状态
export async function updateOverdueSettlements(): Promise<number> {
  const today = new Date().toISOString().split("T")[0];
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE settlements SET status = 'overdue', updated_at = NOW()
     WHERE status IN ('pending', 'confirmed') AND due_date < ?`,
    [today]
  );
  return result.affectedRows;
}

// 生成融资还款账单
export async function generateFinancingRepaymentSettlement(input: {
  contractId: string;
  contractType: string;
  customerId: string;
  customerName: string;
  periodStart: string;
  periodEnd: string;
  repaymentType: "principal" | "interest";
  principal?: number;
  interest?: number;
  annualInterestRate: number;
  usedAmount: number;
  daysInPeriod: number;
  annualDays?: 360 | 365;
}): Promise<Settlement> {
  const annualDays = input.annualDays || 360;
  
  let calculatedInterest = 0;
  if (input.repaymentType === "interest") {
    // 利息 = 使用额度 × 年化利率 ÷ 年天数 × 天数
    calculatedInterest = (input.usedAmount * input.annualInterestRate / 100 / annualDays) * input.daysInPeriod;
    calculatedInterest = Math.round(calculatedInterest * 100) / 100; // 保留2位小数
  }

  const principal = input.repaymentType === "principal" ? (input.principal || 0) : 0;
  const interest = input.repaymentType === "interest" ? calculatedInterest : (input.interest || 0);
  const totalDue = principal + interest;

  // 应结日期：周期结束后15天
  const periodEndDate = new Date(input.periodEnd);
  periodEndDate.setDate(periodEndDate.getDate() + 15);
  const dueDate = periodEndDate.toISOString().split("T")[0];

  return createSettlement({
    type: "financing_repayment",
    contractId: input.contractId,
    contractType: input.contractType,
    customerId: input.customerId,
    customerName: input.customerName,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    repaymentType: input.repaymentType,
    principal,
    interest,
    totalDue,
    dueDate
  });
}

// 生成分成/抽成账单
export async function generateCommissionSettlement(input: {
  type: "commission" | "profit_sharing";
  contractId: string;
  contractType: string;
  customerId: string;
  customerName: string;
  periodStart: string;
  periodEnd: string;
  waybillCount: number;
  details: SettlementDetail[];
}): Promise<Settlement> {
  const totalAmount = input.details.reduce((sum, d) => sum + d.amount, 0);

  // 应结日期：周期结束后15天
  const periodEndDate = new Date(input.periodEnd);
  periodEndDate.setDate(periodEndDate.getDate() + 15);
  const dueDate = periodEndDate.toISOString().split("T")[0];

  return createSettlement({
    type: input.type,
    contractId: input.contractId,
    contractType: input.contractType,
    customerId: input.customerId,
    customerName: input.customerName,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    waybillCount: input.waybillCount,
    totalAmount,
    details: input.details,
    dueDate
  });
}

// 批量生成账单（根据合同配置）
export async function batchGenerateSettlements(contractIds?: string[]): Promise<{
  generated: number;
  errors: string[];
}> {
  // 这个函数会在后续实现中完善，需要：
  // 1. 获取所有需要生成账单的合同
  // 2. 根据合同类型和结算周期判断是否需要生成
  // 3. 汇总运单数据计算金额
  // 4. 生成对应类型的结算单
  
  return {
    generated: 0,
    errors: []
  };
}
