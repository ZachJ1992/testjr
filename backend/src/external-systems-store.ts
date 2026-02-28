import { pool } from "./db.js";
import { ExternalSystemConfig, IntegrationType, CrawlerConfigParams } from "./types.js";
import { v4 as uuidv4 } from "uuid";
import { RowDataPacket, ResultSetHeader } from "mysql2";

// 将数据库行转换为 ExternalSystemConfig 对象
function rowToExternalSystemConfig(row: RowDataPacket): ExternalSystemConfig {
  let crawlerConfig: CrawlerConfigParams | undefined = undefined;
  if (row.crawler_config) {
    try {
      crawlerConfig = typeof row.crawler_config === 'string' 
        ? JSON.parse(row.crawler_config) 
        : row.crawler_config;
    } catch (e) {
      crawlerConfig = undefined;
    }
  }

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
    integrationType: (row.integration_type as IntegrationType) || 'manual',
    crawlerType: row.crawler_type || undefined,
    crawlerConfig,
    syncIntervalMinutes: row.sync_interval_minutes ?? 360,
    lastSyncStatus: row.last_sync_status || undefined,
    lastSyncError: row.last_sync_error || undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

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

  return rows.map(rowToExternalSystemConfig);
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
  return rowToExternalSystemConfig(rows[0]);
}

// 创建外部系统配置
export async function createExternalSystem(data: {
  financierId: string;
  systemName: string;
  systemId: string;
  apiEndpoint?: string;
  apiKey?: string;
  syncEnabled?: boolean;
  integrationType?: IntegrationType;
  crawlerType?: string;
  crawlerConfig?: CrawlerConfigParams;
  syncIntervalMinutes?: number;
}): Promise<ExternalSystemConfig> {
  const id = uuidv4();
  const syncEnabled = data.syncEnabled ?? false;
  const integrationType = data.integrationType ?? 'manual';
  const syncIntervalMinutes = data.syncIntervalMinutes ?? 360;
  const crawlerConfigJson = data.crawlerConfig ? JSON.stringify(data.crawlerConfig) : null;

  await pool.query(
    `INSERT INTO financier_external_systems 
     (id, financier_id, system_name, system_id, api_endpoint, api_key, sync_enabled,
      integration_type, crawler_type, crawler_config, sync_interval_minutes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.financierId,
      data.systemName,
      data.systemId,
      data.apiEndpoint || null,
      data.apiKey || null,
      syncEnabled,
      integrationType,
      data.crawlerType || null,
      crawlerConfigJson,
      syncIntervalMinutes,
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
    integrationType?: IntegrationType;
    crawlerType?: string;
    crawlerConfig?: CrawlerConfigParams;
    syncIntervalMinutes?: number;
    lastSyncStatus?: string;
    lastSyncError?: string;
  }
): Promise<ExternalSystemConfig | null> {
  const updates: string[] = [];
  const values: (string | boolean | number | null)[] = [];

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
  if (data.integrationType !== undefined) {
    updates.push("integration_type = ?");
    values.push(data.integrationType);
  }
  if (data.crawlerType !== undefined) {
    updates.push("crawler_type = ?");
    values.push(data.crawlerType || null);
  }
  if (data.crawlerConfig !== undefined) {
    updates.push("crawler_config = ?");
    values.push(data.crawlerConfig ? JSON.stringify(data.crawlerConfig) : null);
  }
  if (data.syncIntervalMinutes !== undefined) {
    updates.push("sync_interval_minutes = ?");
    values.push(data.syncIntervalMinutes);
  }
  if (data.lastSyncStatus !== undefined) {
    updates.push("last_sync_status = ?");
    values.push(data.lastSyncStatus || null);
  }
  if (data.lastSyncError !== undefined) {
    updates.push("last_sync_error = ?");
    values.push(data.lastSyncError || null);
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

// 获取所有启用爬虫同步的外部系统配置（供调度器使用）
export async function getActiveCrawlerConfigs(): Promise<ExternalSystemConfig[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT es.*, f.enterprise_name as financier_name
     FROM financier_external_systems es
     LEFT JOIN financiers f ON es.financier_id = f.id
     WHERE es.integration_type = 'crawler' 
       AND es.sync_enabled = TRUE 
       AND es.crawler_type IS NOT NULL
       AND es.deleted_at IS NULL
     ORDER BY es.created_at ASC`
  );

  return rows.map(rowToExternalSystemConfig);
}

// 更新同步状态
export async function updateSyncStatus(
  id: string,
  status: 'running' | 'success' | 'failed',
  error?: string
): Promise<void> {
  const updates: string[] = ['last_sync_status = ?'];
  const values: (string | null)[] = [status];

  if (status === 'success' || status === 'failed') {
    updates.push('last_sync_time = NOW()');
  }

  if (error !== undefined) {
    updates.push('last_sync_error = ?');
    values.push(error || null);
  } else if (status === 'success') {
    updates.push('last_sync_error = NULL');
  }

  values.push(id);
  await pool.query(
    `UPDATE financier_external_systems SET ${updates.join(', ')} WHERE id = ?`,
    values
  );
}
