/**
 * 收益管理 - 每日收益计算定时任务
 * 
 * 建议在每日凌晨 00:30 执行，计算前一天的收益
 */

import { pool } from "./db.js";
import { RowDataPacket } from "mysql2";
import * as revenueStore from "./revenue-store.js";
import { CreateRevenueRecordInput } from "./revenue-store.js";

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

  console.log(`${date} 收益计算完成，共生成 ${totalRecords} 条记录`);

  return {
    financingInterest: financingRecords,
    directedPayInterest: directedPayRecords,
    brokerageCommission: 0,
    commissionFee: 0,
    totalRecords,
  };
}

/**
 * 计算三方融资合同每日利息
 */
async function calculateFinancingInterest(date: string): Promise<number> {
  try {
    // 查询所有 active 状态的融资合同，且有在贷金额
    const [contracts] = await pool.query<RowDataPacket[]>(`
      SELECT 
        c.id,
        c.contract_number,
        c.funder_id,
        c.financier_id,
        c.used_amount,
        c.annual_interest_rate,
        f.institution_name as funder_name,
        fn.enterprise_name as financier_name
      FROM contracts c
      LEFT JOIN funders f ON c.funder_id = f.id
      LEFT JOIN financiers fn ON c.financier_id = fn.id
      WHERE c.type = 'financing' 
      AND c.status = 'active'
      AND c.used_amount > 0
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

      // 日利息 = 本金 × 年化利率 / 360
      const dailyInterest =
        (Number(contract.used_amount) * Number(contract.annual_interest_rate)) / 360;

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

      // 日利息 = 本金 × 年化利率 / 360
      const dailyInterest =
        (Number(request.payment_amount) * Number(request.annual_interest_rate)) / 360;

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
