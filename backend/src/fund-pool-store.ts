import { randomUUID } from "crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "./db.js";
import { FundPoolMonitoring, FundProviderShare, LiquidityWarning, FundFlow } from "./types.js";
import { getFunders } from "./funders-store.js";
import { getFinanciers } from "./financiers-store.js";

interface FundFlowRow extends RowDataPacket {
  id: string;
  time: string;
  operation_type: string;
  associated_entity: string;
  change_amount: number;
  remaining_balance: number;
  created_at: string;
}

function mapFundFlowRow(row: FundFlowRow): FundFlow {
  return {
    id: row.id,
    time: row.time,
    operationType: row.operation_type === "payment" ? "payment" : "repayment",
    associatedEntity: row.associated_entity,
    changeAmount: Number(row.change_amount),
    remainingBalance: Number(row.remaining_balance)
  };
}

export async function getFundPoolMonitoring(): Promise<FundPoolMonitoring> {
  // 获取所有资金方
  const funders = await getFunders({ status: "active" });
  
  // 计算资金池总授信额度
  const totalCreditLine = funders.reduce((sum, funder) => sum + funder.cumulativeCreditLimit, 0);
  
  // 计算当前在贷总额
  const totalOutstandingLoans = funders.reduce((sum, funder) => sum + funder.currentLoanBalance, 0);
  
  // 计算当前可用余额
  const currentAvailableBalance = totalCreditLine - totalOutstandingLoans;
  
  // 计算资金利用率
  const utilizationRate = totalCreditLine > 0 ? (totalOutstandingLoans / totalCreditLine) * 100 : 0;
  
  // 计算各资金方授信份额
  const funderShares: FundProviderShare[] = funders.map(funder => {
    const usedAmount = funder.currentLoanBalance;
    const availableAmount = funder.cumulativeCreditLimit - usedAmount;
    const usageRate = funder.cumulativeCreditLimit > 0 
      ? (usedAmount / funder.cumulativeCreditLimit) * 100 
      : 0;
    
    return {
      funderId: funder.id,
      funderName: funder.institutionName,
      totalCreditLine: funder.cumulativeCreditLimit,
      usedAmount,
      availableAmount,
      usageRate
    };
  });
  
  // 获取流动性预警（基于资金使用率和可用额度）
  const liquidityWarnings: LiquidityWarning[] = [];
  const now = new Date().toISOString();
  
  for (const share of funderShares) {
    if (share.usageRate >= 95) {
      liquidityWarnings.push({
        id: randomUUID(),
        type: "warning",
        message: `警告：${share.funderName}可用授信不足10%，建议尽快协调授信调剂`,
        timestamp: now
      });
    } else if (share.usageRate >= 80) {
      liquidityWarnings.push({
        id: randomUUID(),
        type: "tip",
        message: `提示：${share.funderName}可用授信低于20%，建议关注`,
        timestamp: now
      });
    }
  }
  
  // 如果有资金方可用额度很低，添加预警
  const lowBalanceFunders = funderShares.filter(s => s.availableAmount < totalCreditLine * 0.1);
  if (lowBalanceFunders.length > 0) {
    const funderNames = lowBalanceFunders.map(f => f.funderName).join("、");
    liquidityWarnings.push({
      id: randomUUID(),
      type: "warning",
      message: `警告：${funderNames}可用余额预计在3天内耗尽`,
      timestamp: now
    });
  }
  
  // 获取最近的资金流水（最近50条）
  const [flowRows] = await pool.query<FundFlowRow[]>(
    `SELECT id, time, operation_type, associated_entity, change_amount, remaining_balance, created_at
     FROM fund_flows
     ORDER BY time DESC
     LIMIT 50`
  );
  const fundFlows = flowRows.map(mapFundFlowRow);
  
  return {
    totalCreditLine,
    currentAvailableBalance,
    totalOutstandingLoans,
    utilizationRate,
    funderShares,
    liquidityWarnings,
    fundFlows
  };
}

export async function addFundFlow(input: {
  time: string;
  operationType: "payment" | "repayment";
  associatedEntity: string;
  changeAmount: number;
  remainingBalance: number;
}): Promise<FundFlow> {
  const id = randomUUID();
  
  await pool.query(
    `INSERT INTO fund_flows (id, time, operation_type, associated_entity, change_amount, remaining_balance)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.time,
      input.operationType,
      input.associatedEntity,
      input.changeAmount,
      input.remainingBalance
    ]
  );
  
  const [rows] = await pool.query<FundFlowRow[]>(
    `SELECT id, time, operation_type, associated_entity, change_amount, remaining_balance, created_at
     FROM fund_flows WHERE id = ? LIMIT 1`,
    [id]
  );
  
  if (!rows[0]) {
    throw new Error("创建资金流水失败");
  }
  
  return mapFundFlowRow(rows[0]);
}

