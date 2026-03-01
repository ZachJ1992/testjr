/**
 * 收益管理 - 每日收益计算定时任务
 * 
 * 建议在每日凌晨 00:30 执行，计算前一天的收益
 */

import { pool } from "./db.js";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import * as revenueStore from "./revenue-store.js";
import { CreateRevenueRecordInput } from "./revenue-store.js";

function formatDateOnly(value: Date | string): string {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const text = String(value);
  if (text.includes("T")) return text.split("T")[0];
  if (text.includes(" ")) return text.split(" ")[0];
  return text;
}

/**
 * 每日收益计算任务
 */
export async function calculateDailyRevenue(targetDate?: string): Promise<{
  financingInterest: number;
  directedPayInterest: number;
  brokerageCommission: number;
  commissionFee: number;
  totalRecords: number;
}> {
  const date = targetDate || getPreviousDate();
  console.log(`开始计算 ${date} 的收益...`);

  let totalRecords = 0;

  // 1. 计算三方融资合同利息
  const financingRecords = await calculateFinancingInterest(date);
  totalRecords += financingRecords;

  // 2. 计算定向支付利息
  const directedPayRecords = await calculateDirectedPayInterest(date);
  totalRecords += directedPayRecords;

  // 3. 撮合业务抽成 (在结算时生成，这里不处理)
  // 4. 抽成合同费用 (在结算时生成，这里不处理)

  // 5. 运单平台抽成（按融资方规则：融满2.5%应收，金罗200元/单）
  const waybillCommissionRecords = await calculateWaybillPlatformRevenue();
  totalRecords += waybillCommissionRecords;

  console.log(`${date} 收益计算完成，共生成 ${totalRecords} 条记录`);

  return {
    financingInterest: financingRecords,
    directedPayInterest: directedPayRecords,
    brokerageCommission: 0,
    commissionFee: waybillCommissionRecords,
    totalRecords,
  };
}

/**
 * 计算三方融资合同每日利息
 */
async function calculateFinancingInterest(date: string): Promise<number> {
  try {
    // 查询所有 active 状态的融资合同，且有在贷金额（使用 outstanding_principal 剩余本金）
    const [contracts] = await pool.query<RowDataPacket[]>(`
      SELECT 
        c.id,
        CONCAT('RZ', DATE_FORMAT(c.created_at, '%Y%m%d'), LEFT(c.id, 4)) as contract_number,
        c.funder_id,
        c.logistics_provider_id as financier_id,
        c.outstanding_principal as used_amount,
        c.annual_interest_rate,
        f.institution_name as funder_name,
        fn.enterprise_name as financier_name
      FROM contracts c
      LEFT JOIN funders f ON c.funder_id = f.id
      LEFT JOIN financiers fn ON c.logistics_provider_id = fn.id
      WHERE c.type = 'financing' 
      AND c.status = 'active'
      AND c.outstanding_principal > 0
    `);

    let count = 0;
    const records: CreateRevenueRecordInput[] = [];

    for (const contract of contracts) {
      // 检查是否已生成
      const exists = await revenueStore.checkDailyRevenueExists(
        date,
        contract.id,
        "financing_interest"
      );
      if (exists) continue;

      // 日利息 = 本金 × (年化利率/100) / 360
      const dailyInterest =
        (Number(contract.used_amount) * Number(contract.annual_interest_rate) / 100) / 360;

      // 资金方收益
      records.push({
        recordType: "revenue",
        beneficiaryType: "funder",
        beneficiaryId: contract.funder_id,
        sourceType: "financing_interest",
        contractId: contract.id,
        contractNumber: contract.contract_number,
        contractType: "financing",
        funderId: contract.funder_id,
        funderName: contract.funder_name,
        financierId: contract.financier_id,
        financierName: contract.financier_name,
        amount: Math.round(dailyInterest * 100) / 100, // 保留两位小数
        principalAmount: Number(contract.used_amount),
        rate: Number(contract.annual_interest_rate),
        revenueDate: date,
        status: "pending",
      });

      // 融资方支出
      records.push({
        recordType: "expense",
        beneficiaryType: "financier",
        beneficiaryId: contract.financier_id,
        sourceType: "financing_interest",
        contractId: contract.id,
        contractNumber: contract.contract_number,
        contractType: "financing",
        funderId: contract.funder_id,
        funderName: contract.funder_name,
        financierId: contract.financier_id,
        financierName: contract.financier_name,
        amount: Math.round(dailyInterest * 100) / 100,
        principalAmount: Number(contract.used_amount),
        rate: Number(contract.annual_interest_rate),
        revenueDate: date,
        status: "pending",
      });

      count += 2;
    }

    // 批量插入
    if (records.length > 0) {
      await revenueStore.batchCreateRevenueRecords(records);
    }

    return count;
  } catch (err) {
    console.error("计算融资利息失败:", err);
    return 0;
  }
}

/**
 * 计算定向支付每日利息
 */
async function calculateDirectedPayInterest(date: string): Promise<number> {
  try {
    // 查询所有已成功支付且未完全还款的支付申请
    const [requests] = await pool.query<RowDataPacket[]>(`
      SELECT 
        dpr.id as request_id,
        dpr.contract_id,
        dpr.payment_amount,
        dpr.interest_start_time,
        dpc.contract_number,
        dpc.annual_interest_rate,
        dpc.funder_id,
        dpc.financier_id,
        f.institution_name as funder_name,
        fn.enterprise_name as financier_name
      FROM directed_payment_requests dpr
      JOIN directed_pay_contracts dpc ON dpr.contract_id = dpc.id
      LEFT JOIN funders f ON dpc.funder_id = f.id
      LEFT JOIN financiers fn ON dpc.financier_id = fn.id
      WHERE dpr.status = 'success'
      AND dpr.interest_start_time IS NOT NULL
      AND DATE(dpr.interest_start_time) <= ?
    `, [date]);

    let count = 0;
    const records: CreateRevenueRecordInput[] = [];

    for (const request of requests) {
      // 检查是否已生成（使用 payment_request_id 来区分）
      // 这里我们用 contract_id + date 来检查，因为一个合同可能有多笔支付申请
      const [existingRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM revenue_records 
         WHERE revenue_date = ? AND payment_request_id = ? AND source_type = 'directed_pay_interest'`,
        [date, request.request_id]
      );
      if (existingRows[0].count > 0) continue;

      // 日利息 = 本金 × (年化利率/100) / 360
      const dailyInterest =
        (Number(request.payment_amount) * Number(request.annual_interest_rate) / 100) / 360;

      // 资金方收益
      records.push({
        recordType: "revenue",
        beneficiaryType: "funder",
        beneficiaryId: request.funder_id,
        sourceType: "directed_pay_interest",
        contractId: request.contract_id,
        contractNumber: request.contract_number,
        contractType: "directed_pay",
        funderId: request.funder_id,
        funderName: request.funder_name,
        financierId: request.financier_id,
        financierName: request.financier_name,
        amount: Math.round(dailyInterest * 100) / 100,
        principalAmount: Number(request.payment_amount),
        rate: Number(request.annual_interest_rate),
        revenueDate: date,
        status: "pending",
        paymentRequestId: request.request_id,
      });

      // 融资方支出
      records.push({
        recordType: "expense",
        beneficiaryType: "financier",
        beneficiaryId: request.financier_id,
        sourceType: "directed_pay_interest",
        contractId: request.contract_id,
        contractNumber: request.contract_number,
        contractType: "directed_pay",
        funderId: request.funder_id,
        funderName: request.funder_name,
        financierId: request.financier_id,
        financierName: request.financier_name,
        amount: Math.round(dailyInterest * 100) / 100,
        principalAmount: Number(request.payment_amount),
        rate: Number(request.annual_interest_rate),
        revenueDate: date,
        status: "pending",
        paymentRequestId: request.request_id,
      });

      count += 2;
    }

    // 批量插入
    if (records.length > 0) {
      await revenueStore.batchCreateRevenueRecords(records);
    }

    return count;
  } catch (err) {
    console.error("计算定向支付利息失败:", err);
    return 0;
  }
}

/**
 * 生成撮合业务抽成记录
 * (在运单结算时调用)
 */
export async function createBrokerageCommissionRecord(params: {
  contractId: string;
  contractNumber: string;
  financierId: string;
  financierName: string;
  waybillId: string;
  amount: number;
  rate: number;
  freightAmount: number;
  revenueDate: string;
}): Promise<void> {
  // 平台收益（撮合业务是平台收益，没有资金方）
  await revenueStore.createRevenueRecord({
    recordType: "revenue",
    beneficiaryType: "platform",
    sourceType: "brokerage_commission",
    contractId: params.contractId,
    contractNumber: params.contractNumber,
    contractType: "brokerage",
    financierId: params.financierId,
    financierName: params.financierName,
    amount: params.amount,
    principalAmount: params.freightAmount,
    rate: params.rate,
    revenueDate: params.revenueDate,
    status: "pending",
    waybillId: params.waybillId,
  });
}

/**
 * 生成抽成合同费用记录
 * (在结算时调用)
 */
export async function createCommissionFeeRecord(params: {
  contractId: string;
  contractNumber: string;
  financierId: string;
  financierName: string;
  settlementId: string;
  amount: number;
  rate: number;
  baseAmount: number;
  revenueDate: string;
}): Promise<void> {
  // 平台收益
  await revenueStore.createRevenueRecord({
    recordType: "revenue",
    beneficiaryType: "platform",
    sourceType: "commission_fee",
    contractId: params.contractId,
    contractNumber: params.contractNumber,
    contractType: "commission",
    financierId: params.financierId,
    financierName: params.financierName,
    amount: params.amount,
    principalAmount: params.baseAmount,
    rate: params.rate,
    revenueDate: params.revenueDate,
    status: "pending",
    settlementId: params.settlementId,
  });

  // 融资方支出
  await revenueStore.createRevenueRecord({
    recordType: "expense",
    beneficiaryType: "financier",
    beneficiaryId: params.financierId,
    sourceType: "commission_fee",
    contractId: params.contractId,
    contractNumber: params.contractNumber,
    contractType: "commission",
    financierId: params.financierId,
    financierName: params.financierName,
    amount: params.amount,
    principalAmount: params.baseAmount,
    rate: params.rate,
    revenueDate: params.revenueDate,
    status: "pending",
    settlementId: params.settlementId,
  });
}

/**
 * 计算运单平台抽成收益
 * 融满: 每单应付合计 * 2.5%
 * 金罗: 每单固定 200 元
 * 遍历所有未计算过收益的运单，按融资方规则生成 revenue_records
 */
async function calculateWaybillPlatformRevenue(): Promise<number> {
  try {
    // 融资方规则配置
    const FINANCIER_RULES: Record<string, { type: 'percentage' | 'fixed'; value: number; name: string }> = {};

    // 动态查询融资方 ID
    const [financiers] = await pool.query<RowDataPacket[]>(
      `SELECT id, enterprise_name FROM financiers WHERE enterprise_name IN ('金罗', '融满') AND deleted_at IS NULL`
    );

    for (const f of financiers) {
      if (f.enterprise_name === '融满') {
        FINANCIER_RULES[f.id] = { type: 'percentage', value: 0.025, name: '融满' };
      } else if (f.enterprise_name === '金罗') {
        FINANCIER_RULES[f.id] = { type: 'fixed', value: 200, name: '金罗' };
      }
    }

    if (Object.keys(FINANCIER_RULES).length === 0) {
      console.log("[WaybillRevenue] 未找到金罗/融满融资方配置，跳过");
      return 0;
    }

    const financierIds = Object.keys(FINANCIER_RULES);
    const placeholders = financierIds.map(() => '?').join(',');

    // 查询未计算过收益的运单（通过 LEFT JOIN 排除已有记录的运单）
    const [waybills] = await pool.query<RowDataPacket[]>(
      `SELECT w.id, w.waybill_number, w.customer_id, w.receivable_total, w.payable_total, w.waybill_date, w.departure_time,
              f.enterprise_name as financier_name
       FROM waybills w
       LEFT JOIN financiers f ON w.customer_id = f.id
       LEFT JOIN revenue_records rr ON rr.waybill_id = w.id AND rr.source_type = 'waybill_commission'
       WHERE w.deleted_at IS NULL
         AND w.customer_id IN (${placeholders})
         AND rr.id IS NULL`,
      financierIds
    );

    if (waybills.length === 0) {
      console.log("[WaybillRevenue] 无新运单需要计算收益");
      return 0;
    }

    const records: CreateRevenueRecordInput[] = [];

    for (const w of waybills) {
      const rule = FINANCIER_RULES[w.customer_id];
      if (!rule) continue;

      let amount: number;
      let rate: number;
      const payableTotal = Number(w.payable_total) || 0;

      if (rule.type === 'percentage') {
        if (payableTotal <= 0) continue;
        amount = Math.round(payableTotal * rule.value * 100) / 100;
        rate = rule.value;
      } else {
        amount = rule.value;
        rate = 0;
      }

      // 运单抽成日期优先使用“发车时间”，其次运单日期
      const revenueDateSource = w.departure_time || w.waybill_date;
      const revenueDate = revenueDateSource
        ? formatDateOnly(revenueDateSource)
        : new Date().toISOString().split('T')[0];

      records.push({
        recordType: "revenue",
        beneficiaryType: "platform",
        sourceType: "waybill_commission",
        contractId: w.customer_id,
        contractNumber: w.waybill_number,
        contractType: "waybill",
        financierId: w.customer_id,
        financierName: w.financier_name || rule.name,
        amount,
        principalAmount: payableTotal,
        rate,
        revenueDate,
        status: "confirmed",
        waybillId: w.id,
      });
    }

    if (records.length > 0) {
      await revenueStore.batchCreateRevenueRecords(records);
      console.log(`[WaybillRevenue] 生成 ${records.length} 条运单平台抽成记录`);
    }

    return records.length;
  } catch (err) {
    console.error("[WaybillRevenue] 计算运单平台抽成失败:", err);
    return 0;
  }
}

/**
 * 回算历史运单抽成记录（全量）
 * - 已有记录：按当前规则重算 amount / rate / principal_amount
 * - 缺失记录：补齐 waybill_commission 记录
 */
export async function recalculateHistoricalWaybillCommissions(): Promise<{
  updated: number;
  inserted: number;
  totalAffected: number;
}> {
  try {
    const [updateResult] = await pool.query<ResultSetHeader>(`
      UPDATE revenue_records rr
      JOIN waybills w ON rr.waybill_id = w.id
      JOIN financiers f ON w.customer_id = f.id
      SET
        rr.contract_id = w.customer_id,
        rr.contract_number = w.waybill_number,
        rr.contract_type = 'waybill',
        rr.financier_id = w.customer_id,
        rr.financier_name = f.enterprise_name,
        rr.principal_amount = CASE
          WHEN f.enterprise_name = '融满' THEN COALESCE(w.payable_total, 0)
          ELSE COALESCE(w.receivable_total, 0)
        END,
        rr.rate = CASE
          WHEN f.enterprise_name = '融满' THEN 0.025
          ELSE 0
        END,
        rr.amount = CASE
          WHEN f.enterprise_name = '融满' THEN ROUND(COALESCE(w.payable_total, 0) * 0.025, 2)
          WHEN f.enterprise_name = '金罗' THEN 200
          ELSE rr.amount
        END,
        rr.record_type = 'revenue',
        rr.beneficiary_type = 'platform',
        rr.revenue_date = COALESCE(DATE(w.departure_time), DATE(w.waybill_date), rr.revenue_date),
        rr.status = 'confirmed'
      WHERE rr.source_type = 'waybill_commission'
        AND w.deleted_at IS NULL
        AND f.deleted_at IS NULL
        AND f.enterprise_name IN ('融满', '金罗')
    `);

    const [insertResult] = await pool.query<ResultSetHeader>(`
      INSERT INTO revenue_records (
        id, record_type, beneficiary_type, source_type,
        contract_id, contract_number, contract_type,
        financier_id, financier_name,
        amount, principal_amount, rate,
        revenue_date, status, waybill_id
      )
      SELECT
        UUID(), 'revenue', 'platform', 'waybill_commission',
        w.customer_id, w.waybill_number, 'waybill',
        w.customer_id, f.enterprise_name,
        CASE
          WHEN f.enterprise_name = '融满' THEN ROUND(COALESCE(w.payable_total, 0) * 0.025, 2)
          WHEN f.enterprise_name = '金罗' THEN 200
          ELSE 0
        END AS amount,
        CASE
          WHEN f.enterprise_name = '融满' THEN COALESCE(w.payable_total, 0)
          ELSE COALESCE(w.receivable_total, 0)
        END AS principal_amount,
        CASE
          WHEN f.enterprise_name = '融满' THEN 0.025
          ELSE 0
        END AS rate,
        COALESCE(DATE(w.departure_time), DATE(w.waybill_date), CURRENT_DATE) AS revenue_date,
        'confirmed' AS status,
        w.id AS waybill_id
      FROM waybills w
      JOIN financiers f ON w.customer_id = f.id
      LEFT JOIN revenue_records rr
        ON rr.waybill_id = w.id
       AND rr.source_type = 'waybill_commission'
      WHERE w.deleted_at IS NULL
        AND f.deleted_at IS NULL
        AND f.enterprise_name IN ('融满', '金罗')
        AND rr.id IS NULL
        AND (f.enterprise_name <> '融满' OR COALESCE(w.payable_total, 0) > 0)
    `);

    const updated = Number(updateResult.affectedRows || 0);
    const inserted = Number(insertResult.affectedRows || 0);
    const totalAffected = updated + inserted;

    console.log(`[WaybillRevenue] 历史回算完成: 更新 ${updated} 条, 新增 ${inserted} 条`);
    return { updated, inserted, totalAffected };
  } catch (err) {
    console.error("[WaybillRevenue] 历史回算失败:", err);
    throw err;
  }
}

// 辅助函数
function getPreviousDate(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().split("T")[0];
}

/**
 * 启动定时任务
 * 在服务器启动时调用，每天凌晨 00:30 执行
 */
export function startRevenueScheduler(): void {
  const SCHEDULE_HOUR = 0;
  const SCHEDULE_MINUTE = 30;

  const scheduleNextRun = () => {
    const now = new Date();
    const next = new Date();
    next.setHours(SCHEDULE_HOUR, SCHEDULE_MINUTE, 0, 0);

    // 如果今天的时间已过，则安排明天
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    const delay = next.getTime() - now.getTime();
    console.log(
      `[RevenueScheduler] 下次执行时间: ${next.toISOString()}, 延迟: ${Math.round(delay / 1000 / 60)} 分钟`
    );

    setTimeout(async () => {
      console.log(`[RevenueScheduler] 开始执行每日收益计算...`);
      try {
        const result = await calculateDailyRevenue();
        console.log(`[RevenueScheduler] 执行完成:`, result);
      } catch (err) {
        console.error(`[RevenueScheduler] 执行失败:`, err);
      }
      // 安排下一次执行
      scheduleNextRun();
    }, delay);
  };

  scheduleNextRun();
  console.log(`[RevenueScheduler] 收益计算定时任务已启动`);
}
