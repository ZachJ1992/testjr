/**
 * 历史运单：按 branch ↔ tms_org_nodes.short_name 回填 tms_source / tms_branch_node_id（融满 yaoqianshu）
 */

import { pool } from "../db.js";
import { RowDataPacket, ResultSetHeader } from "mysql2";

export async function backfillWaybillsTmsNode(): Promise<void> {
  console.log("[Migration] 运单 TMS 网点回填 开始...");

  const [[dictRow]] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM tms_org_nodes WHERE tms_source = ?`,
    ["yaoqianshu"]
  );
  const dictCount = Number(dictRow?.cnt ?? 0);
  if (dictCount === 0) {
    console.log("[Migration] yaoqianshu 网点字典为空，跳过");
    console.log("[Migration] 运单 TMS 网点回填 完成");
    return;
  }

  const [extRows] = await pool.query<RowDataPacket[]>(
    `SELECT financier_id FROM financier_external_systems
     WHERE crawler_type = ? AND deleted_at IS NULL
     LIMIT 1`,
    ["yaoqianshu"]
  );
  if (extRows.length === 0) {
    console.log("[Migration] 未配置 yaoqianshu 融资方，跳过");
    console.log("[Migration] 运单 TMS 网点回填 完成");
    return;
  }

  const financierId = String(extRows[0].financier_id);

  const [finRows] = await pool.query<RowDataPacket[]>(
    `SELECT enterprise_name FROM financiers WHERE id = ? AND deleted_at IS NULL`,
    [financierId]
  );
  const financierName =
    finRows.length > 0 && finRows[0].enterprise_name != null
      ? String(finRows[0].enterprise_name)
      : "(unknown)";

  console.log(`[Migration] yaoqianshu 网点字典: ${dictCount} 条`);
  console.log(`[Migration] 融资方: ${financierName} (id=${financierId})`);

  const [[unfilledRow]] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM waybills
     WHERE deleted_at IS NULL AND customer_id = ? AND tms_branch_node_id IS NULL`,
    [financierId]
  );
  const unfilled = Number(unfilledRow?.cnt ?? 0);
  if (unfilled === 0) {
    console.log("[Migration] 无需回填，跳过");
    console.log("[Migration] 运单 TMS 网点回填 完成");
    return;
  }

  const [updateResult] = await pool.query<ResultSetHeader>(
    `UPDATE waybills w
     INNER JOIN tms_org_nodes o
       ON o.tms_source = ? AND o.short_name = w.branch
     SET w.tms_source = ?,
         w.tms_branch_node_id = o.node_id,
         w.updated_at = NOW()
     WHERE w.customer_id = ?
       AND w.deleted_at IS NULL
       AND w.tms_branch_node_id IS NULL
       AND w.branch IS NOT NULL AND w.branch <> ''`,
    ["yaoqianshu", "yaoqianshu", financierId]
  );

  const updated = Number(updateResult.affectedRows ?? 0);
  console.log(`[Migration] 回填运单数: ${updated}`);

  const [[distinctRow]] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(DISTINCT w.branch) AS cnt
     FROM waybills w
     WHERE w.deleted_at IS NULL
       AND w.customer_id = ?
       AND w.tms_branch_node_id IS NULL
       AND w.branch IS NOT NULL AND w.branch <> ''`,
    [financierId]
  );
  const unmatchedDistinct = Number(distinctRow?.cnt ?? 0);

  const [branchRows] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT w.branch AS branch_name
     FROM waybills w
     WHERE w.deleted_at IS NULL
       AND w.customer_id = ?
       AND w.tms_branch_node_id IS NULL
       AND w.branch IS NOT NULL AND w.branch <> ''
     ORDER BY branch_name
     LIMIT 10`,
    [financierId]
  );
  const sample = branchRows
    .map((r) => (r.branch_name != null ? String(r.branch_name) : ""))
    .filter((b) => b.length > 0);

  console.log(
    `[Migration] 仍未匹配的 branch 名: ${unmatchedDistinct} 个，前 10 个: [` +
      sample.map((b) => `"${b}"`).join(", ") +
      `]`
  );
  console.log("[Migration] 运单 TMS 网点回填 完成");
}
