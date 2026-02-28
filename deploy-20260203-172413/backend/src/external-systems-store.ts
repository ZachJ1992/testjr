import { pool } from "./db.js";
import { ExternalSystemConfig } from "./types.js";
import { v4 as uuidv4 } from "uuid";
import { RowDataPacket, ResultSetHeader } from "mysql2";

// 获取融资方的所有外部系统配置
export async function getExternalSystemsByFinancierId(
  financierId: string
): Promise<ExternalSystemConfig[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM financier_external_systems 
     WHERE financier_id = ? AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [financierId]
  );

  return rows.map((row) => ({
    id: row.id,
    financierId: row.financier_id,
    systemName: row.system_name,
    systemId: row.system_id,
    apiEndpoint: row.api_endpoint || undefined,
    apiKey: row.api_key || undefined,
    syncEnabled: !!row.sync_enabled,
    lastSyncTime: row.last_sync_time
      ? new Date(row.last_sync_time).toISOString()
      : undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }));
}

// 获取单个外部系统配置
export async function getExternalSystemById(
  id: string
): Promise<ExternalSystemConfig | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM financier_external_systems 
     WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    id: row.id,
    financierId: row.financier_id,
    systemName: row.system_name,
    systemId: row.system_id,
    apiEndpoint: row.api_endpoint || undefined,
    apiKey: row.api_key || undefined,
    syncEnabled: !!row.sync_enabled,
    lastSyncTime: row.last_sync_time
      ? new Date(row.last_sync_time).toISOString()
      : undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

// 创建外部系统配置
export async function createExternalSystem(data: {
  financierId: string;
  systemName: string;
  systemId: string;
  apiEndpoint?: string;
  apiKey?: string;
  syncEnabled?: boolean;
}): Promise<ExternalSystemConfig> {
  const id = uuidv4();
  const syncEnabled = data.syncEnabled ?? false;

  await pool.query(
    `INSERT INTO financier_external_systems 
     (id, financier_id, system_name, system_id, api_endpoint, api_key, sync_enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.financierId,
      data.systemName,
      data.systemId,
      data.apiEndpoint || null,
      data.apiKey || null,
      syncEnabled,
    ]
  );

  const result = await getExternalSystemById(id);
  if (!result) {
    throw new Error("Failed to create external system configuration");
  }
  return result;
}

// 更新外部系统配置
export async function updateExternalSystem(
  id: string,
  data: {
    systemName?: string;
    systemId?: string;
    apiEndpoint?: string;
    apiKey?: string;
    syncEnabled?: boolean;
    lastSyncTime?: string;
  }
): Promise<ExternalSystemConfig | null> {
  const updates: string[] = [];
  const values: (string | boolean | null)[] = [];

  if (data.systemName !== undefined) {
    updates.push("system_name = ?");
    values.push(data.systemName);
  }
  if (data.systemId !== undefined) {
    updates.push("system_id = ?");
    values.push(data.systemId);
  }
  if (data.apiEndpoint !== undefined) {
    updates.push("api_endpoint = ?");
    values.push(data.apiEndpoint || null);
  }
  if (data.apiKey !== undefined) {
    updates.push("api_key = ?");
    values.push(data.apiKey || null);
  }
  if (data.syncEnabled !== undefined) {
    updates.push("sync_enabled = ?");
    values.push(data.syncEnabled);
  }
  if (data.lastSyncTime !== undefined) {
    updates.push("last_sync_time = ?");
    values.push(data.lastSyncTime);
  }

  if (updates.length === 0) {
    return getExternalSystemById(id);
  }

  values.push(id);
  await pool.query(
    `UPDATE financier_external_systems SET ${updates.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
    values
  );

  return getExternalSystemById(id);
}

// 删除外部系统配置（软删除）
export async function deleteExternalSystem(id: string): Promise<boolean> {
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE financier_external_systems SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );

  return result.affectedRows > 0;
}

// 根据系统名称和系统ID查找融资方
export async function findFinancierByExternalSystem(
  systemName: string,
  systemId: string
): Promise<string | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT financier_id FROM financier_external_systems 
     WHERE system_name = ? AND system_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [systemName, systemId]
  );

  if (rows.length === 0) return null;
  return rows[0].financier_id;
}
