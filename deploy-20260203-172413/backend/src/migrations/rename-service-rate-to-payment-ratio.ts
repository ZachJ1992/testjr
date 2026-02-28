/**
 * 迁移脚本：将 service_rate 字段重命名为 payment_ratio
 * 
 * 业务含义变更：
 * - 原"服务费率"改为"支付比例"
 * - 支付比例表示某费用项最多可支付原始金额的百分比
 * - 例如：ETC费用1000元，配置80%，则定向支付金额最多为800元
 */

import { pool } from "../db.js";

export async function runRenameServiceRateToPaymentRatio(): Promise<void> {
  console.log("[MIGRATION] 开始重命名 service_rate → payment_ratio...");

  try {
    // 检查表是否存在
    const [tables] = await pool.query<any[]>(
      "SHOW TABLES LIKE 'payment_category_configs'"
    );

    if (tables.length === 0) {
      console.log("[MIGRATION] payment_category_configs 表不存在，跳过迁移");
      return;
    }

    // 检查旧字段是否存在
    const [columns] = await pool.query<any[]>(
      "SHOW COLUMNS FROM payment_category_configs LIKE 'service_rate'"
    );

    if (columns.length === 0) {
      console.log("[MIGRATION] service_rate 字段不存在，可能已经迁移过");
      
      // 检查新字段是否存在
      const [newColumns] = await pool.query<any[]>(
        "SHOW COLUMNS FROM payment_category_configs LIKE 'payment_ratio'"
      );
      
      if (newColumns.length > 0) {
        console.log("[MIGRATION] payment_ratio 字段已存在，跳过迁移");
        return;
      }
      
      // 如果两个字段都不存在，添加新字段
      console.log("[MIGRATION] 添加 payment_ratio 字段...");
      await pool.query(`
        ALTER TABLE payment_category_configs
        ADD COLUMN payment_ratio DECIMAL(5,2) NOT NULL DEFAULT 100
        COMMENT '支付比例(0-100)，如80表示最多支付原始金额的80%'
      `);
      console.log("[MIGRATION] payment_ratio 字段添加成功");
      return;
    }

    // 重命名字段并修改类型
    console.log("[MIGRATION] 重命名 service_rate → payment_ratio...");
    await pool.query(`
      ALTER TABLE payment_category_configs
      CHANGE COLUMN service_rate payment_ratio DECIMAL(5,2) NOT NULL DEFAULT 100
      COMMENT '支付比例(0-100)，如80表示最多支付原始金额的80%'
    `);

    // 将原来的小数值转换为百分比（如果原值是0.8，需要转换为80）
    // 检查是否有小于1的值需要转换
    const [smallValues] = await pool.query<any[]>(
      "SELECT COUNT(*) as cnt FROM payment_category_configs WHERE payment_ratio > 0 AND payment_ratio < 1"
    );
    
    if (smallValues[0].cnt > 0) {
      console.log("[MIGRATION] 转换旧数据：小数值 → 百分比值...");
      await pool.query(`
        UPDATE payment_category_configs
        SET payment_ratio = payment_ratio * 100
        WHERE payment_ratio > 0 AND payment_ratio < 1
      `);
    }

    console.log("[MIGRATION] service_rate → payment_ratio 迁移完成");
  } catch (error: any) {
    console.error("[MIGRATION] 迁移失败:", error.message);
    throw error;
  }
}
