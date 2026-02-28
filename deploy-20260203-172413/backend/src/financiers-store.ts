import { randomUUID } from "crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "./db.js";
import { Financier, FinancierScale, FinancierStatus, OrgType } from "./types.js";

interface FinancierRow extends RowDataPacket {
  id: string;
  org_id: string | null;
  enterprise_name: string;
  unified_social_credit_code: string;
  legal_representative: string;
  business_address: string;
  region: string | null;
  operating_scale: string;
  business_license_url: string | null;
  road_transport_license_url: string | null;
  legal_person_id_card_url: string | null;
  total_credit_limit: number;
  initial_credit_amount: number;
  remaining_credit_limit: number;
  status: string;
  created_at: string;
  updated_at: string;
}

function mapFinancierRow(row: FinancierRow): Financier {
  return {
    id: row.id,
    orgId: row.org_id || undefined,
    enterpriseName: row.enterprise_name,
    unifiedSocialCreditCode: row.unified_social_credit_code,
    legalRepresentative: row.legal_representative,
    businessAddress: row.business_address,
    region: row.region || undefined,
    operatingScale: row.operating_scale as FinancierScale,
    businessLicenseUrl: row.business_license_url || undefined,
    roadTransportLicenseUrl: row.road_transport_license_url || undefined,
    legalPersonIdCardUrl: row.legal_person_id_card_url || undefined,
    totalCreditLimit: Number(row.total_credit_limit),
    initialCreditAmount: Number(row.initial_credit_amount),
    remainingCreditLimit: Number(row.remaining_credit_limit),
    status: row.status as FinancierStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function getFinanciers(filters?: {
  enterpriseName?: string;
  legalRepresentative?: string;
  region?: string;
  operatingScale?: FinancierScale;
  status?: FinancierStatus;
}): Promise<Financier[]> {
  let query = `
    SELECT id, org_id, enterprise_name, unified_social_credit_code, legal_representative,
           business_address, region, operating_scale,
           business_license_url, road_transport_license_url, legal_person_id_card_url,
           total_credit_limit, initial_credit_amount, remaining_credit_limit,
           status, created_at, updated_at
    FROM financiers
    WHERE deleted_at IS NULL
  `;
  const params: any[] = [];

  if (filters?.enterpriseName) {
    query += ` AND enterprise_name LIKE ?`;
    params.push(`%${filters.enterpriseName}%`);
  }
  if (filters?.legalRepresentative) {
    query += ` AND legal_representative LIKE ?`;
    params.push(`%${filters.legalRepresentative}%`);
  }
  if (filters?.region) {
    query += ` AND region = ?`;
    params.push(filters.region);
  }
  if (filters?.operatingScale) {
    query += ` AND operating_scale = ?`;
    params.push(filters.operatingScale);
  }
  if (filters?.status) {
    query += ` AND status = ?`;
    params.push(filters.status);
  }

  query += ` ORDER BY created_at DESC`;

  const [rows] = await pool.query<FinancierRow[]>(query, params);
  return rows.map(mapFinancierRow);
}

export async function getFinancierById(id: string): Promise<Financier | undefined> {
  const [rows] = await pool.query<FinancierRow[]>(
    `SELECT id, org_id, enterprise_name, unified_social_credit_code, legal_representative,
            business_address, region, operating_scale,
            business_license_url, road_transport_license_url, legal_person_id_card_url,
            total_credit_limit, initial_credit_amount, remaining_credit_limit,
            status, created_at, updated_at
     FROM financiers WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [id]
  );
  return rows[0] ? mapFinancierRow(rows[0]) : undefined;
}

// 辅助函数：创建组织
async function createOrgForFinancier(financierId: string, enterpriseName: string): Promise<string> {
  const orgId = randomUUID();
  await pool.query(
    `INSERT INTO org_units (id, name, type, related_entity_id, is_active) VALUES (?, ?, ?, ?, ?)`,
    [orgId, enterpriseName, "financier" as OrgType, financierId, 1]
  );
  return orgId;
}

export async function createFinancier(input: {
  enterpriseName: string;
  unifiedSocialCreditCode: string;
  legalRepresentative: string;
  businessAddress: string;
  region?: string;
  operatingScale: FinancierScale;
  businessLicenseUrl?: string;
  roadTransportLicenseUrl?: string;
  legalPersonIdCardUrl?: string;
  initialCreditAmount: number;
}): Promise<Financier> {
  const id = randomUUID();

  // 创建融资方记录
  await pool.query(
    `INSERT INTO financiers 
     (id, enterprise_name, unified_social_credit_code, legal_representative,
      business_address, region, operating_scale,
      business_license_url, road_transport_license_url, legal_person_id_card_url,
      total_credit_limit, initial_credit_amount, remaining_credit_limit,
      status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    [
      id,
      input.enterpriseName,
      input.unifiedSocialCreditCode,
      input.legalRepresentative,
      input.businessAddress,
      input.region || null,
      input.operatingScale,
      input.businessLicenseUrl || null,
      input.roadTransportLicenseUrl || null,
      input.legalPersonIdCardUrl || null,
      input.initialCreditAmount,
      input.initialCreditAmount,
      input.initialCreditAmount // remaining_credit_limit 初始等于 total_credit_limit
    ]
  );

  // 自动创建对应组织
  const orgId = await createOrgForFinancier(id, input.enterpriseName);
  
  // 更新融资方的 org_id 字段
  await pool.query(
    `UPDATE financiers SET org_id = ? WHERE id = ?`,
    [orgId, id]
  );

  const financier = await getFinancierById(id);
  if (!financier) {
    throw new Error("创建融资方失败");
  }
  return financier;
}

export async function updateFinancier(
  id: string,
  input: {
    enterpriseName?: string;
    unifiedSocialCreditCode?: string;
    legalRepresentative?: string;
    businessAddress?: string;
    region?: string;
    operatingScale?: FinancierScale;
    businessLicenseUrl?: string;
    roadTransportLicenseUrl?: string;
    legalPersonIdCardUrl?: string;
    totalCreditLimit?: number;
    remainingCreditLimit?: number;
    status?: FinancierStatus;
  }
): Promise<Financier> {
  const current = await getFinancierById(id);
  if (!current) {
    throw new Error("融资方不存在");
  }

  const updates: string[] = [];
  const params: any[] = [];

  if (input.enterpriseName !== undefined) {
    updates.push("enterprise_name = ?");
    params.push(input.enterpriseName);
    
    // 同步更新关联组织的名称
    if (current.orgId) {
      await pool.query(
        `UPDATE org_units SET name = ? WHERE id = ?`,
        [input.enterpriseName, current.orgId]
      );
    }
  }
  if (input.unifiedSocialCreditCode !== undefined) {
    updates.push("unified_social_credit_code = ?");
    params.push(input.unifiedSocialCreditCode);
  }
  if (input.legalRepresentative !== undefined) {
    updates.push("legal_representative = ?");
    params.push(input.legalRepresentative);
  }
  if (input.businessAddress !== undefined) {
    updates.push("business_address = ?");
    params.push(input.businessAddress);
  }
  if (input.region !== undefined) {
    updates.push("region = ?");
    params.push(input.region || null);
  }
  if (input.operatingScale !== undefined) {
    updates.push("operating_scale = ?");
    params.push(input.operatingScale);
  }
  if (input.businessLicenseUrl !== undefined) {
    updates.push("business_license_url = ?");
    params.push(input.businessLicenseUrl || null);
  }
  if (input.roadTransportLicenseUrl !== undefined) {
    updates.push("road_transport_license_url = ?");
    params.push(input.roadTransportLicenseUrl || null);
  }
  if (input.legalPersonIdCardUrl !== undefined) {
    updates.push("legal_person_id_card_url = ?");
    params.push(input.legalPersonIdCardUrl || null);
  }
  if (input.totalCreditLimit !== undefined) {
    updates.push("total_credit_limit = ?");
    params.push(input.totalCreditLimit);
  }
  if (input.remainingCreditLimit !== undefined) {
    updates.push("remaining_credit_limit = ?");
    params.push(input.remainingCreditLimit);
  }
  if (input.status !== undefined) {
    updates.push("status = ?");
    params.push(input.status);
  }

  if (updates.length === 0) {
    return current;
  }

  params.push(id);
  await pool.query(
    `UPDATE financiers SET ${updates.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
    params
  );

  const updated = await getFinancierById(id);
  if (!updated) {
    throw new Error("更新融资方失败");
  }
  return updated;
}

export async function deleteFinancier(id: string): Promise<void> {
  const current = await getFinancierById(id);
  if (!current) {
    throw new Error("融资方不存在");
  }
  
  // 逻辑删除融资方
  await pool.query(
    `UPDATE financiers SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [id]
  );
  
  // 同时禁用关联的组织
  if (current.orgId) {
    await pool.query(
      `UPDATE org_units SET is_active = 0, deleted_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [current.orgId]
    );
  }
}
