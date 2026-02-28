/**
 * 结算调度器
 * 
 * 负责定时执行各类结算任务：
 * 1. 融资还款结算单生成
 * 2. 定向支付结算单生成
 * 3. 抽成合同结算单生成
 * 4. 逾期状态更新
 * 5. 每日利息计算
 */

import { pool } from "./db.js";
import type { RowDataPacket } from "mysql2";
import { 
  calculateCommissionForContract, 
  getContractsNeedingSettlement,
  calculatePeriodStart,
  isSettlementDay
} from "./commission-calculation.js";
import { generateCommissionSettlement, updateOverdueSettlements } from "./settlements-store.js";
import { 
  generateSettlement as generateDirectedPaySettlement,
  updateOverdueDirectedPaySettlements,
  getDirectedPayContracts
} from "./directed-pay-settlements-store.js";
import { calculateAllContractsDailyInterest } from "./contract-loan-store.js";

// ==================== 调度器状态 ====================

let isRunning = false;
let schedulerInterval: NodeJS.Timeout | null = null;

// ==================== 日志函数 ====================

function log(level: "info" | "warn" | "error", message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [Settlement Scheduler] [${level.toUpperCase()}]`;
  
  if (data) {
    console.log(`${prefix} ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`${prefix} ${message}`);
  }
}

// ==================== 任务执行函数 ====================

/**
 * 执行每日利息计算
 */
async function runDailyInterestCalculation(): Promise<{ processed: number; totalInterest: number }> {
  const today = new Date().toISOString().split("T")[0];
  log("info", `开始计算 ${today} 的利息...`);
  
  try {
    const result = await calculateAllContractsDailyInterest(today);
    log("info", `利息计算完成`, result);
    return result;
  } catch (err) {
    log("error", `利息计算失败`, { error: String(err) });
    return { processed: 0, totalInterest: 0 };
  }
}

/**
 * 执行逾期状态更新
 */
async function runOverdueCheck(): Promise<{ general: number; directedPay: number }> {
  log("info", "开始检查逾期结算单...");
  
  try {
    // 更新通用结算单逾期状态
    const generalCount = await updateOverdueSettlements();
    
    // 更新定向支付结算单逾期状态
    const directedPayCount = await updateOverdueDirectedPaySettlements();
    
    log("info", `逾期检查完成`, { general: generalCount, directedPay: directedPayCount });
    return { general: generalCount, directedPay: directedPayCount };
  } catch (err) {
    log("error", `逾期检查失败`, { error: String(err) });
    return { general: 0, directedPay: 0 };
  }
}

/**
 * 生成抽成合同结算单
 */
async function runCommissionSettlement(today: Date): Promise<{ generated: number; errors: string[] }> {
  log("info", "开始检查抽成合同结算...");
  
  const errors: string[] = [];
  let generated = 0;
  
  try {
    // 获取需要结算的合同
    const contracts = await getContractsNeedingSettlement(today);
    
    if (contracts.length === 0) {
      log("info", "今日无需结算的抽成合同");
      return { generated: 0, errors: [] };
    }
    
    log("info", `找到 ${contracts.length} 个需要结算的抽成合同`);
    
    for (const contract of contracts) {
      try {
        // 计算结算周期
        const periodEnd = new Date(today);
        periodEnd.setDate(periodEnd.getDate() - 1); // 结算截止到昨天
        const periodStart = calculatePeriodStart(periodEnd, contract.settlementCycle);
        
        // 计算抽成
        const summary = await calculateCommissionForContract(
          contract.id,
          periodStart.toISOString().split("T")[0],
          periodEnd.toISOString().split("T")[0]
        );
        
        if (!summary || summary.waybillCount === 0) {
          log("info", `合同 ${contract.id} (${contract.customerName}) 本期无运单，跳过`);
          continue;
        }
        
        // 生成结算单
        await generateCommissionSettlement({
          type: "commission",
          contractId: contract.id,
          contractType: "commission",
          customerId: contract.id, // 使用合同ID作为客户ID
          customerName: contract.customerName,
          periodStart: summary.periodStart,
          periodEnd: summary.periodEnd,
          waybillCount: summary.waybillCount,
          details: summary.details.map(d => ({
            fieldKey: d.fieldKey,
            fieldLabel: d.fieldLabel,
            amount: d.totalCommission
          }))
        });
        
        generated++;
        log("info", `成功生成抽成结算单`, {
          contractId: contract.id,
          customerName: contract.customerName,
          waybillCount: summary.waybillCount,
          totalCommission: summary.totalCommission
        });
        
      } catch (err) {
        const errorMsg = `合同 ${contract.id} 结算失败: ${String(err)}`;
        errors.push(errorMsg);
        log("error", errorMsg);
      }
    }
    
    return { generated, errors };
  } catch (err) {
    log("error", `抽成结算整体失败`, { error: String(err) });
    return { generated: 0, errors: [String(err)] };
  }
}

/**
 * 生成定向支付结算单
 */
async function runDirectedPaySettlement(today: Date): Promise<{ generated: number; errors: string[] }> {
  log("info", "开始检查定向支付结算...");
  
  const errors: string[] = [];
  let generated = 0;
  
  try {
    // 获取所有激活的定向支付合同
    const contracts = await getDirectedPayContracts({ status: "active" });
    
    for (const contract of contracts) {
      // 检查是否到结算日
      if (!isSettlementDay(today, contract.settlementCycle, 1)) {
        continue;
      }
      
      try {
        const periodEnd = new Date(today);
        periodEnd.setDate(periodEnd.getDate() - 1);
        
        await generateDirectedPaySettlement(contract.id, periodEnd);
        generated++;
        log("info", `成功生成定向支付结算单`, { contractId: contract.id });
        
      } catch (err) {
        // 如果是"本期无支付记录"错误，跳过
        if (String(err).includes("无支付记录")) {
          log("info", `合同 ${contract.id} 本期无支付记录，跳过`);
          continue;
        }
        
        const errorMsg = `合同 ${contract.id} 结算失败: ${String(err)}`;
        errors.push(errorMsg);
        log("error", errorMsg);
      }
    }
    
    return { generated, errors };
  } catch (err) {
    log("error", `定向支付结算整体失败`, { error: String(err) });
    return { generated: 0, errors: [String(err)] };
  }
}

/**
 * 生成融资还款结算单
 */
async function runFinancingRepaymentSettlement(today: Date): Promise<{ generated: number; errors: string[] }> {
  log("info", "开始检查融资还款结算...");
  
  const errors: string[] = [];
  let generated = 0;
  
  try {
    // 获取所有有未还本金的融资合同
    const [contracts] = await pool.query<RowDataPacket[]>(
      `SELECT c.*, f.enterprise_name as financier_name
       FROM contracts c
       LEFT JOIN financiers f ON c.logistics_provider_id = f.id
       WHERE c.type = 'financing'
         AND c.status = 'active'
         AND c.outstanding_principal > 0`
    );
    
    for (const contract of contracts) {
      // 检查是否到结算日
      const settlementDay = contract.settlement_trigger_day || 1;
      if (today.getDate() !== settlementDay) {
        continue;
      }
      
      try {
        // 计算本期利息（从利息台账汇总）
        const [interestRows] = await pool.query<RowDataPacket[]>(
          `SELECT COALESCE(SUM(interest_amount), 0) as total_interest
           FROM contract_interest_accruals
           WHERE contract_id = ?
             AND status = 'pending'`,
          [contract.id]
        );
        
        const totalInterest = Number(interestRows[0]?.total_interest || 0);
        
        if (totalInterest <= 0) {
          log("info", `合同 ${contract.id} 无待结算利息，跳过`);
          continue;
        }
        
        // 计算周期
        const periodEnd = new Date(today);
        periodEnd.setDate(periodEnd.getDate() - 1);
        const periodStart = calculatePeriodStart(periodEnd, contract.settlement_cycle || "monthly");
        
        // 计算应还日期（结算日 + 15天）
        const dueDate = new Date(today);
        dueDate.setDate(dueDate.getDate() + 15);
        
        // 生成结算单
        const { createSettlement } = await import("./settlements-store.js");
        
        await createSettlement({
          type: "financing_repayment",
          contractId: contract.id,
          contractType: "financing",
          customerId: contract.logistics_provider_id || "",
          customerName: contract.financier_name || contract.logistics_provider_name || "",
          periodStart: periodStart.toISOString().split("T")[0],
          periodEnd: periodEnd.toISOString().split("T")[0],
          repaymentType: "interest",
          interest: totalInterest,
          totalDue: totalInterest,
          dueDate: dueDate.toISOString().split("T")[0]
        });
        
        generated++;
        log("info", `成功生成融资还款结算单`, {
          contractId: contract.id,
          totalInterest
        });
        
      } catch (err) {
        const errorMsg = `合同 ${contract.id} 融资结算失败: ${String(err)}`;
        errors.push(errorMsg);
        log("error", errorMsg);
      }
    }
    
    return { generated, errors };
  } catch (err) {
    log("error", `融资还款结算整体失败`, { error: String(err) });
    return { generated: 0, errors: [String(err)] };
  }
}

// ==================== 主调度函数 ====================

/**
 * 执行所有结算任务
 */
export async function runAllSettlementTasks(): Promise<{
  dailyInterest: { processed: number; totalInterest: number };
  overdueCheck: { general: number; directedPay: number };
  commissionSettlement: { generated: number; errors: string[] };
  directedPaySettlement: { generated: number; errors: string[] };
  financingRepaymentSettlement: { generated: number; errors: string[] };
}> {
  if (isRunning) {
    log("warn", "结算任务正在运行中，跳过本次执行");
    return {
      dailyInterest: { processed: 0, totalInterest: 0 },
      overdueCheck: { general: 0, directedPay: 0 },
      commissionSettlement: { generated: 0, errors: ["任务正在运行中"] },
      directedPaySettlement: { generated: 0, errors: ["任务正在运行中"] },
      financingRepaymentSettlement: { generated: 0, errors: ["任务正在运行中"] }
    };
  }
  
  isRunning = true;
  log("info", "======== 开始执行结算任务 ========");
  
  const today = new Date();
  
  try {
    // 1. 每日利息计算
    const dailyInterest = await runDailyInterestCalculation();
    
    // 2. 逾期状态更新
    const overdueCheck = await runOverdueCheck();
    
    // 3. 抽成合同结算
    const commissionSettlement = await runCommissionSettlement(today);
    
    // 4. 定向支付结算
    const directedPaySettlement = await runDirectedPaySettlement(today);
    
    // 5. 融资还款结算
    const financingRepaymentSettlement = await runFinancingRepaymentSettlement(today);
    
    log("info", "======== 结算任务执行完成 ========", {
      dailyInterest,
      overdueCheck,
      commissionSettlement,
      directedPaySettlement,
      financingRepaymentSettlement
    });
    
    return {
      dailyInterest,
      overdueCheck,
      commissionSettlement,
      directedPaySettlement,
      financingRepaymentSettlement
    };
    
  } finally {
    isRunning = false;
  }
}

// ==================== 调度器控制 ====================

/**
 * 启动调度器（每天凌晨2点执行）
 */
export function startSettlementScheduler(): void {
  if (schedulerInterval) {
    log("warn", "调度器已在运行中");
    return;
  }
  
  log("info", "结算调度器已启动");
  
  // 计算到下一个凌晨2点的时间
  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setHours(2, 0, 0, 0);
  
  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }
  
  const msUntilNextRun = nextRun.getTime() - now.getTime();
  
  log("info", `下次执行时间: ${nextRun.toISOString()}`);
  
  // 设置首次执行
  setTimeout(() => {
    void runAllSettlementTasks();
    
    // 之后每24小时执行一次
    schedulerInterval = setInterval(() => {
      void runAllSettlementTasks();
    }, 24 * 60 * 60 * 1000);
    
  }, msUntilNextRun);
}

/**
 * 停止调度器
 */
export function stopSettlementScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    log("info", "结算调度器已停止");
  }
}

/**
 * 手动触发结算任务（用于API调用）
 */
export async function triggerSettlementManually(): Promise<ReturnType<typeof runAllSettlementTasks>> {
  log("info", "收到手动触发结算请求");
  return runAllSettlementTasks();
}

// ==================== 单独任务触发（用于测试/调试）====================

export { 
  runDailyInterestCalculation,
  runOverdueCheck,
  runCommissionSettlement,
  runDirectedPaySettlement,
  runFinancingRepaymentSettlement
};
