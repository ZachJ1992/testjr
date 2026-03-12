/**
 * 一次性修复：清理因利率计算 bug（未除以100）导致的错误利息数据
 * 
 * bug: dailyRate = annualRate / 360（利息放大100倍）
 * fix: dailyRate = annualRate / 100 / 360
 * 
 * 幂等：通过在 contracts 表添加标记列来确保只执行一次
 */

import { pool } from "../db.js";

export async function fixInterestRateCalculation(): Promise<void> {
  console.log("[MIGRATION] 检查利息数据修复...");

  try {
    const [columns] = await pool.query<any[]>(
      "SHOW COLUMNS FROM contracts LIKE 'interest_rate_fix_applied'"
    );

    if (columns.length > 0) {
      console.log("[MIGRATION] 利息数据已修复过，跳过");
      return;
    }

    // 1. 清空错误的利息台账
    const [tables] = await pool.query<any[]>(
      "SHOW TABLES LIKE 'contract_interest_accruals'"
    );

    if (tables.length > 0) {
      const [delResult] = await pool.query<any>("DELETE FROM contract_interest_accruals");
      console.log(`[MIGRATION] 已清空利息台账记录: ${delResult.affectedRows} 条`);
    }

    // 2. 重置所有融资合同的 accrued_interest 为 0
    const [updateResult] = await pool.query<any>(
      "UPDATE contracts SET accrued_interest = 0 WHERE type = 'financing'"
    );
    console.log(`[MIGRATION] 已重置 ${updateResult.affectedRows} 个融资合同的 accrued_interest 为 0`);

    // 3. 添加标记列，防止重复执行
    await pool.query(`
      ALTER TABLE contracts 
      ADD COLUMN interest_rate_fix_applied TINYINT(1) DEFAULT 1
      COMMENT '利率计算修复标记（v1: annualRate/100/360）'
    `);

    console.log("[MIGRATION] 利息数据修复完成");
  } catch (error: any) {
    console.error("[MIGRATION] 利息数据修复失败:", error.message);
    throw error;
  }
}
