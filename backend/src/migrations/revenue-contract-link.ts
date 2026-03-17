/**
 * 运单合同关联迁移
 * 
 * 1. 存量运单 branch 为空时用 sub_financier 回填
 * 2. revenue_records 新增 commission_contract_id 和 route_id 字段
 * 3. 存量收益记录通过 waybill.branch → routes.name → contract_routes 回填
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

export async function runRevenueContractLinkMigration(): Promise<void> {
  console.log("[Migration] 运单合同关联迁移 开始...");

  // Step 1: 回填 waybills.branch
  try {
    const [result] = await pool.query(
      `UPDATE waybills 
       SET branch = sub_financier 
       WHERE (branch IS NULL OR branch = '') 
         AND sub_financier IS NOT NULL AND sub_financier != ''
         AND deleted_at IS NULL`
    );
    console.log(`[Migration] 运单 branch 回填完成, 影响行数: ${(result as any).affectedRows}`);
  } catch (err: any) {
    console.error(`[Migration] 运单 branch 回填失败: ${err.message}`);
  }

  // Step 2: revenue_records 新增 commission_contract_id
  if (!(await columnExists("revenue_records", "commission_contract_id"))) {
    try {
      await pool.query(
        `ALTER TABLE revenue_records ADD COLUMN commission_contract_id VARCHAR(36) NULL`
      );
      console.log("[Migration] revenue_records 新增 commission_contract_id 列");
    } catch (err: any) {
      console.error(`[Migration] 新增 commission_contract_id 失败: ${err.message}`);
    }
  }

  // Step 3: revenue_records 新增 route_id
  if (!(await columnExists("revenue_records", "route_id"))) {
    try {
      await pool.query(
        `ALTER TABLE revenue_records ADD COLUMN route_id VARCHAR(36) NULL`
      );
      console.log("[Migration] revenue_records 新增 route_id 列");
    } catch (err: any) {
      console.error(`[Migration] 新增 route_id 失败: ${err.message}`);
    }
  }

  // Step 4: 存量收益记录回填 commission_contract_id 和 route_id
  try {
    const [records] = await pool.query<any[]>(
      `SELECT rr.id, rr.waybill_id
       FROM revenue_records rr
       WHERE rr.source_type = 'waybill_commission'
         AND rr.commission_contract_id IS NULL
         AND rr.waybill_id IS NOT NULL`
    );

    if (records.length > 0) {
      console.log(`[Migration] 需要回填的收益记录数: ${records.length}`);
      let updated = 0;

      for (const record of records) {
        const [waybills] = await pool.query<any[]>(
          `SELECT branch FROM waybills WHERE id = ?`,
          [record.waybill_id]
        );

        if (waybills.length === 0 || !waybills[0].branch) continue;

        const branch = waybills[0].branch;

        const [routes] = await pool.query<any[]>(
          `SELECT r.id as route_id, cr.contract_id
           FROM routes r
           JOIN contract_routes cr ON r.id = cr.route_id
           WHERE r.name = ? AND r.status = 'active'
           LIMIT 1`,
          [branch]
        );

        if (routes.length > 0) {
          await pool.query(
            `UPDATE revenue_records 
             SET commission_contract_id = ?, route_id = ?
             WHERE id = ?`,
            [routes[0].contract_id, routes[0].route_id, record.id]
          );
          updated++;
        }
      }

      console.log(`[Migration] 收益记录回填完成, 成功回填: ${updated}/${records.length}`);
    } else {
      console.log("[Migration] 无需回填的收益记录");
    }
  } catch (err: any) {
    console.error(`[Migration] 收益记录回填失败: ${err.message}`);
  }

  console.log("[Migration] 运单合同关联迁移 完成");
}
