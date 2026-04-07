/**
 * 对账批次 CRUD & 状态机
 */

import { pool } from "./db.js";
import { randomUUID } from "crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import type { ReconBatch, ReconBatchStatus } from "./types.js";

function generateBatchNumber(): string {
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rand = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `RB${ts}${rand}`;
}

function mapRow(row: RowDataPacket): ReconBatch {
  return {
    id: row.id,
    batchNumber: row.batch_number,
    contractId: row.contract_id,
    financierId: row.financier_id ?? undefined,
    financierName: row.financier_name ?? undefined,
    areaName: row.area_name ?? undefined,
    localPartnerName: row.local_partner_name ?? undefined,
    periodStart: typeof row.period_start === "object" ? (row.period_start as Date).toISOString().split("T")[0] : String(row.period_start).split("T")[0],
    periodEnd: typeof row.period_end === "object" ? (row.period_end as Date).toISOString().split("T")[0] : String(row.period_end).split("T")[0],
    totalAmount: Number(row.total_amount),
    itemCount: Number(row.item_count),
    status: row.status as ReconBatchStatus,
    settlementId: row.settlement_id ?? undefined,
    exportUrl: row.export_url ?? undefined,
    paymentProofUrl: row.payment_proof_url ?? undefined,
    remark: row.remark ?? undefined,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

// ---------- 查询 ----------

export async function getReconBatches(filters?: {
  contractId?: string;
  financierId?: string;
  areaId?: string;
  status?: ReconBatchStatus;
  startDate?: string;
  endDate?: string;
}): Promise<ReconBatch[]> {
  let sql = `SELECT b.*, GROUP_CONCAT(DISTINCT lp.name SEPARATOR '、') as local_partner_name,
                    GROUP_CONCAT(DISTINCT ar.name SEPARATOR '、') as area_name
    FROM commission_recon_batches b
    LEFT JOIN contract_routes cr ON b.contract_id = cr.contract_id
    LEFT JOIN routes rt ON cr.route_id = rt.id
    LEFT JOIN local_partners lp ON rt.local_partner_id = lp.id
    LEFT JOIN areas ar ON lp.area_id = ar.id
    WHERE 1=1`;
  const vals: any[] = [];

  if (filters?.contractId) { sql += " AND b.contract_id = ?"; vals.push(filters.contractId); }
  if (filters?.financierId) { sql += " AND b.financier_id = ?"; vals.push(filters.financierId); }
  if (filters?.areaId) { sql += " AND lp.area_id = ?"; vals.push(filters.areaId); }
  if (filters?.status) { sql += " AND b.status = ?"; vals.push(filters.status); }
  if (filters?.startDate) { sql += " AND b.period_start >= ?"; vals.push(filters.startDate); }
  if (filters?.endDate) { sql += " AND b.period_end <= ?"; vals.push(filters.endDate); }

  sql += " GROUP BY b.id ORDER BY b.created_at DESC";
  const [rows] = await pool.query<RowDataPacket[]>(sql, vals);
  return rows.map(mapRow);
}

export async function getReconBatchById(id: string): Promise<ReconBatch | undefined> {
  const [rows] = await pool.query<RowDataPacket[]>("SELECT * FROM commission_recon_batches WHERE id = ?", [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

// ---------- 创建对账批次 ----------

export async function createReconBatch(input: {
  contractId: string;
  financierId?: string;
  financierName?: string;
  periodStart: string;
  periodEnd: string;
  revenueRecordIds: string[];
  remark?: string;
}): Promise<ReconBatch> {
  const id = randomUUID();
  const batchNumber = generateBatchNumber();

  // 计算选中收益的合计
  const placeholders = input.revenueRecordIds.map(() => "?").join(",");
  const [amountRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS total
     FROM revenue_records
     WHERE id IN (${placeholders}) AND record_type = 'revenue'`,
    input.revenueRecordIds
  );
  const totalAmount = Number(amountRows[0]?.total || 0);
  const itemCount = Number(amountRows[0]?.cnt || 0);

  await pool.query(
    `INSERT INTO commission_recon_batches
     (id, batch_number, contract_id, financier_id, financier_name, period_start, period_end, total_amount, item_count, status, remark)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'reconciling', ?)`,
    [id, batchNumber, input.contractId, input.financierId || null, input.financierName || null,
     input.periodStart, input.periodEnd, totalAmount, itemCount, input.remark || null]
  );

  // 插入明细
  for (const rrId of input.revenueRecordIds) {
    await pool.query(
      "INSERT INTO commission_recon_items (id, batch_id, revenue_record_id) VALUES (?, ?, ?)",
      [randomUUID(), id, rrId]
    );
  }

  // 把对应收益记录标记为 reconciling
  await pool.query(
    `UPDATE revenue_records SET status = 'reconciling', updated_at = NOW() WHERE id IN (${placeholders})`,
    input.revenueRecordIds
  );

  return (await getReconBatchById(id))!;
}

// ---------- 状态流转 ----------

const VALID_TRANSITIONS: Record<string, string[]> = {
  reconciling: ["reconciled", "cancelled"],
  reconciled: ["settlement_generated", "cancelled"],
  settlement_generated: ["paid_offline"],
  paid_offline: ["accounted"],
};

async function transition(id: string, targetStatus: ReconBatchStatus, extra?: Record<string, any>): Promise<ReconBatch> {
  const batch = await getReconBatchById(id);
  if (!batch) throw new Error("对账批次不存在");

  const allowed = VALID_TRANSITIONS[batch.status];
  if (!allowed || !allowed.includes(targetStatus)) {
    throw new Error(`无法从 ${batch.status} 转换到 ${targetStatus}`);
  }

  const sets = ["status = ?", "updated_at = NOW()"];
  const vals: any[] = [targetStatus];

  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      sets.push(`${k} = ?`);
      vals.push(v);
    }
  }
  vals.push(id);
  await pool.query(`UPDATE commission_recon_batches SET ${sets.join(", ")} WHERE id = ?`, vals);

  // 同步更新关联收益记录状态
  const revenueStatus = targetStatus === "accounted" ? "accounted"
    : targetStatus === "reconciled" ? "reconciled"
    : targetStatus === "settlement_generated" ? "settled"
    : undefined;

  if (revenueStatus) {
    await pool.query(
      `UPDATE revenue_records rr
       JOIN commission_recon_items cri ON cri.revenue_record_id = rr.id
       SET rr.status = ?, rr.updated_at = NOW()
       WHERE cri.batch_id = ?`,
      [revenueStatus, id]
    );
  }

  return (await getReconBatchById(id))!;
}

export async function markReconciled(id: string): Promise<ReconBatch> {
  return transition(id, "reconciled");
}

export async function generateSettlementForBatch(id: string, settlementId: string): Promise<ReconBatch> {
  return transition(id, "settlement_generated", { settlement_id: settlementId });
}

export async function markPaidOffline(id: string, paymentProofUrl?: string): Promise<ReconBatch> {
  return transition(id, "paid_offline", paymentProofUrl ? { payment_proof_url: paymentProofUrl } : undefined);
}

export async function markAccounted(id: string): Promise<ReconBatch> {
  return transition(id, "accounted");
}

// ---------- 取消对账批次（退回） ----------

export async function cancelReconBatch(id: string): Promise<ReconBatch> {
  const batch = await getReconBatchById(id);
  if (!batch) throw new Error("对账批次不存在");

  const allowed = VALID_TRANSITIONS[batch.status];
  if (!allowed || !allowed.includes("cancelled")) {
    throw new Error(`当前状态 ${batch.status} 无法取消，已生成结算单后不可取消`);
  }

  await pool.query(
    `UPDATE commission_recon_batches SET status = 'cancelled', updated_at = NOW() WHERE id = ?`,
    [id]
  );

  // 将关联的收益记录状态回退为 confirmed
  await pool.query(
    `UPDATE revenue_records rr
     JOIN commission_recon_items cri ON cri.revenue_record_id = rr.id
     SET rr.status = 'confirmed', rr.updated_at = NOW()
     WHERE cri.batch_id = ?`,
    [id]
  );

  return (await getReconBatchById(id))!;
}

// ---------- 获取批次关联的收益记录 ----------

export async function getBatchRevenueRecordIds(batchId: string): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT revenue_record_id FROM commission_recon_items WHERE batch_id = ?",
    [batchId]
  );
  return rows.map(r => r.revenue_record_id);
}

export async function getBatchRevenueRecords(batchId: string): Promise<RowDataPacket[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT rr.*, w.vehicle_plate, w.driver_name, w.sub_financier,
            lp.name as local_partner_name, rt.name as route_name
     FROM revenue_records rr
     JOIN commission_recon_items cri ON cri.revenue_record_id = rr.id
     LEFT JOIN waybills w ON rr.waybill_id = w.id
     LEFT JOIN routes rt ON rr.route_id = rt.id
     LEFT JOIN local_partners lp ON rt.local_partner_id = lp.id
     WHERE cri.batch_id = ?
     ORDER BY rr.revenue_date DESC`,
    [batchId]
  );
  return rows;
}

// ---------- 对账统计 ----------

export async function getReconStats(): Promise<{
  totalRevenue: number;
  pendingAmount: number;
  accountedAmount: number;
}> {
  const [rows] = await pool.query<RowDataPacket[]>(`
    SELECT
      COALESCE(SUM(amount), 0) AS total_revenue,
      COALESCE(SUM(CASE WHEN status NOT IN ('settled', 'accounted') THEN amount ELSE 0 END), 0) AS pending_amount,
      COALESCE(SUM(CASE WHEN status IN ('settled', 'accounted') THEN amount ELSE 0 END), 0) AS accounted_amount
    FROM revenue_records
    WHERE record_type = 'revenue'
      AND source_type = 'waybill_commission'
  `);
  return {
    totalRevenue: Number(rows[0]?.total_revenue || 0),
    pendingAmount: Number(rows[0]?.pending_amount || 0),
    accountedAmount: Number(rows[0]?.accounted_amount || 0),
  };
}
