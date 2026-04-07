import test from "node:test";
import assert from "node:assert/strict";

import {
  getPlatformRevenueOverview,
  getDashboardWaybillsOverview,
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
