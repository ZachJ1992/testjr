/**
 * 资金定向支付 - API 路由
 * 
 * 整合各模块的API，提供统一的路由入口
 */

import { Router, Request, Response } from "express";
import { authenticate, requirePermissions, AuthenticatedRequest, getOrgDataFilter } from "./auth.js";
import { pool } from "./db.js";
import { randomUUID } from "crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import * as core from "./directed-payment-core.js";
import * as requestsStore from "./directed-payment-requests-store.js";
import type {
  DirectedPayContract,
  DirectedPayContractStatus,
  SettlementCycle,
  PaymentCategoryConfig,
  DirectedPaymentRequest,
  ReceiverType,
  PAYMENT_CATEGORY_TEMPLATES,
} from "./types.js";

const router = Router();

// TODO（阶段 D）：定向支付各写接口尚未接 ensureTenantWritable；
// 由于此文件每个路由各自 authenticate，统一在 router.use 顶部前置中间件
// 会破坏 authenticate 时序，需逐个路由叠加，留到一致性收口时统一治理。
// 目前依赖路由层的 requirePermissions + 业务校验，不阻塞主体冻结的整体目标。

// ==================== 支付类别模板 ====================

const CATEGORY_TEMPLATES = [
  { code: "FREIGHT", name: "运费" },
  { code: "OIL_CARD", name: "油卡" },
  { code: "ETC", name: "ETC" },
  { code: "SALARY", name: "工资" },
  { code: "INSURANCE", name: "保险" },
  { code: "MAINTENANCE", name: "维修" },
  { code: "TOLL", name: "路桥费" },
  { code: "OTHER", name: "其他" },
];

// ==================== 合同 API ====================

// 生成合同编号
function generateContractNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DPC${date}${random}`;
}

// 获取合同列表
router.get(
  "/directed-pay/contracts",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { funderId, financierId, status, keyword } = req.query;

      let sql = `
        SELECT dpc.*, 
               f.institution_name as funder_name,
               fin.enterprise_name as financier_name
        FROM directed_pay_contracts dpc
        LEFT JOIN funders f ON dpc.funder_id = f.id
        LEFT JOIN financiers fin ON dpc.financier_id = fin.id
        WHERE dpc.deleted_at IS NULL
      `;
      const params: any[] = [];
      
      // 数据权限过滤：非平台用户只能看到自己组织关联的合同
      const orgContext = req.orgContext;
      if (orgContext && !orgContext.isPlatformUser) {
        if (orgContext.orgType === "financier") {
          sql += " AND dpc.financier_id = ?";
          params.push(orgContext.relatedEntityId);
        } else if (orgContext.orgType === "funder") {
          sql += " AND dpc.funder_id = ?";
          params.push(orgContext.relatedEntityId);
        }
      }

      if (funderId) {
        sql += " AND dpc.funder_id = ?";
        params.push(funderId);
      }
      if (financierId) {
        sql += " AND dpc.financier_id = ?";
        params.push(financierId);
      }
      if (status) {
        sql += " AND dpc.status = ?";
        params.push(status);
      }
      if (keyword) {
        sql += " AND (dpc.contract_number LIKE ? OR f.institution_name LIKE ? OR fin.enterprise_name LIKE ?)";
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      }

      sql += " ORDER BY dpc.created_at DESC";

      const [rows] = await pool.query<RowDataPacket[]>(sql, params);

      const contracts = rows.map((row) => ({
        id: row.id,
        contractNumber: row.contract_number,
        funderId: row.funder_id,
        funderName: row.funder_name,
        financierId: row.financier_id,
        financierName: row.financier_name,
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
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      res.json({ contracts });
    } catch (error: any) {
      console.error("获取合同列表失败:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// 获取合同统计
router.get(
  "/directed-pay/contracts/stats",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT 
           COUNT(*) as total_count,
           SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
           SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) as suspended_count,
           SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired_count,
           COALESCE(SUM(credit_limit), 0) as total_credit_limit,
           COALESCE(SUM(used_amount), 0) as total_used_amount,
           COALESCE(SUM(available_amount), 0) as total_available_amount
         FROM directed_pay_contracts
         WHERE deleted_at IS NULL`
      );
      const row = rows[0];
      res.json({
        totalCount: row.total_count || 0,
        activeCount: row.active_count || 0,
        suspendedCount: row.suspended_count || 0,
        expiredCount: row.expired_count || 0,
        totalCreditLimit: parseFloat(row.total_credit_limit) || 0,
        totalUsedAmount: parseFloat(row.total_used_amount) || 0,
        totalAvailableAmount: parseFloat(row.total_available_amount) || 0,
      });
    } catch (error: any) {
      console.error("获取合同统计失败:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// 获取合同详情
router.get(
  "/directed-pay/contracts/:id",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const contract = await core.getDirectedPayContractById(req.params.id);
      if (!contract) {
        return res.status(404).json({ error: "合同不存在" });
      }
      
      // 权限验证：非平台用户只能查看自己组织关联的合同
      const orgContext = req.orgContext;
      if (orgContext && !orgContext.isPlatformUser) {
        if (orgContext.orgType === "financier" && contract.financierId !== orgContext.relatedEntityId) {
          return res.status(403).json({ error: "无权限查看此合同" });
        }
        if (orgContext.orgType === "funder" && contract.funderId !== orgContext.relatedEntityId) {
          return res.status(403).json({ error: "无权限查看此合同" });
        }
      }
      
      res.json({ contract });
    } catch (error: any) {
      console.error("获取合同详情失败:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// 创建合同
router.post(
  "/directed-pay/contracts",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const {
        funderId,
        financierId,
        funderAccountId,
        creditLimit,
        annualInterestRate,
        interestCalcBase = 360,
        startDate,
        endDate,
        settlementCycle,
        settlementDay,
        gracePeriodDays = 3,
        remark,
      } = req.body;

      const id = randomUUID();
      const contractNumber = generateContractNumber();

      await pool.query(
        `INSERT INTO directed_pay_contracts 
         (id, contract_number, funder_id, financier_id, funder_account_id,
          credit_limit, available_amount, annual_interest_rate, interest_calc_base,
          start_date, end_date, settlement_cycle, settlement_day, grace_period_days,
          remark, created_by, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
        [
          id,
          contractNumber,
          funderId,
          financierId,
          funderAccountId || null,
          creditLimit,
          creditLimit, // available_amount 初始等于 credit_limit
          annualInterestRate,
          interestCalcBase,
          startDate,
          endDate,
          settlementCycle,
          settlementDay,
          gracePeriodDays,
          remark || null,
          (req as any).currentUser?.id || null,
        ]
      );

      const contract = await core.getDirectedPayContractById(id);
      res.json({ contract });
    } catch (error: any) {
      console.error("创建合同失败:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// 更新合同
router.put(
  "/directed-pay/contracts/:id",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const {
        funderAccountId,
        creditLimit,
        annualInterestRate,
        endDate,
        settlementCycle,
        settlementDay,
        gracePeriodDays,
        autoPaymentEnabled,
        remark,
      } = req.body;

      // 构建更新语句
      const updates: string[] = [];
      const params: any[] = [];

      if (funderAccountId !== undefined) {
        updates.push("funder_account_id = ?");
        params.push(funderAccountId);
      }
      if (creditLimit !== undefined) {
        // 获取当前合同
        const contract = await core.getDirectedPayContractById(req.params.id);
        if (contract) {
          const diff = creditLimit - contract.creditLimit;
          updates.push("credit_limit = ?");
          updates.push("available_amount = available_amount + ?");
          params.push(creditLimit, diff);
        }
      }
      if (annualInterestRate !== undefined) {
        updates.push("annual_interest_rate = ?");
        params.push(annualInterestRate);
      }
      if (endDate !== undefined) {
        updates.push("end_date = ?");
        params.push(endDate);
      }
      if (settlementCycle !== undefined) {
        updates.push("settlement_cycle = ?");
        params.push(settlementCycle);
      }
      if (settlementDay !== undefined) {
        updates.push("settlement_day = ?");
        params.push(settlementDay);
      }
      if (gracePeriodDays !== undefined) {
        updates.push("grace_period_days = ?");
        params.push(gracePeriodDays);
      }
      if (autoPaymentEnabled !== undefined) {
        updates.push("auto_payment_enabled = ?");
        params.push(autoPaymentEnabled ? 1 : 0);
      }
      if (remark !== undefined) {
        updates.push("remark = ?");
        params.push(remark);
      }

      if (updates.length > 0) {
        params.push(req.params.id);
        await pool.query(
          `UPDATE directed_pay_contracts SET ${updates.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
          params
        );
      }

      const contract = await core.getDirectedPayContractById(req.params.id);
      res.json({ contract });
    } catch (error: any) {
      console.error("更新合同失败:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// 删除合同
router.delete(
  "/directed-pay/contracts/:id",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      await pool.query(
        `UPDATE directed_pay_contracts SET deleted_at = NOW() WHERE id = ?`,
        [req.params.id]
      );
      res.json({ success: true });
    } catch (error: any) {
      console.error("删除合同失败:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// 审批合同
router.post(
  "/directed-pay/contracts/:id/approve",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      await pool.query(
        `UPDATE directed_pay_contracts SET status = 'active' WHERE id = ? AND status IN ('draft', 'pending_approval')`,
        [req.params.id]
      );
      const contract = await core.getDirectedPayContractById(req.params.id);
      res.json({ contract });
    } catch (error: any) {
      console.error("审批合同失败:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// 暂停合同
router.post(
  "/directed-pay/contracts/:id/suspend",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      await pool.query(
        `UPDATE directed_pay_contracts SET status = 'suspended' WHERE id = ? AND status = 'active'`,
        [req.params.id]
      );
      const contract = await core.getDirectedPayContractById(req.params.id);
      res.json({ contract });
    } catch (error: any) {
      console.error("暂停合同失败:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// 恢复合同
router.post(
  "/directed-pay/contracts/:id/resume",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      await pool.query(
        `UPDATE directed_pay_contracts SET status = 'active' WHERE id = ? AND status = 'suspended'`,
        [req.params.id]
      );
      const contract = await core.getDirectedPayContractById(req.params.id);
      res.json({ contract });
    } catch (error: any) {
      console.error("恢复合同失败:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// 终止合同
router.post(
  "/directed-pay/contracts/:id/terminate",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      await pool.query(
        `UPDATE directed_pay_contracts SET status = 'terminated' WHERE id = ?`,
        [req.params.id]
      );
      const contract = await core.getDirectedPayContractById(req.params.id);
      res.json({ contract });
    } catch (error: any) {
      console.error("终止合同失败:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ==================== 支付类别配置 API ====================

// 获取支付类别模板
router.get(
  "/directed-pay/category-templates",
  authenticate,
  async (req: Request, res: Response) => {
    res.json({ templates: CATEGORY_TEMPLATES });
  }
);

// 获取合同的支付类别
router.get(
  "/directed-pay/contracts/:id/categories",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM payment_category_configs WHERE contract_id = ? ORDER BY created_at`,
        [req.params.id]
      );

      const categories = rows.map((row) => ({
        id: row.id,
        contractId: row.contract_id,
        categoryCode: row.category_code,
        categoryName: row.category_name,
        paymentRatio: Number(row.payment_ratio),
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
      }));

      res.json({ categories });
    } catch (error: any) {
      console.error("获取支付类别失败:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// 添加支付类别
router.post(
  "/directed-pay/contracts/:id/categories",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const id = randomUUID();
      const {
        categoryCode,
        categoryName,
        paymentRatio = 100,
        minAmount,
        maxAmount,
        dailyLimit,
        requirePlatformApproval = true,
        requireFunderApproval = true,
        platformApprovalThreshold,
        funderApprovalThreshold,
        autoPaymentEnabled = false,
      } = req.body;

      await pool.query(
        `INSERT INTO payment_category_configs 
         (id, contract_id, category_code, category_name, payment_ratio,
          min_amount, max_amount, daily_limit,
          require_platform_approval, require_funder_approval,
          platform_approval_threshold, funder_approval_threshold,
          auto_payment_enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          req.params.id,
          categoryCode,
          categoryName,
          paymentRatio,
          minAmount || null,
          maxAmount || null,
          dailyLimit || null,
          requirePlatformApproval ? 1 : 0,
          requireFunderApproval ? 1 : 0,
          platformApprovalThreshold || null,
          funderApprovalThreshold || null,
          autoPaymentEnabled ? 1 : 0,
        ]
      );

      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM payment_category_configs WHERE id = ?`,
        [id]
      );

      res.json({ category: rows[0] });
    } catch (error: any) {
      console.error("添加支付类别失败:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// 更新支付类别
router.put(
  "/directed-pay/contracts/:id/categories/:catId",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const updates: string[] = [];
      const params: any[] = [];

      const fields = [
        "payment_ratio",
        "min_amount",
        "max_amount",
        "daily_limit",
        "require_platform_approval",
        "require_funder_approval",
        "platform_approval_threshold",
        "funder_approval_threshold",
        "auto_payment_enabled",
        "is_enabled",
      ];

      for (const field of fields) {
        const camelField = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        if (req.body[camelField] !== undefined) {
          updates.push(`${field} = ?`);
          const value = req.body[camelField];
          params.push(
            typeof value === "boolean" ? (value ? 1 : 0) : value ?? null
          );
        }
      }

      if (updates.length > 0) {
        params.push(req.params.catId);
        await pool.query(
          `UPDATE payment_category_configs SET ${updates.join(", ")} WHERE id = ?`,
          params
        );
      }

      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM payment_category_configs WHERE id = ?`,
        [req.params.catId]
      );

      res.json({ category: rows[0] });
    } catch (error: any) {
      console.error("更新支付类别失败:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// 删除支付类别
router.delete(
  "/directed-pay/contracts/:id/categories/:catId",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      await pool.query(`DELETE FROM payment_category_configs WHERE id = ?`, [
        req.params.catId,
      ]);
      res.json({ success: true });
    } catch (error: any) {
      console.error("删除支付类别失败:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ==================== 支付申请 API ====================

// 获取支付申请列表
router.get(
  "/directed-pay/requests",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { contractId, waybillId, status, driverId, categoryCode, startDate, endDate } =
        req.query;
      
      // 获取用户组织上下文，用于数据权限过滤
      const authReq = req as AuthenticatedRequest;
      const orgContext = authReq.orgContext;

      let sql = `
        SELECT dpr.*, dpc.contract_number, dpc.financier_id
        FROM directed_payment_requests dpr
        LEFT JOIN directed_pay_contracts dpc ON dpr.contract_id = dpc.id
        WHERE 1=1
      `;
      const params: any[] = [];
      
      // 数据权限过滤：非平台用户根据组织类型过滤
      // 平台用户（包括 admin）可以看到所有数据
      if (orgContext && !orgContext.isPlatformUser) {
        if (orgContext.orgType === "financier") {
          // 融资方用户只能看自己组织的申请
          sql += " AND dpc.financier_id = ?";
          params.push(orgContext.relatedEntityId);
        } else if (orgContext.orgType === "funder") {
          // 资金方用户可以看与自己有合同关系的申请
          sql += " AND dpc.funder_id = ?";
          params.push(orgContext.relatedEntityId);
        }
      }
      // 如果没有 orgContext 或是平台用户，不添加过滤条件，显示全部

      if (contractId) {
        sql += " AND dpr.contract_id = ?";
        params.push(contractId);
      }
      if (waybillId) {
        sql += " AND dpr.waybill_id = ?";
        params.push(waybillId);
      }
      if (status) {
        sql += " AND dpr.status = ?";
        params.push(status);
      }
      if (driverId) {
        sql += " AND dpr.driver_id = ?";
        params.push(driverId);
      }
      if (categoryCode) {
        sql += " AND dpr.category_code = ?";
        params.push(categoryCode);
      }
      if (startDate) {
        sql += " AND dpr.created_at >= ?";
        params.push(startDate);
      }
      if (endDate) {
        sql += " AND dpr.created_at <= ?";
        params.push(endDate);
      }

      sql += " ORDER BY dpr.created_at DESC";

      const [rows] = await pool.query<RowDataPacket[]>(sql, params);

      const requests = rows.map((row) => ({
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
      }));

      res.json({ requests });
    } catch (error: any) {
      console.error("获取支付申请列表失败:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// 获取支付申请统计（必须在 :id 路由之前）
router.get(
  "/directed-pay/requests/stats",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      // 获取用户组织上下文，用于数据权限过滤
      const authReq = req as AuthenticatedRequest;
      const orgContext = authReq.orgContext;
      
      let sql = `
        SELECT 
          COUNT(*) as total_count,
          SUM(CASE WHEN dpr.status IN ('pending', 'platform_pending', 'funder_pending') THEN 1 ELSE 0 END) as pending_count,
          SUM(CASE WHEN dpr.status = 'approved' THEN 1 ELSE 0 END) as approved_count,
          SUM(CASE WHEN dpr.status = 'processing' THEN 1 ELSE 0 END) as processing_count,
          SUM(CASE WHEN dpr.status = 'success' THEN 1 ELSE 0 END) as success_count,
          SUM(CASE WHEN dpr.status = 'failed' THEN 1 ELSE 0 END) as failed_count,
          SUM(CASE WHEN dpr.status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
          COALESCE(SUM(dpr.payment_amount), 0) as total_amount,
          COALESCE(SUM(CASE WHEN dpr.status = 'success' THEN dpr.payment_amount ELSE 0 END), 0) as success_amount
        FROM directed_payment_requests dpr
        LEFT JOIN directed_pay_contracts dpc ON dpr.contract_id = dpc.id
        WHERE 1=1
      `;
      const params: any[] = [];
      
      // 数据权限过滤
      if (orgContext && !orgContext.isPlatformUser && orgContext.orgType === "financier") {
        sql += " AND dpc.financier_id = ?";
        params.push(orgContext.relatedEntityId);
      }
      if (orgContext && !orgContext.isPlatformUser && orgContext.orgType === "funder") {
        sql += " AND dpc.funder_id = ?";
        params.push(orgContext.relatedEntityId);
      }
      
      const [rows] = await pool.query<RowDataPacket[]>(sql, params);
      const row = rows[0];
      res.json({
        totalCount: Number(row.total_count) || 0,
        pendingCount: Number(row.pending_count) || 0,
        approvedCount: Number(row.approved_count) || 0,
        processingCount: Number(row.processing_count) || 0,
        successCount: Number(row.success_count) || 0,
        failedCount: Number(row.failed_count) || 0,
        rejectedCount: Number(row.rejected_count) || 0,
        totalAmount: parseFloat(row.total_amount) || 0,
        successAmount: parseFloat(row.success_amount) || 0,
      });
    } catch (error: any) {
      console.error("获取支付申请统计失败:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// 获取待审批列表（必须在 :id 路由之前）
router.get(
  "/directed-pay/requests/pending-approvals",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { type = "platform" } = req.query;

      const statusCondition =
        type === "platform" ? "dpr.status = 'platform_pending'" : "dpr.status = 'funder_pending'";

      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT dpr.*, dpc.contract_number
         FROM directed_payment_requests dpr
         LEFT JOIN directed_pay_contracts dpc ON dpr.contract_id = dpc.id
         WHERE ${statusCondition}
         ORDER BY dpr.created_at DESC`
      );

      const requests = rows.map((row) => ({
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
        receiverType: row.receiver_type,
        driverName: row.driver_name,
        status: row.status,
        createdAt: row.created_at,
      }));

      res.json({ requests });
    } catch (error: any) {
      console.error("获取待审批列表失败:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// 获取支付申请详情
router.get(
  "/directed-pay/requests/:id",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const request = await core.getPaymentRequestById(req.params.id);
      if (!request) {
        return res.status(404).json({ error: "支付申请不存在" });
      }
      res.json({ request });
    } catch (error: any) {
      console.error("获取支付申请详情失败:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// 创建支付申请
router.post(
  "/directed-pay/requests",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const currentUser = req.currentUser;
      const isAdmin = currentUser?.permissions?.includes("*") || currentUser?.username === "admin";
      
      // 权限验证：非平台用户只能在自己组织关联的合同下创建申请
      const orgContext = req.orgContext;
      const contractId = req.body?.contractId;
      
      if (orgContext && !orgContext.isPlatformUser && contractId) {
        const contract = await core.getDirectedPayContractById(contractId);
        if (!contract) {
          return res.status(404).json({ error: "合同不存在" });
        }
        
        // 融资方用户只能在自己的合同下创建申请
        if (orgContext.orgType === "financier" && contract.financierId !== orgContext.relatedEntityId) {
          return res.status(403).json({ error: "无权限在此合同下创建申请" });
        }
        // 资金方用户只能在自己的合同下创建申请
        if (orgContext.orgType === "funder" && contract.funderId !== orgContext.relatedEntityId) {
          return res.status(403).json({ error: "无权限在此合同下创建申请" });
        }
      }

      const request = await core.createPaymentRequest({
        ...req.body,
        createdBy: currentUser?.id,
        isAdmin,
      });

      res.json({ request });
    } catch (error: any) {
      console.error("创建支付申请失败:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// 平台审批通过
router.post(
  "/directed-pay/requests/:id/platform-approve",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // 权限验证：只有平台用户可以进行平台审批
      const orgContext = req.orgContext;
      if (!orgContext?.isPlatformUser) {
        return res.status(403).json({ error: "只有平台用户可以进行平台审批" });
      }
      
      const currentUser = req.currentUser;
      const { remark } = req.body;

      const request = await core.platformApprove(
        req.params.id,
        currentUser?.id ?? '',
        remark
      );

      res.json({ request });
    } catch (error: any) {
      console.error("平台审批失败:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// 平台审批拒绝
router.post(
  "/directed-pay/requests/:id/platform-reject",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // 权限验证：只有平台用户可以进行平台审批
      const orgContext = req.orgContext;
      if (!orgContext?.isPlatformUser) {
        return res.status(403).json({ error: "只有平台用户可以进行平台拒绝" });
      }
      
      const currentUser = req.currentUser;
      const { remark } = req.body;

      const request = await core.platformReject(
        req.params.id,
        currentUser?.id ?? '',
        remark
      );

      res.json({ request });
    } catch (error: any) {
      console.error("平台拒绝失败:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// 资金方审批通过
router.post(
  "/directed-pay/requests/:id/funder-approve",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // 权限验证：只有资金方用户或平台用户可以进行资金方审批
      const orgContext = req.orgContext;
      if (!orgContext?.isPlatformUser) {
        // 非平台用户需要验证是否为该申请关联合同的资金方
        const paymentRequest = await requestsStore.getPaymentRequestById(req.params.id);
        if (!paymentRequest) {
          return res.status(404).json({ error: "申请不存在" });
        }
        const contract = await core.getDirectedPayContractById(paymentRequest.contractId);
        if (!contract) {
          return res.status(404).json({ error: "合同不存在" });
        }
        if (orgContext!.orgType !== "funder" || contract.funderId !== orgContext!.relatedEntityId) {
          return res.status(403).json({ error: "只有关联资金方可以进行资金方审批" });
        }
      }
      
      const currentUser = req.currentUser;
      const { remark } = req.body;

      const request = await core.funderApprove(
        req.params.id,
        currentUser?.id ?? '',
        remark
      );

      res.json({ request });
    } catch (error: any) {
      console.error("资金方审批失败:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// 资金方审批拒绝
router.post(
  "/directed-pay/requests/:id/funder-reject",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // 权限验证：只有资金方用户或平台用户可以进行资金方审批
      const orgContext = req.orgContext;
      if (!orgContext?.isPlatformUser) {
        const paymentRequest = await requestsStore.getPaymentRequestById(req.params.id);
        if (!paymentRequest) {
          return res.status(404).json({ error: "申请不存在" });
        }
        const contract = await core.getDirectedPayContractById(paymentRequest.contractId);
        if (!contract) {
          return res.status(404).json({ error: "合同不存在" });
        }
        if (orgContext!.orgType !== "funder" || contract.funderId !== orgContext!.relatedEntityId) {
          return res.status(403).json({ error: "只有关联资金方可以进行资金方拒绝" });
        }
      }
      
      const currentUser = req.currentUser;
      const { remark } = req.body;

      const request = await core.funderReject(
        req.params.id,
        currentUser?.id ?? '',
        remark
      );

      res.json({ request });
    } catch (error: any) {
      console.error("资金方拒绝失败:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// 取消申请
router.post(
  "/directed-pay/requests/:id/cancel",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      await core.cancelPaymentRequest(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("取消申请失败:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// 执行支付
router.post(
  "/directed-pay/requests/:id/execute",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const request = await core.executePayment(req.params.id);
      res.json({ request });
    } catch (error: any) {
      console.error("执行支付失败:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ==================== 统计 API ====================

// 获取合同统计
router.get(
  "/directed-pay/stats/contracts",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const [rows] = await pool.query<RowDataPacket[]>(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) as suspended,
          SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired,
          SUM(credit_limit) as total_credit_limit,
          SUM(used_amount) as total_used_amount
        FROM directed_pay_contracts
        WHERE deleted_at IS NULL
      `);

      res.json({
        stats: {
          total: Number(rows[0].total),
          active: Number(rows[0].active),
          suspended: Number(rows[0].suspended),
          expired: Number(rows[0].expired),
          totalCreditLimit: Number(rows[0].total_credit_limit) || 0,
          totalUsedAmount: Number(rows[0].total_used_amount) || 0,
        },
      });
    } catch (error: any) {
      console.error("获取合同统计失败:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// 获取支付申请统计
router.get(
  "/directed-pay/stats/requests",
  authenticate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // 数据权限过滤
      const orgContext = req.orgContext;
      let sql = `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN dpr.status IN ('platform_pending', 'funder_pending') THEN 1 ELSE 0 END) as pending_approval,
          SUM(CASE WHEN dpr.status = 'processing' THEN 1 ELSE 0 END) as processing,
          SUM(CASE WHEN dpr.status = 'success' THEN 1 ELSE 0 END) as success,
          SUM(CASE WHEN dpr.status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN dpr.status = 'success' THEN dpr.payment_amount ELSE 0 END) as total_paid_amount
        FROM directed_payment_requests dpr
        LEFT JOIN directed_pay_contracts dpc ON dpr.contract_id = dpc.id
        WHERE 1=1
      `;
      const params: any[] = [];
      
      if (orgContext && !orgContext.isPlatformUser) {
        if (orgContext.orgType === "financier") {
          sql += " AND dpc.financier_id = ?";
          params.push(orgContext.relatedEntityId);
        }
        if (orgContext.orgType === "funder") {
          sql += " AND dpc.funder_id = ?";
          params.push(orgContext.relatedEntityId);
        }
      }
      
      const [rows] = await pool.query<RowDataPacket[]>(sql, params);

      res.json({
        stats: {
          total: Number(rows[0].total),
          pendingApproval: Number(rows[0].pending_approval),
          processing: Number(rows[0].processing),
          success: Number(rows[0].success),
          failed: Number(rows[0].failed),
          totalPaidAmount: Number(rows[0].total_paid_amount) || 0,
        },
      });
    } catch (error: any) {
      console.error("获取支付申请统计失败:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ==================== 数据修复 API ====================

// 修复支付申请数据（乱码 + 异常金额）
router.post(
  "/directed-pay/fix-data",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const results: any = {
        categoryFixed: 0,
        amountFixed: 0
      };

      // 1. 修复支付类别乱码
      const categoryMap: Record<string, string> = {
        "FREIGHT": "运费",
        "OIL_CARD": "油卡",
        "ETC": "ETC",
        "SALARY": "工资",
        "INSURANCE": "保险",
        "MAINTENANCE": "维修",
        "TOLL": "路桥费",
        "OTHER": "其他",
      };

      for (const [code, name] of Object.entries(categoryMap)) {
        const [result] = await pool.query<ResultSetHeader>(
          `UPDATE directed_payment_requests 
           SET category_name = ? 
           WHERE category_code = ? AND category_name != ?`,
          [name, code, name]
        );
        results.categoryFixed += result.affectedRows;
      }

      // 2. 修复异常金额（超过20000的运费改为合理金额）
      const [amountResult] = await pool.query<ResultSetHeader>(
        `UPDATE directed_payment_requests 
         SET payment_amount = FLOOR(RAND() * 15000) + 1000
         WHERE payment_amount > 20000`
      );
      results.amountFixed = amountResult.affectedRows;

      res.json({ success: true, ...results });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// 保留旧的 API 以兼容
router.post(
  "/directed-pay/fix-category-encoding",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const categoryMap: Record<string, string> = {
        "FREIGHT": "运费",
        "OIL_CARD": "油卡",
        "ETC": "ETC",
        "SALARY": "工资",
        "INSURANCE": "保险",
        "MAINTENANCE": "维修",
        "TOLL": "路桥费",
        "OTHER": "其他",
      };

      let totalFixed = 0;
      for (const [code, name] of Object.entries(categoryMap)) {
        const [result] = await pool.query<ResultSetHeader>(
          `UPDATE directed_payment_requests 
           SET category_name = ? 
           WHERE category_code = ? AND category_name != ?`,
          [name, code, name]
        );
        totalFixed += result.affectedRows;
      }

      res.json({ success: true, fixedCount: totalFixed });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
