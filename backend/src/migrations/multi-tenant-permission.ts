/**
 * 多方主体权限与数据隔离迁移（阶段 A 骨架）
 *
 * 只建表，不迁数据。表结构对应 PRD 「功能权限 / 数据权限 / 授权上限 / 操作日志」设计。
 * 已有表（roles, role_permissions, user_groups, group_permissions, permissions 等）不动。
 * 这些表本期作为骨架存在，业务读写将在阶段 B/C 陆续接入。
 */

import { pool } from "../db.js";
import type { RowDataPacket } from "mysql2";

async function tableExists(table: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) as cnt FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table]
  );
  return Number(rows[0]?.cnt || 0) > 0;
}

async function createIfNotExists(table: string, ddl: string): Promise<void> {
  if (await tableExists(table)) {
    console.log(`   - ${table} 已存在，跳过`);
    return;
  }
  await pool.query(ddl);
  console.log(`   ✓ ${table} 已创建`);
}

export async function runMultiTenantPermissionMigration(): Promise<void> {
  console.log("\n=== 多方主体权限迁移开始 ===");

  // 1. 功能权限目录（与现有 permissions 解耦的结构化目录）
  await createIfNotExists(
    "permission_catalog",
    `CREATE TABLE permission_catalog (
      code VARCHAR(120) NOT NULL PRIMARY KEY,
      permission_type VARCHAR(20) NOT NULL COMMENT 'menu/page/tab/action',
      module_code VARCHAR(64) NOT NULL,
      action_code VARCHAR(64),
      parent_code VARCHAR(120),
      is_builtin TINYINT(1) NOT NULL DEFAULT 0,
      description VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_permission_catalog_module (module_code),
      INDEX idx_permission_catalog_type (permission_type),
      INDEX idx_permission_catalog_parent (parent_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`
  );

  // 2. 用户功能权限微调（相对角色的 grant/revoke）
  await createIfNotExists(
    "user_permission_overrides",
    `CREATE TABLE user_permission_overrides (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      permission_code VARCHAR(120) NOT NULL,
      effect_type ENUM('grant','revoke') NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_user_perm (user_id, permission_code),
      INDEX idx_upo_user (user_id),
      INDEX idx_upo_perm (permission_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`
  );

  // 3. 数据权限模板
  await createIfNotExists(
    "data_scope_templates",
    `CREATE TABLE data_scope_templates (
      code VARCHAR(120) NOT NULL PRIMARY KEY,
      scope_name VARCHAR(120) NOT NULL,
      module_code VARCHAR(64) NOT NULL,
      scope_mode ENUM('self_only','tenant_only','tenant_and_children','tenants_specified','all_tenants') NOT NULL,
      include_child_tenants TINYINT(1) NOT NULL DEFAULT 0,
      readonly TINYINT(1) NOT NULL DEFAULT 0,
      exportable TINYINT(1) NOT NULL DEFAULT 0,
      is_builtin TINYINT(1) NOT NULL DEFAULT 0,
      remark VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_dst_module (module_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`
  );

  // 4. 用户数据权限（按模块）
  await createIfNotExists(
    "user_data_scopes",
    `CREATE TABLE user_data_scopes (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      module_code VARCHAR(64) NOT NULL,
      scope_mode ENUM('self_only','tenant_only','tenant_and_children','tenants_specified','all_tenants') NOT NULL,
      tenant_ids JSON NULL,
      include_child_tenants TINYINT(1) NOT NULL DEFAULT 0,
      readonly TINYINT(1) NOT NULL DEFAULT 0,
      exportable TINYINT(1) NOT NULL DEFAULT 0,
      template_code VARCHAR(120),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_user_module (user_id, module_code),
      INDEX idx_uds_user (user_id),
      INDEX idx_uds_module (module_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`
  );

  // 5. 授权上限（管理员可向下分发的最大边界）
  await createIfNotExists(
    "grant_boundaries",
    `CREATE TABLE grant_boundaries (
      user_id VARCHAR(36) PRIMARY KEY,
      grantable_permission_codes JSON NULL,
      grantable_scope_modes JSON NULL,
      grantable_tenant_ids JSON NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`
  );

  // 6. 操作日志
  await createIfNotExists(
    "operation_logs",
    `CREATE TABLE operation_logs (
      id VARCHAR(36) PRIMARY KEY,
      operator_user_id VARCHAR(36),
      operator_tenant_id VARCHAR(36),
      target_type VARCHAR(64),
      target_id VARCHAR(120),
      action VARCHAR(120) NOT NULL,
      before_snapshot JSON NULL,
      after_snapshot JSON NULL,
      is_sensitive TINYINT(1) NOT NULL DEFAULT 0,
      confirmed TINYINT(1) NOT NULL DEFAULT 0,
      ip VARCHAR(64),
      ua VARCHAR(255),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_oplog_operator (operator_user_id),
      INDEX idx_oplog_tenant (operator_tenant_id),
      INDEX idx_oplog_action (action),
      INDEX idx_oplog_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`
  );

  console.log("=== 多方主体权限迁移完成 ===\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMultiTenantPermissionMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
