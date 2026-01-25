/**
 * 多租户数据隔离迁移脚本
 * 
 * 此脚本添加以下字段：
 * - org_units 表：type, related_entity_id
 * - funders 表：org_id
 * - financiers 表：org_id
 */

import { pool } from "../db.js";
import type { RowDataPacket } from "mysql2";

async function addColumnIfNotExists(tableName: string, columnName: string, columnDefinition: string): Promise<void> {
  try {
    const [columns] = await pool.query<RowDataPacket[]>(
      `SHOW COLUMNS FROM ${tableName} LIKE '${columnName}'`
    );
    if (columns.length === 0) {
      await pool.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
      console.log(`✓ Added column ${columnName} to ${tableName}`);
    } else {
      console.log(`- Column ${columnName} already exists in ${tableName}`);
    }
  } catch (err: any) {
    if (err.code !== 'ER_NO_SUCH_TABLE') {
      console.error(`✗ Failed to add column ${columnName} to ${tableName}:`, err.message);
    }
  }
}

async function createIndexIfNotExists(tableName: string, indexName: string, columnNames: string): Promise<void> {
  try {
    const [indexes] = await pool.query<RowDataPacket[]>(
      `SHOW INDEX FROM ${tableName} WHERE Key_name = '${indexName}'`
    );
    if (indexes.length === 0) {
      await pool.query(`CREATE INDEX ${indexName} ON ${tableName} (${columnNames})`);
      console.log(`✓ Created index ${indexName} on ${tableName}`);
    } else {
      console.log(`- Index ${indexName} already exists on ${tableName}`);
    }
  } catch (err: any) {
    if (err.code !== 'ER_NO_SUCH_TABLE') {
      console.error(`✗ Failed to create index ${indexName}:`, err.message);
    }
  }
}

export async function runMultiTenantMigration(): Promise<void> {
  console.log("=== 多租户数据隔离迁移开始 ===\n");

  // 1. 为 org_units 添加类型和关联实体字段
  console.log("1. 更新 org_units 表...");
  await addColumnIfNotExists('org_units', 'type', "VARCHAR(20) NOT NULL DEFAULT 'platform'");
  await addColumnIfNotExists('org_units', 'related_entity_id', 'VARCHAR(36) NULL');
  await createIndexIfNotExists('org_units', 'idx_org_type', 'type');
  await createIndexIfNotExists('org_units', 'idx_org_related_entity', 'related_entity_id');

  // 2. 为 funders 添加组织关联字段
  console.log("\n2. 更新 funders 表...");
  await addColumnIfNotExists('funders', 'org_id', 'VARCHAR(36) NULL');
  await createIndexIfNotExists('funders', 'idx_funders_org_id', 'org_id');

  // 3. 为 financiers 添加组织关联字段
  console.log("\n3. 更新 financiers 表...");
  await addColumnIfNotExists('financiers', 'org_id', 'VARCHAR(36) NULL');
  await createIndexIfNotExists('financiers', 'idx_financiers_org_id', 'org_id');

  console.log("\n=== 多租户数据隔离迁移完成 ===");
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  runMultiTenantMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
