/**
 * 收益管理 - 数据库表迁移
 * 
 * 创建以下表：
 * 1. revenue_records - 收益/支出记录表
 */

import { pool } from "../db.js";

export async function createRevenueTables(): Promise<void> {
  console.log("=== 创建收益管理数据库表 ===\n");

  // 1. 收益/支出记录表
  console.log("1. 创建 revenue_records 表...");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS revenue_records (
      id VARCHAR(36) PRIMARY KEY,
      
      -- 记录类型：收益 or 支出
      record_type ENUM('revenue', 'expense') NOT NULL,
      
      -- 收益/支出归属方
      beneficiary_type ENUM('platform', 'funder', 'financier') NOT NULL,
      beneficiary_id VARCHAR(36),
      
      -- 收益来源类型
      source_type ENUM(
        'financing_interest',
        'directed_pay_interest',
        'brokerage_commission',
        'commission_fee'
      ) NOT NULL,
      
      -- 关联合同信息
      contract_id VARCHAR(36) NOT NULL,
      contract_number VARCHAR(50),
      contract_type VARCHAR(50),
      
      -- 资金方信息
      funder_id VARCHAR(36),
      funder_name VARCHAR(255),
      
      -- 融资方信息
      financier_id VARCHAR(36),
      financier_name VARCHAR(255),
      
      -- 金额信息
      amount DECIMAL(18,2) NOT NULL,
      principal_amount DECIMAL(18,2),
      rate DECIMAL(10,6),
      
      -- 收益日期
      revenue_date DATE NOT NULL,
      
      -- 状态
      status ENUM('pending', 'confirmed', 'settled') DEFAULT 'pending',
      
      -- 关联单据
      settlement_id VARCHAR(36),
      payment_request_id VARCHAR(36),
      waybill_id VARCHAR(36),
      
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      
      -- 索引
      INDEX idx_rr_record_type (record_type),
      INDEX idx_rr_beneficiary (beneficiary_type, beneficiary_id),
      INDEX idx_rr_date (revenue_date),
      INDEX idx_rr_source (source_type),
      INDEX idx_rr_status (status),
      INDEX idx_rr_contract (contract_id),
      INDEX idx_rr_funder (funder_id),
      INDEX idx_rr_financier (financier_id),
      INDEX idx_rr_settlement (settlement_id),
      INDEX idx_rr_payment_request (payment_request_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log("   ✓ revenue_records 表创建完成");

  // 扩展 source_type 枚举，添加 waybill_commission
  try {
    await pool.query(`
      ALTER TABLE revenue_records 
      MODIFY COLUMN source_type ENUM(
        'financing_interest',
        'directed_pay_interest',
        'brokerage_commission',
        'commission_fee',
        'waybill_commission'
      ) NOT NULL
    `);
    console.log("   ✓ source_type 枚举已扩展（新增 waybill_commission）");
  } catch (err: any) {
    if (err.code === 'ER_DUPLICATED_VALUE_IN_TYPE') {
      console.log("   - source_type 枚举已包含 waybill_commission，跳过");
    } else {
      console.log("   ✓ source_type 枚举更新完成");
    }
  }

  console.log("\n=== 收益管理数据库表创建完成 ===");
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  createRevenueTables()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
