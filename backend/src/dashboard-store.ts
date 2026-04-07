import { getRevenueStats } from "./revenue-store.js";
import type { RevenueStats } from "./types.js";
import {
  getWaybillsOverview,
  type WaybillOverview,
} from "./waybills-store.js";
import type {
  WaybillAccessScope,
  WaybillOverviewFilters,
} from "./waybills-query.js";

export interface PlatformRevenueOverview {
  totalRevenue: number;
}

interface RevenueStatsReader {
  getRevenueStats(filters: {
    recordType?: "revenue" | "expense";
  }): Promise<RevenueStats>;
}

interface WaybillOverviewReader {
  getWaybillsOverview(
    filters: WaybillOverviewFilters,
    scope: WaybillAccessScope
  ): Promise<WaybillOverview>;
}

function roundMoney(value: unknown): number {
  return Number((Number(value) || 0).toFixed(2));
}

export async function getPlatformRevenueOverview(
  _filters?: {
    startDate?: string;
    endDate?: string;
  },
  deps: RevenueStatsReader = { getRevenueStats }
): Promise<PlatformRevenueOverview> {
  const stats = await deps.getRevenueStats({
    recordType: "revenue",
  });

  return {
    totalRevenue: roundMoney(stats.totalRevenue),
  };
}

export async function getDashboardWaybillsOverview(
  filters: WaybillOverviewFilters = {},
  scope: WaybillAccessScope = {},
  deps: WaybillOverviewReader = { getWaybillsOverview }
): Promise<WaybillOverview> {
  const overview = await deps.getWaybillsOverview(filters, scope);

  return {
    waybillCount: Number(overview.waybillCount) || 0,
    totalReceivable: roundMoney(overview.totalReceivable),
  };
}
