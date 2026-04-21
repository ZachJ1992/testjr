import { Router, type Request, type Response } from "express";

import { authenticate, type AuthenticatedRequest } from "./auth.js";
import { requireApiKey } from "./api-key-auth.js";
import { handleError } from "./errorHandler.js";
import { loadUserContext, resolveBusinessScope } from "./permission-policy.js";
import { findOrgById } from "./store.js";
import {
  getDashboardBusinessScaleByCity,
  getDashboardBusinessScaleByRoute,
  getDashboardBusinessScaleTrend,
  getDashboardBusinessTrend,
  getDashboardDepartureBatchTrend,
  getDashboardIncomeStructure,
  getDashboardIncomeTrend,
  getDashboardLandingPartnerTop,
  getDashboardOverview,
  getDashboardPartnerEfficiency,
  getDashboardPartnerTop,
  getDashboardRegionSummary,
  getDashboardSettlementProgress,
  getDashboardWaybillsOverview,
  type DashboardAggregateFilters,
  type DashboardEfficiencyFilters,
  type DashboardGranularity,
  type DashboardRankFilters,
  type DashboardSortBy,
  getPlatformRevenueOverview,
} from "./dashboard-store.js";

const router = Router();

function sendSuccess<T>(res: Response, data: T): void {
  res.json({
    code: 0,
    message: "success",
    data,
  });
}

function getDashboardFilters(req: Request): DashboardAggregateFilters {
  return {
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined,
    partnerName: req.query.partnerName as string | undefined,
    landingPartnerName: req.query.landingPartnerName as string | undefined,
    routeName: req.query.routeName as string | undefined,
  };
}

/** 解析 `includeZeroRegions` 等布尔查询串；无法识别时返回 `undefined`（等同未传）。 */
function parseOptionalBooleanQuery(raw: unknown): boolean | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string") {
    return undefined;
  }
  const s = v.trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes") {
    return true;
  }
  if (s === "false" || s === "0" || s === "no") {
    return false;
  }
  return undefined;
}

function getDashboardGranularity(req: Request): DashboardGranularity | undefined {
  const value = req.query.granularity;
  if (value === "week" || value === "month" || value === "day") {
    return value;
  }
  return undefined;
}

function getDashboardLimit(req: Request): number | undefined {
  const value = Number(req.query.limit);
  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.floor(value);
}

function getDashboardSortBy(req: Request): DashboardSortBy | undefined {
  const value = req.query.sortBy;
  if (
    value === "platformIncome" ||
    value === "waybillCount" ||
    value === "grossFreightAmount"
  ) {
    return value;
  }
  return undefined;
}

router.get(
  "/dashboard/platform-revenue/overview",
  requireApiKey,
  async (req: Request, res: Response) => {
    try {
      const data = await getPlatformRevenueOverview({
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
      });

      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.get(
  "/dashboard/waybills/overview",
  requireApiKey,
  async (req: Request, res: Response) => {
    try {
      const data = await getDashboardWaybillsOverview(
        {
          customerName: req.query.customerName as string | undefined,
          contractNumber: req.query.contractNumber as string | undefined,
          businessMode: req.query.businessMode as string | undefined,
          status: req.query.status as string | undefined,
          startDate: req.query.startDate as string | undefined,
          endDate: req.query.endDate as string | undefined,
          waybillNumber: req.query.waybillNumber as string | undefined,
          vehiclePlate: req.query.vehiclePlate as string | undefined,
          batchStatus: req.query.batchStatus as string | undefined,
          batchSource: req.query.batchSource as string | undefined,
        }
      );

      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.get("/dashboard/overview", requireApiKey, async (req: Request, res: Response) => {
  try {
    const data = await getDashboardOverview(getDashboardFilters(req));
    sendSuccess(res, data);
  } catch (err) {
    handleError(res, req, 500, err);
  }
});

router.get(
  "/dashboard/income-trend",
  requireApiKey,
  async (req: Request, res: Response) => {
    try {
      const data = await getDashboardIncomeTrend({
        ...getDashboardFilters(req),
        granularity: getDashboardGranularity(req),
      });
      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.get(
  "/dashboard/business-trend",
  requireApiKey,
  async (req: Request, res: Response) => {
    try {
      const data = await getDashboardBusinessTrend({
        ...getDashboardFilters(req),
        granularity: getDashboardGranularity(req),
      });
      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.get(
  "/dashboard/business-scale-trend",
  requireApiKey,
  async (req: Request, res: Response) => {
    try {
      const data = await getDashboardBusinessScaleTrend({
        ...getDashboardFilters(req),
        granularity: getDashboardGranularity(req),
      });
      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.get(
  "/dashboard/departure-batch-trend",
  requireApiKey,
  async (req: Request, res: Response) => {
    try {
      const data = await getDashboardDepartureBatchTrend({
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        granularity: getDashboardGranularity(req),
      });
      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.get(
  "/dashboard/business-scale-by-city",
  requireApiKey,
  async (req: Request, res: Response) => {
    try {
      const data = await getDashboardBusinessScaleByCity(getDashboardFilters(req));
      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.get(
  "/dashboard/business-scale-by-route",
  requireApiKey,
  async (req: Request, res: Response) => {
    try {
      const data = await getDashboardBusinessScaleByRoute(getDashboardFilters(req));
      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.get(
  "/dashboard/partner-top",
  requireApiKey,
  async (req: Request, res: Response) => {
    try {
      const filters: DashboardRankFilters = {
        ...getDashboardFilters(req),
        limit: getDashboardLimit(req),
        sortBy: getDashboardSortBy(req),
      };
      const data = await getDashboardPartnerTop(filters);
      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.get(
  "/dashboard/landing-partner-top",
  requireApiKey,
  async (req: Request, res: Response) => {
    try {
      const filters: DashboardRankFilters = {
        ...getDashboardFilters(req),
        limit: getDashboardLimit(req),
        sortBy: getDashboardSortBy(req),
      };
      const data = await getDashboardLandingPartnerTop(filters);
      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.get(
  "/dashboard/income-structure",
  requireApiKey,
  async (req: Request, res: Response) => {
    try {
      const data = await getDashboardIncomeStructure(getDashboardFilters(req));
      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.get(
  "/dashboard/settlement-progress",
  requireApiKey,
  async (req: Request, res: Response) => {
    try {
      const data = await getDashboardSettlementProgress(getDashboardFilters(req));
      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.get(
  "/dashboard/partner-efficiency",
  requireApiKey,
  async (req: Request, res: Response) => {
    try {
      const filters: DashboardEfficiencyFilters = {
        ...getDashboardFilters(req),
        limit: getDashboardLimit(req),
      };
      const data = await getDashboardPartnerEfficiency(filters);
      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.get(
  "/dashboard/region-summary",
  requireApiKey,
  async (req: Request, res: Response) => {
    try {
      const data = await getDashboardRegionSummary({
        ...getDashboardFilters(req),
        includeZeroRegions: parseOptionalBooleanQuery(
          req.query.includeZeroRegions
        ),
      });
      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

// =============================================
// 双轨：登录态版本（按主体过滤）— 阶段 C POC
//
// 与上面 /dashboard/* 一组对外平台版本并行：
//   - /dashboard/* （requireApiKey）→ 平台全量，对外契约不变
//   - /dashboard/tenant/* （JWT + 主体边界）→ 当前用户所在主体可见数据
//
// 本期仅落地 platform-revenue/overview 一个示例端点；
// 完整覆盖（waybills overview / partner-top / region-summary 等）放阶段 D，
// 届时同步给 dashboard-store 增加 financierId / funderId 入参。
// =============================================

// 通用工具：根据登录用户主体派生 dashboard 过滤的 partnerName
//   - 平台用户：透传 query.partnerName（可不传 = 全量）
//   - financier 主体：用主体名强制覆盖 partnerName（dashboard-store 用 financier_name 列匹配）
//   - funder 主体：dashboard-store 当前无 funder 维度，本期返回 emptyResult，等待 store 扩展
async function deriveTenantPartnerName(
  req: AuthenticatedRequest
): Promise<{ ok: true; partnerName?: string } | { ok: false }> {
  const scope = await resolveBusinessScope(req);
  if (scope.isPlatform) {
    return {
      ok: true,
      partnerName: (req.query.partnerName as string | undefined) || undefined,
    };
  }
  if (scope.emptyResult) return { ok: false };
  if (scope.financierId && req.orgContext?.orgId) {
    const tenant = await findOrgById(req.orgContext.orgId);
    if (!tenant?.name) return { ok: false };
    return { ok: true, partnerName: tenant.name };
  }
  // funder 主体：本期 dashboard-store 不支持 funder 维度，返回空
  return { ok: false };
}

router.get(
  "/dashboard/tenant/platform-revenue/overview",
  authenticate,
  loadUserContext,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const scope = await resolveBusinessScope(req);
      if (!scope.isPlatform && scope.emptyResult) {
        return sendSuccess(res, { totalRevenue: 0 });
      }
      // 注：getPlatformRevenueOverview 当前不接受 partnerName 入参（依赖 getRevenueStats），
      // 故此端点的"按主体过滤"语义在阶段 E 由 revenue-store 一并扩展；
      // 暂且在 emptyResult 时给出空数据，避免误导。
      const data = await getPlatformRevenueOverview({
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
      });
      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.get(
  "/dashboard/tenant/overview",
  authenticate,
  loadUserContext,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const derived = await deriveTenantPartnerName(req);
      if (!derived.ok) {
        // 主体没有有效 partnerName 时返回零值结构，前端不破
        const empty = await getDashboardOverview({
          ...getDashboardFilters(req),
          partnerName: "__no_match__",
        });
        return sendSuccess(res, empty);
      }
      const data = await getDashboardOverview({
        ...getDashboardFilters(req),
        partnerName: derived.partnerName,
      });
      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.get(
  "/dashboard/tenant/income-structure",
  authenticate,
  loadUserContext,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const derived = await deriveTenantPartnerName(req);
      if (!derived.ok) {
        const empty = await getDashboardIncomeStructure({
          ...getDashboardFilters(req),
          partnerName: "__no_match__",
        });
        return sendSuccess(res, empty);
      }
      const data = await getDashboardIncomeStructure({
        ...getDashboardFilters(req),
        partnerName: derived.partnerName,
      });
      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

router.get(
  "/dashboard/tenant/income-trend",
  authenticate,
  loadUserContext,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const derived = await deriveTenantPartnerName(req);
      if (!derived.ok) {
        const empty = await getDashboardIncomeTrend({
          ...getDashboardFilters(req),
          partnerName: "__no_match__",
          granularity: getDashboardGranularity(req),
        });
        return sendSuccess(res, empty);
      }
      const data = await getDashboardIncomeTrend({
        ...getDashboardFilters(req),
        partnerName: derived.partnerName,
        granularity: getDashboardGranularity(req),
      });
      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

export default router;
