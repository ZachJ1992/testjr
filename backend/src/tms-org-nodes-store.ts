/**
 * TMS 网点字典查询（tms_org_nodes）
 */

import { pool } from "./db.js";
import type { RowDataPacket } from "mysql2";

const NODE_TYPE_LABELS: Record<string, string> = {
  "1": "总部",
  "2": "职能机构",
  "3": "网点",
  "4": "货站",
  "5": "分拨中心",
  "6": "冻结网点",
  "7": "车队",
  "8": "仓库",
  "9": "专线",
  "10": "三方",
};

const PROPERTY_LABELS: Record<string, string> = { "1": "自营", "2": "加盟" };

const STATE_LABELS: Record<string, string> = {
  "0": "删除",
  "1": "未激活",
  "2": "启用",
  "3": "停用",
};

/** 与 GET /api/tms-org-nodes 单条 items 元素一致 */
export interface TmsOrgNodeRow {
  id: string;
  tmsSource: string;
  nodeId: string;
  nodeName: string;
  shortName?: string;
  companyCode?: string;
  accountCode?: string;
  nodeType?: string;
  nodeTypeLabel?: string;
  property?: string;
  propertyLabel?: string;
  state?: string;
  stateLabel?: string;
  parentNodeId?: string;
  province?: string;
  city?: string;
}

function mapRow(row: RowDataPacket): TmsOrgNodeRow {
  const nodeType = row.node_type ?? undefined;
  const property = row.property ?? undefined;
  const state = row.state ?? undefined;
  return {
    id: row.id,
    tmsSource: row.tms_source,
    nodeId: row.node_id,
    nodeName: row.node_name,
    shortName: row.short_name ?? undefined,
    companyCode: row.company_code ?? undefined,
    accountCode: row.account_code ?? undefined,
    nodeType,
    nodeTypeLabel: nodeType ? NODE_TYPE_LABELS[nodeType] : undefined,
    property,
    propertyLabel: property ? PROPERTY_LABELS[property] : undefined,
    state,
    stateLabel: state ? STATE_LABELS[state] : undefined,
    parentNodeId: row.parent_node_id ?? undefined,
    province: row.province ?? undefined,
    city: row.city ?? undefined,
  };
}

function buildWhereClause(params: {
  tmsSource?: string;
  state?: string;
  nodeType?: string;
  keyword?: string;
}): { sql: string; vals: unknown[] } {
  const parts: string[] = ["1=1"];
  const vals: unknown[] = [];

  if (params.tmsSource?.trim()) {
    parts.push("tms_source = ?");
    vals.push(params.tmsSource.trim());
  }

  let st = params.state?.trim();
  if (!st) {
    st = "2";
  }
  if (st !== "all") {
    parts.push("state = ?");
    vals.push(st);
  }

  if (params.nodeType?.trim()) {
    parts.push("FIND_IN_SET(node_type, ?)");
    vals.push(params.nodeType.trim());
  }

  const kw = params.keyword?.trim();
  if (kw) {
    const like = `%${kw}%`;
    parts.push("(node_name LIKE ? OR short_name LIKE ? OR company_code LIKE ?)");
    vals.push(like, like, like);
  }

  return { sql: parts.join(" AND "), vals };
}

export async function getTmsOrgNodes(params: {
  tmsSource?: string;
  state?: string;
  nodeType?: string;
  keyword?: string;
  pageSize?: number;
}): Promise<{ items: TmsOrgNodeRow[]; total: number }> {
  const pageSize = Math.min(500, Math.max(1, params.pageSize ?? 200));
  const { sql: whereSql, vals: whereVals } = buildWhereClause(params);

  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM tms_org_nodes WHERE ${whereSql}`,
    [...whereVals]
  );
  const total = Number(countRows[0]?.cnt ?? 0);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, tms_source, node_id, node_name, short_name, company_code, account_code,
            parent_node_id, node_type, property, state, province, city
     FROM tms_org_nodes
     WHERE ${whereSql}
     ORDER BY
       CASE state WHEN '2' THEN 0 ELSE 1 END,
       CASE node_type WHEN '9' THEN 0 WHEN '3' THEN 1 WHEN '10' THEN 2 ELSE 3 END,
       short_name
     LIMIT ?`,
    [...whereVals, pageSize]
  );

  return { items: rows.map(mapRow), total };
}

export async function checkTmsNodeExists(tmsSource: string, nodeId: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 FROM tms_org_nodes WHERE tms_source = ? AND node_id = ? LIMIT 1`,
    [tmsSource, nodeId]
  );
  return rows.length > 0;
}

/**
 * 查找某个 name 在指定 TMS 字典里唯一精确匹配的启用网点（state=2）。
 * 命中条件：短名 (short_name) 或全名 (node_name) 与 name 严格相等，且全字典内此 name 唯一对应一个 node_id。
 * 用于「按名字自动绑定 routes.tms_node_id」的场景。
 */
export async function findUniqueTmsNodeByName(
  tmsSource: string,
  name: string
): Promise<{ nodeId: string; nodeName: string } | undefined> {
  const trimmed = String(name || "").trim();
  if (!trimmed) return undefined;
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT node_id, node_name
     FROM tms_org_nodes
     WHERE tms_source = ?
       AND state = '2'
       AND (short_name = ? OR node_name = ?)`,
    [tmsSource, trimmed, trimmed]
  );
  if (rows.length !== 1) return undefined;
  return {
    nodeId: String(rows[0].node_id),
    nodeName: String(rows[0].node_name),
  };
}

/**
 * 全量扫描 routes，找出所有「tms_node_id 为空、name 在某 TMS 字典里唯一精确匹配」的活跃记录，
 * 一次性回写 tms_source + tms_node_id。
 *
 * 注意：
 * - 仅作用于 routes.tms_node_id IS NULL 的活跃线路，绝不会覆盖已有绑定。
 * - 借助 SQL 自连接的 NOT EXISTS 排除歧义（一个 name 对应字典里多个 node_id 时跳过）。
 * - 用于摇钱树同步组织树后的「字典刷新 → 反向自动绑定」补偿。
 *
 * @returns 本次新增绑定的 routes 条数
 */
export async function autoBindRoutesByName(tmsSource: string): Promise<number> {
  const src = String(tmsSource || "").trim();
  if (!src) return 0;
  const [result] = await pool.query<RowDataPacket[] & { affectedRows: number }>(
    `UPDATE routes r
     JOIN tms_org_nodes o
       ON o.tms_source = ?
      AND o.state = '2'
      AND (o.short_name = r.name OR o.node_name = r.name)
     SET r.tms_source = o.tms_source,
         r.tms_node_id = o.node_id,
         r.updated_at = NOW()
     WHERE r.status = 'active'
       AND r.tms_node_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM tms_org_nodes o2
         WHERE o2.tms_source = o.tms_source
           AND o2.state = '2'
           AND (o2.short_name = r.name OR o2.node_name = r.name)
           AND o2.node_id <> o.node_id
       )`,
    [src]
  );
  const affected = Number((result as any)?.affectedRows ?? 0);
  return affected;
}
