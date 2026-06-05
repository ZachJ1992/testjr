/**
 * 业务抽成合同 v2 — 落地合作方 / 线路 / 合同-线路关联 CRUD
 */

import { pool } from "./db.js";
import { randomUUID } from "crypto";
import type { RowDataPacket } from "mysql2";
import type { Area, LocalPartner, Route, ContractRoute } from "./types.js";
import { findUniqueTmsNodeByName } from "./tms-org-nodes-store.js";

/**
 * 摇钱树是目前我们唯一同步组织树的 TMS，新建/改名 routes 时若调用方未显式提供
 * tmsNodeId，则默认按 'yaoqianshu' 字典做唯一名字精确匹配的自动绑定。
 * 后续接入其它 TMS 同步时可改为配置项。
 */
const DEFAULT_AUTO_BIND_TMS_SOURCE = "yaoqianshu";

/**
 * 接入了 TMS 组织树同步的 financier 名单，只有这些 financier 下的 routes 才参与 TMS 绑定状态展示。
 * 未接入的 financier（如金罗），routes 的 tmsBindingStatus 直接返回 undefined，
 * UI 不再显示"未匹配"的红色误报。
 *
 * 新接入其它 TMS 时在此添加对应 financier 的 enterprise_name 即可。
 */
const TMS_BINDING_ENABLED_FINANCIERS = new Set<string>(["融满"]);

/**
 * 即使 financier 接入了 TMS，但部分区域的运单来自其它系统（如临沂走 56qqt 不走摇钱树），
 * 字典里永远查不到对应网点，这些区域下的 routes 同样不参与 TMS 绑定状态展示。
 * 列出需要豁免的 area_name 即可。
 */
const TMS_BINDING_DISABLED_AREAS = new Set<string>(["临沂融满"]);

// =============================================
// 区域 (Areas)
// =============================================

function mapAreaRow(row: RowDataPacket): Area {
  return {
    id: row.id,
    name: row.name,
    financierId: row.financier_id,
    financierName: row.financier_name ?? undefined,
    remark: row.remark ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getAreas(params?: {
  financierId?: string;
  status?: string;
}): Promise<Area[]> {
  let sql = `
    SELECT a.*, f.enterprise_name AS financier_name
    FROM areas a
    LEFT JOIN financiers f ON a.financier_id = f.id
    WHERE 1=1
  `;
  const vals: any[] = [];
  if (params?.financierId) {
    sql += " AND a.financier_id = ?";
    vals.push(params.financierId);
  }
  if (params?.status) {
    sql += " AND a.status = ?";
    vals.push(params.status);
  }
  sql += " ORDER BY a.created_at DESC";
  const [rows] = await pool.query<RowDataPacket[]>(sql, vals);
  return rows.map(mapAreaRow);
}

export async function getAreaById(id: string): Promise<Area | undefined> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT a.*, f.enterprise_name AS financier_name
     FROM areas a
     LEFT JOIN financiers f ON a.financier_id = f.id
     WHERE a.id = ?`,
    [id]
  );
  return rows[0] ? mapAreaRow(rows[0]) : undefined;
}

export async function createArea(input: {
  name: string;
  financierId: string;
  remark?: string;
}): Promise<Area> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO areas (id, name, financier_id, remark)
     VALUES (?, ?, ?, ?)`,
    [id, input.name, input.financierId, input.remark || null]
  );
  return (await getAreaById(id))!;
}

export async function updateArea(
  id: string,
  input: Partial<{
    name: string;
    financierId: string;
    remark: string;
    status: "active" | "disabled";
  }>
): Promise<Area> {
  const sets: string[] = [];
  const vals: any[] = [];
  if (input.name !== undefined) { sets.push("name = ?"); vals.push(input.name); }
  if (input.financierId !== undefined) { sets.push("financier_id = ?"); vals.push(input.financierId); }
  if (input.remark !== undefined) { sets.push("remark = ?"); vals.push(input.remark); }
  if (input.status !== undefined) { sets.push("status = ?"); vals.push(input.status); }
  if (sets.length > 0) {
    sets.push("updated_at = NOW()");
    vals.push(id);
    await pool.query(`UPDATE areas SET ${sets.join(", ")} WHERE id = ?`, vals);
  }
  const area = await getAreaById(id);
  if (!area) throw new Error("区域不存在");
  return area;
}

export async function deleteArea(id: string): Promise<void> {
  // 先解除落地合作方关联，再删除区域
  await pool.query("UPDATE local_partners SET area_id = NULL WHERE area_id = ?", [id]);
  await pool.query("DELETE FROM areas WHERE id = ?", [id]);
}

// =============================================
// 落地合作方 (Local Partners)
// =============================================

function mapLocalPartnerRow(row: RowDataPacket): LocalPartner {
  return {
    id: row.id,
    name: row.name,
    financierId: row.financier_id,
    financierName: row.financier_name ?? undefined,
    areaId: row.area_id ?? undefined,
    areaName: row.area_name ?? undefined,
    contactPerson: row.contact_person ?? undefined,
    contactPhone: row.contact_phone ?? undefined,
    remark: row.remark ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getLocalPartners(params?: {
  financierId?: string;
  areaId?: string;
  status?: string;
}): Promise<LocalPartner[]> {
  let sql = `
    SELECT lp.*, f.enterprise_name AS financier_name, a.name AS area_name
    FROM local_partners lp
    LEFT JOIN financiers f ON lp.financier_id = f.id
    LEFT JOIN areas a ON lp.area_id = a.id
    WHERE 1=1
  `;
  const vals: any[] = [];

  if (params?.financierId) {
    sql += " AND lp.financier_id = ?";
    vals.push(params.financierId);
  }
  if (params?.areaId) {
    sql += " AND lp.area_id = ?";
    vals.push(params.areaId);
  }
  if (params?.status) {
    sql += " AND lp.status = ?";
    vals.push(params.status);
  }
  sql += " ORDER BY lp.created_at DESC";

  const [rows] = await pool.query<RowDataPacket[]>(sql, vals);
  return rows.map(mapLocalPartnerRow);
}

export async function getLocalPartnerById(id: string): Promise<LocalPartner | undefined> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT lp.*, f.enterprise_name AS financier_name, a.name AS area_name
     FROM local_partners lp
     LEFT JOIN financiers f ON lp.financier_id = f.id
     LEFT JOIN areas a ON lp.area_id = a.id
     WHERE lp.id = ?`,
    [id]
  );
  return rows[0] ? mapLocalPartnerRow(rows[0]) : undefined;
}

export async function createLocalPartner(input: {
  name: string;
  financierId: string;
  areaId?: string;
  contactPerson?: string;
  contactPhone?: string;
  remark?: string;
}): Promise<LocalPartner> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO local_partners (id, name, financier_id, area_id, contact_person, contact_phone, remark)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, input.name, input.financierId, input.areaId || null, input.contactPerson || null, input.contactPhone || null, input.remark || null]
  );
  return (await getLocalPartnerById(id))!;
}

export async function updateLocalPartner(
  id: string,
  input: Partial<{
    name: string;
    financierId: string;
    areaId: string | null;
    contactPerson: string;
    contactPhone: string;
    remark: string;
    status: "active" | "disabled";
  }>
): Promise<LocalPartner> {
  const sets: string[] = [];
  const vals: any[] = [];

  if (input.name !== undefined) { sets.push("name = ?"); vals.push(input.name); }
  if (input.financierId !== undefined) { sets.push("financier_id = ?"); vals.push(input.financierId); }
  if (input.areaId !== undefined) { sets.push("area_id = ?"); vals.push(input.areaId); }
  if (input.contactPerson !== undefined) { sets.push("contact_person = ?"); vals.push(input.contactPerson); }
  if (input.contactPhone !== undefined) { sets.push("contact_phone = ?"); vals.push(input.contactPhone); }
  if (input.remark !== undefined) { sets.push("remark = ?"); vals.push(input.remark); }
  if (input.status !== undefined) { sets.push("status = ?"); vals.push(input.status); }

  if (sets.length > 0) {
    sets.push("updated_at = NOW()");
    vals.push(id);
    await pool.query(`UPDATE local_partners SET ${sets.join(", ")} WHERE id = ?`, vals);
  }
  const lp = await getLocalPartnerById(id);
  if (!lp) throw new Error("落地合作方不存在");
  return lp;
}

export async function deleteLocalPartner(id: string): Promise<void> {
  await pool.query("DELETE FROM routes WHERE local_partner_id = ?", [id]);
  await pool.query("DELETE FROM local_partners WHERE id = ?", [id]);
}

// =============================================
// 线路 (Routes)
// =============================================

function mapRouteRow(row: RowDataPacket): Route {
  const tmsNodeId = row.tms_node_id ?? undefined;
  const tmsNodeName = row.tms_node_name ?? undefined;
  const financierName = row.financier_enterprise_name
    ? String(row.financier_enterprise_name)
    : undefined;
  const areaName = row.area_name ? String(row.area_name) : undefined;

  // 计算 TMS 绑定状态的前提：
  //   1) financier 接入了 TMS 组织树同步（如融满走摇钱树）；
  //   2) 该 route 所在区域不在豁免列表（如「临沂融满」走 56qqt 不走摇钱树，字典里查不到）。
  // 任一条件不满足，tmsBindingStatus 返回 undefined，前端不再展示绑定 Tag，避免红色误报。
  let tmsBindingStatus: "bound" | "stale" | "unbound" | undefined = undefined;
  if (
    financierName &&
    TMS_BINDING_ENABLED_FINANCIERS.has(financierName) &&
    !(areaName && TMS_BINDING_DISABLED_AREAS.has(areaName))
  ) {
    if (tmsNodeId) {
      tmsBindingStatus = tmsNodeName ? "bound" : "stale";
    } else {
      tmsBindingStatus = "unbound";
    }
  }

  return {
    id: row.id,
    name: row.name,
    localPartnerId: row.local_partner_id,
    localPartnerName: row.local_partner_name ?? undefined,
    areaName: row.area_name ?? undefined,
    remark: row.remark ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tmsSource: row.tms_source ?? undefined,
    tmsNodeId,
    tmsNodeName,
    tmsBindingStatus,
  };
}

export async function getRoutes(params?: {
  localPartnerId?: string;
  financierId?: string;
  areaId?: string;
  status?: string;
}): Promise<Route[]> {
  let sql = `
    SELECT r.*, lp.name AS local_partner_name, a.name AS area_name,
           o.node_name AS tms_node_name,
           f.enterprise_name AS financier_enterprise_name
    FROM routes r
    LEFT JOIN local_partners lp ON r.local_partner_id = lp.id
    LEFT JOIN financiers f ON lp.financier_id = f.id
    LEFT JOIN areas a ON lp.area_id = a.id
    LEFT JOIN tms_org_nodes o
      ON o.tms_source = r.tms_source AND o.node_id = r.tms_node_id
    WHERE 1=1
  `;
  const vals: any[] = [];

  if (params?.localPartnerId) {
    sql += " AND r.local_partner_id = ?";
    vals.push(params.localPartnerId);
  }
  if (params?.financierId) {
    sql += " AND lp.financier_id = ?";
    vals.push(params.financierId);
  }
  if (params?.areaId) {
    sql += " AND lp.area_id = ?";
    vals.push(params.areaId);
  }
  if (params?.status) {
    sql += " AND r.status = ?";
    vals.push(params.status);
  }
  // 排序：待绑定（tms_node_id 为空）优先 → 字典失联（已绑但字典找不到）→ 已绑定；同组内按创建时间倒序
  sql += `
    ORDER BY
      CASE
        WHEN r.tms_node_id IS NULL THEN 0
        WHEN o.node_name IS NULL THEN 1
        ELSE 2
      END,
      r.created_at DESC
  `;

  const [rows] = await pool.query<RowDataPacket[]>(sql, vals);
  return rows.map(mapRouteRow);
}

export async function getRouteById(id: string): Promise<Route | undefined> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT r.*, lp.name AS local_partner_name, a.name AS area_name,
            o.node_name AS tms_node_name,
            f.enterprise_name AS financier_enterprise_name
     FROM routes r
     LEFT JOIN local_partners lp ON r.local_partner_id = lp.id
     LEFT JOIN financiers f ON lp.financier_id = f.id
     LEFT JOIN areas a ON lp.area_id = a.id
     LEFT JOIN tms_org_nodes o
       ON o.tms_source = r.tms_source AND o.node_id = r.tms_node_id
     WHERE r.id = ?`,
    [id]
  );
  return rows[0] ? mapRouteRow(rows[0]) : undefined;
}

export async function createRoute(input: {
  name: string;
  localPartnerId: string;
  remark?: string;
  tmsSource?: string;
  tmsNodeId?: string;
}): Promise<Route> {
  const id = randomUUID();

  let finalTmsSource: string | null = input.tmsSource || null;
  let finalTmsNodeId: string | null = input.tmsNodeId || null;

  // 自动绑定：新建时未指定 tmsNodeId，则按 name 在默认字典做唯一精确匹配，命中即顺手绑上。
  if (!finalTmsNodeId) {
    try {
      const hit = await findUniqueTmsNodeByName(DEFAULT_AUTO_BIND_TMS_SOURCE, input.name);
      if (hit) {
        finalTmsSource = DEFAULT_AUTO_BIND_TMS_SOURCE;
        finalTmsNodeId = hit.nodeId;
        console.log(
          `[Routes] 新建时自动绑定 TMS 网点: name=${input.name} → ${DEFAULT_AUTO_BIND_TMS_SOURCE}/${hit.nodeId}`
        );
      }
    } catch (e: any) {
      console.warn(`[Routes] 新建时自动绑定 TMS 网点失败（不影响主流程）: ${e?.message || e}`);
    }
  }

  await pool.query(
    `INSERT INTO routes (id, name, local_partner_id, remark, tms_source, tms_node_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.name,
      input.localPartnerId,
      input.remark || null,
      finalTmsSource,
      finalTmsNodeId,
    ]
  );
  return (await getRouteById(id))!;
}

export async function updateRoute(
  id: string,
  input: Partial<{
    name: string;
    localPartnerId: string;
    remark: string;
    status: "active" | "disabled";
    tmsSource: string | null;
    tmsNodeId: string | null;
  }>
): Promise<Route> {
  const sets: string[] = [];
  const vals: any[] = [];

  if (input.name !== undefined) { sets.push("name = ?"); vals.push(input.name); }
  if (input.localPartnerId !== undefined) { sets.push("local_partner_id = ?"); vals.push(input.localPartnerId); }
  if (input.remark !== undefined) { sets.push("remark = ?"); vals.push(input.remark); }
  if (input.status !== undefined) { sets.push("status = ?"); vals.push(input.status); }
  if (input.tmsSource !== undefined) { sets.push("tms_source = ?"); vals.push(input.tmsSource); }
  if (input.tmsNodeId !== undefined) { sets.push("tms_node_id = ?"); vals.push(input.tmsNodeId); }

  if (sets.length > 0) {
    sets.push("updated_at = NOW()");
    vals.push(id);
    await pool.query(`UPDATE routes SET ${sets.join(", ")} WHERE id = ?`, vals);
  }

  // 自动绑定：只要调用方没有显式触碰 tmsNodeId / tmsSource（即非"切换 TMS 模式"场景），
  // 就在每次编辑后尝试做一次自动绑定补偿。当 route 已绑定时该检查会自然短路，开销可忽略。
  // 这样无论运维改的是 name、remark、partner 还是 status，都能把"已经能识别"的线路顺手绑上。
  // 仅对接入了 TMS 同步的 financier 做尝试（tmsBindingStatus 不为 undefined 即代表已接入）。
  if (input.tmsNodeId === undefined && input.tmsSource === undefined) {
    const current = await getRouteById(id);
    if (
      current &&
      !current.tmsNodeId &&
      current.status === "active" &&
      current.tmsBindingStatus !== undefined
    ) {
      try {
        const hit = await findUniqueTmsNodeByName(DEFAULT_AUTO_BIND_TMS_SOURCE, current.name);
        if (hit) {
          await pool.query(
            `UPDATE routes SET tms_source = ?, tms_node_id = ?, updated_at = NOW() WHERE id = ?`,
            [DEFAULT_AUTO_BIND_TMS_SOURCE, hit.nodeId, id]
          );
          console.log(
            `[Routes] 编辑后自动绑定 TMS 网点: route=${id} name=${current.name} → ${DEFAULT_AUTO_BIND_TMS_SOURCE}/${hit.nodeId}`
          );
        }
      } catch (e: any) {
        console.warn(`[Routes] 自动绑定 TMS 网点失败（不影响主流程）: ${e?.message || e}`);
      }
    }
  }

  const r = await getRouteById(id);
  if (!r) throw new Error("线路不存在");
  return r;
}

export async function deleteRoute(id: string): Promise<void> {
  await pool.query("DELETE FROM contract_routes WHERE route_id = ?", [id]);
  await pool.query("DELETE FROM routes WHERE id = ?", [id]);
}

// =============================================
// 合同-线路关联 (Contract Routes)
// =============================================

function mapContractRouteRow(row: RowDataPacket): ContractRoute {
  return {
    id: row.id,
    contractId: row.contract_id,
    routeId: row.route_id,
    routeName: row.route_name ?? undefined,
    areaName: row.area_name ?? undefined,
    localPartnerName: row.local_partner_name ?? undefined,
    createdAt: row.created_at,
  };
}

export async function getContractRoutes(contractId: string): Promise<ContractRoute[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT cr.*, r.name AS route_name, lp.name AS local_partner_name, a.name AS area_name
     FROM contract_routes cr
     LEFT JOIN routes r ON cr.route_id = r.id
     LEFT JOIN local_partners lp ON r.local_partner_id = lp.id
     LEFT JOIN areas a ON lp.area_id = a.id
     WHERE cr.contract_id = ?
     ORDER BY cr.created_at`,
    [contractId]
  );
  return rows.map(mapContractRouteRow);
}

export async function setContractRoutes(
  contractId: string,
  routeIds: string[]
): Promise<ContractRoute[]> {
  await pool.query("DELETE FROM contract_routes WHERE contract_id = ?", [contractId]);

  for (const routeId of routeIds) {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO contract_routes (id, contract_id, route_id) VALUES (?, ?, ?)`,
      [id, contractId, routeId]
    );
  }

  return getContractRoutes(contractId);
}
