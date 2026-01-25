import { randomUUID } from "crypto";
import { pool } from "./db.js";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

// 类型定义
export type PaymentCodeStatus = "active" | "used" | "expired" | "cancelled";
export type TmsSyncStatus = "pending" | "synced" | "failed";

export interface PaymentCode {
  id: string;
  code: string;
  requestId: string;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  amount: number;
  expireAt: string;
  status: PaymentCodeStatus;
  usedAt?: string;
  usedLocation?: string;
  tmsSyncStatus: TmsSyncStatus;
  tmsSyncTime?: string;
  tmsSyncResponse?: any;
  createdAt: string;
  updatedAt?: string;
}

type PaymentCodeRow = RowDataPacket & {
  id: string;
  code: string;
  request_id: string;
  driver_id: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  amount: string;
  expire_at: Date;
  status: string;
  used_at: Date | null;
  used_location: string | null;
  tms_sync_status: string;
  tms_sync_time: Date | null;
  tms_sync_response: any;
  created_at: Date;
  updated_at: Date | null;
};

// 生成付款码
function generatePaymentCode(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DPY${date}${random}`;
}

// 转换数据库行到付款码对象
function rowToPaymentCode(row: PaymentCodeRow): PaymentCode {
  return {
    id: row.id,
    code: row.code,
    requestId: row.request_id,
    driverId: row.driver_id ?? undefined,
    driverName: row.driver_name ?? undefined,
    driverPhone: row.driver_phone ?? undefined,
    amount: parseFloat(row.amount),
    expireAt: row.expire_at.toISOString(),
    status: row.status as PaymentCodeStatus,
    usedAt: row.used_at?.toISOString(),
    usedLocation: row.used_location ?? undefined,
    tmsSyncStatus: row.tms_sync_status as TmsSyncStatus,
    tmsSyncTime: row.tms_sync_time?.toISOString(),
    tmsSyncResponse: row.tms_sync_response ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at?.toISOString()
  };
}

// 创建付款码
export async function createPaymentCode(input: {
  requestId: string;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  amount: number;
  expireHours?: number; // 默认24小时
}): Promise<PaymentCode> {
  const id = randomUUID();
  const code = generatePaymentCode();
  const expireHours = input.expireHours || 24;
  const expireAt = new Date(Date.now() + expireHours * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO payment_codes 
     (id, code, request_id, driver_id, driver_name, driver_phone, amount, expire_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    [id, code, input.requestId, input.driverId ?? null, input.driverName ?? null, input.driverPhone ?? null, input.amount, expireAt]
  );

  const paymentCode = await getPaymentCodeById(id);
  if (!paymentCode) throw new Error("创建付款码失败");
  return paymentCode;
}

// 根据ID获取
export async function getPaymentCodeById(id: string): Promise<PaymentCode | undefined> {
  const [rows] = await pool.query<PaymentCodeRow[]>(
    `SELECT * FROM payment_codes WHERE id = ?`,
    [id]
  );
  if (rows.length === 0) return undefined;
  return rowToPaymentCode(rows[0]);
}

// 根据code获取
export async function getPaymentCodeByCode(code: string): Promise<PaymentCode | undefined> {
  const [rows] = await pool.query<PaymentCodeRow[]>(
    `SELECT * FROM payment_codes WHERE code = ?`,
    [code]
  );
  if (rows.length === 0) return undefined;
  return rowToPaymentCode(rows[0]);
}

// 获取付款码列表
export async function getPaymentCodes(filters?: {
  requestId?: string;
  driverId?: string;
  status?: PaymentCodeStatus;
  startDate?: string;
  endDate?: string;
}): Promise<PaymentCode[]> {
  let sql = `SELECT * FROM payment_codes WHERE 1=1`;
  const params: any[] = [];

  if (filters?.requestId) {
    sql += ` AND request_id = ?`;
    params.push(filters.requestId);
  }
  if (filters?.driverId) {
    sql += ` AND driver_id = ?`;
    params.push(filters.driverId);
  }
  if (filters?.status) {
    sql += ` AND status = ?`;
    params.push(filters.status);
  }
  if (filters?.startDate) {
    sql += ` AND created_at >= ?`;
    params.push(filters.startDate);
  }
  if (filters?.endDate) {
    sql += ` AND created_at <= ?`;
    params.push(filters.endDate + ' 23:59:59');
  }

  sql += ` ORDER BY created_at DESC`;

  const [rows] = await pool.query<PaymentCodeRow[]>(sql, params);
  return rows.map(rowToPaymentCode);
}

// 使用付款码
export async function usePaymentCode(
  code: string,
  usedLocation?: string
): Promise<PaymentCode> {
  const paymentCode = await getPaymentCodeByCode(code);
  if (!paymentCode) throw new Error("付款码不存在");
  if (paymentCode.status !== "active") throw new Error("付款码状态无效");
  if (new Date(paymentCode.expireAt) < new Date()) throw new Error("付款码已过期");

  await pool.query(
    `UPDATE payment_codes SET status = 'used', used_at = NOW(), used_location = ?, updated_at = NOW() WHERE code = ?`,
    [usedLocation ?? null, code]
  );

  return (await getPaymentCodeByCode(code))!;
}

// 取消付款码
export async function cancelPaymentCode(code: string): Promise<void> {
  const paymentCode = await getPaymentCodeByCode(code);
  if (!paymentCode) throw new Error("付款码不存在");
  if (paymentCode.status !== "active") throw new Error("只能取消有效的付款码");

  await pool.query(
    `UPDATE payment_codes SET status = 'cancelled', updated_at = NOW() WHERE code = ? AND status = 'active'`,
    [code]
  );
}

// 更新TMS同步状态
export async function updateTmsSyncStatus(
  code: string,
  status: TmsSyncStatus,
  response?: any
): Promise<void> {
  await pool.query(
    `UPDATE payment_codes SET tms_sync_status = ?, tms_sync_time = NOW(), tms_sync_response = ?, updated_at = NOW() WHERE code = ?`,
    [status, response ? JSON.stringify(response) : null, code]
  );
}

// 获取过期的付款码（用于定时任务）
export async function getExpiredPaymentCodes(): Promise<PaymentCode[]> {
  const [rows] = await pool.query<PaymentCodeRow[]>(
    `SELECT * FROM payment_codes WHERE status = 'active' AND expire_at < NOW()`
  );
  return rows.map(rowToPaymentCode);
}

// 批量过期付款码
export async function expirePaymentCodes(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  
  const placeholders = ids.map(() => '?').join(',');
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE payment_codes SET status = 'expired', updated_at = NOW() WHERE id IN (${placeholders}) AND status = 'active'`,
    ids
  );
  return result.affectedRows;
}

// 定时任务：自动过期付款码
export async function autoExpirePaymentCodes(): Promise<number> {
  const expired = await getExpiredPaymentCodes();
  if (expired.length === 0) return 0;
  
  const ids = expired.map(p => p.id);
  return await expirePaymentCodes(ids);
}

// 根据请求ID获取付款码
export async function getPaymentCodesByRequestId(requestId: string): Promise<PaymentCode[]> {
  const [rows] = await pool.query<PaymentCodeRow[]>(
    `SELECT * FROM payment_codes WHERE request_id = ? ORDER BY created_at DESC`,
    [requestId]
  );
  return rows.map(rowToPaymentCode);
}
