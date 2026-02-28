/**
 * 合同放款管理 - API 路由
 */

import { Router, Response } from "express";
import { AuthenticatedRequest, authenticate, requirePermissions } from "./auth.js";
import {
  createDisbursement,
  getDisbursementsByContract,
  cancelDisbursement,
  createRepayment,
  getRepaymentsByContract,
  cancelRepayment,
  getInterestAccrualsByContract,
  getContractLoanSummary,
  calculateDailyInterest,
  calculateAllContractsDailyInterest,
} from "./contract-loan-store.js";

const router = Router();

// ==================== 放款相关 ====================

/**
 * 创建放款记录
 * POST /api/contracts/:contractId/disbursements
 */
router.post(
  "/contracts/:contractId/disbursements",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { contractId } = req.params;
      const { amount, disbursementDate, remark } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: "放款金额必须大于0" });
      }
      if (!disbursementDate) {
        return res.status(400).json({ error: "放款日期不能为空" });
      }

      const disbursement = await createDisbursement({
        contractId,
        amount,
        disbursementDate,
        operatorId: req.user?.id,
        operatorName: req.user?.username,
        remark,
      });

      res.json({ success: true, disbursement });
    } catch (err: any) {
      console.error("创建放款记录失败:", err);
      res.status(500).json({ error: err.message || "创建放款记录失败" });
    }
  }
);

/**
 * 获取合同的放款记录列表
 * GET /api/contracts/:contractId/disbursements
 */
router.get(
  "/contracts/:contractId/disbursements",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { contractId } = req.params;
      const disbursements = await getDisbursementsByContract(contractId);
      res.json({ disbursements });
    } catch (err: any) {
      console.error("获取放款记录失败:", err);
      res.status(500).json({ error: err.message || "获取放款记录失败" });
    }
  }
);

/**
 * 取消放款记录
 * DELETE /api/disbursements/:id
 */
router.delete(
  "/disbursements/:id",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await cancelDisbursement(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      console.error("取消放款记录失败:", err);
      res.status(500).json({ error: err.message || "取消放款记录失败" });
    }
  }
);

// ==================== 还款相关 ====================

/**
 * 创建还款记录
 * POST /api/contracts/:contractId/repayments
 */
router.post(
  "/contracts/:contractId/repayments",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { contractId } = req.params;
      const { principalAmount, interestAmount, repaymentDate, remark } = req.body;

      const principal = Number(principalAmount) || 0;
      const interest = Number(interestAmount) || 0;

      if (principal <= 0 && interest <= 0) {
        return res.status(400).json({ error: "还款金额必须大于0" });
      }
      if (!repaymentDate) {
        return res.status(400).json({ error: "还款日期不能为空" });
      }

      const repayment = await createRepayment({
        contractId,
        principalAmount: principal,
        interestAmount: interest,
        repaymentDate,
        operatorId: req.user?.id,
        operatorName: req.user?.username,
        remark,
      });

      res.json({ success: true, repayment });
    } catch (err: any) {
      console.error("创建还款记录失败:", err);
      res.status(500).json({ error: err.message || "创建还款记录失败" });
    }
  }
);

/**
 * 获取合同的还款记录列表
 * GET /api/contracts/:contractId/repayments
 */
router.get(
  "/contracts/:contractId/repayments",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { contractId } = req.params;
      const repayments = await getRepaymentsByContract(contractId);
      res.json({ repayments });
    } catch (err: any) {
      console.error("获取还款记录失败:", err);
      res.status(500).json({ error: err.message || "获取还款记录失败" });
    }
  }
);

/**
 * 取消还款记录
 * DELETE /api/repayments/:id
 */
router.delete(
  "/repayments/:id",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await cancelRepayment(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      console.error("取消还款记录失败:", err);
      res.status(500).json({ error: err.message || "取消还款记录失败" });
    }
  }
);

// ==================== 利息台账 ====================

/**
 * 获取合同的利息台账
 * GET /api/contracts/:contractId/interest-accruals
 */
router.get(
  "/contracts/:contractId/interest-accruals",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { contractId } = req.params;
      const { status, startDate, endDate } = req.query;
      
      const accruals = await getInterestAccrualsByContract(contractId, {
        status: status as 'pending' | 'settled' | undefined,
        startDate: startDate as string | undefined,
        endDate: endDate as string | undefined,
      });
      
      res.json({ accruals });
    } catch (err: any) {
      console.error("获取利息台账失败:", err);
      res.status(500).json({ error: err.message || "获取利息台账失败" });
    }
  }
);

// ==================== 合同放款汇总 ====================

/**
 * 获取合同放款汇总信息
 * GET /api/contracts/:contractId/loan-summary
 */
router.get(
  "/contracts/:contractId/loan-summary",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { contractId } = req.params;
      const summary = await getContractLoanSummary(contractId);
      
      if (!summary) {
        return res.status(404).json({ error: "合同不存在" });
      }
      
      res.json({ summary });
    } catch (err: any) {
      console.error("获取放款汇总失败:", err);
      res.status(500).json({ error: err.message || "获取放款汇总失败" });
    }
  }
);

// ==================== 利息计算（管理员操作） ====================

/**
 * 手动计算单个合同某日利息
 * POST /api/contracts/:contractId/calculate-interest
 */
router.post(
  "/contracts/:contractId/calculate-interest",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { contractId } = req.params;
      const { date } = req.body;
      
      const targetDate = date || new Date().toISOString().split('T')[0];
      const accrual = await calculateDailyInterest(contractId, targetDate);
      
      res.json({ success: true, accrual });
    } catch (err: any) {
      console.error("计算利息失败:", err);
      res.status(500).json({ error: err.message || "计算利息失败" });
    }
  }
);

/**
 * 批量计算所有合同当日利息（定时任务或管理员手动触发）
 * POST /api/contracts/calculate-all-interest
 */
router.post(
  "/contracts/calculate-all-interest",
  authenticate,
  requirePermissions("manage_contracts"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { date } = req.body;
      const targetDate = date || new Date().toISOString().split('T')[0];
      
      const result = await calculateAllContractsDailyInterest(targetDate);
      
      res.json({ 
        success: true, 
        date: targetDate,
        processedContracts: result.processed,
        totalInterest: result.totalInterest,
      });
    } catch (err: any) {
      console.error("批量计算利息失败:", err);
      res.status(500).json({ error: err.message || "批量计算利息失败" });
    }
  }
);

export default router;
