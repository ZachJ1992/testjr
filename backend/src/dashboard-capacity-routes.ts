/**
 * 运力中枢 HTTP 路由（/api/dashboard/capacity/*）。
 * 鉴权与经营大屏一致：X-API-Key（requireApiKey）。
 * 口径见 `dashboard-capacity-store.ts` 与 `docs/capacity-dashboard-api.md`。
 */

import { Router, type Request, type Response } from "express";

import { requireApiKey } from "./api-key-auth.js";
import { handleError } from "./errorHandler.js";
import {
  getCapacityCityHeat,
  getCapacityOverview,
  getCapacityProvinceMap,
  getCapacityRegionDetail,
  getCapacityRegionDetailCurrent,
  getCapacityRouteTop,
  getCapacityTrend,
  getCapacityVehicleMonitor,
  parseCapacityDateOnly,
} from "./dashboard-capacity-store.js";

const router = Router();

function sendSuccess<T>(res: Response, data: T): void {
  res.json({
    code: 0,
    message: "success",
    data,
  });
}

function capacityDateFilters(req: Request): { startDate?: string; endDate?: string } {
  return {
    startDate: parseCapacityDateOnly(req.query.startDate),
    endDate: parseCapacityDateOnly(req.query.endDate),
  };
}

/** P0：运力 KPI 总览（运单代理指标，非收益口径） */
router.get(
  "/dashboard/capacity/overview",
  requireApiKey,
  async (req: Request, res: Response) => {
    try {
      const data = await getCapacityOverview(capacityDateFilters(req));
      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

/**
 * P0：全国省级运力分布。
 * 在 store 层合并固定省级底表（与 `DASHBOARD_REGION_SUMMARY_TEMPLATE` 省序一致），零运单省仍返回且 `displayText` 为接入中文案。
 */
router.get(
  "/dashboard/capacity/province-map",
  requireApiKey,
  async (req: Request, res: Response) => {
    try {
      const data = await getCapacityProvinceMap(capacityDateFilters(req));
      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

/** P0：城市运力热度 */
router.get(
  "/dashboard/capacity/city-heat",
  requireApiKey,
  async (req: Request, res: Response) => {
    try {
      const data = await getCapacityCityHeat(capacityDateFilters(req));
      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

/** P1：重点线路/方向 TOP（waybillCount = 运单条数） */
router.get(
  "/dashboard/capacity/route-top",
  requireApiKey,
  async (req: Request, res: Response) => {
    try {
      const limitRaw = req.query.limit;
      const limit = limitRaw != null ? Number(limitRaw) : undefined;
      const data = await getCapacityRouteTop({
        ...capacityDateFilters(req),
        limit: Number.isFinite(limit) ? limit : undefined,
      });
      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

/**
 * P1：区域详情卡。
 * query: `provinceName`（可选）、`regionName`（可选=市）、`topLimit`。
 * 不传 `provinceName` 时返回全省列表 `items`（每省一条）；传省/市时 `items` 长度为 1。
 */
router.get(
  "/dashboard/capacity/region-detail",
  requireApiKey,
  async (req: Request, res: Response) => {
    try {
      const provinceRaw = req.query.provinceName;
      const effectiveProvince =
        provinceRaw === undefined || provinceRaw === null
          ? undefined
          : String(Array.isArray(provinceRaw) ? provinceRaw[0] : provinceRaw).trim() ||
            undefined;

      const regionNameRaw = req.query.regionName;
      const regionName =
        regionNameRaw === undefined || regionNameRaw === null
          ? undefined
          : String(Array.isArray(regionNameRaw) ? regionNameRaw[0] : regionNameRaw).trim() ||
            undefined;

      const topLimitRaw = req.query.topLimit;
      const topLimit =
        topLimitRaw != null ? Number(Array.isArray(topLimitRaw) ? topLimitRaw[0] : topLimitRaw) : undefined;

      const data = await getCapacityRegionDetail({
        ...capacityDateFilters(req),
        provinceName: effectiveProvince,
        regionName,
        topLimit: Number.isFinite(topLimit) ? topLimit : undefined,
      });
      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

/**
 * P1：区域详情卡「当前轮播项」。
 * 与 `region-detail` 同数据源与同序（多省时）；按服务器时间与可配置周期取模切换，无会话状态。
 * query：在 `region-detail` 基础上增加可选 `rotationIntervalSeconds`（默认 5，非法值回落默认并夹在上下限内）。
 */
router.get(
  "/dashboard/capacity/region-detail-current",
  requireApiKey,
  async (req: Request, res: Response) => {
    try {
      const provinceRaw = req.query.provinceName;
      const effectiveProvince =
        provinceRaw === undefined || provinceRaw === null
          ? undefined
          : String(Array.isArray(provinceRaw) ? provinceRaw[0] : provinceRaw).trim() ||
            undefined;

      const regionNameRaw = req.query.regionName;
      const regionName =
        regionNameRaw === undefined || regionNameRaw === null
          ? undefined
          : String(Array.isArray(regionNameRaw) ? regionNameRaw[0] : regionNameRaw).trim() ||
            undefined;

      const topLimitRaw = req.query.topLimit;
      const topLimit =
        topLimitRaw != null ? Number(Array.isArray(topLimitRaw) ? topLimitRaw[0] : topLimitRaw) : undefined;

      const rotationRaw = req.query.rotationIntervalSeconds;

      const data = await getCapacityRegionDetailCurrent({
        ...capacityDateFilters(req),
        provinceName: effectiveProvince,
        regionName,
        topLimit: Number.isFinite(topLimit) ? topLimit : undefined,
        rotationIntervalSeconds: rotationRaw,
      });
      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

/** P2：按业务日的车辆数趋势；在途字段固定为 null */
router.get(
  "/dashboard/capacity/trend",
  requireApiKey,
  async (req: Request, res: Response) => {
    try {
      const data = await getCapacityTrend(capacityDateFilters(req));
      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

/**
 * P2：运单动态列表（降级）。
 * 非 GPS 实时监控；仅返回车牌、状态文本、任务名、发站到站、最近业务时间。
 */
router.get(
  "/dashboard/capacity/vehicle-monitor",
  requireApiKey,
  async (req: Request, res: Response) => {
    try {
      const limitRaw = req.query.limit;
      const limit = limitRaw != null ? Number(limitRaw) : undefined;
      const data = await getCapacityVehicleMonitor({
        ...capacityDateFilters(req),
        limit: Number.isFinite(limit) ? limit : undefined,
      });
      sendSuccess(res, data);
    } catch (err) {
      handleError(res, req, 500, err);
    }
  }
);

export default router;
