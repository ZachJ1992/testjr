/**
 * 收益管理 - 数据存储层
 */

import { pool } from "./db.js";
import { randomUUID } from "crypto";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import {
  RevenueRecord,
  RevenueStats,
  RevenueTrendPoint,
  RevenueComposition,
  RevenueRankItem,
  RevenueRecordType,
  RevenueSourceType,
  RevenueStatus,
  BeneficiaryType,
} from "./types.js";

// 来源类型名称映射
const SOURCE_TYPE_NAMES: Record<RevenueSourceType, string> = {
  financing_interest: "三方融资利息",
  directed_pay_interest: "定向支付利息",
  brokerage_commission: "撮合业务抽成",
  commission_fee: "抽成合同费用",
  waybill_commission: "运单平台抽成",
};

function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateOnlyString(value: unknown): string {
  if (value instanceof Date) {
    return formatDateLocal(value);
  }
  const text = String(value ?? "");
  if (!text) return "";
  if (text.includes("T")) return text.split("T")[0];
  if (text.includes(" ")) return text.split(" ")[0];
  return text;
}

// 数据库行转换为 RevenueRecord
function rowToRevenueRecord(row: RowDataPacket): RevenueRecord {
  return {
    id: row.id,
    recordType: row.record_type,
    beneficiaryType: row.beneficiary_type,
    beneficiaryId: row.beneficiary_id || undefined,
    sourceType: row.source_type,
    contractId: row.contract_id,
    contractNumber: row.contract_number || undefined,
    contractType: row.contract_type || undefined,
    funderId: row.funder_id || undefined,
    funderName: row.funder_name || undefined,
    financierId: row.financier_id || undefined,
    financierName: row.financier_name || undefined,
    amount: Number(row.amount),
    principalAmount: row.principal_amount ? Number(row.principal_amount) : undefined,
    rate: row.rate ? Number(row.rate) : undefined,
    revenueDate: toDateOnlyString(row.revenue_date),
    status: row.status,
    settlementId: row.settlement_id || undefined,
    paymentRequestId: row.payment_request_id || undefined,
    waybillId: row.waybill_id || undefined,
    remark: row.remark || undefined,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
    updatedAt: row.updated_at instanceof Date
      ? row.updated_at.toISOString()
      : String(row.updated_at),
  };
}

// 创建收益记录输入类型
export type CreateRevenueRecordInput = Omit<RevenueRecord, "id" | "createdAt" | "updatedAt">;

/**
 * 创建收益记录
 */
export async function createRevenueRecord(
  input: CreateRevenueRecordInput
): Promise<RevenueRecord> {
  const id = randomUUID();

  await pool.query(
    `INSERT INTO revenue_records (
      id, record_type, beneficiary_type, beneficiary_id, source_type,
      contract_id, contract_number, contract_type,
      funder_id, funder_name, financier_id, financier_name,
      amount, principal_amount, rate, revenue_date, status,
      settlement_id, payment_request_id, waybill_id, remark
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.recordType,
      input.beneficiaryType,
      input.beneficiaryId || null,
      input.sourceType,
      input.contractId,
      input.contractNumber || null,
      input.contractType || null,
      input.funderId || null,
      input.funderName || null,
      input.financierId || null,
      input.financierName || null,
      input.amount,
      input.principalAmount || null,
      input.rate || null,
      input.revenueDate,
      input.status || "pending",
      input.settlementId || null,
      input.paymentRequestId || null,
      input.waybillId || null,
      input.remark || null,
    ]
  );

  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM revenue_records WHERE id = ?",
    [id]
  );

  return rowToRevenueRecord(rows[0]);
}

/**
 * 批量创建收益记录
 */
export async function batchCreateRevenueRecords(
  records: CreateRevenueRecordInput[]
): Promise<number> {
  if (records.length === 0) return 0;

  const values = records.map((input) => [
    randomUUID(),
    input.recordType,
    input.beneficiaryType,
    input.beneficiaryId || null,
    input.sourceType,
    input.contractId,
    input.contractNumber || null,
    input.contractType || null,
    input.funderId || null,
    input.funderName || null,
    input.financierId || null,
    input.financierName || null,
    input.amount,
    input.principalAmount || null,
    input.rate || null,
    input.revenueDate,
    input.status || "pending",
    input.settlementId || null,
    input.paymentRequestId || null,
    input.waybillId || null,
    input.remark || null,
  ]);

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO revenue_records (
      id, record_type, beneficiary_type, beneficiary_id, source_type,
      contract_id, contract_number, contract_type,
      funder_id, funder_name, financier_id, financier_name,
      amount, principal_amount, rate, revenue_date, status,
      settlement_id, payment_request_id, waybill_id, remark
    ) VALUES ?`,
    [values]
  );

  return result.affectedRows;
}

// 查询过滤器类型
export interface RevenueRecordFilters {
  recordType?: RevenueRecordType;
  beneficiaryType?: BeneficiaryType;
  beneficiaryId?: string;
  sourceType?: RevenueSourceType;
  financierId?: string;
  funderId?: string;
  status?: RevenueStatus;
  startDate?: string;
  endDate?: string;
  contractId?: string;
  page?: number;
  pageSize?: number;
}

/**
 * 查询收益记录列表
 */
export async function getRevenueRecords(
  filters: RevenueRecordFilters
): Promise<{ records: RevenueRecord[]; total: number }> {
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters.recordType) {
    conditions.push("record_type = ?");
    params.push(filters.recordType);
  }

  if (filters.beneficiaryType) {
    conditions.push("beneficiary_type = ?");
    params.push(filters.beneficiaryType);
  }

  if (filters.beneficiaryId) {
    conditions.push("beneficiary_id = ?");
    params.push(filters.beneficiaryId);
  }

  if (filters.sourceType) {
    conditions.push("source_type = ?");
    params.push(filters.sourceType);
  }

  if (filters.financierId) {
    conditions.push("financier_id = ?");
    params.push(filters.financierId);
  }

  if (filters.funderId) {
    conditions.push("funder_id = ?");
    params.push(filters.funderId);
  }

  if (filters.status) {
    conditions.push("status = ?");
    params.push(filters.status);
  }

  if (filters.startDate) {
    conditions.push("revenue_date >= ?");
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    conditions.push("revenue_date <= ?");
    params.push(filters.endDate);
  }

  if (filters.contractId) {
    conditions.push("contract_id = ?");
    params.push(filters.contractId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // 获取总数
  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) as total FROM revenue_records ${whereClause}`,
    params
  );
  const total = countRows[0].total;

  // 分页
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 20;
  const offset = (page - 1) * pageSize;

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM revenue_records ${whereClause} 
     ORDER BY revenue_date DESC, created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return {
    records: rows.map(rowToRevenueRecord),
    total,
  };
}

/**
 * 获取收益统计
 */
export async function getRevenueStats(filters: {
  recordType?: RevenueRecordType;
  beneficiaryType?: BeneficiaryType;
  beneficiaryId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<RevenueStats> {
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters.recordType) {
    conditions.push("record_type = ?");
    params.push(filters.recordType);
  }

  if (filters.beneficiaryType) {
    conditions.push("beneficiary_type = ?");
    params.push(filters.beneficiaryType);
  }

  if (filters.beneficiaryId) {
    conditions.push("beneficiary_id = ?");
    params.push(filters.beneficiaryId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // 总收益
  const [totalRows] = await pool.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM revenue_records ${whereClause}`,
    params
  );

  // 已确认收益
  const confirmedConditions = [...conditions, "status IN ('confirmed', 'settled')"];
  const [confirmedRows] = await pool.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM revenue_records WHERE ${confirmedConditions.join(" AND ")}`,
    params
  );

  // 待确认收益
  const pendingConditions = [...conditions, "status = 'pending'"];
  const [pendingRows] = await pool.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(amount), 0) as total FROM revenue_records WHERE ${pendingConditions.join(" AND ")}`,
    params
  );

  // 本期收益 (根据 startDate 和 endDate)
  let periodRevenue = 0;
  if (filters.startDate && filters.endDate) {
    const periodConditions = [...conditions, "revenue_date >= ?", "revenue_date <= ?"];
    const [periodRows] = await pool.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM revenue_records WHERE ${periodConditions.join(" AND ")}`,
      [...params, filters.startDate, filters.endDate]
    );
    periodRevenue = Number(periodRows[0].total);
  }

  // 预估收益 (基于当前活跃合同计算未来30天)
  const estimatedRevenue = await calculateEstimatedRevenue({
    beneficiaryType: filters.beneficiaryType,
    beneficiaryId: filters.beneficiaryId,
  });

  // 计算环比增长率
  let growthRate: number | undefined;
  if (filters.startDate && filters.endDate) {
    const start = new Date(filters.startDate);
    const end = new Date(filters.endDate);
    const periodDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    const prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - periodDays);
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    
    const prevStartStr = prevStart.toISOString().split('T')[0];
    const prevEndStr = prevEnd.toISOString().split('T')[0];
    
    const prevConditions = [...conditions, "revenue_date >= ?", "revenue_date <= ?"];
    const [prevRows] = await pool.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM revenue_records WHERE ${prevConditions.join(" AND ")}`,
      [...params, prevStartStr, prevEndStr]
    );
    const prevPeriodRevenue = Number(prevRows[0].total);
    
    if (prevPeriodRevenue > 0) {
      growthRate = ((periodRevenue - prevPeriodRevenue) / prevPeriodRevenue) * 100;
    }
  }

  // 计算日均收益
  let dailyAverage: number | undefined;
  if (filters.startDate && filters.endDate) {
    const start = new Date(filters.startDate);
    const end = new Date(filters.endDate);
    const periodDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    dailyAverage = periodDays > 0 ? periodRevenue / periodDays : 0;
  }

  // 业务指标 - 只有平台看板需要
  let totalInvestment: number | undefined;
  let activeContracts: number | undefined;
  let newContractsPeriod: number | undefined;
  let activeFunders: number | undefined;
  let activeFinanciers: number | undefined;
  let periodWaybills: number | undefined;

  // 如果不是按受益方过滤，则计算业务指标（平台看板）
  if (!filters.beneficiaryType && !filters.beneficiaryId) {
    // 在投总额 (有效合同的剩余本金总和)
    const [investmentRows] = await pool.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(outstanding_principal), 0) as total 
       FROM contracts 
       WHERE status = 'active' AND type = 'financing' AND deleted_at IS NULL`
    );
    totalInvestment = Number(investmentRows[0].total);

    // 有效合同数 (四种合同类型总和)
    // 1. contracts 表 (三方融资、撮合业务等)
    const [contractCountRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM contracts 
       WHERE status = 'active' AND deleted_at IS NULL`
    );
    const mainContractCount = Number(contractCountRows[0].count);
    
    // 2. commission_contracts 表 (抽成合同)
    const [commissionContractRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM commission_contracts 
       WHERE status = 'active'`
    );
    const commissionContractCount = Number(commissionContractRows[0].count);
    
    // 3. directed_pay_contracts 表 (定向支付合同)
    const [directedPayRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM directed_pay_contracts 
       WHERE status = 'active' AND deleted_at IS NULL`
    );
    const directedPayCount = Number(directedPayRows[0].count);
    
    activeContracts = mainContractCount + commissionContractCount + directedPayCount;

    // 本期新增合同 (统计三个表的新增)
    if (filters.startDate && filters.endDate) {
      const [newContractRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM contracts 
         WHERE status = 'active'
           AND created_at >= ? AND created_at <= DATE_ADD(?, INTERVAL 1 DAY)
           AND deleted_at IS NULL`,
        [filters.startDate, filters.endDate]
      );
      const [newCommissionRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM commission_contracts 
         WHERE status = 'active'
           AND created_at >= ? AND created_at <= DATE_ADD(?, INTERVAL 1 DAY)`,
        [filters.startDate, filters.endDate]
      );
      const [newDirectedPayRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM directed_pay_contracts 
         WHERE status = 'active'
           AND created_at >= ? AND created_at <= DATE_ADD(?, INTERVAL 1 DAY)
           AND deleted_at IS NULL`,
        [filters.startDate, filters.endDate]
      );
      newContractsPeriod = Number(newContractRows[0].count) + Number(newCommissionRows[0].count) + Number(newDirectedPayRows[0].count);
    }

    // 活跃资金方数量（有效合同 + 资金方主数据未删除且状态激活）
    const [funderRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM (
         SELECT DISTINCT c.funder_id
         FROM contracts c
         JOIN funders f ON f.id = c.funder_id
         WHERE c.status = 'active'
           AND c.deleted_at IS NULL
           AND f.deleted_at IS NULL
           AND f.status = 'active'
           AND c.funder_id IS NOT NULL
           AND c.funder_id != ''
         UNION
         SELECT DISTINCT dpc.funder_id
         FROM directed_pay_contracts dpc
         JOIN funders f ON f.id = dpc.funder_id
         WHERE dpc.status = 'active'
           AND dpc.deleted_at IS NULL
           AND f.deleted_at IS NULL
           AND f.status = 'active'
           AND dpc.funder_id IS NOT NULL
           AND dpc.funder_id != ''
       ) AS all_funders`
    );
    activeFunders = Number(funderRows[0].count);

    // 活跃融资方数量（有效合同 + 融资方主数据未删除且状态激活）
    const [financierRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM (
         SELECT DISTINCT c.logistics_provider_id
         FROM contracts c
         JOIN financiers f ON f.id = c.logistics_provider_id
         WHERE c.status = 'active'
           AND c.deleted_at IS NULL
           AND f.deleted_at IS NULL
           AND f.status = 'active'
           AND c.logistics_provider_id IS NOT NULL
           AND c.logistics_provider_id != ''
         UNION
         SELECT DISTINCT dpc.financier_id
         FROM directed_pay_contracts dpc
         JOIN financiers f ON f.id = dpc.financier_id
         WHERE dpc.status = 'active'
           AND dpc.deleted_at IS NULL
           AND f.deleted_at IS NULL
           AND f.status = 'active'
           AND dpc.financier_id IS NOT NULL
           AND dpc.financier_id != ''
       ) AS all_financiers`
    );
    activeFinanciers = Number(financierRows[0].count);

    // 本期运单数 (与运单管理页面保持一致的查询条件)
    if (filters.startDate && filters.endDate) {
      const [waybillRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM waybills 
         WHERE waybill_date >= ? AND waybill_date <= ? AND deleted_at IS NULL`,
        [filters.startDate, filters.endDate]
      );
      periodWaybills = Number(waybillRows[0].count);
    }
  }

  return {
    totalRevenue: Number(totalRows[0].total),
    confirmedRevenue: Number(confirmedRows[0].total),
    pendingRevenue: Number(pendingRows[0].total),
    estimatedRevenue,
    periodRevenue,
    growthRate,
    dailyAverage,
    totalInvestment,
    activeContracts,
    newContractsPeriod,
    activeFunders,
    activeFinanciers,
    periodWaybills,
  };
}

/**
 * 获取收益趋势
 */
export async function getRevenueTrend(filters: {
  recordType?: RevenueRecordType;
  beneficiaryType?: BeneficiaryType;
  beneficiaryId?: string;
  startDate: string;
  endDate: string;
  groupBy: "day" | "week" | "month" | "year";
}): Promise<RevenueTrendPoint[]> {
  const conditions: string[] = [
    "revenue_date >= ?",
    "revenue_date <= ?",
  ];
  const params: any[] = [filters.startDate, filters.endDate];

  if (filters.recordType) {
    conditions.push("record_type = ?");
    params.push(filters.recordType);
  }

  if (filters.beneficiaryType) {
    conditions.push("beneficiary_type = ?");
    params.push(filters.beneficiaryType);
  }

  if (filters.beneficiaryId) {
    conditions.push("beneficiary_id = ?");
    params.push(filters.beneficiaryId);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  let dateFormat: string;
  switch (filters.groupBy) {
    case "day":
      dateFormat = "%Y-%m-%d";
      break;
    case "week":
      dateFormat = "%x-W%v"; // ISO week
      break;
    case "month":
      dateFormat = "%Y-%m";
      break;
    case "year":
      dateFormat = "%Y";
      break;
    default:
      dateFormat = "%Y-%m-%d";
  }

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 
      DATE_FORMAT(revenue_date, ?) as date,
      COALESCE(SUM(amount), 0) as amount,
      COALESCE(SUM(CASE WHEN status IN ('confirmed', 'settled') THEN amount ELSE 0 END), 0) as confirmed_amount,
      COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as pending_amount
    FROM revenue_records
    ${whereClause}
    GROUP BY DATE_FORMAT(revenue_date, ?)
    ORDER BY date ASC`,
    [dateFormat, ...params, dateFormat]
  );

  return rows.map((row) => ({
    date: row.date,
    amount: Number(row.amount),
    confirmedAmount: Number(row.confirmed_amount),
    pendingAmount: Number(row.pending_amount),
  }));
}

/**
 * 获取收益构成
 */
export async function getRevenueComposition(filters: {
  recordType?: RevenueRecordType;
  beneficiaryType?: BeneficiaryType;
  beneficiaryId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<RevenueComposition[]> {
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters.recordType) {
    conditions.push("record_type = ?");
    params.push(filters.recordType);
  }

  if (filters.beneficiaryType) {
    conditions.push("beneficiary_type = ?");
    params.push(filters.beneficiaryType);
  }

  if (filters.beneficiaryId) {
    conditions.push("beneficiary_id = ?");
    params.push(filters.beneficiaryId);
  }

  if (filters.startDate) {
    conditions.push("revenue_date >= ?");
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    conditions.push("revenue_date <= ?");
    params.push(filters.endDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 
      source_type,
      COALESCE(SUM(amount), 0) as amount
    FROM revenue_records
    ${whereClause}
    GROUP BY source_type
    ORDER BY amount DESC`,
    params
  );

  // 计算总额和百分比
  const total = rows.reduce((sum, row) => sum + Number(row.amount), 0);

  return rows.map((row) => ({
    sourceType: row.source_type as RevenueSourceType,
    sourceName: SOURCE_TYPE_NAMES[row.source_type as RevenueSourceType] || row.source_type,
    amount: Number(row.amount),
    percentage: total > 0 ? Math.round((Number(row.amount) / total) * 10000) / 100 : 0,
  }));
}

/**
 * 获取排行榜
 */
export async function getRevenueRanking(filters: {
  recordType?: RevenueRecordType;
  beneficiaryType?: BeneficiaryType;
  beneficiaryId?: string;
  rankBy: "funder" | "financier";
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<RevenueRankItem[]> {
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters.recordType) {
    conditions.push("record_type = ?");
    params.push(filters.recordType);
  }

  if (filters.beneficiaryType) {
    conditions.push("beneficiary_type = ?");
    params.push(filters.beneficiaryType);
  }

  if (filters.beneficiaryId) {
    conditions.push("beneficiary_id = ?");
    params.push(filters.beneficiaryId);
  }

  if (filters.startDate) {
    conditions.push("revenue_date >= ?");
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    conditions.push("revenue_date <= ?");
    params.push(filters.endDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit || 10;

  const idField = filters.rankBy === "funder" ? "funder_id" : "financier_id";
  const nameField = filters.rankBy === "funder" ? "funder_name" : "financier_name";

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 
      ${idField} as id,
      ${nameField} as name,
      COALESCE(SUM(amount), 0) as amount,
      COUNT(*) as count
    FROM revenue_records
    ${whereClause}
    AND ${idField} IS NOT NULL
    GROUP BY ${idField}, ${nameField}
    ORDER BY amount DESC
    LIMIT ?`,
    [...params, limit]
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name || "未知",
    amount: Number(row.amount),
    count: Number(row.count),
  }));
}

/**
 * 计算预估收益 (未来30天)
 * 基于过去30天的平均日收益来预估
 */
export async function calculateEstimatedRevenue(filters: {
  beneficiaryType?: BeneficiaryType;
  beneficiaryId?: string;
}): Promise<number> {
  try {
    const conditions: string[] = [];
    const params: any[] = [];

    // 只计算收益类型的记录
    conditions.push("record_type = 'revenue'");

    if (filters.beneficiaryType) {
      conditions.push("beneficiary_type = ?");
      params.push(filters.beneficiaryType);
    }

    if (filters.beneficiaryId) {
      conditions.push("beneficiary_id = ?");
      params.push(filters.beneficiaryId);
    }

    // 计算过去30天的总收益
    conditions.push("revenue_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)");
    conditions.push("revenue_date <= CURDATE()");

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(amount), 0) as total, COUNT(DISTINCT revenue_date) as days
       FROM revenue_records ${whereClause}`,
      params
    );

    const totalRevenue = Number(rows[0].total);
    const actualDays = Number(rows[0].days) || 1;
    
    // 计算日均收益，然后预估30天
    const dailyAverage = totalRevenue / actualDays;
    const estimatedRevenue = dailyAverage * 30;

    return Math.round(estimatedRevenue * 100) / 100;
  } catch (e) {
    console.error("计算预估收益失败:", e);
    return 0;
  }
}

/**
 * 检查某日收益是否已生成
 */
export async function checkDailyRevenueExists(
  date: string,
  contractId: string,
  sourceType: RevenueSourceType
): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) as count FROM revenue_records 
     WHERE revenue_date = ? AND contract_id = ? AND source_type = ?`,
    [date, contractId, sourceType]
  );
  return rows[0].count > 0;
}

/**
 * 更新收益状态
 */
export async function updateRevenueStatus(
  id: string,
  status: RevenueStatus
): Promise<void> {
  await pool.query(
    "UPDATE revenue_records SET status = ? WHERE id = ?",
    [status, id]
  );
}

/**
 * 按结算单更新状态
 */
export async function updateRevenueStatusBySettlement(
  settlementId: string,
  status: RevenueStatus
): Promise<void> {
  await pool.query(
    "UPDATE revenue_records SET status = ? WHERE settlement_id = ?",
    [status, settlementId]
  );
}

/**
 * 按支付申请ID更新状态
 */
export async function updateRevenueStatusByPaymentRequest(
  paymentRequestId: string,
  status: RevenueStatus
): Promise<void> {
  await pool.query(
    "UPDATE revenue_records SET status = ? WHERE payment_request_id = ?",
    [status, paymentRequestId]
  );
}

/**
 * 获取收益记录 by ID
 */
export async function getRevenueRecordById(id: string): Promise<RevenueRecord | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM revenue_records WHERE id = ?",
    [id]
  );

  if (rows.length === 0) return null;
  return rowToRevenueRecord(rows[0]);
}

/**
 * 导出收益记录为CSV格式数据
 */
export async function exportRevenueRecords(
  filters: RevenueRecordFilters
): Promise<{
  headers: string[];
  rows: string[][];
}> {
  // 不分页，获取所有数据
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters.recordType) {
    conditions.push("record_type = ?");
    params.push(filters.recordType);
  }

  if (filters.beneficiaryType) {
    conditions.push("beneficiary_type = ?");
    params.push(filters.beneficiaryType);
  }

  if (filters.beneficiaryId) {
    conditions.push("beneficiary_id = ?");
    params.push(filters.beneficiaryId);
  }

  if (filters.sourceType) {
    conditions.push("source_type = ?");
    params.push(filters.sourceType);
  }

  if (filters.financierId) {
    conditions.push("financier_id = ?");
    params.push(filters.financierId);
  }

  if (filters.funderId) {
    conditions.push("funder_id = ?");
    params.push(filters.funderId);
  }

  if (filters.status) {
    conditions.push("status = ?");
    params.push(filters.status);
  }

  if (filters.startDate) {
    conditions.push("revenue_date >= ?");
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    conditions.push("revenue_date <= ?");
    params.push(filters.endDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM revenue_records ${whereClause} ORDER BY revenue_date DESC, created_at DESC`,
    params
  );

  const headers = [
    "收益日期",
    "记录类型",
    "收益来源",
    "金额",
    "本金",
    "利率",
    "资金方",
    "融资方",
    "合同编号",
    "状态",
    "备注",
  ];

  const recordTypeNames: Record<string, string> = {
    revenue: "收益",
    expense: "支出",
  };

  const statusNames: Record<string, string> = {
    pending: "待确认",
    confirmed: "已确认",
    settled: "已结算",
  };

  const dataRows = rows.map((row) => [
    row.revenue_date instanceof Date
      ? row.revenue_date.toISOString().split("T")[0]
      : String(row.revenue_date).split("T")[0],
    recordTypeNames[row.record_type] || row.record_type,
    SOURCE_TYPE_NAMES[row.source_type as RevenueSourceType] || row.source_type,
    String(row.amount),
    row.principal_amount ? String(row.principal_amount) : "",
    row.rate ? String(row.rate) : "",
    row.funder_name || "",
    row.financier_name || "",
    row.contract_number || "",
    statusNames[row.status] || row.status,
    row.remark || "",
  ]);

  return { headers, rows: dataRows };
}
