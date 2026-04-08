/**
 * 业务抽成合同 v2 — 落地合作方 / 线路 / 合同-线路关联 CRUD
 */

import { pool } from "./db.js";
import { randomUUID } from "crypto";
import type { RowDataPacket } from "mysql2";
import type { Area, LocalPartner, Route, ContractRoute } from "./types.js";

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
  };
}

export async function getRoutes(params?: {
  localPartnerId?: string;
  financierId?: string;
  areaId?: string;
  status?: string;
}): Promise<Route[]> {
  let sql = `
    SELECT r.*, lp.name AS local_partner_name, a.name AS area_name
    FROM routes r
    LEFT JOIN local_partners lp ON r.local_partner_id = lp.id
    LEFT JOIN areas a ON lp.area_id = a.id
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
  sql += " ORDER BY r.created_at DESC";

  const [rows] = await pool.query<RowDataPacket[]>(sql, vals);
  return rows.map(mapRouteRow);
}

export async function getRouteById(id: string): Promise<Route | undefined> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT r.*, lp.name AS local_partner_name, a.name AS area_name
     FROM routes r
     LEFT JOIN local_partners lp ON r.local_partner_id = lp.id
     LEFT JOIN areas a ON lp.area_id = a.id
     WHERE r.id = ?`,
    [id]
  );
  return rows[0] ? mapRouteRow(rows[0]) : undefined;
}

export async function createRoute(input: {
  name: string;
  localPartnerId: string;
  remark?: string;
}): Promise<Route> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO routes (id, name, local_partner_id, remark) VALUES (?, ?, ?, ?)`,
    [id, input.name, input.localPartnerId, input.remark || null]
  );
  return (await getRouteById(id))!;
}

export async function updateRoute(
  id: string,
  input: Partial<{ name: string; localPartnerId: string; remark: string; status: "active" | "disabled" }>
): Promise<Route> {
  const sets: string[] = [];
  const vals: any[] = [];

  if (input.name !== undefined) { sets.push("name = ?"); vals.push(input.name); }
  if (input.localPartnerId !== undefined) { sets.push("local_partner_id = ?"); vals.push(input.localPartnerId); }
  if (input.remark !== undefined) { sets.push("remark = ?"); vals.push(input.remark); }
  if (input.status !== undefined) { sets.push("status = ?"); vals.push(input.status); }

  if (sets.length > 0) {
    sets.push("updated_at = NOW()");
    vals.push(id);
    await pool.query(`UPDATE routes SET ${sets.join(", ")} WHERE id = ?`, vals);
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
