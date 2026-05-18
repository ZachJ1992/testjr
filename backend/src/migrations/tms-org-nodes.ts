/**
 * TMS 网点字典与 routes / waybills 关联字段迁移
 */

import { pool } from "../db.js";

async function tableExists(table: string): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return (rows as any[]).length > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return (rows as any[]).length > 0;
}

async function indexExists(table: string, indexName: string): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName]
  );
  return (rows as any[]).length > 0;
}

export async function runTmsOrgNodesMigration(): Promise<void> {
  console.log("[Migration] TMS 网点字典迁移 开始...");

  // Step 1: 创建 tms_org_nodes 表
  try {
    if (!(await tableExists("tms_org_nodes"))) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tms_org_nodes (
          id VARCHAR(36) PRIMARY KEY,
          tms_source VARCHAR(50) NOT NULL COMMENT 'TMS 来源标识，如 yaoqianshu',
          node_id VARCHAR(50) NOT NULL COMMENT 'TMS 内部稳定 ID（来自 orgList.id）',
          node_name VARCHAR(255) NOT NULL COMMENT '当前完整名称（company_name）',
          short_name VARCHAR(255) NULL COMMENT '当前简称（short_name）',
          company_code VARCHAR(50) NULL COMMENT 'TMS 中可见的核算代码',
          account_code VARCHAR(50) NULL COMMENT '账户代码',
          parent_node_id VARCHAR(50) NULL COMMENT '上级网点 node_id（来自 sup_id）',
          node_type VARCHAR(20) NULL COMMENT 'TMS 节点类型 type：2=职能机构 3=网点 4=货站 5=分拨中心 6=冻结网点 7=车队 8=仓库 9=专线 10=三方',
          property VARCHAR(20) NULL COMMENT '属性 property：1=自营 2=加盟',
          state VARCHAR(20) NULL COMMENT '状态 state：0=删除 1=未激活 2=启用 3=停用',
          province VARCHAR(100) NULL,
          city VARCHAR(100) NULL,
          raw JSON NULL COMMENT '原始字段保留，便于后续扩展',
          name_history JSON NULL COMMENT '历史曾用名 [{name, changed_at}]',
          first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uk_tms_source_node_id (tms_source, node_id),
          KEY idx_node_name (node_name),
          KEY idx_short_name (short_name),
          KEY idx_parent (tms_source, parent_node_id),
          KEY idx_state (tms_source, state)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
          COMMENT='TMS 网点（组织架构）字典，关联键 tms_source+node_id'
      `);
      console.log("[Migration] 创建表 tms_org_nodes");
    } else {
      console.log("[Migration] 表 tms_org_nodes 已存在，跳过");
    }
  } catch (err: any) {
    console.error(`[Migration] Step 1 失败: ${err.message}`);
  }

  // Step 2: routes 加 tms_source
  try {
    if (!(await columnExists("routes", "tms_source"))) {
      await pool.query(
        `ALTER TABLE routes ADD COLUMN tms_source VARCHAR(50) NULL COMMENT 'TMS 来源；为空表示该线路非自动同步'`
      );
      console.log("[Migration] routes 新增 tms_source");
    } else {
      console.log("[Migration] routes.tms_source 已存在，跳过");
    }
  } catch (err: any) {
    console.error(`[Migration] Step 2 失败: ${err.message}`);
  }

  // Step 3: routes 加 tms_node_id
  try {
    if (!(await columnExists("routes", "tms_node_id"))) {
      await pool.query(
        `ALTER TABLE routes ADD COLUMN tms_node_id VARCHAR(50) NULL COMMENT '关联 tms_org_nodes.node_id'`
      );
      console.log("[Migration] routes 新增 tms_node_id");
    } else {
      console.log("[Migration] routes.tms_node_id 已存在，跳过");
    }
  } catch (err: any) {
    console.error(`[Migration] Step 3 失败: ${err.message}`);
  }

  // Step 4: routes 加 idx_routes_tms
  try {
    if (!(await indexExists("routes", "idx_routes_tms"))) {
      await pool.query(
        `ALTER TABLE routes ADD INDEX idx_routes_tms (tms_source, tms_node_id)`
      );
      console.log("[Migration] routes 新增索引 idx_routes_tms");
    } else {
      console.log("[Migration] routes 索引 idx_routes_tms 已存在，跳过");
    }
  } catch (err: any) {
    console.error(`[Migration] Step 4 失败: ${err.message}`);
  }

  // Step 5: waybills 加 tms_source
  try {
    if (!(await columnExists("waybills", "tms_source"))) {
      await pool.query(
        `ALTER TABLE waybills ADD COLUMN tms_source VARCHAR(50) NULL COMMENT '运单来源 TMS'`
      );
      console.log("[Migration] waybills 新增 tms_source");
    } else {
      console.log("[Migration] waybills.tms_source 已存在，跳过");
    }
  } catch (err: any) {
    console.error(`[Migration] Step 5 失败: ${err.message}`);
  }

  // Step 6: waybills 加 tms_branch_node_id
  try {
    if (!(await columnExists("waybills", "tms_branch_node_id"))) {
      await pool.query(
        `ALTER TABLE waybills ADD COLUMN tms_branch_node_id VARCHAR(50) NULL COMMENT '该运单业务归属网点 node_id（如摇钱树的 bsc_company_id）'`
      );
      console.log("[Migration] waybills 新增 tms_branch_node_id");
    } else {
      console.log("[Migration] waybills.tms_branch_node_id 已存在，跳过");
    }
  } catch (err: any) {
    console.error(`[Migration] Step 6 失败: ${err.message}`);
  }

  // Step 7: waybills 加 idx_waybills_tms_branch
  try {
    if (!(await indexExists("waybills", "idx_waybills_tms_branch"))) {
      await pool.query(
        `ALTER TABLE waybills ADD INDEX idx_waybills_tms_branch (tms_source, tms_branch_node_id)`
      );
      console.log("[Migration] waybills 新增索引 idx_waybills_tms_branch");
    } else {
      console.log("[Migration] waybills 索引 idx_waybills_tms_branch 已存在，跳过");
    }
  } catch (err: any) {
    console.error(`[Migration] Step 7 失败: ${err.message}`);
  }

  console.log("[Migration] TMS 网点字典迁移 完成");
}
