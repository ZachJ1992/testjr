import { Router, type Request, type Response } from "express";

import { requireApiKey } from "./api-key-auth.js";
import { handleError } from "./errorHandler.js";
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
      const data = await getDashboardRegionSummary(getDashboardFilters(req));
      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

export default router;
