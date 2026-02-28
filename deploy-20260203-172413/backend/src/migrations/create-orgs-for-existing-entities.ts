/**
 * 为现有的资金方和融资方创建对应的组织
 * 
 * 此脚本会：
 * 1. 查询所有没有组织关联的资金方，为其创建组织
 * 2. 查询所有没有组织关联的融资方，为其创建组织
 */

import { randomUUID } from "crypto";
import { pool } from "../db.js";
import type { RowDataPacket } from "mysql2";

interface FunderRow extends RowDataPacket {
  id: string;
  institution_name: string;
  org_id: string | null;
}

interface FinancierRow extends RowDataPacket {
  id: string;
  enterprise_name: string;
  org_id: string | null;
}

export async function createOrgsForExistingEntities(): Promise<void> {
  console.log("=== 为现有资金方和融资方创建组织 ===\n");

  // 1. 为资金方创建组织
  console.log("1. 处理资金方...");
  const [funders] = await pool.query<FunderRow[]>(
    `SELECT id, institution_name, org_id FROM funders WHERE deleted_at IS NULL`
  );
  
  let funderCount = 0;
  for (const funder of funders) {
    if (funder.org_id) {
      console.log(`   - 资金方 "${funder.institution_name}" 已有组织，跳过`);
      continue;
    }
    
    // 创建组织
    const orgId = randomUUID();
    await pool.query(
      `INSERT INTO org_units (id, name, type, related_entity_id, is_active) VALUES (?, ?, ?, ?, ?)`,
      [orgId, funder.institution_name, "funder", funder.id, 1]
    );
    
    // 更新资金方的 org_id
    await pool.query(
      `UPDATE funders SET org_id = ? WHERE id = ?`,
      [orgId, funder.id]
    );
    
    console.log(`   ✓ 为资金方 "${funder.institution_name}" 创建组织 (${orgId})`);
    funderCount++;
  }
  console.log(`   共为 ${funderCount} 个资金方创建了组织\n`);

  // 2. 为融资方创建组织
  console.log("2. 处理融资方...");
  const [financiers] = await pool.query<FinancierRow[]>(
    `SELECT id, enterprise_name, org_id FROM financiers WHERE deleted_at IS NULL`
  );
  
  let financierCount = 0;
  for (const financier of financiers) {
    if (financier.org_id) {
      console.log(`   - 融资方 "${financier.enterprise_name}" 已有组织，跳过`);
      continue;
    }
    
    // 创建组织
    const orgId = randomUUID();
    await pool.query(
      `INSERT INTO org_units (id, name, type, related_entity_id, is_active) VALUES (?, ?, ?, ?, ?)`,
      [orgId, financier.enterprise_name, "financier", financier.id, 1]
    );
    
    // 更新融资方的 org_id
    await pool.query(
      `UPDATE financiers SET org_id = ? WHERE id = ?`,
      [orgId, financier.id]
    );
    
    console.log(`   ✓ 为融资方 "${financier.enterprise_name}" 创建组织 (${orgId})`);
    financierCount++;
  }
  console.log(`   共为 ${financierCount} 个融资方创建了组织\n`);

  // 3. 确保有一个平台根组织
  console.log("3. 检查平台根组织...");
  const [platformOrgs] = await pool.query<RowDataPacket[]>(
    `SELECT id, name FROM org_units WHERE type = 'platform' AND deleted_at IS NULL LIMIT 1`
  );
  
  if (platformOrgs.length === 0) {
    // 检查是否有 Root 组织
    const [rootOrgs] = await pool.query<RowDataPacket[]>(
      `SELECT id, name FROM org_units WHERE name = 'Root' AND deleted_at IS NULL LIMIT 1`
    );
    
    if (rootOrgs.length > 0) {
      // 将 Root 组织设置为平台类型
      await pool.query(
        `UPDATE org_units SET type = 'platform' WHERE id = ?`,
        [rootOrgs[0].id]
      );
      console.log(`   ✓ 将 "Root" 组织设置为平台类型`);
    } else {
      // 创建平台根组织
      const platformOrgId = randomUUID();
      await pool.query(
        `INSERT INTO org_units (id, name, type, is_active) VALUES (?, ?, ?, ?)`,
        [platformOrgId, "平台总部", "platform", 1]
      );
      console.log(`   ✓ 创建平台根组织 "平台总部" (${platformOrgId})`);
    }
  } else {
    console.log(`   - 平台组织已存在: "${platformOrgs[0].name}"`);
  }

  console.log("\n=== 组织创建完成 ===");
  
  // 4. 输出统计信息
  console.log("\n=== 组织统计 ===");
  const [stats] = await pool.query<RowDataPacket[]>(`
    SELECT type, COUNT(*) as count 
    FROM org_units 
    WHERE deleted_at IS NULL 
    GROUP BY type
  `);
  
  for (const stat of stats) {
    const typeLabel = stat.type === 'platform' ? '平台' : 
                      stat.type === 'funder' ? '资金方' : 
                      stat.type === 'financier' ? '融资方' : stat.type;
    console.log(`   ${typeLabel}: ${stat.count} 个组织`);
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  createOrgsForExistingEntities()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
