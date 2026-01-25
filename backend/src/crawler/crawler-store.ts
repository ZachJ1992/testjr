import { randomUUID } from "crypto";
import type { RowDataPacket } from "mysql2";
import { pool } from "../db.js";
import type { CrawlerConfig, CrawlerSyncLog } from "./crawler-types.js";

// ==================== 配置 Row 映射 ====================

interface CrawlerConfigRow extends RowDataPacket {
  id: string;
  financier_id: string;
  name: string;
  system_url: string;
  api_endpoint: string;
  cookies: string;
  company_id: string | null;
  user_id: string | null;
  group_id: string | null;
  extra_params: string | null;
  sync_enabled: number;
  sync_interval_minutes: number;
  last_sync_time: string | null;
  last_sync_record_id: string | null;
  last_sync_count: number | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
}

interface CrawlerSyncLogRow extends RowDataPacket {
  id: string;
  config_id: string;
  start_time: string;
  end_time: string | null;
  status: string;
  total_fetched: number;
  new_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  error_message: string | null;
  created_at: string;
}

function mapConfigRow(row: CrawlerConfigRow): CrawlerConfig {
  // 解析 extraParams
  let extraParams: Record<string, any> | undefined;
  if (row.extra_params) {
    try {
      extraParams = typeof row.extra_params === 'string' 
        ? JSON.parse(row.extra_params) 
        : row.extra_params;
    } catch (e) {
      extraParams = undefined;
    }
  }
  
  // 从 extraParams 中获取登录配置，或使用默认值
  const loginConfig = {
    companyId: extraParams?.loginCompanyId || row.company_id || '100020',
    username: extraParams?.loginUsername || '超级管理员',
    password: extraParams?.loginPassword || 'abc123',  // 默认密码改为 abc123
  };
  
  return {
    id: row.id,
    financierId: row.financier_id,
    financierName: (extraParams?.financierName as string) || row.name,
    name: row.name,
    systemUrl: row.system_url,
    baseUrl: row.system_url,  // 等同于 systemUrl
    apiEndpoint: row.api_endpoint,
    cookies: row.cookies,
    companyId: row.company_id || undefined,
    userId: row.user_id || undefined,
    groupId: row.group_id || undefined,
    loginConfig,
    extraParams,
    syncEnabled: !!row.sync_enabled,
    enabled: !!row.sync_enabled,
    syncIntervalMinutes: row.sync_interval_minutes,
    syncInterval: row.sync_interval_minutes,
    lastSyncTime: row.last_sync_time || undefined,
    lastSyncRecordId: row.last_sync_record_id || undefined,
    lastSyncCount: row.last_sync_count || undefined,
    lastSyncStatus: row.last_sync_status as CrawlerConfig['lastSyncStatus'],
    lastSyncError: row.last_sync_error || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLogRow(row: CrawlerSyncLogRow): CrawlerSyncLog {
  return {
    id: row.id,
    configId: row.config_id,
    startTime: row.start_time,
    endTime: row.end_time || undefined,
    status: row.status as CrawlerSyncLog['status'],
    totalFetched: row.total_fetched,
    newCount: row.new_count,
    updatedCount: row.updated_count,
    skippedCount: row.skipped_count,
    errorCount: row.error_count,
    errorMessage: row.error_message || undefined,
    createdAt: row.created_at,
  };
}

// ==================== 配置 CRUD ====================

export async function getCrawlerConfigs(financierId?: string): Promise<CrawlerConfig[]> {
  let query = `SELECT * FROM crawler_configs WHERE deleted_at IS NULL`;
  const params: any[] = [];

  if (financierId) {
    query += ` AND financier_id = ?`;
    params.push(financierId);
  }

  query += ` ORDER BY created_at DESC`;

  const [rows] = await pool.query<CrawlerConfigRow[]>(query, params);
  return rows.map(mapConfigRow);
}

export async function getCrawlerConfigById(id: string): Promise<CrawlerConfig | undefined> {
  const [rows] = await pool.query<CrawlerConfigRow[]>(
    `SELECT * FROM crawler_configs WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [id]
  );
  return rows[0] ? mapConfigRow(rows[0]) : undefined;
}

export async function createCrawlerConfig(input: Omit<CrawlerConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<CrawlerConfig> {
  const id = randomUUID();

  await pool.query(
    `INSERT INTO crawler_configs (
      id, financier_id, name, system_url, api_endpoint, cookies,
      company_id, user_id, group_id, extra_params,
      sync_enabled, sync_interval_minutes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.financierId,
      input.name,
      input.systemUrl,
      input.apiEndpoint,
      input.cookies,
      input.companyId || null,
      input.userId || null,
      input.groupId || null,
      input.extraParams ? JSON.stringify(input.extraParams) : null,
      input.syncEnabled ? 1 : 0,
      input.syncIntervalMinutes || 60,
    ]
  );

  const config = await getCrawlerConfigById(id);
  if (!config) throw new Error("创建爬虫配置失败");
  return config;
}

export async function updateCrawlerConfig(id: string, input: Partial<CrawlerConfig>): Promise<CrawlerConfig> {
  const current = await getCrawlerConfigById(id);
  if (!current) throw new Error("爬虫配置不存在");

  const updates: string[] = [];
  const params: any[] = [];

  if (input.name !== undefined) {
    updates.push('name = ?');
    params.push(input.name);
  }
  if (input.systemUrl !== undefined) {
    updates.push('system_url = ?');
    params.push(input.systemUrl);
  }
  if (input.apiEndpoint !== undefined) {
    updates.push('api_endpoint = ?');
    params.push(input.apiEndpoint);
  }
  if (input.cookies !== undefined) {
    updates.push('cookies = ?');
    params.push(input.cookies);
  }
  if (input.companyId !== undefined) {
    updates.push('company_id = ?');
    params.push(input.companyId || null);
  }
  if (input.userId !== undefined) {
    updates.push('user_id = ?');
    params.push(input.userId || null);
  }
  if (input.groupId !== undefined) {
    updates.push('group_id = ?');
    params.push(input.groupId || null);
  }
  if (input.extraParams !== undefined) {
    updates.push('extra_params = ?');
    params.push(input.extraParams ? JSON.stringify(input.extraParams) : null);
  }
  if (input.syncEnabled !== undefined) {
    updates.push('sync_enabled = ?');
    params.push(input.syncEnabled ? 1 : 0);
  }
  if (input.syncIntervalMinutes !== undefined) {
    updates.push('sync_interval_minutes = ?');
    params.push(input.syncIntervalMinutes);
  }
  if (input.lastSyncTime !== undefined) {
    updates.push('last_sync_time = ?');
    params.push(input.lastSyncTime);
  }
  if (input.lastSyncRecordId !== undefined) {
    updates.push('last_sync_record_id = ?');
    params.push(input.lastSyncRecordId);
  }
  if (input.lastSyncCount !== undefined) {
    updates.push('last_sync_count = ?');
    params.push(input.lastSyncCount);
  }
  if (input.lastSyncStatus !== undefined) {
    updates.push('last_sync_status = ?');
    params.push(input.lastSyncStatus);
  }
  if (input.lastSyncError !== undefined) {
    updates.push('last_sync_error = ?');
    params.push(input.lastSyncError || null);
  }

  if (updates.length > 0) {
    params.push(id);
    await pool.query(
      `UPDATE crawler_configs SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
  }

  const updated = await getCrawlerConfigById(id);
  if (!updated) throw new Error("更新爬虫配置失败");
  return updated;
}

export async function deleteCrawlerConfig(id: string): Promise<void> {
  const current = await getCrawlerConfigById(id);
  if (!current) throw new Error("爬虫配置不存在");

  await pool.query(
    `UPDATE crawler_configs SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [id]
  );
}

// ==================== 同步日志 ====================

export async function getCrawlerSyncLogs(configId: string, limit: number = 50): Promise<CrawlerSyncLog[]> {
  const [rows] = await pool.query<CrawlerSyncLogRow[]>(
    `SELECT * FROM crawler_sync_logs WHERE config_id = ? ORDER BY start_time DESC LIMIT ?`,
    [configId, limit]
  );
  return rows.map(mapLogRow);
}

export async function createCrawlerSyncLog(input: {
  configId: string;
  status: 'running' | 'success' | 'failed';
}): Promise<CrawlerSyncLog> {
  const id = randomUUID();

  await pool.query(
    `INSERT INTO crawler_sync_logs (id, config_id, start_time, status) VALUES (?, ?, NOW(), ?)`,
    [id, input.configId, input.status]
  );

  const [rows] = await pool.query<CrawlerSyncLogRow[]>(
    `SELECT * FROM crawler_sync_logs WHERE id = ? LIMIT 1`,
    [id]
  );

  if (!rows[0]) throw new Error("创建同步日志失败");
  return mapLogRow(rows[0]);
}

export async function updateCrawlerSyncLog(id: string, input: Partial<CrawlerSyncLog>): Promise<void> {
  const updates: string[] = [];
  const params: any[] = [];

  if (input.endTime !== undefined) {
    updates.push('end_time = ?');
    params.push(input.endTime);
  }
  if (input.status !== undefined) {
    updates.push('status = ?');
    params.push(input.status);
  }
  if (input.totalFetched !== undefined) {
    updates.push('total_fetched = ?');
    params.push(input.totalFetched);
  }
  if (input.newCount !== undefined) {
    updates.push('new_count = ?');
    params.push(input.newCount);
  }
  if (input.updatedCount !== undefined) {
    updates.push('updated_count = ?');
    params.push(input.updatedCount);
  }
  if (input.skippedCount !== undefined) {
    updates.push('skipped_count = ?');
    params.push(input.skippedCount);
  }
  if (input.errorCount !== undefined) {
    updates.push('error_count = ?');
    params.push(input.errorCount);
  }
  if (input.errorMessage !== undefined) {
    updates.push('error_message = ?');
    params.push(input.errorMessage || null);
  }

  if (updates.length > 0) {
    params.push(id);
    await pool.query(
      `UPDATE crawler_sync_logs SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
  }
}

// ==================== 获取需要同步的配置 ====================

export async function getActiveCrawlerConfigs(): Promise<CrawlerConfig[]> {
  const [rows] = await pool.query<CrawlerConfigRow[]>(`
    SELECT * FROM crawler_configs 
    WHERE deleted_at IS NULL 
      AND sync_enabled = 1
      AND (
        last_sync_time IS NULL 
        OR TIMESTAMPDIFF(MINUTE, last_sync_time, NOW()) >= sync_interval_minutes
      )
    ORDER BY last_sync_time ASC
  `);
  return rows.map(mapConfigRow);
}
