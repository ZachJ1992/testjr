/**
 * 操作日志数据访问层（阶段 B）
 *
 * - recordOperationLog 用于业务路由统一写日志（异步、最终一致；失败不阻塞主流程）
 * - getOperationLogs 提供分页查询，按主体维度过滤
 */

import { randomUUID } from "crypto";
import type { RowDataPacket } from "mysql2";
import { pool } from "./db.js";

export interface OperationLogRecord {
  id: string;
  operatorUserId?: string;
  operatorTenantId?: string;
  targetType?: string;
  targetId?: string;
  action: string;
  beforeSnapshot?: any;
  afterSnapshot?: any;
  isSensitive: boolean;
  confirmed: boolean;
  ip?: string;
  ua?: string;
  createdAt: string;
}

export interface RecordOperationLogInput {
  operatorUserId?: string;
  operatorTenantId?: string;
  targetType?: string;
  targetId?: string;
  action: string;
  beforeSnapshot?: any;
  afterSnapshot?: any;
  isSensitive?: boolean;
  confirmed?: boolean;
  ip?: string;
  ua?: string;
}

export interface OperationLogQuery {
  operatorTenantId?: string; // 仅看某主体；undefined 表示不限制
  operatorUserId?: string;
  action?: string;
  isSensitive?: boolean;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

function jsonOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function parseJson(raw: unknown): any {
  if (raw === null || raw === undefined) return undefined;
  if (Array.isArray(raw) || typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

function mapRow(row: RowDataPacket): OperationLogRecord {
  return {
    id: row.id,
    operatorUserId: row.operator_user_id ?? undefined,
    operatorTenantId: row.operator_tenant_id ?? undefined,
    targetType: row.target_type ?? undefined,
    targetId: row.target_id ?? undefined,
    action: row.action,
    beforeSnapshot: parseJson(row.before_snapshot),
    afterSnapshot: parseJson(row.after_snapshot),
    isSensitive: !!row.is_sensitive,
    confirmed: !!row.confirmed,
    ip: row.ip ?? undefined,
    ua: row.ua ?? undefined,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

/**
 * 写一条操作日志。永不抛出（出错降级为 warn），避免污染主链路。
 */
export async function recordOperationLog(
  input: RecordOperationLogInput
): Promise<void> {
  try {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO operation_logs
        (id, operator_user_id, operator_tenant_id, target_type, target_id,
         action, before_snapshot, after_snapshot, is_sensitive, confirmed,
         ip, ua)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.operatorUserId || null,
        input.operatorTenantId || null,
        input.targetType || null,
        input.targetId || null,
        input.action,
        jsonOrNull(input.beforeSnapshot),
        jsonOrNull(input.afterSnapshot),
        input.isSensitive ? 1 : 0,
        input.confirmed ? 1 : 0,
        input.ip || null,
        input.ua || null,
      ]
    );
  } catch (err: any) {
    if (err?.code !== "ER_NO_SUCH_TABLE") {
      console.warn("[recordOperationLog] failed:", err?.message);
    }
  }
}

export async function getOperationLogs(
  query: OperationLogQuery = {}
): Promise<{ items: OperationLogRecord[]; total: number }> {
  const conditions: string[] = [];
  const params: any[] = [];

  if (query.operatorTenantId) {
    conditions.push("operator_tenant_id = ?");
    params.push(query.operatorTenantId);
  }
  if (query.operatorUserId) {
    conditions.push("operator_user_id = ?");
    params.push(query.operatorUserId);
  }
  if (query.action) {
    conditions.push("action = ?");
    params.push(query.action);
  }
  if (query.isSensitive !== undefined) {
    conditions.push("is_sensitive = ?");
    params.push(query.isSensitive ? 1 : 0);
  }
  if (query.startDate) {
    conditions.push("created_at >= ?");
    params.push(query.startDate);
  }
  if (query.endDate) {
    conditions.push("created_at <= ?");
    params.push(query.endDate);
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  try {
    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS cnt FROM operation_logs ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.cnt || 0);

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, operator_user_id, operator_tenant_id, target_type, target_id,
              action, before_snapshot, after_snapshot, is_sensitive, confirmed,
              ip, ua, created_at
       FROM operation_logs
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    return {
      items: rows.map(mapRow),
      total,
    };
  } catch (err: any) {
    if (err?.code === "ER_NO_SUCH_TABLE") {
      return { items: [], total: 0 };
    }
    throw err;
  }
}
