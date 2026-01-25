import { randomUUID } from "crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { pool } from "./db.js";
import { Funder, FunderType, FunderStatus, OrgType } from "./types.js";

interface FunderRow extends RowDataPacket {
  id: string;
  org_id: string | null;
  institution_name: string;
  institution_type: string;
  unified_social_credit_code: string;
  business_license_url: string | null;
  business_license_name: string | null;
  financial_license_url: string | null;
  financial_license_name: string | null;
  account_opening_permit_url: string | null;
  account_opening_permit_name: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  bank_name: string | null;
  bank_account: string | null;
  account_name: string | null;
  cumulative_credit_limit: number;
  current_loan_balance: number;
  status: string;
  created_at: string;
  updated_at: string;
}

function mapFunderRow(row: FunderRow): Funder {
  return {
    id: row.id,
    orgId: row.org_id || undefined,
    institutionName: row.institution_name,
    institutionType: row.institution_type as FunderType,
    unifiedSocialCreditCode: row.unified_social_credit_code,
    businessLicenseUrl: row.business_license_url || undefined,
    businessLicenseName: row.business_license_name || undefined,
    financialLicenseUrl: row.financial_license_url || undefined,
    financialLicenseName: row.financial_license_name || undefined,
    accountOpeningPermitUrl: row.account_opening_permit_url || undefined,
    accountOpeningPermitName: row.account_opening_permit_name || undefined,
    contactPerson: row.contact_person || undefined,
    contactPhone: row.contact_phone || undefined,
    bankName: row.bank_name || undefined,
    bankAccount: row.bank_account || undefined,
    accountName: row.account_name || undefined,
    cumulativeCreditLimit: Number(row.cumulative_credit_limit),
    currentLoanBalance: Number(row.current_loan_balance),
    status: row.status as FunderStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function getFunders(filters?: {
  institutionName?: string;
  contactPerson?: string;
  institutionType?: FunderType;
  status?: FunderStatus;
}): Promise<Funder[]> {
  let query = `
    SELECT id, org_id, institution_name, institution_type, unified_social_credit_code,
           business_license_url, business_license_name,
           financial_license_url, financial_license_name,
           account_opening_permit_url, account_opening_permit_name,
           contact_person, contact_phone, bank_name, bank_account, account_name,
           cumulative_credit_limit, current_loan_balance, status, created_at, updated_at
    FROM funders
    WHERE deleted_at IS NULL
  `;
  const params: any[] = [];

  if (filters?.institutionName) {
    query += ` AND institution_name LIKE ?`;
    params.push(`%${filters.institutionName}%`);
  }
  if (filters?.contactPerson) {
    query += ` AND contact_person LIKE ?`;
    params.push(`%${filters.contactPerson}%`);
  }
  if (filters?.institutionType) {
    query += ` AND institution_type = ?`;
    params.push(filters.institutionType);
  }
  if (filters?.status) {
    query += ` AND status = ?`;
    params.push(filters.status);
  }

  query += ` ORDER BY created_at DESC`;

  const [rows] = await pool.query<FunderRow[]>(query, params);
  return rows.map(mapFunderRow);
}

export async function getFunderById(id: string): Promise<Funder | undefined> {
  const [rows] = await pool.query<FunderRow[]>(
    `SELECT id, org_id, institution_name, institution_type, unified_social_credit_code,
            business_license_url, business_license_name,
            financial_license_url, financial_license_name,
            account_opening_permit_url, account_opening_permit_name,
            contact_person, contact_phone, bank_name, bank_account, account_name,
            cumulative_credit_limit, current_loan_balance, status, created_at, updated_at
     FROM funders WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [id]
  );
  return rows[0] ? mapFunderRow(rows[0]) : undefined;
}

// 辅助函数：创建组织
async function createOrgForFunder(funderId: string, institutionName: string): Promise<string> {
  const orgId = randomUUID();
  await pool.query(
    `INSERT INTO org_units (id, name, type, related_entity_id, is_active) VALUES (?, ?, ?, ?, ?)`,
    [orgId, institutionName, "funder" as OrgType, funderId, 1]
  );
  return orgId;
}

export async function createFunder(input: {
  institutionName: string;
  institutionType: FunderType;
  unifiedSocialCreditCode: string;
  businessLicenseUrl?: string;
  businessLicenseName?: string;
  financialLicenseUrl?: string;
  financialLicenseName?: string;
  accountOpeningPermitUrl?: string;
  accountOpeningPermitName?: string;
  contactPerson?: string;
  contactPhone?: string;
  bankName?: string;
  bankAccount?: string;
  accountName?: string;
  cumulativeCreditLimit?: number;
}): Promise<Funder> {
  const id = randomUUID();

  // 创建资金方记录
  await pool.query(
    `INSERT INTO funders 
     (id, institution_name, institution_type, unified_social_credit_code,
      business_license_url, business_license_name,
      financial_license_url, financial_license_name,
      account_opening_permit_url, account_opening_permit_name,
      contact_person, contact_phone, bank_name, bank_account, account_name,
      cumulative_credit_limit, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    [
      id,
      input.institutionName,
      input.institutionType,
      input.unifiedSocialCreditCode,
      input.businessLicenseUrl || null,
      input.businessLicenseName || null,
      input.financialLicenseUrl || null,
      input.financialLicenseName || null,
      input.accountOpeningPermitUrl || null,
      input.accountOpeningPermitName || null,
      input.contactPerson || null,
      input.contactPhone || null,
      input.bankName || null,
      input.bankAccount || null,
      input.accountName || null,
      input.cumulativeCreditLimit || 0
    ]
  );

  // 自动创建对应组织
  const orgId = await createOrgForFunder(id, input.institutionName);
  
  // 更新资金方的 org_id 字段
  await pool.query(
    `UPDATE funders SET org_id = ? WHERE id = ?`,
    [orgId, id]
  );

  const funder = await getFunderById(id);
  if (!funder) {
    throw new Error("创建资金方失败");
  }
  return funder;
}

export async function updateFunder(
  id: string,
  input: {
    institutionName?: string;
    institutionType?: FunderType;
    unifiedSocialCreditCode?: string;
    businessLicenseUrl?: string;
    businessLicenseName?: string;
    financialLicenseUrl?: string;
    financialLicenseName?: string;
    accountOpeningPermitUrl?: string;
    accountOpeningPermitName?: string;
    contactPerson?: string;
    contactPhone?: string;
    bankName?: string;
    bankAccount?: string;
    accountName?: string;
    cumulativeCreditLimit?: number;
    status?: FunderStatus;
  }
): Promise<Funder> {
  const current = await getFunderById(id);
  if (!current) {
    throw new Error("资金方不存在");
  }

  const updates: string[] = [];
  const params: any[] = [];

  if (input.institutionName !== undefined) {
    updates.push("institution_name = ?");
    params.push(input.institutionName);
    
    // 同步更新关联组织的名称
    if (current.orgId) {
      await pool.query(
        `UPDATE org_units SET name = ? WHERE id = ?`,
        [input.institutionName, current.orgId]
      );
    }
  }
  if (input.institutionType !== undefined) {
    updates.push("institution_type = ?");
    params.push(input.institutionType);
  }
  if (input.unifiedSocialCreditCode !== undefined) {
    updates.push("unified_social_credit_code = ?");
    params.push(input.unifiedSocialCreditCode);
  }
  if (input.businessLicenseUrl !== undefined) {
    updates.push("business_license_url = ?");
    params.push(input.businessLicenseUrl || null);
  }
  if (input.businessLicenseName !== undefined) {
    updates.push("business_license_name = ?");
    params.push(input.businessLicenseName || null);
  }
  if (input.financialLicenseUrl !== undefined) {
    updates.push("financial_license_url = ?");
    params.push(input.financialLicenseUrl || null);
  }
  if (input.financialLicenseName !== undefined) {
    updates.push("financial_license_name = ?");
    params.push(input.financialLicenseName || null);
  }
  if (input.accountOpeningPermitUrl !== undefined) {
    updates.push("account_opening_permit_url = ?");
    params.push(input.accountOpeningPermitUrl || null);
  }
  if (input.accountOpeningPermitName !== undefined) {
    updates.push("account_opening_permit_name = ?");
    params.push(input.accountOpeningPermitName || null);
  }
  if (input.contactPerson !== undefined) {
    updates.push("contact_person = ?");
    params.push(input.contactPerson || null);
  }
  if (input.contactPhone !== undefined) {
    updates.push("contact_phone = ?");
    params.push(input.contactPhone || null);
  }
  if (input.bankName !== undefined) {
    updates.push("bank_name = ?");
    params.push(input.bankName || null);
  }
  if (input.bankAccount !== undefined) {
    updates.push("bank_account = ?");
    params.push(input.bankAccount || null);
  }
  if (input.accountName !== undefined) {
    updates.push("account_name = ?");
    params.push(input.accountName || null);
  }
  if (input.cumulativeCreditLimit !== undefined) {
    updates.push("cumulative_credit_limit = ?");
    params.push(input.cumulativeCreditLimit);
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
    `UPDATE funders SET ${updates.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
    params
  );

  const updated = await getFunderById(id);
  if (!updated) {
    throw new Error("更新资金方失败");
  }
  return updated;
}

export async function deleteFunder(id: string): Promise<void> {
  const current = await getFunderById(id);
  if (!current) {
    throw new Error("资金方不存在");
  }
  
  // 逻辑删除资金方
  await pool.query(
    `UPDATE funders SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`,
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
