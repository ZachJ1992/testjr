import test from "node:test";
import assert from "node:assert/strict";

import {
  getDefaultBusinessScaleByRouteDateRange,
  getDefaultLast30DaysDateRange,
  getDefaultLast7DaysDateRange,
  getDefaultLast8WeeksDateRange,
  getDashboardBusinessScaleByCity,
  getDashboardBusinessScaleByRoute,
  getDashboardBusinessScaleTrend,
  getDashboardDepartureBatchTrend,
  DASHBOARD_BUSINESS_SCALE_TREND_PARTIAL_WEEK_NOTE,
  getPlatformRevenueOverview,
  getDashboardWaybillsOverview,
  getDashboardOverview,
  getDashboardIncomeTrend,
  getDashboardPartnerTop,
  getDashboardRegionSummary,
  getDashboardSettlementProgress,
  normalizeDashboardDateValue,
} from "./dashboard-store.js";
import { DASHBOARD_REGION_SUMMARY_TEMPLATE } from "./dashboard-region-summary-template.js";

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

test("getDashboardRegionSummary aggregates by normalized region and respects dateScope", async () => {
  const result = await getDashboardRegionSummary(
    { startDate: "2026-04-01", endDate: "2026-04-07" },
    {
      getRegionFactRows: async () => [
        {
          waybill_id: "w1",
          amount: 10,
          gross_freight_amount: 0,
          financier_name: "金罗",
          raw_area_name: null,
          landing_partner_id: "lp1",
          landing_partner_name: "落地A",
          route_id: "route-cd-1",
        },
        {
          waybill_id: "w1",
          amount: 5,
          gross_freight_amount: 0,
          financier_name: "金罗",
          raw_area_name: null,
          landing_partner_id: "lp1",
          landing_partner_name: "落地A",
          route_id: "route-cd-1",
        },
        {
          waybill_id: "w2",
          amount: 3,
          gross_freight_amount: 0,
          financier_name: "其他",
          raw_area_name: "重庆融满",
          landing_partner_id: "lp2",
          landing_partner_name: "落地B",
          route_id: "route-cq-1",
        },
        {
          waybill_id: "w3",
          amount: 99,
          gross_freight_amount: 0,
          financier_name: "融满",
          raw_area_name: null,
          landing_partner_id: null,
          landing_partner_name: null,
          route_id: "route-orphan",
        },
        {
          waybill_id: "w4",
          amount: 7,
          gross_freight_amount: 0,
          financier_name: "其他",
          raw_area_name: "火星融满",
          landing_partner_id: "lp9",
          landing_partner_name: "落地Z",
          route_id: "route-mars",
        },
      ],
    }
  );

  assert.equal(result.dateScope, "custom");
  assert.equal(result.startDate, "2026-04-01");
  assert.equal(result.endDate, "2026-04-07");
  assert.equal(result.usedFixedRegionTemplate, false);
  // 「未维护区域」「provinceName=未知」在地图接口输出层被过滤
  assert.equal(result.items.length, 2);
  assert.ok(!result.items.some((i) => i.regionName === "未维护区域"));
  assert.ok(!result.items.some((i) => i.provinceName === "未知"));
  const chengdu = result.items.find((i) => i.regionName === "成都");
  const chongqing = result.items.find((i) => i.regionName === "重庆");
  assert.ok(chengdu);
  assert.ok(chongqing);
  assert.deepEqual(chengdu, {
    regionName: "成都",
    provinceName: "四川",
    waybillCount: 1,
    platformIncome: 15,
    landingPartnerCount: 1,
    routeCount: 1,
    activeRouteCount: 1,
    displayText: "四川｜平台收益，15.00 元｜活跃线路，1 条",
  });
  assert.deepEqual(chongqing, {
    regionName: "重庆",
    provinceName: "重庆",
    waybillCount: 1,
    platformIncome: 3,
    landingPartnerCount: 1,
    routeCount: 1,
    activeRouteCount: 1,
    displayText: "重庆｜平台收益，3.00 元｜活跃线路，1 条",
  });
});

test("getDashboardRegionSummary includeZeroRegions=true fills template order and zeros", async () => {
  const result = await getDashboardRegionSummary(
    {
      startDate: "2026-04-01",
      endDate: "2026-04-07",
      includeZeroRegions: true,
    },
    { getRegionFactRows: async () => [] }
  );
  assert.equal(result.usedFixedRegionTemplate, true);
  assert.equal(result.items.length, DASHBOARD_REGION_SUMMARY_TEMPLATE.length);
  assert.deepEqual(
    result.items.map((i) => ({
      provinceName: i.provinceName,
      regionName: i.regionName,
    })),
    [...DASHBOARD_REGION_SUMMARY_TEMPLATE]
  );
  assert.ok(
    result.items.every(
      (i) =>
        i.waybillCount === 0 &&
        i.platformIncome === 0 &&
        i.landingPartnerCount === 0 &&
        i.routeCount === 0 &&
        i.activeRouteCount === 0
    )
  );
  assert.ok(
    result.items.every(
      (i) => i.displayText === "该区域数据持续接入中"
    )
  );
});

test("getDashboardRegionSummary includeZeroRegions=true overlays by province+region only", async () => {
  const result = await getDashboardRegionSummary(
    {
      startDate: "2026-04-01",
      endDate: "2026-04-07",
      includeZeroRegions: true,
    },
    {
      getRegionFactRows: async () => [
        {
          waybill_id: "w1",
          amount: 10,
          gross_freight_amount: 0,
          financier_name: "金罗",
          raw_area_name: null,
          landing_partner_id: "lp1",
          landing_partner_name: "落地A",
          route_id: "route-cd-1",
        },
        {
          waybill_id: "w2",
          amount: 3,
          gross_freight_amount: 0,
          financier_name: "其他",
          raw_area_name: "重庆融满",
          landing_partner_id: "lp2",
          landing_partner_name: "落地B",
          route_id: "route-cq-1",
        },
        {
          waybill_id: "w3",
          amount: 999,
          gross_freight_amount: 0,
          financier_name: "其他",
          raw_area_name: "南京融满",
          landing_partner_id: "lp3",
          landing_partner_name: "落地C",
          route_id: "route-nj-1",
        },
      ],
    }
  );
  assert.equal(result.usedFixedRegionTemplate, true);
  assert.equal(result.items.length, DASHBOARD_REGION_SUMMARY_TEMPLATE.length);
  const chengdu = result.items.find(
    (i) => i.provinceName === "四川" && i.regionName === "成都"
  );
  const chongqing = result.items.find(
    (i) => i.provinceName === "重庆" && i.regionName === "重庆"
  );
  assert.ok(chengdu);
  assert.ok(chongqing);
  assert.equal(chengdu!.platformIncome, 10);
  assert.equal(chongqing!.platformIncome, 3);
  assert.ok(!result.items.some((i) => i.regionName === "南京"));
  const changchun = result.items.find(
    (i) => i.provinceName === "吉林" && i.regionName === "长春"
  );
  assert.ok(changchun);
  assert.equal(changchun!.displayText, "该区域数据持续接入中");
});

test("getDashboardRegionSummary displayText pending when waybillCount is zero", async () => {
  const result = await getDashboardRegionSummary(
    { startDate: "2026-04-01", endDate: "2026-04-07" },
    {
      getRegionFactRows: async () => [
        {
          waybill_id: null,
          amount: 100,
          gross_freight_amount: 0,
          financier_name: "其他",
          raw_area_name: "广州融满",
          landing_partner_id: "lp1",
          landing_partner_name: "落地A",
          route_id: "r1",
        },
      ],
    }
  );
  assert.equal(result.items.length, 1);
  const gz = result.items[0];
  assert.equal(gz?.regionName, "广州");
  assert.equal(gz?.waybillCount, 0);
  assert.equal(gz?.platformIncome, 100);
  assert.equal(gz?.displayText, "该区域数据持续接入中");
});

test("getDefaultLast7DaysDateRange spans 7 inclusive local days", () => {
  assert.deepEqual(
    getDefaultLast7DaysDateRange(new Date(2026, 3, 9)),
    { startDate: "2026-04-03", endDate: "2026-04-09" }
  );
});

test("getDefaultLast30DaysDateRange spans 30 inclusive local days", () => {
  assert.deepEqual(
    getDefaultLast30DaysDateRange(new Date(2026, 3, 9)),
    { startDate: "2026-03-11", endDate: "2026-04-09" }
  );
});

test("getDefaultLast8WeeksDateRange starts Monday eight weeks back from current week", () => {
  assert.deepEqual(
    getDefaultLast8WeeksDateRange(new Date(2026, 3, 16)),
    { startDate: "2026-02-23", endDate: "2026-04-16" }
  );
});

test("getDashboardBusinessScaleTrend week rolls up daily grossFreightAmount by ISO week", async () => {
  const result = await getDashboardBusinessScaleTrend(
    {
      startDate: "2026-03-01",
      endDate: "2026-03-15",
      granularity: "week",
    },
    {
      getBusinessTrendRows: async (f) => {
        assert.equal(f.granularity, "day");
        assert.equal(f.startDate, "2026-03-01");
        assert.equal(f.endDate, "2026-03-15");
        return [
          {
            date: "2026-03-01",
            waybillCount: 1,
            grossFreightAmount: 100,
            platformIncome: 1,
          },
          {
            date: "2026-03-02",
            waybillCount: 1,
            grossFreightAmount: 200,
            platformIncome: 2,
          },
          {
            date: "2026-03-08",
            waybillCount: 1,
            grossFreightAmount: 50,
            platformIncome: 1,
          },
        ];
      },
    }
  );

  assert.equal(result.dateScope, "custom");
  assert.equal(result.startDate, "2026-03-01");
  assert.equal(result.endDate, "2026-03-15");
  assert.equal(result.usedDefaultDateRange, false);
  assert.equal(result.granularity, "week");
  assert.equal(result.usedDefaultGranularity, false);
  assert.ok(result.weekPeriodSemantics);
  assert.equal(result.weekPeriodSemantics?.periodLabelStandard, "iso8601");
  assert.equal(
    result.weekPeriodSemantics?.partialWeekInterpretation,
    DASHBOARD_BUSINESS_SCALE_TREND_PARTIAL_WEEK_NOTE
  );
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items[0], {
    periodLabel: "2026-W09",
    startDate: "2026-03-01",
    endDate: "2026-03-01",
    grossFreightAmount: 100,
  });
  assert.deepEqual(result.items[1], {
    periodLabel: "2026-W10",
    startDate: "2026-03-02",
    endDate: "2026-03-08",
    grossFreightAmount: 250,
  });
});

test("getDashboardBusinessScaleTrend omits granularity defaults to week", async () => {
  let captured: { startDate?: string; endDate?: string } = {};
  const result = await getDashboardBusinessScaleTrend(
    {},
    {
      getBusinessTrendRows: async (f) => {
        captured = { startDate: f.startDate, endDate: f.endDate };
        return [];
      },
    }
  );
  assert.equal(result.granularity, "week");
  assert.equal(result.usedDefaultGranularity, true);
  assert.equal(result.dateScope, "last8weeks");
  assert.equal(result.usedDefaultDateRange, true);
  const expected = getDefaultLast8WeeksDateRange();
  assert.equal(captured.startDate, expected.startDate);
  assert.equal(captured.endDate, expected.endDate);
  assert.equal(result.startDate, expected.startDate);
  assert.equal(result.endDate, expected.endDate);
  assert.ok(result.weekPeriodSemantics);
});

test("getDashboardDepartureBatchTrend week maps bucket bounds and counts", async () => {
  const result = await getDashboardDepartureBatchTrend(
    {
      startDate: "2026-03-01",
      endDate: "2026-03-20",
      granularity: "week",
    },
    {
      getDepartureBatchTrendRows: async (f) => {
        assert.equal(f.granularity, "week");
        assert.equal(f.startDate, "2026-03-01");
        assert.equal(f.endDate, "2026-03-20");
        return [
          {
            periodLabel: "2026-W09",
            minBucket: "2026-03-01",
            maxBucket: "2026-03-01",
            departureBatchCount: 3,
          },
          {
            periodLabel: "2026-W10",
            minBucket: "2026-03-02",
            maxBucket: "2026-03-08",
            departureBatchCount: 186,
          },
        ];
      },
    }
  );

  assert.equal(result.dateScope, "custom");
  assert.equal(result.usedDefaultDateRange, false);
  assert.equal(result.granularity, "week");
  assert.equal(result.usedDefaultGranularity, false);
  assert.deepEqual(result.items[0], {
    periodLabel: "2026-W09",
    startDate: "2026-03-01",
    endDate: "2026-03-01",
    departureBatchCount: 3,
  });
  assert.deepEqual(result.items[1], {
    periodLabel: "2026-W10",
    startDate: "2026-03-02",
    endDate: "2026-03-08",
    departureBatchCount: 186,
  });
});

test("getDashboardDepartureBatchTrend without dates uses last8weeks default window", async () => {
  let captured: { startDate?: string; endDate?: string } = {};
  const result = await getDashboardDepartureBatchTrend(
    {},
    {
      getDepartureBatchTrendRows: async (f) => {
        captured = { startDate: f.startDate, endDate: f.endDate };
        return [];
      },
    }
  );
  assert.equal(result.dateScope, "last8weeks");
  assert.equal(result.usedDefaultDateRange, true);
  assert.equal(result.granularity, "week");
  assert.equal(result.usedDefaultGranularity, true);
  const expected = getDefaultLast8WeeksDateRange();
  assert.equal(captured.startDate, expected.startDate);
  assert.equal(captured.endDate, expected.endDate);
});

test("getDashboardDepartureBatchTrend day uses period as single day bounds", async () => {
  const result = await getDashboardDepartureBatchTrend(
    {
      startDate: "2026-04-01",
      endDate: "2026-04-02",
      granularity: "day",
    },
    {
      getDepartureBatchTrendRows: async () => [
        {
          periodLabel: "2026-04-01",
          minBucket: "2026-04-01",
          maxBucket: "2026-04-01",
          departureBatchCount: 5,
        },
      ],
    }
  );
  assert.deepEqual(result.items[0], {
    periodLabel: "2026-04-01",
    startDate: "2026-04-01",
    endDate: "2026-04-01",
    departureBatchCount: 5,
  });
});

test("getDashboardBusinessScaleByCity without dates uses last30days and sorts by gross", async () => {
  let captured: { startDate?: string; endDate?: string } = {};
  const result = await getDashboardBusinessScaleByCity(
    {},
    {
      getRegionFactRows: async (filters) => {
        captured = { startDate: filters.startDate, endDate: filters.endDate };
        return [
          {
            waybill_id: "w1",
            amount: 1,
            gross_freight_amount: 100,
            financier_name: "金罗",
            raw_area_name: null,
            landing_partner_id: "lp1",
            landing_partner_name: "落地A",
            route_id: "r1",
          },
          {
            waybill_id: "w2",
            amount: 2,
            gross_freight_amount: 500,
            financier_name: "其他",
            raw_area_name: "重庆融满",
            landing_partner_id: "lp2",
            landing_partner_name: "落地B",
            route_id: "r2",
          },
          {
            waybill_id: "w3",
            amount: 3,
            gross_freight_amount: 200,
            financier_name: "其他",
            raw_area_name: "成都融满",
            landing_partner_id: "lp3",
            landing_partner_name: "落地C",
            route_id: "r3",
          },
        ];
      },
    }
  );

  assert.equal(result.dateScope, "last30days");
  assert.equal(result.usedDefaultDateRange, true);
  const expected = getDefaultLast30DaysDateRange();
  assert.equal(captured.startDate, expected.startDate);
  assert.equal(captured.endDate, expected.endDate);
  assert.equal(result.startDate, expected.startDate);
  assert.equal(result.endDate, expected.endDate);
  assert.equal(result.items[0]?.regionName, "重庆");
  assert.equal(result.items[0]?.waybillCount, 1);
  assert.equal(result.items[0]?.grossFreightAmount, 500);
  assert.equal(result.items[1]?.regionName, "成都");
  assert.equal(result.items[1]?.waybillCount, 2);
  assert.equal(result.items[1]?.grossFreightAmount, 300);
  assert.equal(result.items.length, 2);
});

test("getDashboardBusinessScaleByCity with explicit dates sets usedDefaultDateRange false", async () => {
  const result = await getDashboardBusinessScaleByCity(
    { startDate: "2026-04-01", endDate: "2026-04-07" },
    {
      getRegionFactRows: async () => [],
    }
  );
  assert.equal(result.dateScope, "custom");
  assert.equal(result.usedDefaultDateRange, false);
  assert.equal(result.startDate, "2026-04-01");
  assert.equal(result.endDate, "2026-04-07");
});

test("getDashboardBusinessScaleByRoute without dates uses fixedStartToToday", async () => {
  let captured: { startDate?: string; endDate?: string } = {};
  const result = await getDashboardBusinessScaleByRoute(
    {},
    {
      getBusinessScaleByRouteRows: async (filters) => {
        captured = { startDate: filters.startDate, endDate: filters.endDate };
        return [
          {
            route_id: "rid-1",
            route_name: "线路甲",
            gross_freight_amount: 10.126,
          },
          {
            route_id: null,
            route_name: "仅运单线路文案",
            gross_freight_amount: 2,
          },
        ];
      },
    }
  );

  assert.equal(result.dateScope, "fixedStartToToday");
  assert.equal(result.usedDefaultDateRange, true);
  const expected = getDefaultBusinessScaleByRouteDateRange();
  assert.equal(captured.startDate, expected.startDate);
  assert.equal(captured.endDate, expected.endDate);
  assert.equal(result.startDate, expected.startDate);
  assert.equal(result.endDate, expected.endDate);
  assert.equal(result.items[0]?.routeId, "rid-1");
  assert.equal(result.items[0]?.routeName, "线路甲");
  assert.equal(result.items[0]?.grossFreightAmount, 10.13);
  assert.equal(result.items[1]?.routeId, null);
  assert.equal(result.items[1]?.routeName, "仅运单线路文案");
  assert.equal(result.items[1]?.grossFreightAmount, 2);
});

test("getDashboardBusinessScaleByRoute with explicit dates is custom", async () => {
  const result = await getDashboardBusinessScaleByRoute(
    { startDate: "2026-04-01", endDate: "2026-04-07" },
    {
      getBusinessScaleByRouteRows: async () => [],
    }
  );
  assert.equal(result.dateScope, "custom");
  assert.equal(result.usedDefaultDateRange, false);
  assert.equal(result.startDate, "2026-04-01");
  assert.equal(result.endDate, "2026-04-07");
});

test("getDashboardBusinessScaleByRoute with only startDate is custom and does not inject end", async () => {
  let captured: { startDate?: string; endDate?: string } = {};
  await getDashboardBusinessScaleByRoute(
    { startDate: "2026-04-01" },
    {
      getBusinessScaleByRouteRows: async (filters) => {
        captured = filters;
        return [];
      },
    }
  );
  assert.equal(captured.startDate, "2026-04-01");
  assert.equal(captured.endDate, undefined);
});

test("getDashboardRegionSummary without dates uses last7days and forwards range to reader", async () => {
  let captured: { startDate?: string; endDate?: string } = {};
  const result = await getDashboardRegionSummary(
    {},
    {
      getRegionFactRows: async (filters) => {
        captured = { startDate: filters.startDate, endDate: filters.endDate };
        return [];
      },
    }
  );
  assert.equal(result.dateScope, "last7days");
  const expected = getDefaultLast7DaysDateRange();
  assert.equal(captured.startDate, expected.startDate);
  assert.equal(captured.endDate, expected.endDate);
  assert.equal(result.startDate, expected.startDate);
  assert.equal(result.endDate, expected.endDate);
  assert.equal(result.usedFixedRegionTemplate, false);
});
