/**
 * 资金定向支付 - 数据库表迁移
 * 
 * 创建以下表：
 * 1. directed_pay_contracts - 定向支付合同表
 * 2. payment_category_configs - 支付类别配置表
 * 3. directed_payment_requests - 定向支付申请表
 * 4. payment_codes - 付款码表
 * 5. virtual_accounts - 虚拟账户表
 * 6. virtual_account_transactions - 虚拟账户流水表
 * 7. directed_pay_settlements - 定向支付结算单表
 * 8. directed_pay_settlement_items - 结算单明细表
 */

import { pool } from "../db.js";

export async function createDirectedPaymentTables(): Promise<void> {
  console.log("=== 创建资金定向支付数据库表 ===\n");

  // 1. 定向支付合同表
  console.log("1. 创建 directed_pay_contracts 表...");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS directed_pay_contracts (
      id VARCHAR(36) PRIMARY KEY,
      contract_number VARCHAR(50) NOT NULL UNIQUE,
      funder_id VARCHAR(36) NOT NULL,
      financier_id VARCHAR(36) NOT NULL,
      funder_account_id VARCHAR(100),
      credit_limit DECIMAL(18,2) NOT NULL,
      used_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      available_amount DECIMAL(18,2) NOT NULL,
      annual_interest_rate DECIMAL(5,4) NOT NULL,
      interest_calc_base INT NOT NULL DEFAULT 360,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      settlement_cycle VARCHAR(20) NOT NULL,
      settlement_day INT NOT NULL,
      grace_period_days INT NOT NULL DEFAULT 3,
      auto_payment_enabled TINYINT(1) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      remark TEXT,
      created_by VARCHAR(36),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL,
      INDEX idx_dpc_funder (funder_id),
      INDEX idx_dpc_financier (financier_id),
      INDEX idx_dpc_status (status),
      INDEX idx_dpc_dates (start_date, end_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log("   ✓ directed_pay_contracts 表创建完成");

  // 2. 支付类别配置表
  console.log("2. 创建 payment_category_configs 表...");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_category_configs (
      id VARCHAR(36) PRIMARY KEY,
      contract_id VARCHAR(36) NOT NULL,
      category_code VARCHAR(50) NOT NULL,
      category_name VARCHAR(100) NOT NULL,
      payment_ratio DECIMAL(5,2) NOT NULL DEFAULT 100 COMMENT '支付比例(0-100)，如80表示最多支付原始金额的80%',
      min_amount DECIMAL(18,2),
      max_amount DECIMAL(18,2),
      daily_limit DECIMAL(18,2),
      require_platform_approval TINYINT(1) NOT NULL DEFAULT 1,
      require_funder_approval TINYINT(1) NOT NULL DEFAULT 1,
      platform_approval_threshold DECIMAL(18,2),
      funder_approval_threshold DECIMAL(18,2),
      auto_payment_enabled TINYINT(1) NOT NULL DEFAULT 0,
      is_enabled TINYINT(1) NOT NULL DEFAULT 1,
      unlock_status VARCHAR(50) NOT NULL DEFAULT 'created' COMMENT '解锁状态：达到此状态后可申请该费用',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pcc_contract (contract_id),
      INDEX idx_pcc_category (category_code),
      UNIQUE KEY uk_contract_category (contract_id, category_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log("   ✓ payment_category_configs 表创建完成");

  // 3. 定向支付申请表
  console.log("3. 创建 directed_payment_requests 表...");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS directed_payment_requests (
      id VARCHAR(36) PRIMARY KEY,
      request_number VARCHAR(50) NOT NULL UNIQUE,
      contract_id VARCHAR(36) NOT NULL,
      waybill_id VARCHAR(36),
      waybill_number VARCHAR(50),
      category_code VARCHAR(50) NOT NULL,
      category_name VARCHAR(100) NOT NULL,
      payment_amount DECIMAL(18,2) NOT NULL,
      service_fee DECIMAL(18,2) NOT NULL DEFAULT 0,
      interest_start_time DATETIME,
      receiver_type VARCHAR(20) NOT NULL,
      receiver_name VARCHAR(100),
      receiver_account VARCHAR(100),
      receiver_bank VARCHAR(100),
      driver_id VARCHAR(36),
      driver_name VARCHAR(100),
      driver_phone VARCHAR(20),
      remark TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      platform_approval_status VARCHAR(20) DEFAULT 'pending',
      platform_approved_by VARCHAR(36),
      platform_approved_at DATETIME,
      platform_approval_remark TEXT,
      funder_approval_status VARCHAR(20) DEFAULT 'pending',
      funder_approved_by VARCHAR(36),
      funder_approved_at DATETIME,
      funder_approval_remark TEXT,
      execution_time DATETIME,
      execution_channel VARCHAR(50),
      execution_transaction_id VARCHAR(100),
      execution_status VARCHAR(20),
      execution_failure_reason TEXT,
      created_by VARCHAR(36),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_dpr_contract (contract_id),
      INDEX idx_dpr_waybill (waybill_id),
      INDEX idx_dpr_status (status),
      INDEX idx_dpr_driver (driver_id),
      INDEX idx_dpr_category (category_code),
      INDEX idx_dpr_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log("   ✓ directed_payment_requests 表创建完成");

  // 4. 付款码表
  console.log("4. 创建 payment_codes 表...");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_codes (
      id VARCHAR(36) PRIMARY KEY,
      code VARCHAR(50) NOT NULL UNIQUE,
      request_id VARCHAR(36) NOT NULL,
      driver_id VARCHAR(36),
      driver_name VARCHAR(100),
      driver_phone VARCHAR(20),
      amount DECIMAL(18,2) NOT NULL,
      expire_at DATETIME NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      used_at DATETIME,
      used_location VARCHAR(255),
      tms_sync_status VARCHAR(20) DEFAULT 'pending',
      tms_sync_time DATETIME,
      tms_sync_response JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pc_code (code),
      INDEX idx_pc_request (request_id),
      INDEX idx_pc_driver (driver_id),
      INDEX idx_pc_status (status),
      INDEX idx_pc_expire (expire_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log("   ✓ payment_codes 表创建完成");

  // 5. 虚拟账户表
  console.log("5. 创建 virtual_accounts 表...");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS virtual_accounts (
      id VARCHAR(36) PRIMARY KEY,
      account_number VARCHAR(50) NOT NULL UNIQUE,
      owner_type VARCHAR(20) NOT NULL,
      owner_id VARCHAR(36) NOT NULL,
      owner_name VARCHAR(100) NOT NULL,
      balance DECIMAL(18,2) NOT NULL DEFAULT 0,
      frozen_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      total_income DECIMAL(18,2) NOT NULL DEFAULT 0,
      total_expense DECIMAL(18,2) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL,
      INDEX idx_va_owner (owner_type, owner_id),
      INDEX idx_va_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log("   ✓ virtual_accounts 表创建完成");

  // 6. 虚拟账户流水表
  console.log("6. 创建 virtual_account_transactions 表...");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS virtual_account_transactions (
      id VARCHAR(36) PRIMARY KEY,
      transaction_number VARCHAR(50) NOT NULL UNIQUE,
      account_id VARCHAR(36) NOT NULL,
      txn_type VARCHAR(20) NOT NULL,
      amount DECIMAL(18,2) NOT NULL,
      balance_before DECIMAL(18,2) NOT NULL,
      balance_after DECIMAL(18,2) NOT NULL,
      related_type VARCHAR(50),
      related_id VARCHAR(36),
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_vat_account (account_id),
      INDEX idx_vat_type (txn_type),
      INDEX idx_vat_related (related_type, related_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log("   ✓ virtual_account_transactions 表创建完成");

  // 7. 定向支付结算单表
  console.log("7. 创建 directed_pay_settlements 表...");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS directed_pay_settlements (
      id VARCHAR(36) PRIMARY KEY,
      settlement_number VARCHAR(50) NOT NULL UNIQUE,
      contract_id VARCHAR(36) NOT NULL,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      payment_count INT NOT NULL DEFAULT 0,
      principal_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      interest_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      service_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      total_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      due_date DATE NOT NULL,
      actual_paid_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      paid_at DATETIME,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_dps_contract (contract_id),
      INDEX idx_dps_status (status),
      INDEX idx_dps_period (period_start, period_end),
      INDEX idx_dps_due_date (due_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log("   ✓ directed_pay_settlements 表创建完成");

  // 8. 结算单明细表
  console.log("8. 创建 directed_pay_settlement_items 表...");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS directed_pay_settlement_items (
      id VARCHAR(36) PRIMARY KEY,
      settlement_id VARCHAR(36) NOT NULL,
      payment_request_id VARCHAR(36) NOT NULL,
      payment_amount DECIMAL(18,2) NOT NULL,
      payment_time DATETIME NOT NULL,
      interest_days INT NOT NULL,
      interest_amount DECIMAL(18,2) NOT NULL,
      service_fee DECIMAL(18,2) NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_dpsi_settlement (settlement_id),
      INDEX idx_dpsi_payment (payment_request_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log("   ✓ directed_pay_settlement_items 表创建完成");

  console.log("\n=== 资金定向支付数据库表创建完成 ===");
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  createDirectedPaymentTables()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
