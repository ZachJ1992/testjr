import { randomUUID } from "crypto";
import { pool } from "./db.js";
import { RowDataPacket, ResultSetHeader } from "mysql2";

// ==================== 类型定义 ====================

export type ReceiverType = "bank_transfer" | "virtual_account" | "payment_code" | "oil_card" | "etc_recharge";
export type PaymentRequestStatus = "pending" | "platform_pending" | "funder_pending" | "approved" | "rejected" | "processing" | "success" | "failed" | "cancelled";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface DirectedPaymentRequest {
  id: string;
  requestNumber: string;
  contractId: string;
  contractNumber?: string;
  waybillId?: string;
  waybillNumber?: string;
  categoryCode: string;
  categoryName: string;
  paymentAmount: number;
  serviceFee: number;
  interestStartTime?: string;
  receiverType: ReceiverType;
  receiverName?: string;
  receiverAccount?: string;
  receiverBank?: string;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  remark?: string;
  status: PaymentRequestStatus;
  platformApprovalStatus: ApprovalStatus;
  platformApprovedBy?: string;
  platformApprovedAt?: string;
  platformApprovalRemark?: string;
  funderApprovalStatus: ApprovalStatus;
  funderApprovedBy?: string;
  funderApprovedAt?: string;
  funderApprovalRemark?: string;
  executionTime?: string;
  executionChannel?: string;
  executionTransactionId?: string;
  executionStatus?: string;
  executionFailureReason?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PaymentRequestStats {
  totalCount: number;
  pendingCount: number;
  approvedCount: number;
  processingCount: number;
  successCount: number;
  failedCount: number;
  rejectedCount: number;
  totalAmount: number;
  successAmount: number;
}

// ==================== 数据库表初始化 ====================

export async function ensureDirectedPaymentTables(): Promise<void> {
  // 定向支付合同表（如果不存在则创建）
  await pool.query(`
    CREATE TABLE IF NOT EXISTS directed_pay_contracts (
      id VARCHAR(36) PRIMARY KEY,
      contract_number VARCHAR(50) NOT NULL UNIQUE,
      funder_id VARCHAR(36) NOT NULL,
      financier_id VARCHAR(36) NOT NULL,
      funder_account_id VARCHAR(100),
      credit_limit DECIMAL(18,2) NOT NULL,
      used_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      available_amount DECIMAL(18,2) NOT NULL,
      annual_interest_rate DECIMAL(5,4) NOT NULL,
      interest_calc_base INT NOT NULL DEFAULT 360,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      settlement_cycle VARCHAR(20) NOT NULL,
      settlement_day INT NOT NULL,
      grace_period_days INT NOT NULL DEFAULT 3,
      auto_payment_enabled TINYINT(1) NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      remark TEXT,
      created_by VARCHAR(36),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      deleted_at DATETIME NULL,
      INDEX idx_dpc_funder (funder_id),
      INDEX idx_dpc_financier (financier_id),
      INDEX idx_dpc_status (status),
      INDEX idx_dpc_dates (start_date, end_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 支付类别配置表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_category_configs (
      id VARCHAR(36) PRIMARY KEY,
      contract_id VARCHAR(36) NOT NULL,
      category_code VARCHAR(50) NOT NULL,
      category_name VARCHAR(100) NOT NULL,
      payment_ratio DECIMAL(5,2) NOT NULL DEFAULT 100,
      min_amount DECIMAL(18,2),
      max_amount DECIMAL(18,2),
      daily_limit DECIMAL(18,2),
      require_platform_approval TINYINT(1) NOT NULL DEFAULT 1,
      require_funder_approval TINYINT(1) NOT NULL DEFAULT 1,
      platform_approval_threshold DECIMAL(18,2),
      funder_approval_threshold DECIMAL(18,2),
      auto_payment_enabled TINYINT(1) NOT NULL DEFAULT 0,
      is_enabled TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pcc_contract (contract_id),
      INDEX idx_pcc_category (category_code),
      UNIQUE KEY uk_contract_category (contract_id, category_code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 定向支付申请表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS directed_payment_requests (
      id VARCHAR(36) PRIMARY KEY,
      request_number VARCHAR(50) NOT NULL UNIQUE,
      contract_id VARCHAR(36) NOT NULL,
      waybill_id VARCHAR(36),
      waybill_number VARCHAR(50),
      category_code VARCHAR(50) NOT NULL,
      category_name VARCHAR(100) NOT NULL,
      payment_amount DECIMAL(18,2) NOT NULL,
      service_fee DECIMAL(18,2) NOT NULL DEFAULT 0,
      interest_start_time DATETIME,
      receiver_type VARCHAR(20) NOT NULL,
      receiver_name VARCHAR(100),
      receiver_account VARCHAR(100),
      receiver_bank VARCHAR(100),
      driver_id VARCHAR(36),
      driver_name VARCHAR(100),
      driver_phone VARCHAR(20),
      remark TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      platform_approval_status VARCHAR(20) DEFAULT 'pending',
      platform_approved_by VARCHAR(36),
      platform_approved_at DATETIME,
      platform_approval_remark TEXT,
      funder_approval_status VARCHAR(20) DEFAULT 'pending',
      funder_approved_by VARCHAR(36),
      funder_approved_at DATETIME,
      funder_approval_remark TEXT,
      execution_time DATETIME,
      execution_channel VARCHAR(50),
      execution_transaction_id VARCHAR(100),
      execution_status VARCHAR(20),
      execution_failure_reason TEXT,
      created_by VARCHAR(36),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_dpr_contract (contract_id),
      INDEX idx_dpr_waybill (waybill_id),
      INDEX idx_dpr_status (status),
      INDEX idx_dpr_driver (driver_id),
      INDEX idx_dpr_category (category_code),
      INDEX idx_dpr_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 付款码表
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_codes (
      id VARCHAR(36) PRIMARY KEY,
      code VARCHAR(50) NOT NULL UNIQUE,
      request_id VARCHAR(36) NOT NULL,
      driver_id VARCHAR(36),
      amount DECIMAL(18,2) NOT NULL,
      expire_at DATETIME NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      used_at DATETIME,
      used_location VARCHAR(200),
      tms_sync_status VARCHAR(20) DEFAULT 'pending',
      tms_sync_time DATETIME,
      tms_sync_response JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_pc_request (request_id),
      INDEX idx_pc_driver (driver_id),
      INDEX idx_pc_status (status),
      INDEX idx_pc_expire (expire_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

// ==================== 辅助函数 ====================

// 生成申请编号
function generateRequestNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DPR${date}${random}`;
}

// 生成付款码
function generatePaymentCode(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `DPY${date}${random}`;
}

// 映射行数据到 DirectedPaymentRequest 对象
function mapRequestRow(row: RowDataPacket): DirectedPaymentRequest {
  return {
    id: row.id,
    requestNumber: row.request_number,
    contractId: row.contract_id,
    contractNumber: row.contract_number,
    waybillId: row.waybill_id || undefined,
    waybillNumber: row.waybill_number || undefined,
    categoryCode: row.category_code,
    categoryName: row.category_name,
    paymentAmount: Number(row.payment_amount),
    serviceFee: Number(row.service_fee),
    interestStartTime: row.interest_start_time ? new Date(row.interest_start_time).toISOString() : undefined,
    receiverType: row.receiver_type,
    receiverName: row.receiver_name || undefined,
    receiverAccount: row.receiver_account || undefined,
    receiverBank: row.receiver_bank || undefined,
    driverId: row.driver_id || undefined,
    driverName: row.driver_name || undefined,
    driverPhone: row.driver_phone || undefined,
    remark: row.remark || undefined,
    status: row.status,
    platformApprovalStatus: row.platform_approval_status,
    platformApprovedBy: row.platform_approved_by || undefined,
    platformApprovedAt: row.platform_approved_at ? new Date(row.platform_approved_at).toISOString() : undefined,
    platformApprovalRemark: row.platform_approval_remark || undefined,
    funderApprovalStatus: row.funder_approval_status,
    funderApprovedBy: row.funder_approved_by || undefined,
    funderApprovedAt: row.funder_approved_at ? new Date(row.funder_approved_at).toISOString() : undefined,
    funderApprovalRemark: row.funder_approval_remark || undefined,
    executionTime: row.execution_time ? new Date(row.execution_time).toISOString() : undefined,
    executionChannel: row.execution_channel || undefined,
    executionTransactionId: row.execution_transaction_id || undefined,
    executionStatus: row.execution_status || undefined,
    executionFailureReason: row.execution_failure_reason || undefined,
    createdBy: row.created_by || undefined,
    createdByName: row.created_by_name || undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
  };
}

// 获取类别配置
async function getPaymentCategoryConfig(contractId: string, categoryCode: string): Promise<{
  requirePlatformApproval: boolean;
  requireFunderApproval: boolean;
  platformApprovalThreshold?: number;
  funderApprovalThreshold?: number;
  paymentRatio: number;  // 支付比例 (0-100)
} | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM payment_category_configs 
     WHERE contract_id = ? AND category_code = ? AND is_enabled = 1`,
    [contractId, categoryCode]
  );
  if (rows.length === 0) return null;
  
  const row = rows[0];
  return {
    requirePlatformApproval: row.require_platform_approval === 1,
    requireFunderApproval: row.require_funder_approval === 1,
    platformApprovalThreshold: row.platform_approval_threshold ? Number(row.platform_approval_threshold) : undefined,
    funderApprovalThreshold: row.funder_approval_threshold ? Number(row.funder_approval_threshold) : undefined,
    paymentRatio: Number(row.payment_ratio) || 100,  // 默认100%全额支付
  };
}

// ==================== 支付申请 CRUD ====================

// 创建支付申请
export async function createPaymentRequest(input: {
  contractId: string;
  waybillId?: string;
  waybillNumber?: string;
  categoryCode: string;
  categoryName: string;
  paymentAmount: number;
  serviceFee?: number;
  receiverType: ReceiverType;
  receiverName?: string;
  receiverAccount?: string;
  receiverBank?: string;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  remark?: string;
  createdBy?: string;
  skipApproval?: boolean; // admin 用户可跳过审批
}): Promise<DirectedPaymentRequest> {
  const id = randomUUID();
  const requestNumber = generateRequestNumber();

  // 获取类别配置，判断是否需要审批
  const categoryConfig = await getPaymentCategoryConfig(input.contractId, input.categoryCode);
  
  // 服务费由调用方传入，默认为0
  const serviceFee = input.serviceFee ?? 0;
  
  // 判断初始状态
  let status: PaymentRequestStatus = "pending";
  let platformApprovalStatus: ApprovalStatus = "pending";
  let funderApprovalStatus: ApprovalStatus = "pending";
  
  if (input.skipApproval) {
    // admin 用户跳过审批
    status = "approved";
    platformApprovalStatus = "approved";
    funderApprovalStatus = "approved";
  } else if (categoryConfig) {
    // 如果金额低于审批阈值，可以跳过审批
    const needPlatformApproval = categoryConfig.requirePlatformApproval && 
      (!categoryConfig.platformApprovalThreshold || input.paymentAmount >= categoryConfig.platformApprovalThreshold);
    const needFunderApproval = categoryConfig.requireFunderApproval && 
      (!categoryConfig.funderApprovalThreshold || input.paymentAmount >= categoryConfig.funderApprovalThreshold);
    
    if (needPlatformApproval) {
      status = "platform_pending";
    } else if (needFunderApproval) {
      status = "funder_pending";
      platformApprovalStatus = "approved";
    } else {
      status = "approved";
      platformApprovalStatus = "approved";
      funderApprovalStatus = "approved";
    }
  } else {
    // 没有类别配置，默认需要平台审批
    status = "platform_pending";
  }

  await pool.query(
    `INSERT INTO directed_payment_requests 
     (id, request_number, contract_id, waybill_id, waybill_number,
      category_code, category_name, payment_amount, service_fee,
      receiver_type, receiver_name, receiver_account, receiver_bank,
      driver_id, driver_name, driver_phone, remark,
      status, platform_approval_status, funder_approval_status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, requestNumber, input.contractId, input.waybillId || null, input.waybillNumber || null,
      input.categoryCode, input.categoryName, input.paymentAmount, serviceFee,
      input.receiverType, input.receiverName || null, input.receiverAccount || null, input.receiverBank || null,
      input.driverId || null, input.driverName || null, input.driverPhone || null, input.remark || null,
      status, platformApprovalStatus, funderApprovalStatus, input.createdBy || null
    ]
  );

  const request = await getPaymentRequestById(id);
  if (!request) throw new Error("创建支付申请失败");
  return request;
}

// 获取支付申请详情
export async function getPaymentRequestById(id: string): Promise<DirectedPaymentRequest | undefined> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT r.*, c.contract_number, u.display_name as created_by_name
     FROM directed_payment_requests r
     LEFT JOIN directed_pay_contracts c ON r.contract_id = c.id
     LEFT JOIN users u ON r.created_by = u.id
     WHERE r.id = ?`,
    [id]
  );
  return rows[0] ? mapRequestRow(rows[0]) : undefined;
}

// 获取支付申请列表
export async function getPaymentRequests(filters?: {
  contractId?: string;
  waybillId?: string;
  status?: PaymentRequestStatus;
  driverId?: string;
  categoryCode?: string;
  startDate?: string;
  endDate?: string;
  financierId?: string;  // 按融资方过滤（数据隔离）
  funderId?: string;     // 按资金方过滤（数据隔离）
}): Promise<DirectedPaymentRequest[]> {
  let query = `
    SELECT r.*, c.contract_number, c.financier_id, c.funder_id, u.display_name as created_by_name
    FROM directed_payment_requests r
    LEFT JOIN directed_pay_contracts c ON r.contract_id = c.id
    LEFT JOIN users u ON r.created_by = u.id
    WHERE 1=1
  `;
  const values: any[] = [];

  // 数据隔离：融资方只能看自己的申请
  if (filters?.financierId) {
    query += " AND c.financier_id = ?";
    values.push(filters.financierId);
  }
  // 数据隔离：资金方只能看自己合同下的申请
  if (filters?.funderId) {
    query += " AND c.funder_id = ?";
    values.push(filters.funderId);
  }

  if (filters?.contractId) {
    query += " AND r.contract_id = ?";
    values.push(filters.contractId);
  }
  if (filters?.waybillId) {
    query += " AND r.waybill_id = ?";
    values.push(filters.waybillId);
  }
  if (filters?.status) {
    query += " AND r.status = ?";
    values.push(filters.status);
  }
  if (filters?.driverId) {
    query += " AND r.driver_id = ?";
    values.push(filters.driverId);
  }
  if (filters?.categoryCode) {
    query += " AND r.category_code = ?";
    values.push(filters.categoryCode);
  }
  if (filters?.startDate) {
    query += " AND r.created_at >= ?";
    values.push(filters.startDate);
  }
  if (filters?.endDate) {
    query += " AND r.created_at <= ?";
    values.push(filters.endDate + " 23:59:59");
  }

  query += " ORDER BY r.created_at DESC";

  const [rows] = await pool.query<RowDataPacket[]>(query, values);
  return rows.map(mapRequestRow);
}

// 获取待审批列表
export async function getPendingApprovals(filters: {
  type: "platform" | "funder";
  funderId?: string;  // 资金方审批时按资金方过滤
}): Promise<DirectedPaymentRequest[]> {
  const statusCondition = filters.type === "platform" 
    ? "r.status = 'platform_pending'" 
    : "r.status = 'funder_pending'";
  
  let query = `
    SELECT r.*, c.contract_number, c.funder_id, u.display_name as created_by_name
    FROM directed_payment_requests r
    LEFT JOIN directed_pay_contracts c ON r.contract_id = c.id
    LEFT JOIN users u ON r.created_by = u.id
    WHERE ${statusCondition}
  `;
  const values: any[] = [];
  
  // 资金方审批时只能看到自己合同的待审批
  if (filters.funderId) {
    query += " AND c.funder_id = ?";
    values.push(filters.funderId);
  }
  
  query += " ORDER BY r.created_at DESC";
  
  const [rows] = await pool.query<RowDataPacket[]>(query, values);
  return rows.map(mapRequestRow);
}

// 获取支付申请统计
export async function getPaymentRequestStats(filters?: {
  contractId?: string;
  startDate?: string;
  endDate?: string;
  financierId?: string;  // 按融资方过滤（数据隔离）
  funderId?: string;     // 按资金方过滤（数据隔离）
}): Promise<PaymentRequestStats> {
  let query = `
    SELECT 
      COUNT(*) as total_count,
      SUM(CASE WHEN r.status IN ('pending', 'platform_pending', 'funder_pending') THEN 1 ELSE 0 END) as pending_count,
      SUM(CASE WHEN r.status = 'approved' THEN 1 ELSE 0 END) as approved_count,
      SUM(CASE WHEN r.status = 'processing' THEN 1 ELSE 0 END) as processing_count,
      SUM(CASE WHEN r.status = 'success' THEN 1 ELSE 0 END) as success_count,
      SUM(CASE WHEN r.status = 'failed' THEN 1 ELSE 0 END) as failed_count,
      SUM(CASE WHEN r.status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
      COALESCE(SUM(r.payment_amount), 0) as total_amount,
      COALESCE(SUM(CASE WHEN r.status = 'success' THEN r.payment_amount ELSE 0 END), 0) as success_amount
    FROM directed_payment_requests r
    LEFT JOIN directed_pay_contracts c ON r.contract_id = c.id
    WHERE 1=1
  `;
  const values: any[] = [];

  // 数据隔离：融资方只能看自己的统计
  if (filters?.financierId) {
    query += " AND c.financier_id = ?";
    values.push(filters.financierId);
  }
  // 数据隔离：资金方只能看自己合同的统计
  if (filters?.funderId) {
    query += " AND c.funder_id = ?";
    values.push(filters.funderId);
  }

  if (filters?.contractId) {
    query += " AND r.contract_id = ?";
    values.push(filters.contractId);
  }
  if (filters?.startDate) {
    query += " AND r.created_at >= ?";
    values.push(filters.startDate);
  }
  if (filters?.endDate) {
    query += " AND r.created_at <= ?";
    values.push(filters.endDate + " 23:59:59");
  }

  const [rows] = await pool.query<RowDataPacket[]>(query, values);
  const row = rows[0];
  
  return {
    totalCount: Number(row.total_count),
    pendingCount: Number(row.pending_count),
    approvedCount: Number(row.approved_count),
    processingCount: Number(row.processing_count),
    successCount: Number(row.success_count),
    failedCount: Number(row.failed_count),
    rejectedCount: Number(row.rejected_count),
    totalAmount: Number(row.total_amount),
    successAmount: Number(row.success_amount),
  };
}

// ==================== 审批流程 ====================

// 平台审批通过
export async function platformApprove(
  requestId: string,
  approvedBy: string,
  remark?: string
): Promise<DirectedPaymentRequest> {
  const request = await getPaymentRequestById(requestId);
  if (!request) throw new Error("申请不存在");
  if (request.status !== "platform_pending") throw new Error("申请状态不正确，无法进行平台审批");
  
  // 检查是否还需要资金方审批
  const categoryConfig = await getPaymentCategoryConfig(request.contractId, request.categoryCode);
  const needFunderApproval = categoryConfig?.requireFunderApproval ?? true;
  
  const newStatus = needFunderApproval ? "funder_pending" : "approved";
  const newFunderStatus = needFunderApproval ? "pending" : "approved";
  
  await pool.query(
    `UPDATE directed_payment_requests 
     SET status = ?, platform_approval_status = 'approved',
         platform_approved_by = ?, platform_approved_at = NOW(),
         platform_approval_remark = ?, funder_approval_status = ?
     WHERE id = ?`,
    [newStatus, approvedBy, remark || null, newFunderStatus, requestId]
  );
  
  const updated = await getPaymentRequestById(requestId);
  if (!updated) throw new Error("更新后获取申请失败");
  return updated;
}

// 平台审批拒绝
export async function platformReject(
  requestId: string,
  approvedBy: string,
  remark?: string
): Promise<DirectedPaymentRequest> {
  const request = await getPaymentRequestById(requestId);
  if (!request) throw new Error("申请不存在");
  if (request.status !== "platform_pending") throw new Error("申请状态不正确，无法进行平台审批");
  
  await pool.query(
    `UPDATE directed_payment_requests 
     SET status = 'rejected', platform_approval_status = 'rejected',
         platform_approved_by = ?, platform_approved_at = NOW(),
         platform_approval_remark = ?
     WHERE id = ?`,
    [approvedBy, remark || null, requestId]
  );
  
  const updated = await getPaymentRequestById(requestId);
  if (!updated) throw new Error("更新后获取申请失败");
  return updated;
}

// 资金方审批通过
export async function funderApprove(
  requestId: string,
  approvedBy: string,
  remark?: string
): Promise<DirectedPaymentRequest> {
  const request = await getPaymentRequestById(requestId);
  if (!request) throw new Error("申请不存在");
  if (request.status !== "funder_pending") throw new Error("申请状态不正确，无法进行资金方审批");
  
  await pool.query(
    `UPDATE directed_payment_requests 
     SET status = 'approved', funder_approval_status = 'approved',
         funder_approved_by = ?, funder_approved_at = NOW(),
         funder_approval_remark = ?
     WHERE id = ?`,
    [approvedBy, remark || null, requestId]
  );
  
  const updated = await getPaymentRequestById(requestId);
  if (!updated) throw new Error("更新后获取申请失败");
  return updated;
}

// 资金方审批拒绝
export async function funderReject(
  requestId: string,
  approvedBy: string,
  remark?: string
): Promise<DirectedPaymentRequest> {
  const request = await getPaymentRequestById(requestId);
  if (!request) throw new Error("申请不存在");
  if (request.status !== "funder_pending") throw new Error("申请状态不正确，无法进行资金方审批");
  
  await pool.query(
    `UPDATE directed_payment_requests 
     SET status = 'rejected', funder_approval_status = 'rejected',
         funder_approved_by = ?, funder_approved_at = NOW(),
         funder_approval_remark = ?
     WHERE id = ?`,
    [approvedBy, remark || null, requestId]
  );
  
  const updated = await getPaymentRequestById(requestId);
  if (!updated) throw new Error("更新后获取申请失败");
  return updated;
}

// 取消申请
export async function cancelRequest(requestId: string): Promise<DirectedPaymentRequest> {
  const request = await getPaymentRequestById(requestId);
  if (!request) throw new Error("申请不存在");
  if (!["pending", "platform_pending", "funder_pending"].includes(request.status)) {
    throw new Error("只能取消待处理或待审批状态的申请");
  }
  
  await pool.query(
    `UPDATE directed_payment_requests SET status = 'cancelled' WHERE id = ?`,
    [requestId]
  );
  
  const updated = await getPaymentRequestById(requestId);
  if (!updated) throw new Error("更新后获取申请失败");
  return updated;
}

// ==================== 支付执行 ====================

// 扣减合同额度
async function deductContractCredit(contractId: string, amount: number): Promise<void> {
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE directed_pay_contracts 
     SET used_amount = used_amount + ?, available_amount = available_amount - ?
     WHERE id = ? AND available_amount >= ? AND status = 'active'`,
    [amount, amount, contractId, amount]
  );
  if (result.affectedRows === 0) {
    throw new Error("扣减额度失败：额度不足或合同状态异常");
  }
}

// 恢复合同额度
async function restoreContractCredit(contractId: string, amount: number): Promise<void> {
  await pool.query(
    `UPDATE directed_pay_contracts 
     SET used_amount = used_amount - ?, available_amount = available_amount + ?
     WHERE id = ?`,
    [amount, amount, contractId]
  );
}

// 创建付款码
export async function createPaymentCode(requestId: string, driverId?: string, amount?: number): Promise<{
  id: string;
  code: string;
  amount: number;
  expireAt: string;
}> {
  const request = await getPaymentRequestById(requestId);
  if (!request) throw new Error("申请不存在");
  
  const id = randomUUID();
  const code = generatePaymentCode();
  const paymentAmount = amount ?? request.paymentAmount;
  const expireAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24小时后过期
  
  await pool.query(
    `INSERT INTO payment_codes (id, code, request_id, driver_id, amount, expire_at, status)
     VALUES (?, ?, ?, ?, ?, ?, 'active')`,
    [id, code, requestId, driverId || request.driverId || null, paymentAmount, expireAt]
  );
  
  return {
    id,
    code,
    amount: paymentAmount,
    expireAt: expireAt.toISOString(),
  };
}

// 执行支付（模拟）
export async function executePayment(requestId: string): Promise<DirectedPaymentRequest> {
  const request = await getPaymentRequestById(requestId);
  if (!request) throw new Error("申请不存在");
  if (request.status !== "approved") throw new Error("申请未审批通过，无法执行支付");
  
  // 更新状态为处理中
  await pool.query(
    `UPDATE directed_payment_requests SET status = 'processing' WHERE id = ?`,
    [requestId]
  );
  
  try {
    // 1. 扣减合同额度
    await deductContractCredit(request.contractId, request.paymentAmount);
    
    // 2. 根据收款方式执行支付
    let transactionId: string;
    
    switch (request.receiverType) {
      case "payment_code":
        // 生成付款码
        const paymentCode = await createPaymentCode(requestId, request.driverId, request.paymentAmount);
        transactionId = paymentCode.code;
        // TODO: 推送到TMS
        break;
        
      case "virtual_account":
        // TODO: 充值到虚拟账户
        transactionId = `VA${Date.now()}`;
        break;
        
      case "bank_transfer":
      case "oil_card":
      case "etc_recharge":
      default:
        // 模拟支付
        transactionId = `MOCK${Date.now()}`;
        break;
    }
    
    // 3. 更新支付成功
    await pool.query(
      `UPDATE directed_payment_requests 
       SET status = 'success', execution_time = NOW(), execution_channel = 'mock',
           execution_transaction_id = ?, execution_status = 'success',
           interest_start_time = NOW()
       WHERE id = ?`,
      [transactionId, requestId]
    );
    
  } catch (error: any) {
    // 回滚额度
    await restoreContractCredit(request.contractId, request.paymentAmount);
    
    // 更新支付失败
    await pool.query(
      `UPDATE directed_payment_requests 
       SET status = 'failed', execution_time = NOW(),
           execution_status = 'failed', execution_failure_reason = ?
       WHERE id = ?`,
      [error.message, requestId]
    );
    
    throw error;
  }
  
  const updated = await getPaymentRequestById(requestId);
  if (!updated) throw new Error("更新后获取申请失败");
  return updated;
}

// ==================== 批量操作 ====================

// 批量创建支付申请
export async function batchCreatePaymentRequests(requests: Array<{
  contractId: string;
  waybillId?: string;
  waybillNumber?: string;
  categoryCode: string;
  categoryName: string;
  paymentAmount: number;
  serviceFee?: number;
  receiverType: ReceiverType;
  receiverName?: string;
  receiverAccount?: string;
  receiverBank?: string;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  remark?: string;
  createdBy?: string;
  skipApproval?: boolean;
}>): Promise<DirectedPaymentRequest[]> {
  const results: DirectedPaymentRequest[] = [];
  
  for (const req of requests) {
    const created = await createPaymentRequest(req);
    results.push(created);
  }
  
  return results;
}

// ==================== 付款码相关 ====================

// 获取付款码信息
export async function getPaymentCodeByCode(code: string): Promise<{
  id: string;
  code: string;
  requestId: string;
  driverId?: string;
  amount: number;
  expireAt: string;
  status: string;
  usedAt?: string;
} | undefined> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM payment_codes WHERE code = ?`,
    [code]
  );
  if (rows.length === 0) return undefined;
  
  const row = rows[0];
  return {
    id: row.id,
    code: row.code,
    requestId: row.request_id,
    driverId: row.driver_id || undefined,
    amount: Number(row.amount),
    expireAt: new Date(row.expire_at).toISOString(),
    status: row.status,
    usedAt: row.used_at ? new Date(row.used_at).toISOString() : undefined,
  };
}

// 使用付款码
export async function usePaymentCode(code: string, usedLocation?: string): Promise<void> {
  const paymentCode = await getPaymentCodeByCode(code);
  if (!paymentCode) throw new Error("付款码不存在");
  if (paymentCode.status !== "active") throw new Error("付款码状态不正确");
  if (new Date(paymentCode.expireAt) < new Date()) throw new Error("付款码已过期");
  
  await pool.query(
    `UPDATE payment_codes SET status = 'used', used_at = NOW(), used_location = ? WHERE code = ?`,
    [usedLocation || null, code]
  );
}

// 取消付款码
export async function cancelPaymentCode(code: string): Promise<void> {
  await pool.query(
    `UPDATE payment_codes SET status = 'cancelled' WHERE code = ? AND status = 'active'`,
    [code]
  );
}

// 更新TMS同步状态
export async function updatePaymentCodeTmsSync(
  code: string,
  status: "pending" | "success" | "failed",
  response?: any
): Promise<void> {
  await pool.query(
    `UPDATE payment_codes SET tms_sync_status = ?, tms_sync_time = NOW(), tms_sync_response = ? WHERE code = ?`,
    [status, response ? JSON.stringify(response) : null, code]
  );
}
