/**
 * 业务抽成合同 v2 数据模型迁移
 * 
 * 新增：
 *   - local_partners  落地合作方（属于某个合作方/financier）
 *   - routes           线路（属于某个落地合作方）
 *   - contract_routes  合同-线路关联表
 * 
 * 变更：
 *   - commission_contracts 新增 financier_id 列，建立与合作方的外键关联
 */

import { pool } from "../db.js";

async function columnExists(table: string, column: string): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return (rows as any[]).length > 0;
}

async function tableExists(table: string): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES 
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return (rows as any[]).length > 0;
}

export async function runCommissionV2Migration(): Promise<void> {
  console.log("\n========== 业务抽成合同 v2 迁移 ==========");

  // 0. 修复已存在表的 collation（统一到 utf8mb4_0900_ai_ci 与数据库其他表一致）
  const tablesToFixCollation = ["local_partners", "routes", "contract_routes", "commission_recon_batches", "commission_recon_items"];
  for (const tbl of tablesToFixCollation) {
    if (await tableExists(tbl)) {
      try {
        await pool.query(`ALTER TABLE ${tbl} CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
        console.log(`  -> ${tbl} collation 已统一为 utf8mb4_0900_ai_ci`);
      } catch (e: any) {
        console.log(`  注意：修复 ${tbl} collation 时出错，继续`, e.message);
      }
    }
  }

  // 1. 落地合作方
  if (!(await tableExists("local_partners"))) {
    console.log("创建 local_partners 表...");
    await pool.query(`
      CREATE TABLE local_partners (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        financier_id VARCHAR(36) NOT NULL COMMENT '所属合作方(financiers.id)',
        contact_person VARCHAR(100),
        contact_phone VARCHAR(50),
        remark TEXT,
        status ENUM('active','disabled') NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_lp_financier (financier_id),
        INDEX idx_lp_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    console.log("  -> local_partners 已创建");
  } else {
    console.log("  local_partners 已存在，跳过");
  }

  // 2. 线路
  if (!(await tableExists("routes"))) {
    console.log("创建 routes 表...");
    await pool.query(`
      CREATE TABLE routes (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        local_partner_id VARCHAR(36) NOT NULL COMMENT '所属落地合作方',
        remark TEXT,
        status ENUM('active','disabled') NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_route_lp (local_partner_id),
        INDEX idx_route_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    console.log("  -> routes 已创建");
  } else {
    console.log("  routes 已存在，跳过");
  }

  // 3. 合同-线路关联表
  if (!(await tableExists("contract_routes"))) {
    console.log("创建 contract_routes 表...");
    await pool.query(`
      CREATE TABLE contract_routes (
        id VARCHAR(36) PRIMARY KEY,
        contract_id VARCHAR(36) NOT NULL COMMENT '抽成合同ID',
        route_id VARCHAR(36) NOT NULL COMMENT '线路ID',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_contract_route (contract_id, route_id),
        INDEX idx_cr_contract (contract_id),
        INDEX idx_cr_route (route_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    console.log("  -> contract_routes 已创建");
  } else {
    console.log("  contract_routes 已存在，跳过");
  }

  // 4. commission_contracts 新增 financier_id 列
  if (!(await columnExists("commission_contracts", "financier_id"))) {
    console.log("为 commission_contracts 添加 financier_id 列...");
    await pool.query(`
      ALTER TABLE commission_contracts 
      ADD COLUMN financier_id VARCHAR(36) NULL COMMENT '关联合作方' AFTER customer_name
    `);
    await pool.query(`
      CREATE INDEX idx_cc_financier ON commission_contracts (financier_id)
    `);
    console.log("  -> financier_id 列已添加");

    // 回填：通过 customer_name 匹配 financiers.enterprise_name
    console.log("回填 financier_id...");
    const [result] = await pool.query(`
      UPDATE commission_contracts cc
      JOIN financiers f ON cc.customer_name = f.enterprise_name
      SET cc.financier_id = f.id
      WHERE cc.financier_id IS NULL
    `);
    console.log(`  -> 回填完成, affected=${(result as any).affectedRows}`);
  } else {
    console.log("  commission_contracts.financier_id 已存在，跳过");
  }

  // 4b. commission_contracts 新增 contract_name 列
  if (!(await columnExists("commission_contracts", "contract_name"))) {
    await pool.query(`ALTER TABLE commission_contracts ADD COLUMN contract_name VARCHAR(200) NULL COMMENT '合同名称' AFTER id`);
    console.log("  -> contract_name 列已添加");
  } else {
    console.log("  commission_contracts.contract_name 已存在，跳过");
  }

  // 5. commission_contracts 将 customer_system_id, settlement_cycle, settlement_day 改为可空
  // 通过 ALTER 把 NOT NULL 去掉（幂等：如果已经是 NULL 不会报错）
  try {
    await pool.query(`
      ALTER TABLE commission_contracts 
      MODIFY COLUMN customer_system_id VARCHAR(100) NULL,
      MODIFY COLUMN settlement_cycle ENUM('monthly','biweekly','weekly') NULL DEFAULT 'monthly',
      MODIFY COLUMN settlement_day INT NULL DEFAULT 10
    `);
    console.log("  -> customer_system_id / settlement_cycle / settlement_day 已改为可空");
  } catch (e: any) {
    console.log("  注意：修改列可空属性时出错（可能已为可空），继续", e.message);
  }

  // 6. 对账批次表
  if (!(await tableExists("commission_recon_batches"))) {
    console.log("创建 commission_recon_batches 表...");
    await pool.query(`
      CREATE TABLE commission_recon_batches (
        id VARCHAR(36) PRIMARY KEY,
        batch_number VARCHAR(50) NOT NULL UNIQUE,
        contract_id VARCHAR(36) NOT NULL COMMENT '抽成合同ID',
        financier_id VARCHAR(36) COMMENT '合作方ID',
        financier_name VARCHAR(200),
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        total_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
        item_count INT NOT NULL DEFAULT 0,
        status ENUM('reconciling','reconciled','settlement_generated','paid_offline','accounted') NOT NULL DEFAULT 'reconciling',
        settlement_id VARCHAR(36) COMMENT '关联结算单ID',
        export_url TEXT COMMENT '导出文件路径',
        payment_proof_url TEXT COMMENT '付款凭证',
        remark TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_crb_contract (contract_id),
        INDEX idx_crb_status (status),
        INDEX idx_crb_financier (financier_id),
        INDEX idx_crb_period (period_start, period_end)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    console.log("  -> commission_recon_batches 已创建");
  } else {
    console.log("  commission_recon_batches 已存在，跳过");
  }

  // 7. 对账批次明细（关联收益记录）
  if (!(await tableExists("commission_recon_items"))) {
    console.log("创建 commission_recon_items 表...");
    await pool.query(`
      CREATE TABLE commission_recon_items (
        id VARCHAR(36) PRIMARY KEY,
        batch_id VARCHAR(36) NOT NULL COMMENT '对账批次ID',
        revenue_record_id VARCHAR(36) NOT NULL COMMENT '收益记录ID',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_batch_revenue (batch_id, revenue_record_id),
        INDEX idx_cri_batch (batch_id),
        INDEX idx_cri_revenue (revenue_record_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    console.log("  -> commission_recon_items 已创建");
  } else {
    console.log("  commission_recon_items 已存在，跳过");
  }

  // 8. 扩展 revenue_records status 枚举以支持对账状态
  try {
    await pool.query(`
      ALTER TABLE revenue_records 
      MODIFY COLUMN status ENUM('pending','confirmed','reconciling','reconciled','settled','accounted') DEFAULT 'pending'
    `);
    console.log("  -> revenue_records.status 枚举已扩展");
  } catch (e: any) {
    console.log("  注意：扩展 revenue_records status 时出错（可能已扩展），继续", e.message);
  }

  // 9. 扩展 commission_recon_batches status 枚举以支持 cancelled
  try {
    await pool.query(`
      ALTER TABLE commission_recon_batches
      MODIFY COLUMN status ENUM('reconciling','reconciled','settlement_generated','paid_offline','accounted','cancelled') NOT NULL DEFAULT 'reconciling'
    `);
    console.log("  -> commission_recon_batches.status 枚举已扩展（新增 cancelled）");
  } catch (e: any) {
    console.log("  注意：扩展 batch status 时出错（可能已扩展），继续", e.message);
  }

  console.log("========== 业务抽成合同 v2 迁移完成 ==========\n");
}
