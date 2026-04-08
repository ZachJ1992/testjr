/**
 * 抽成计算模块
 * 
 * 负责根据抽成合同配置计算运单的抽成金额
 */

import { pool } from "./db.js";
import type { RowDataPacket } from "mysql2";

// ==================== 类型定义 ====================

export interface CommissionConfigItem {
  fieldKey: string;
  fieldLabel: string;
  mode: "percentage" | "fixed";
  value: number;
}

export interface WaybillCommissionResult {
  waybillId: string;
  waybillNumber: string;
  contractId: string;
  details: Array<{
    fieldKey: string;
    fieldLabel: string;
    baseAmount: number;
    mode: "percentage" | "fixed";
    rate: number;
    commissionAmount: number;
  }>;
  totalCommission: number;
}

export interface CommissionSettlementSummary {
  contractId: string;
  customerName: string;
  periodStart: string;
  periodEnd: string;
  waybillCount: number;
  details: Array<{
    fieldKey: string;
    fieldLabel: string;
    totalBaseAmount: number;
    totalCommission: number;
  }>;
  totalCommission: number;
}

// ==================== 运单字段映射 ====================

// 运单表中对应的字段名映射
const WAYBILL_FIELD_MAP: Record<string, string> = {
  receivableTotal: "receivable_total",
  payableTotal: "payable_total",
  receivableTransport: "receivable_transport",
  freight: "freight_amount",
  pickupFee: "pickup_fee",
  deliveryFee: "delivery_fee",
  receiptFee: "receipt_fee",
  packagingFee: "packaging_fee",
  insuranceFee: "insurance_fee",
  premiumFee: "premium_fee",
  handlingFee: "handling_fee",
  oilCardAmount: "oil_card_amount",
  etcAmount: "etc_amount",
  cashAmount: "cash_amount"
};

const COMPUTED_FIELDS: Record<string, (waybill: any) => number> = {
  priceDiff: (w) => Number(w.receivable_total || 0) - Number(w.payable_total || 0),
};

// ==================== 核心计算函数 ====================

/**
 * 计算单个运单的抽成金额
 */
export async function calculateWaybillCommission(
  waybillId: string,
  commissionConfig: CommissionConfigItem[]
): Promise<WaybillCommissionResult | null> {
  // 获取运单数据
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM waybills WHERE id = ?`,
    [waybillId]
  );
  
  if (!rows[0]) return null;
  
  const waybill = rows[0];
  const details: WaybillCommissionResult["details"] = [];
  let totalCommission = 0;
  
  for (const config of commissionConfig) {
    const computeFn = COMPUTED_FIELDS[config.fieldKey];
    const baseAmount = computeFn
      ? computeFn(waybill)
      : Number(waybill[WAYBILL_FIELD_MAP[config.fieldKey] || config.fieldKey] || 0);
    
    let commissionAmount = 0;
    if (config.mode === "percentage") {
      commissionAmount = baseAmount * (config.value / 100);
    } else {
      // 固定金额模式：每单固定抽成
      commissionAmount = config.value;
    }
    
    // 保留2位小数
    commissionAmount = Math.round(commissionAmount * 100) / 100;
    
    if (baseAmount > 0 || config.mode === "fixed") {
      details.push({
        fieldKey: config.fieldKey,
        fieldLabel: config.fieldLabel,
        baseAmount,
        mode: config.mode,
        rate: config.value,
        commissionAmount
      });
      totalCommission += commissionAmount;
    }
  }
  
  return {
    waybillId,
    waybillNumber: waybill.waybill_number,
    contractId: "", // 需要外部填充
    details,
    totalCommission: Math.round(totalCommission * 100) / 100
  };
}

/**
 * 根据抽成合同计算周期内的抽成汇总
 */
export async function calculateCommissionForContract(
  contractId: string,
  periodStart: string,
  periodEnd: string
): Promise<CommissionSettlementSummary | null> {
  // 获取抽成合同
  const [contractRows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM commission_contracts WHERE id = ?`,
    [contractId]
  );
  
  if (!contractRows[0]) return null;
  
  const contract = contractRows[0];
  const commissionConfig: CommissionConfigItem[] = 
    typeof contract.commission_config === "string" 
      ? JSON.parse(contract.commission_config) 
      : contract.commission_config || [];
  
  if (commissionConfig.length === 0) {
    return null;
  }
  
  // 获取周期内该客户的运单
  // 通过客户名称匹配（customer_name 或 customer_id）
  const [waybillRows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM waybills 
     WHERE customer_name = ?
       AND waybill_date >= ?
       AND waybill_date <= ?
       AND status IN ('completed', 'settled', 'signed')`,
    [contract.customer_name, periodStart, periodEnd]
  );
  
  if (waybillRows.length === 0) {
    return null;
  }
  
  // 汇总计算
  const detailsMap = new Map<string, {
    fieldKey: string;
    fieldLabel: string;
    totalBaseAmount: number;
    totalCommission: number;
  }>();
  
  // 初始化各字段汇总
  for (const config of commissionConfig) {
    detailsMap.set(config.fieldKey, {
      fieldKey: config.fieldKey,
      fieldLabel: config.fieldLabel,
      totalBaseAmount: 0,
      totalCommission: 0
    });
  }
  
  // 遍历运单计算
  for (const waybill of waybillRows) {
    for (const config of commissionConfig) {
      const dbField = WAYBILL_FIELD_MAP[config.fieldKey] || config.fieldKey;
      const baseAmount = Number(waybill[dbField] || 0);
      
      let commissionAmount = 0;
      if (config.mode === "percentage") {
        commissionAmount = baseAmount * (config.value / 100);
      } else {
        commissionAmount = config.value;
      }
      
      const detail = detailsMap.get(config.fieldKey)!;
      detail.totalBaseAmount += baseAmount;
      detail.totalCommission += commissionAmount;
    }
  }
  
  // 转换为数组并计算总额
  const details = Array.from(detailsMap.values()).map(d => ({
    ...d,
    totalBaseAmount: Math.round(d.totalBaseAmount * 100) / 100,
    totalCommission: Math.round(d.totalCommission * 100) / 100
  }));
  
  const totalCommission = details.reduce((sum, d) => sum + d.totalCommission, 0);
  
  return {
    contractId,
    customerName: contract.customer_name,
    periodStart,
    periodEnd,
    waybillCount: waybillRows.length,
    details,
    totalCommission: Math.round(totalCommission * 100) / 100
  };
}

/**
 * 检查合同是否到结算日
 */
export function isSettlementDay(
  today: Date,
  settlementCycle: string,
  settlementDay: number
): boolean {
  const dayOfMonth = today.getDate();
  const dayOfWeek = today.getDay(); // 0=Sunday, 1=Monday, ...
  
  switch (settlementCycle) {
    case "monthly":
      // 月度结算：检查是否到了指定的结算日
      return dayOfMonth === settlementDay;
    
    case "biweekly":
      // 半月结算：每月1日和15日
      return dayOfMonth === 1 || dayOfMonth === 15;
    
    case "weekly":
      // 周结算：每周日（或可配置）
      return dayOfWeek === 0;
    
    default:
      return false;
  }
}

/**
 * 计算结算周期的开始日期
 */
export function calculatePeriodStart(
  periodEnd: Date,
  settlementCycle: string
): Date {
  const start = new Date(periodEnd);
  
  switch (settlementCycle) {
    case "monthly":
      start.setMonth(start.getMonth() - 1);
      start.setDate(start.getDate() + 1);
      break;
    case "biweekly":
      start.setDate(start.getDate() - 13);
      break;
    case "weekly":
      start.setDate(start.getDate() - 6);
      break;
  }
  
  return start;
}

/**
 * 获取需要结算的抽成合同列表
 */
export async function getContractsNeedingSettlement(today: Date): Promise<Array<{
  id: string;
  customerName: string;
  settlementCycle: string;
  settlementDay: number;
}>> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, customer_name, settlement_cycle, settlement_day 
     FROM commission_contracts 
     WHERE status = 'active'`
  );
  
  return rows
    .filter(row => isSettlementDay(today, row.settlement_cycle, row.settlement_day))
    .map(row => ({
      id: row.id,
      customerName: row.customer_name,
      settlementCycle: row.settlement_cycle,
      settlementDay: row.settlement_day
    }));
}
