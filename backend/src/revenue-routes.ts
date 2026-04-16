/**
 * 收益管理 - API路由
 */

import { Router, Response } from "express";
import { authenticate, requirePermissions, requireAnyPermission, AuthenticatedRequest } from "./auth.js";
import { handleError, sendError } from "./errorHandler.js";
import * as revenueStore from "./revenue-store.js";
import { calculateDailyRevenue, recalculateHistoricalWaybillCommissions } from "./revenue-scheduler.js";
import { RevenueSourceType, RevenueStatus } from "./types.js";

const router = Router();

// ==================== 平台收益接口 ====================

// 平台收益统计
router.get(
  "/revenue/platform/stats",
  authenticate,
  requirePermissions("view_platform_revenue"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { startDate, endDate } = req.query;
      
      const stats = await revenueStore.getRevenueStats({
        recordType: "revenue",
        startDate: startDate as string,
        endDate: endDate as string,
      });
      
      res.json(stats);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 平台收益明细
router.get(
  "/revenue/platform/list",
  authenticate,
  requirePermissions("view_platform_revenue"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { startDate, endDate, sourceType, funderId, financierId, financierName, status, page, pageSize, subFinancier, commissionContractId, localPartnerId, areaId, useWaybillDate } = req.query;
      
      const result = await revenueStore.getRevenueRecords({
        recordType: "revenue",
        sourceType: sourceType as RevenueSourceType,
        funderId: funderId as string,
        financierId: financierId as string,
        financierName: financierName as string,
        status: status as RevenueStatus,
        startDate: startDate as string,
        endDate: endDate as string,
        useWaybillDate: String(useWaybillDate || "") === "true" || String(useWaybillDate || "") === "1",
        page: page ? Number(page) : 1,
        pageSize: pageSize ? Number(pageSize) : 20,
        subFinancier: subFinancier as string,
        commissionContractId: commissionContractId as string,
        localPartnerId: localPartnerId as string,
        areaId: areaId as string,
      });
      
      res.json(result);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 平台收益趋势
router.get(
  "/revenue/platform/trend",
  authenticate,
  requirePermissions("view_platform_revenue"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { startDate, endDate, groupBy } = req.query;
      
      if (!startDate || !endDate) {
        sendError(res, req, 400, "error.revenue.date_required");
        return;
      }
      
      const trend = await revenueStore.getRevenueTrend({
        recordType: "revenue",
        startDate: startDate as string,
        endDate: endDate as string,
        groupBy: (groupBy as "day" | "week" | "month" | "year") || "day",
      });
      
      res.json({ trend });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 平台运营趋势
router.get(
  "/revenue/platform/operation-trend",
  authenticate,
  requirePermissions("view_platform_revenue"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { startDate, endDate, groupBy } = req.query;

      if (!startDate || !endDate) {
        sendError(res, req, 400, "error.revenue.date_required");
        return;
      }

      const trend = await revenueStore.getPlatformOperationTrend({
        startDate: startDate as string,
        endDate: endDate as string,
        groupBy: (groupBy as "day" | "week" | "month" | "year") || "day",
      });

      res.json({ trend });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 平台收益构成
router.get(
  "/revenue/platform/composition",
  authenticate,
  requirePermissions("view_platform_revenue"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { startDate, endDate } = req.query;
      
      const composition = await revenueStore.getRevenueComposition({
        recordType: "revenue",
        startDate: startDate as string,
        endDate: endDate as string,
      });
      
      res.json({ composition });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 平台收益排行 - 资金方
router.get(
  "/revenue/platform/ranking/funders",
  authenticate,
  requirePermissions("view_platform_revenue"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { startDate, endDate, limit } = req.query;
      
      const ranking = await revenueStore.getRevenueRanking({
        recordType: "revenue",
        rankBy: "funder",
        startDate: startDate as string,
        endDate: endDate as string,
        limit: limit ? Number(limit) : 10,
      });
      
      res.json({ ranking });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 平台收益排行 - 融资方
router.get(
  "/revenue/platform/ranking/financiers",
  authenticate,
  requirePermissions("view_platform_revenue"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { startDate, endDate, limit } = req.query;
      
      const ranking = await revenueStore.getRevenueRanking({
        recordType: "revenue",
        rankBy: "financier",
        startDate: startDate as string,
        endDate: endDate as string,
        limit: limit ? Number(limit) : 10,
      });
      
      res.json({ ranking });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 平台收益导出
router.get(
  "/revenue/platform/export",
  authenticate,
  requirePermissions("view_platform_revenue"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { startDate, endDate, sourceType, funderId, financierId, status } = req.query;
      
      const data = await revenueStore.exportRevenueRecords({
        recordType: "revenue",
        sourceType: sourceType as RevenueSourceType,
        funderId: funderId as string,
        financierId: financierId as string,
        status: status as RevenueStatus,
        startDate: startDate as string,
        endDate: endDate as string,
      });
      
      // 生成CSV内容
      const BOM = "\uFEFF"; // UTF-8 BOM
      const csvContent = BOM + [
        data.headers.join(","),
        ...data.rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(",")),
      ].join("\n");
      
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=platform_revenue_${new Date().toISOString().split("T")[0]}.csv`);
      res.send(csvContent);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// ==================== 资金方收益接口 ====================

// 资金方收益统计
router.get(
  "/revenue/funder/stats",
  authenticate,
  requirePermissions("view_funder_revenue"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { startDate, endDate } = req.query;
      const orgContext = req.orgContext;
      
      // 数据权限：资金方用户只能看自己的数据
      let beneficiaryId: string | undefined;
      if (orgContext && !orgContext.isPlatformUser && orgContext.orgType === "funder") {
        beneficiaryId = orgContext.relatedEntityId;
      }
      
      const stats = await revenueStore.getRevenueStats({
        recordType: "revenue",
        beneficiaryType: "funder",
        beneficiaryId,
        startDate: startDate as string,
        endDate: endDate as string,
      });
      
      res.json(stats);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 资金方收益明细
router.get(
  "/revenue/funder/list",
  authenticate,
  requirePermissions("view_funder_revenue"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { startDate, endDate, sourceType, financierId, status, page, pageSize } = req.query;
      const orgContext = req.orgContext;
      
      // 数据权限：资金方用户只能看自己的数据
      let funderId: string | undefined;
      if (orgContext && !orgContext.isPlatformUser && orgContext.orgType === "funder") {
        funderId = orgContext.relatedEntityId;
      }
      
      const result = await revenueStore.getRevenueRecords({
        recordType: "revenue",
        beneficiaryType: "funder",
        beneficiaryId: funderId,
        funderId,
        sourceType: sourceType as RevenueSourceType,
        financierId: financierId as string,
        status: status as RevenueStatus,
        startDate: startDate as string,
        endDate: endDate as string,
        page: page ? Number(page) : 1,
        pageSize: pageSize ? Number(pageSize) : 20,
      });
      
      res.json(result);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 资金方收益趋势
router.get(
  "/revenue/funder/trend",
  authenticate,
  requirePermissions("view_funder_revenue"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { startDate, endDate, groupBy } = req.query;
      const orgContext = req.orgContext;
      
      if (!startDate || !endDate) {
        sendError(res, req, 400, "error.revenue.date_required");
        return;
      }
      
      // 数据权限
      let beneficiaryId: string | undefined;
      if (orgContext && !orgContext.isPlatformUser && orgContext.orgType === "funder") {
        beneficiaryId = orgContext.relatedEntityId;
      }
      
      const trend = await revenueStore.getRevenueTrend({
        recordType: "revenue",
        beneficiaryType: "funder",
        beneficiaryId,
        startDate: startDate as string,
        endDate: endDate as string,
        groupBy: (groupBy as "day" | "week" | "month" | "year") || "day",
      });
      
      res.json({ trend });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 资金方收益构成
router.get(
  "/revenue/funder/composition",
  authenticate,
  requirePermissions("view_funder_revenue"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { startDate, endDate } = req.query;
      const orgContext = req.orgContext;
      
      // 数据权限
      let beneficiaryId: string | undefined;
      if (orgContext && !orgContext.isPlatformUser && orgContext.orgType === "funder") {
        beneficiaryId = orgContext.relatedEntityId;
      }
      
      const composition = await revenueStore.getRevenueComposition({
        recordType: "revenue",
        beneficiaryType: "funder",
        beneficiaryId,
        startDate: startDate as string,
        endDate: endDate as string,
      });
      
      res.json({ composition });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 资金方合作融资方排行
router.get(
  "/revenue/funder/ranking/financiers",
  authenticate,
  requirePermissions("view_funder_revenue"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { startDate, endDate, limit } = req.query;
      const orgContext = req.orgContext;
      
      // 数据权限
      let beneficiaryId: string | undefined;
      if (orgContext && !orgContext.isPlatformUser && orgContext.orgType === "funder") {
        beneficiaryId = orgContext.relatedEntityId;
      }
      
      const ranking = await revenueStore.getRevenueRanking({
        recordType: "revenue",
        beneficiaryType: "funder",
        beneficiaryId,
        rankBy: "financier",
        startDate: startDate as string,
        endDate: endDate as string,
        limit: limit ? Number(limit) : 10,
      });
      
      res.json({ ranking });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 资金方收益导出
router.get(
  "/revenue/funder/export",
  authenticate,
  requirePermissions("view_funder_revenue"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { startDate, endDate, sourceType, financierId, status } = req.query;
      const orgContext = req.orgContext;
      
      // 数据权限
      let funderId: string | undefined;
      if (orgContext && !orgContext.isPlatformUser && orgContext.orgType === "funder") {
        funderId = orgContext.relatedEntityId;
      }
      
      const data = await revenueStore.exportRevenueRecords({
        recordType: "revenue",
        beneficiaryType: "funder",
        beneficiaryId: funderId,
        funderId,
        sourceType: sourceType as RevenueSourceType,
        financierId: financierId as string,
        status: status as RevenueStatus,
        startDate: startDate as string,
        endDate: endDate as string,
      });
      
      // 生成CSV内容
      const BOM = "\uFEFF";
      const csvContent = BOM + [
        data.headers.join(","),
        ...data.rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(",")),
      ].join("\n");
      
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=funder_revenue_${new Date().toISOString().split("T")[0]}.csv`);
      res.send(csvContent);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// ==================== 融资方支出接口 ====================

// 融资方支出统计
router.get(
  "/expense/financier/stats",
  authenticate,
  requirePermissions("view_financier_expense"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { startDate, endDate } = req.query;
      const orgContext = req.orgContext;
      
      // 数据权限：融资方用户只能看自己的数据
      let beneficiaryId: string | undefined;
      if (orgContext && !orgContext.isPlatformUser && orgContext.orgType === "financier") {
        beneficiaryId = orgContext.relatedEntityId;
      }
      
      const stats = await revenueStore.getRevenueStats({
        recordType: "expense",
        beneficiaryType: "financier",
        beneficiaryId,
        startDate: startDate as string,
        endDate: endDate as string,
      });
      
      res.json(stats);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 融资方支出明细
router.get(
  "/expense/financier/list",
  authenticate,
  requirePermissions("view_financier_expense"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { startDate, endDate, sourceType, funderId, status, page, pageSize } = req.query;
      const orgContext = req.orgContext;
      
      // 数据权限
      let financierId: string | undefined;
      if (orgContext && !orgContext.isPlatformUser && orgContext.orgType === "financier") {
        financierId = orgContext.relatedEntityId;
      }
      
      const result = await revenueStore.getRevenueRecords({
        recordType: "expense",
        beneficiaryType: "financier",
        beneficiaryId: financierId,
        financierId,
        sourceType: sourceType as RevenueSourceType,
        funderId: funderId as string,
        status: status as RevenueStatus,
        startDate: startDate as string,
        endDate: endDate as string,
        page: page ? Number(page) : 1,
        pageSize: pageSize ? Number(pageSize) : 20,
      });
      
      res.json(result);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 融资方支出趋势
router.get(
  "/expense/financier/trend",
  authenticate,
  requirePermissions("view_financier_expense"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { startDate, endDate, groupBy } = req.query;
      const orgContext = req.orgContext;
      
      if (!startDate || !endDate) {
        sendError(res, req, 400, "error.revenue.date_required");
        return;
      }
      
      // 数据权限
      let beneficiaryId: string | undefined;
      if (orgContext && !orgContext.isPlatformUser && orgContext.orgType === "financier") {
        beneficiaryId = orgContext.relatedEntityId;
      }
      
      const trend = await revenueStore.getRevenueTrend({
        recordType: "expense",
        beneficiaryType: "financier",
        beneficiaryId,
        startDate: startDate as string,
        endDate: endDate as string,
        groupBy: (groupBy as "day" | "week" | "month" | "year") || "day",
      });
      
      res.json({ trend });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 融资方支出构成
router.get(
  "/expense/financier/composition",
  authenticate,
  requirePermissions("view_financier_expense"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { startDate, endDate } = req.query;
      const orgContext = req.orgContext;
      
      // 数据权限
      let beneficiaryId: string | undefined;
      if (orgContext && !orgContext.isPlatformUser && orgContext.orgType === "financier") {
        beneficiaryId = orgContext.relatedEntityId;
      }
      
      const composition = await revenueStore.getRevenueComposition({
        recordType: "expense",
        beneficiaryType: "financier",
        beneficiaryId,
        startDate: startDate as string,
        endDate: endDate as string,
      });
      
      res.json({ composition });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 融资方合作资金方排行
router.get(
  "/expense/financier/ranking/funders",
  authenticate,
  requirePermissions("view_financier_expense"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { startDate, endDate, limit } = req.query;
      const orgContext = req.orgContext;
      
      // 数据权限
      let beneficiaryId: string | undefined;
      if (orgContext && !orgContext.isPlatformUser && orgContext.orgType === "financier") {
        beneficiaryId = orgContext.relatedEntityId;
      }
      
      const ranking = await revenueStore.getRevenueRanking({
        recordType: "expense",
        beneficiaryType: "financier",
        beneficiaryId,
        rankBy: "funder",
        startDate: startDate as string,
        endDate: endDate as string,
        limit: limit ? Number(limit) : 10,
      });
      
      res.json({ ranking });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 融资方支出导出
router.get(
  "/expense/financier/export",
  authenticate,
  requirePermissions("view_financier_expense"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { startDate, endDate, sourceType, funderId, status } = req.query;
      const orgContext = req.orgContext;
      
      // 数据权限
      let financierId: string | undefined;
      if (orgContext && !orgContext.isPlatformUser && orgContext.orgType === "financier") {
        financierId = orgContext.relatedEntityId;
      }
      
      const data = await revenueStore.exportRevenueRecords({
        recordType: "expense",
        beneficiaryType: "financier",
        beneficiaryId: financierId,
        financierId,
        sourceType: sourceType as RevenueSourceType,
        funderId: funderId as string,
        status: status as RevenueStatus,
        startDate: startDate as string,
        endDate: endDate as string,
      });
      
      // 生成CSV内容
      const BOM = "\uFEFF";
      const csvContent = BOM + [
        data.headers.join(","),
        ...data.rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(",")),
      ].join("\n");
      
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=financier_expense_${new Date().toISOString().split("T")[0]}.csv`);
      res.send(csvContent);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// ==================== 管理接口 ====================

// 手动触发收益计算 (仅平台管理员)
router.post(
  "/revenue/calculate",
  authenticate,
  requirePermissions("revenue_management"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { date } = req.body ?? {};
      const result = await calculateDailyRevenue(date);
      res.json({ success: true, ...result });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 清理并重新计算指定日期的收益（仅平台管理员）
router.post(
  "/revenue/recalculate",
  authenticate,
  requirePermissions("revenue_management"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { date } = req.body ?? {};
      if (!date) {
        return sendError(res, req, 400, "日期参数必填");
      }
      
      // 删除指定日期的融资利息和定向支付利息记录
      const { pool } = await import("./db.js");
      await pool.query(
        `DELETE FROM revenue_records WHERE revenue_date = ? AND source_type IN ('financing_interest', 'directed_pay_interest')`,
        [date]
      );
      
      // 重新计算
      const result = await calculateDailyRevenue(date);
      res.json({ success: true, message: `已清理并重新计算 ${date} 的收益`, ...result });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// 全量回算运单抽成历史记录（仅平台管理员）
router.post(
  "/revenue/recalculate-waybill-commission-history",
  authenticate,
  requirePermissions("revenue_management"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await recalculateHistoricalWaybillCommissions();
      res.json({
        success: true,
        message: "运单抽成历史记录已按最新规则回算",
        ...result,
      });
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

export default router;
