/**
 * 资金定向支付 - 核心逻辑
 * 
 * 包含:
 * 1. 审批流程 (平台 + 资金方双重审批)
 * 2. 支付执行引擎
 * 3. 利息计算
 */

import { randomUUID } from "crypto";
import { pool } from "./db.js";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import type {
  DirectedPayContract,
  DirectedPaymentRequest,
  PaymentRequestStatus,
  ApprovalStatus,
  ReceiverType,
  PaymentCategoryConfig,
  PaymentCode,
} from "./types.js";

// ==================== 辅助函数 ====================

// 生成支付申请编号
function generateRequestNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DPR${date}${random}`;
}

// 生成付款码
function generatePaymentCode(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DPY${date}${random}`;
}

// ==================== 合同相关查询 ====================

export async function getDirectedPayContractById(
  id: string
): Promise<DirectedPayContract | undefined> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT dpc.*, 
            f.institution_name as funder_name,
            fin.enterprise_name as financier_name
     FROM directed_pay_contracts dpc
     LEFT JOIN funders f ON dpc.funder_id = f.id
     LEFT JOIN financiers fin ON dpc.financier_id = fin.id
     WHERE dpc.id = ? AND dpc.deleted_at IS NULL`,
    [id]
  );

  if (!rows[0]) return undefined;
  return mapContractRow(rows[0]);
}

export async function getActiveContractByFinancier(
  financierId: string
): Promise<DirectedPayContract | undefined> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT dpc.*, 
            f.institution_name as funder_name,
            fin.enterprise_name as financier_name
     FROM directed_pay_contracts dpc
     LEFT JOIN funders f ON dpc.funder_id = f.id
     LEFT JOIN financiers fin ON dpc.financier_id = fin.id
     WHERE dpc.financier_id = ? 
       AND dpc.status = 'active'
       AND dpc.start_date <= CURDATE()
       AND dpc.end_date >= CURDATE()
       AND dpc.deleted_at IS NULL
     LIMIT 1`,
    [financierId]
  );

  if (!rows[0]) return undefined;
  return mapContractRow(rows[0]);
}

function mapContractRow(row: RowDataPacket): DirectedPayContract {
  return {
    id: row.id,
    contractNumber: row.contract_number,
    funderId: row.funder_id,
    funderName: row.funder_name,
    financierId: row.financier_id,
    financierName: row.financier_name,
    funderAccountId: row.funder_account_id,
    creditLimit: Number(row.credit_limit),
    usedAmount: Number(row.used_amount),
    availableAmount: Number(row.available_amount),
    annualInterestRate: Number(row.annual_interest_rate),
    interestCalcBase: Number(row.interest_calc_base),
    startDate: row.start_date,
    endDate: row.end_date,
    settlementCycle: row.settlement_cycle,
    settlementDay: Number(row.settlement_day),
    gracePeriodDays: Number(row.grace_period_days),
    autoPaymentEnabled: row.auto_payment_enabled === 1,
    status: row.status,
    remark: row.remark,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ==================== 支付类别配置查询 ====================

export async function getPaymentCategoryConfig(
  contractId: string,
  categoryCode: string
): Promise<PaymentCategoryConfig | undefined> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM payment_category_configs 
     WHERE contract_id = ? AND category_code = ? AND is_enabled = 1`,
    [contractId, categoryCode]
  );

  if (!rows[0]) return undefined;
  return mapCategoryRow(rows[0]);
}

function mapCategoryRow(row: RowDataPacket): PaymentCategoryConfig {
  return {
    id: row.id,
    contractId: row.contract_id,
    categoryCode: row.category_code,
    categoryName: row.category_name,
    paymentRatio: Number(row.payment_ratio),  // 支付比例 (0-100)
    minAmount: row.min_amount ? Number(row.min_amount) : undefined,
    maxAmount: row.max_amount ? Number(row.max_amount) : undefined,
    dailyLimit: row.daily_limit ? Number(row.daily_limit) : undefined,
    requirePlatformApproval: row.require_platform_approval === 1,
    requireFunderApproval: row.require_funder_approval === 1,
    platformApprovalThreshold: row.platform_approval_threshold
      ? Number(row.platform_approval_threshold)
      : undefined,
    funderApprovalThreshold: row.funder_approval_threshold
      ? Number(row.funder_approval_threshold)
      : undefined,
    autoPaymentEnabled: row.auto_payment_enabled === 1,
    isEnabled: row.is_enabled === 1,
    createdAt: row.created_at,
  };
}

// ==================== 支付申请 CRUD ====================

export async function getPaymentRequestById(
  id: string
): Promise<DirectedPaymentRequest | undefined> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT dpr.*, dpc.contract_number
     FROM directed_payment_requests dpr
     LEFT JOIN directed_pay_contracts dpc ON dpr.contract_id = dpc.id
     WHERE dpr.id = ?`,
    [id]
  );

  if (!rows[0]) return undefined;
  return mapRequestRow(rows[0]);
}

function mapRequestRow(row: RowDataPacket): DirectedPaymentRequest {
  return {
    id: row.id,
    requestNumber: row.request_number,
    contractId: row.contract_id,
    contractNumber: row.contract_number,
    waybillId: row.waybill_id,
    waybillNumber: row.waybill_number,
    categoryCode: row.category_code,
    categoryName: row.category_name,
    paymentAmount: Number(row.payment_amount),
    serviceFee: Number(row.service_fee),
    interestStartTime: row.interest_start_time,
    receiverType: row.receiver_type,
    receiverName: row.receiver_name,
    receiverAccount: row.receiver_account,
    receiverBank: row.receiver_bank,
    driverId: row.driver_id,
    driverName: row.driver_name,
    driverPhone: row.driver_phone,
    remark: row.remark,
    status: row.status,
    platformApprovalStatus: row.platform_approval_status,
    platformApprovedBy: row.platform_approved_by,
    platformApprovedAt: row.platform_approved_at,
    platformApprovalRemark: row.platform_approval_remark,
    funderApprovalStatus: row.funder_approval_status,
    funderApprovedBy: row.funder_approved_by,
    funderApprovedAt: row.funder_approved_at,
    funderApprovalRemark: row.funder_approval_remark,
    executionTime: row.execution_time,
    executionChannel: row.execution_channel,
    executionTransactionId: row.execution_transaction_id,
    executionStatus: row.execution_status,
    executionFailureReason: row.execution_failure_reason,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ==================== 创建支付申请 ====================

export interface CreatePaymentRequestInput {
  contractId: string;
  waybillId?: string;
  waybillNumber?: string;
  categoryCode: string;
  categoryName: string;
  originalAmount?: number;   // 原始费用金额（用于根据支付比例计算）
  paymentAmount: number;     // 实际支付金额（如果提供 originalAmount，此字段会被重新计算）
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
  isAdmin?: boolean; // admin跳过审批
}

export async function createPaymentRequest(
  input: CreatePaymentRequestInput
): Promise<DirectedPaymentRequest> {
  const id = randomUUID();
  const requestNumber = generateRequestNumber();

  // 获取类别配置，判断是否需要审批
  const categoryConfig = await getPaymentCategoryConfig(
    input.contractId,
    input.categoryCode
  );

  // 根据支付比例计算实际支付金额
  let finalPaymentAmount = input.paymentAmount;
  
  if (categoryConfig && categoryConfig.paymentRatio < 100) {
    if (input.originalAmount) {
      // 如果提供了原始金额，根据支付比例计算实际支付金额
      const maxAllowedAmount = input.originalAmount * categoryConfig.paymentRatio / 100;
      finalPaymentAmount = Math.min(input.paymentAmount, maxAllowedAmount);
      console.log(`[PAYMENT RATIO] 原始金额: ${input.originalAmount}, 支付比例: ${categoryConfig.paymentRatio}%, 最大允许: ${maxAllowedAmount}, 实际支付: ${finalPaymentAmount}`);
    } else {
      // 没有提供原始金额，验证支付金额是否合理（记录警告）
      console.log(`[PAYMENT RATIO WARNING] 未提供原始金额，无法验证支付比例。类别 ${input.categoryCode} 配置的支付比例为 ${categoryConfig.paymentRatio}%`);
    }
  }

  // 验证单笔限额
  if (categoryConfig) {
    if (categoryConfig.minAmount && finalPaymentAmount < categoryConfig.minAmount) {
      throw new Error(`支付金额 ${finalPaymentAmount} 低于最小限额 ${categoryConfig.minAmount}`);
    }
    if (categoryConfig.maxAmount && finalPaymentAmount > categoryConfig.maxAmount) {
      throw new Error(`支付金额 ${finalPaymentAmount} 超过最大限额 ${categoryConfig.maxAmount}`);
    }
  }

  // 判断初始状态
  let status: PaymentRequestStatus = "pending";
  let platformApprovalStatus: ApprovalStatus = "pending";
  let funderApprovalStatus: ApprovalStatus = "pending";

  if (input.isAdmin) {
    // admin 用户跳过所有审批
    status = "approved";
    platformApprovalStatus = "approved";
    funderApprovalStatus = "approved";
  } else if (categoryConfig) {
    // 判断是否需要平台审批
    const needPlatformApproval =
      categoryConfig.requirePlatformApproval &&
      (!categoryConfig.platformApprovalThreshold ||
        finalPaymentAmount >= categoryConfig.platformApprovalThreshold);

    // 判断是否需要资金方审批
    const needFunderApproval =
      categoryConfig.requireFunderApproval &&
      (!categoryConfig.funderApprovalThreshold ||
        finalPaymentAmount >= categoryConfig.funderApprovalThreshold);

    if (needPlatformApproval) {
      status = "platform_pending";
    } else if (needFunderApproval) {
      status = "funder_pending";
      platformApprovalStatus = "approved";
    } else {
      // 都不需要审批，直接通过
      status = "approved";
      platformApprovalStatus = "approved";
      funderApprovalStatus = "approved";
    }
  } else {
    // 没有类别配置，默认需要双重审批
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
      id,
      requestNumber,
      input.contractId,
      input.waybillId || null,
      input.waybillNumber || null,
      input.categoryCode,
      input.categoryName,
      finalPaymentAmount,  // 使用根据支付比例计算后的金额
      input.serviceFee || 0,
      input.receiverType,
      input.receiverName || null,
      input.receiverAccount || null,
      input.receiverBank || null,
      input.driverId || null,
      input.driverName || null,
      input.driverPhone || null,
      input.remark || null,
      status,
      platformApprovalStatus,
      funderApprovalStatus,
      input.createdBy || null,
    ]
  );

  const request = await getPaymentRequestById(id);
  if (!request) throw new Error("创建支付申请失败");
  return request;
}

// ==================== 审批流程 ====================

/**
 * 平台审批通过
 */
export async function platformApprove(
  requestId: string,
  approvedBy: string,
  remark?: string
): Promise<DirectedPaymentRequest> {
  const request = await getPaymentRequestById(requestId);
  if (!request) throw new Error("支付申请不存在");
  if (request.status !== "platform_pending") {
    throw new Error(`申请状态不正确，当前状态: ${request.status}`);
  }

  // 检查是否还需要资金方审批
  const categoryConfig = await getPaymentCategoryConfig(
    request.contractId,
    request.categoryCode
  );

  const needFunderApproval =
    categoryConfig?.requireFunderApproval &&
    (!categoryConfig.funderApprovalThreshold ||
      request.paymentAmount >= categoryConfig.funderApprovalThreshold);

  const newStatus: PaymentRequestStatus = needFunderApproval
    ? "funder_pending"
    : "approved";
  const newFunderStatus: ApprovalStatus = needFunderApproval
    ? "pending"
    : "approved";

  await pool.query(
    `UPDATE directed_payment_requests 
     SET status = ?, platform_approval_status = 'approved',
         platform_approved_by = ?, platform_approved_at = NOW(),
         platform_approval_remark = ?, funder_approval_status = ?
     WHERE id = ?`,
    [newStatus, approvedBy, remark || null, newFunderStatus, requestId]
  );

  return (await getPaymentRequestById(requestId))!;
}

/**
 * 平台审批拒绝
 */
export async function platformReject(
  requestId: string,
  approvedBy: string,
  remark?: string
): Promise<DirectedPaymentRequest> {
  const request = await getPaymentRequestById(requestId);
  if (!request) throw new Error("支付申请不存在");
  if (request.status !== "platform_pending") {
    throw new Error(`申请状态不正确，当前状态: ${request.status}`);
  }

  await pool.query(
    `UPDATE directed_payment_requests 
     SET status = 'rejected', platform_approval_status = 'rejected',
         platform_approved_by = ?, platform_approved_at = NOW(),
         platform_approval_remark = ?
     WHERE id = ?`,
    [approvedBy, remark || null, requestId]
  );

  return (await getPaymentRequestById(requestId))!;
}

/**
 * 资金方审批通过
 */
export async function funderApprove(
  requestId: string,
  approvedBy: string,
  remark?: string
): Promise<DirectedPaymentRequest> {
  const request = await getPaymentRequestById(requestId);
  if (!request) throw new Error("支付申请不存在");
  if (request.status !== "funder_pending") {
    throw new Error(`申请状态不正确，当前状态: ${request.status}`);
  }

  await pool.query(
    `UPDATE directed_payment_requests 
     SET status = 'approved', funder_approval_status = 'approved',
         funder_approved_by = ?, funder_approved_at = NOW(),
         funder_approval_remark = ?
     WHERE id = ?`,
    [approvedBy, remark || null, requestId]
  );

  return (await getPaymentRequestById(requestId))!;
}

/**
 * 资金方审批拒绝
 */
export async function funderReject(
  requestId: string,
  approvedBy: string,
  remark?: string
): Promise<DirectedPaymentRequest> {
  const request = await getPaymentRequestById(requestId);
  if (!request) throw new Error("支付申请不存在");
  if (request.status !== "funder_pending") {
    throw new Error(`申请状态不正确，当前状态: ${request.status}`);
  }

  await pool.query(
    `UPDATE directed_payment_requests 
     SET status = 'rejected', funder_approval_status = 'rejected',
         funder_approved_by = ?, funder_approved_at = NOW(),
         funder_approval_remark = ?
     WHERE id = ?`,
    [approvedBy, remark || null, requestId]
  );

  return (await getPaymentRequestById(requestId))!;
}

/**
 * 取消申请
 */
export async function cancelPaymentRequest(requestId: string): Promise<void> {
  await pool.query(
    `UPDATE directed_payment_requests SET status = 'cancelled' 
     WHERE id = ? AND status IN ('pending', 'platform_pending', 'funder_pending')`,
    [requestId]
  );
}

// ==================== 支付执行引擎 ====================

/**
 * 扣减合同额度
 */
async function deductContractCredit(
  contractId: string,
  amount: number
): Promise<void> {
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE directed_pay_contracts 
     SET used_amount = used_amount + ?, available_amount = available_amount - ?
     WHERE id = ? AND available_amount >= ? AND status = 'active' AND deleted_at IS NULL`,
    [amount, amount, contractId, amount]
  );

  if (result.affectedRows === 0) {
    throw new Error("扣减额度失败：额度不足或合同状态异常");
  }
}

/**
 * 恢复合同额度（失败回滚或还款）
 */
async function restoreContractCredit(
  contractId: string,
  amount: number
): Promise<void> {
  await pool.query(
    `UPDATE directed_pay_contracts 
     SET used_amount = used_amount - ?, available_amount = available_amount + ?
     WHERE id = ? AND deleted_at IS NULL`,
    [amount, amount, contractId]
  );
}

/**
 * 创建付款码
 */
async function createPaymentCodeForRequest(
  request: DirectedPaymentRequest,
  expireHours: number = 24
): Promise<PaymentCode> {
  const id = randomUUID();
  const code = generatePaymentCode();
  const expireAt = new Date(Date.now() + expireHours * 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO payment_codes 
     (id, code, request_id, driver_id, driver_name, driver_phone, amount, expire_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
    [
      id,
      code,
      request.id,
      request.driverId || null,
      request.driverName || null,
      request.driverPhone || null,
      request.paymentAmount,
      expireAt,
    ]
  );

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM payment_codes WHERE id = ?`,
    [id]
  );

  return {
    id: rows[0].id,
    code: rows[0].code,
    requestId: rows[0].request_id,
    driverId: rows[0].driver_id,
    driverName: rows[0].driver_name,
    driverPhone: rows[0].driver_phone,
    amount: Number(rows[0].amount),
    expireAt: rows[0].expire_at,
    status: rows[0].status,
    usedAt: rows[0].used_at,
    usedLocation: rows[0].used_location,
    tmsSyncStatus: rows[0].tms_sync_status,
    tmsSyncTime: rows[0].tms_sync_time,
    createdAt: rows[0].created_at,
  };
}

/**
 * TMS同步（模拟）
 */
async function syncPaymentCodeToTms(paymentCode: PaymentCode): Promise<void> {
  // TODO: 实现真实的TMS对接
  console.log(`[TMS MOCK] Syncing payment code ${paymentCode.code} to TMS...`);

  // 模拟同步成功
  await pool.query(
    `UPDATE payment_codes 
     SET tms_sync_status = 'synced', tms_sync_time = NOW()
     WHERE id = ?`,
    [paymentCode.id]
  );

  console.log(`[TMS MOCK] Payment code ${paymentCode.code} synced successfully`);
}

/**
 * 虚拟账户入账（模拟）
 */
async function creditVirtualAccount(
  request: DirectedPaymentRequest
): Promise<string> {
  // TODO: 实现真实的虚拟账户入账
  console.log(
    `[VIRTUAL ACCOUNT MOCK] Crediting ${request.paymentAmount} to driver ${request.driverId}...`
  );

  // 返回模拟的交易号
  return `VA${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

/**
 * 执行支付
 */
export async function executePayment(
  requestId: string
): Promise<DirectedPaymentRequest> {
  const request = await getPaymentRequestById(requestId);
  if (!request) throw new Error("支付申请不存在");
  if (request.status !== "approved") {
    throw new Error(`申请未审批通过，当前状态: ${request.status}`);
  }

  // 更新状态为处理中
  await pool.query(
    `UPDATE directed_payment_requests SET status = 'processing' WHERE id = ?`,
    [requestId]
  );

  let transactionId: string = "";
  let creditDeducted = false; // 标记是否已成功扣减额度

  try {
    // 1. 扣减合同额度
    await deductContractCredit(request.contractId, request.paymentAmount);
    creditDeducted = true; // 标记：额度已扣减，后续失败需要回滚

    // 2. 根据收款方式执行支付
    switch (request.receiverType) {
      case "payment_code": {
        // 生成付款码并推送到TMS
        const paymentCode = await createPaymentCodeForRequest(request);
        transactionId = paymentCode.code;
        await syncPaymentCodeToTms(paymentCode);
        break;
      }

      case "virtual_account": {
        // 充值到虚拟账户
        transactionId = await creditVirtualAccount(request);
        break;
      }

      case "bank_transfer":
      case "oil_card":
      case "etc_recharge":
      default: {
        // 模拟支付
        transactionId = `MOCK${Date.now()}${Math.random()
          .toString(36)
          .slice(2, 6)
          .toUpperCase()}`;
        console.log(
          `[PAYMENT MOCK] Simulating ${request.receiverType} payment...`
        );
        break;
      }
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

    console.log(
      `[PAYMENT] Request ${request.requestNumber} executed successfully, transaction: ${transactionId}`
    );
  } catch (error: any) {
    console.error(`[PAYMENT ERROR] Request ${request.requestNumber} failed:`, error);

    // 只有在成功扣减额度后发生的错误才需要回滚
    if (creditDeducted) {
      try {
        await restoreContractCredit(request.contractId, request.paymentAmount);
        console.log(`[PAYMENT] Credit restored for contract ${request.contractId}`);
      } catch (rollbackError) {
        console.error("[PAYMENT ERROR] Failed to rollback credit:", rollbackError);
      }
    }

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

  return (await getPaymentRequestById(requestId))!;
}

// ==================== 利息计算 ====================

/**
 * 计算单笔支付的利息
 * 
 * 规则：
 * - 从支付时刻开始计息
 * - 按日计息
 * - 不满一天按一天计算
 * - 计息基数默认360天
 */
export function calculateInterest(
  principal: number,
  annualRate: number,
  paymentTime: Date,
  settlementTime: Date,
  calcBase: number = 360
): { days: number; interest: number } {
  // 计算天数（不满一天按一天）
  const diffMs = settlementTime.getTime() - paymentTime.getTime();
  const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  // 日利率
  const dailyRate = annualRate / calcBase;

  // 利息 = 本金 × 日利率 × 天数
  const interest = principal * dailyRate * days;

  // 保留两位小数（四舍五入）
  return {
    days,
    interest: Math.round(interest * 100) / 100,
  };
}

// ==================== 导出额度恢复函数（供结算模块使用） ====================
export { restoreContractCredit };
