import test from "node:test";
import assert from "node:assert/strict";

import {
  getPlatformRevenueOverview,
  getDashboardWaybillsOverview,
  getDashboardOverview,
  getDashboardIncomeTrend,
  getDashboardPartnerTop,
  getDashboardSettlementProgress,
  normalizeDashboardDateValue,
} from "./dashboard-store.js";

test("getPlatformRevenueOverview ignores incoming date filters", async () => {
  const calls: Array<Record<string, unknown>> = [];

  const result = await getPlatformRevenueOverview(
    {
      startDate: "2026-04-01",
      endDate: "2026-04-07",
    },
    {
      getRevenueStats: async (filters) => {
        calls.push(filters as Record<string, unknown>);
        return {
          totalRevenue: 1234.567,
          confirmedRevenue: 0,
          pendingRevenue: 0,
          periodRevenue: 99,
          estimatedRevenue: 0,
        };
      },
    }
  );

  assert.deepEqual(calls, [{ recordType: "revenue" }]);
  assert.deepEqual(result, {
    totalRevenue: 1234.57,
  });
});

test("getDashboardWaybillsOverview reuses waybill overview query and normalizes empty values", async () => {
  const result = await getDashboardWaybillsOverview(
    {
      customerName: "客户A",
      startDate: "2026-04-01",
      endDate: "2026-04-07",
    },
    {
      customerIds: ["fin-1"],
    },
    {
      getWaybillsOverview: async (filters, scope) => {
        assert.deepEqual(filters, {
          customerName: "客户A",
          startDate: "2026-04-01",
          endDate: "2026-04-07",
        });
        assert.deepEqual(scope, {
          customerIds: ["fin-1"],
        });

        return {
          waybillCount: 0,
          totalReceivable: 0,
        };
      },
    }
  );

  assert.deepEqual(result, {
    waybillCount: 0,
    totalReceivable: 0,
  });
});

test("getDashboardOverview normalizes amounts and calculates avgDailyIncome by natural days", async () => {
  const calls: Array<Record<string, unknown>> = [];

  const result = await getDashboardOverview(
    {
      startDate: "2026-04-01",
      endDate: "2026-04-05",
      partnerName: "融满",
    },
    {
      getOverviewStats: async (filters) => {
        calls.push(filters as Record<string, unknown>);
        return {
          totalWaybillCount: 12,
          grossFreightAmount: 1050.126,
          platformIncome: 230.456,
          pendingSettlementIncome: 200.454,
          settledIncome: 30.002,
          firstDate: "2026-04-01",
          lastDate: "2026-04-05",
          effectiveContractCount: 2,
          partnerCount: 1,
          landingPartnerCount: 2,
        };
      },
    }
  );

  assert.deepEqual(calls, [
    {
      startDate: "2026-04-01",
      endDate: "2026-04-05",
      partnerName: "融满",
    },
  ]);
  assert.deepEqual(result, {
    totalWaybillCount: 12,
    grossFreightAmount: 1050.13,
    platformIncome: 230.46,
    pendingSettlementIncome: 200.45,
    settledIncome: 30,
    avgDailyIncome: 46.09,
    effectiveContractCount: 2,
    partnerCount: 1,
    landingPartnerCount: 2,
  });
});

test("getDashboardOverview calculates avgDailyIncome when overview stats contain Date objects", async () => {
  const result = await getDashboardOverview(
    {},
    {
      getOverviewStats: async () => ({
        totalWaybillCount: 2,
        grossFreightAmount: 300,
        platformIncome: 90,
        pendingSettlementIncome: 90,
        settledIncome: 0,
        firstDate: new Date("2026-04-01T00:00:00.000Z") as unknown as string,
        lastDate: new Date("2026-04-03T00:00:00.000Z") as unknown as string,
        effectiveContractCount: 0,
        partnerCount: 1,
        landingPartnerCount: 0,
      }),
    }
  );

  assert.equal(result.avgDailyIncome, 30);
});

test("normalizeDashboardDateValue keeps mysql Date values as yyyy-mm-dd text", () => {
  assert.equal(
    normalizeDashboardDateValue(new Date("2026-01-27T16:00:00.000Z")),
    "2026-01-28"
  );
});

test("getDashboardIncomeTrend keeps requested granularity and rounds income fields", async () => {
  const result = await getDashboardIncomeTrend(
    {
      startDate: "2026-04-01",
      endDate: "2026-04-30",
      granularity: "week",
    },
    {
      getIncomeTrendRows: async (filters) => {
        assert.deepEqual(filters, {
          startDate: "2026-04-01",
          endDate: "2026-04-30",
          granularity: "week",
        });
        return [
          {
            date: "2026-W14",
            platformIncome: 123.456,
            pendingSettlementIncome: 100.555,
            settledIncome: 22.901,
          },
        ];
      },
    }
  );

  assert.deepEqual(result, {
    granularity: "week",
    items: [
      {
        date: "2026-W14",
        platformIncome: 123.46,
        pendingSettlementIncome: 100.56,
        settledIncome: 22.9,
      },
    ],
  });
});

test("getDashboardPartnerTop normalizes partner names and computes avgIncomePerWaybill", async () => {
  const result = await getDashboardPartnerTop(
    {
      startDate: "2026-04-01",
      endDate: "2026-04-30",
      limit: 5,
      sortBy: "platformIncome",
    },
    {
      getDimensionTopRows: async (filters, dimension) => {
        assert.equal(dimension, "partner");
        assert.deepEqual(filters, {
          startDate: "2026-04-01",
          endDate: "2026-04-30",
          limit: 5,
          sortBy: "platformIncome",
        });
        return [
          {
            name: "  ",
            waybillCount: 4,
            grossFreightAmount: 888.888,
            platformIncome: 100,
          },
        ];
      },
    }
  );

  assert.deepEqual(result, {
    dimension: "partner",
    sortBy: "platformIncome",
    items: [
      {
        partnerName: "未命名合作方",
        waybillCount: 4,
        grossFreightAmount: 888.89,
        platformIncome: 100,
        avgIncomePerWaybill: 25,
      },
    ],
  });
});

test("getDashboardSettlementProgress returns fixed stages and falls back missing stages to zero", async () => {
  const result = await getDashboardSettlementProgress(
    {
      routeName: "线路A",
    },
    {
      getSettlementProgressRows: async (filters) => {
        assert.deepEqual(filters, {
          routeName: "线路A",
        });
        return {
          total: {
            count: 8,
            amount: 100.5,
          },
          reconciled: {
            count: 3,
            amount: 60,
          },
          accounted: {
            count: 1,
            amount: 12.345,
          },
        };
      },
    }
  );

  assert.deepEqual(result, {
    recordProgress: [
      {
        stage: "收益记录",
        count: 8,
        amount: 100.5,
      },
      {
        stage: "已生成对账单",
        count: 0,
        amount: 0,
      },
      {
        stage: "对账完成",
        count: 3,
        amount: 60,
      },
      {
        stage: "已生成结算单",
        count: 0,
        amount: 0,
      },
      {
        stage: "已入账",
        count: 1,
        amount: 12.35,
      },
    ],
  });
});
