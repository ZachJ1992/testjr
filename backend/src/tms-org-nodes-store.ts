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
