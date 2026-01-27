/**
 * 合同放款管理 - 数据库表迁移
 * 
 * 创建以下表：
 * 1. contract_disbursements - 放款记录表
 * 2. contract_repayments - 还款记录表
 * 3. contract_interest_accruals - 每日利息台账表
 * 
 * 扩展 contracts 表字段
 */

import { pool } from "../db.js";

export async function createContractLoanTables(): Promise<void> {
  console.log("=== 创建合同放款管理数据库表 ===\n");

  // 1. 放款记录表
  console.log("1. 创建 contract_disbursements 表...");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contract_disbursements (
      id VARCHAR(36) PRIMARY KEY,
      contract_id VARCHAR(36) NOT NULL,
      amount DECIMAL(18,2) NOT NULL,
      disbursement_date DATE NOT NULL,
      operator_id VARCHAR(36),
      operator_name VARCHAR(100),
      remark TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_cd_contract (contract_id),
      INDEX idx_cd_date (disbursement_date),
      INDEX idx_cd_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log("   ✓ contract_disbursements 表创建完成");

  // 2. 还款记录表
  console.log("2. 创建 contract_repayments 表...");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contract_repayments (
      id VARCHAR(36) PRIMARY KEY,
      contract_id VARCHAR(36) NOT NULL,
      principal_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      interest_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      total_amount DECIMAL(18,2) NOT NULL,
      repayment_date DATE NOT NULL,
      operator_id VARCHAR(36),
      operator_name VARCHAR(100),
      remark TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_cr_contract (contract_id),
      INDEX idx_cr_date (repayment_date),
      INDEX idx_cr_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log("   ✓ contract_repayments 表创建完成");

  // 3. 每日利息台账表
  console.log("3. 创建 contract_interest_accruals 表...");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contract_interest_accruals (
      id VARCHAR(36) PRIMARY KEY,
      contract_id VARCHAR(36) NOT NULL,
      accrual_date DATE NOT NULL,
      principal_base DECIMAL(18,2) NOT NULL,
      annual_rate DECIMAL(10,6) NOT NULL,
      daily_rate DECIMAL(12,10) NOT NULL,
      interest_amount DECIMAL(18,4) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      settled_at DATETIME,
      settled_by VARCHAR(36),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_contract_date (contract_id, accrual_date),
      INDEX idx_cia_contract (contract_id),
      INDEX idx_cia_date (accrual_date),
      INDEX idx_cia_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log("   ✓ contract_interest_accruals 表创建完成");

  // 4. 扩展 contracts 表字段
  console.log("4. 扩展 contracts 表字段...");
  
  const columnsToAdd = [
    { name: 'total_disbursed', definition: 'DECIMAL(18,2) NOT NULL DEFAULT 0' },
    { name: 'total_repaid_principal', definition: 'DECIMAL(18,2) NOT NULL DEFAULT 0' },
    { name: 'total_repaid_interest', definition: 'DECIMAL(18,2) NOT NULL DEFAULT 0' },
    { name: 'outstanding_principal', definition: 'DECIMAL(18,2) NOT NULL DEFAULT 0' },
    { name: 'accrued_interest', definition: 'DECIMAL(18,4) NOT NULL DEFAULT 0' },
    { name: 'loan_status', definition: "VARCHAR(30) NOT NULL DEFAULT 'not_disbursed'" },
    { name: 'overdue_rate', definition: 'DECIMAL(10,6) DEFAULT NULL' },
    { name: 'first_disbursement_date', definition: 'DATE DEFAULT NULL' },
    { name: 'last_disbursement_date', definition: 'DATE DEFAULT NULL' },
    { name: 'last_repayment_date', definition: 'DATE DEFAULT NULL' },
  ];

  for (const col of columnsToAdd) {
    try {
      await pool.query(`ALTER TABLE contracts ADD COLUMN ${col.name} ${col.definition}`);
      console.log(`   ✓ 添加字段 ${col.name}`);
    } catch (err: any) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log(`   - 字段 ${col.name} 已存在，跳过`);
      } else {
        throw err;
      }
    }
  }

  // 添加索引
  try {
    await pool.query(`ALTER TABLE contracts ADD INDEX idx_loan_status (loan_status)`);
    console.log("   ✓ 添加 loan_status 索引");
  } catch (err: any) {
    if (err.code === 'ER_DUP_KEYNAME') {
      console.log("   - loan_status 索引已存在，跳过");
    }
  }

  console.log("\n=== 合同放款管理表创建完成 ===\n");
}

// 放款状态枚举
export const LoanStatus = {
  NOT_DISBURSED: 'not_disbursed',      // 未放款
  PARTIALLY_DISBURSED: 'partially_disbursed', // 部分放款
  FULLY_DISBURSED: 'fully_disbursed',  // 全额放款
  REPAYING: 'repaying',                // 还款中
  FULLY_REPAID: 'fully_repaid',        // 已结清
  OVERDUE: 'overdue',                  // 逾期
} as const;

export type LoanStatusType = typeof LoanStatus[keyof typeof LoanStatus];
