/**
 * 为 payment_category_configs 表添加 unlock_status 字段
 * 
 * 解锁状态：定义运单达到什么状态后才能申请该费用类别
 */
import { pool } from "../db.js";

export async function runAddUnlockStatusMigration(): Promise<void> {
  console.log("[MIGRATION] 添加 unlock_status 字段...");

  try {
    // 检查表是否存在
    const [tables] = await pool.query<any[]>(
      "SHOW TABLES LIKE 'payment_category_configs'"
    );

    if (tables.length === 0) {
      console.log("[MIGRATION] payment_category_configs 表不存在，跳过");
      return;
    }

    // 检查字段是否已存在
    const [columns] = await pool.query<any[]>(
      "SHOW COLUMNS FROM payment_category_configs LIKE 'unlock_status'"
    );

    if (columns.length > 0) {
      console.log("[MIGRATION] unlock_status 字段已存在，跳过");
      return;
    }

    await pool.query(`
      ALTER TABLE payment_category_configs
      ADD COLUMN unlock_status VARCHAR(50) DEFAULT 'created'
      COMMENT '解锁状态：达到此状态后可申请该费用'
    `);

    console.log("[MIGRATION] unlock_status 字段添加成功");
  } catch (error: any) {
    console.error("[MIGRATION] 迁移失败:", error.message);
    throw error;
  }
}
