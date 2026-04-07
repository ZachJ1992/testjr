import test from "node:test";
import assert from "node:assert/strict";

import type { OrgContext } from "./auth.js";
import {
  buildWaybillQueryParts,
  resolveWaybillAccessScope,
} from "./waybills-query.js";

test("resolveWaybillAccessScope returns unrestricted scope for platform users", async () => {
  const scope = await resolveWaybillAccessScope({
    isPlatformUser: true,
    orgType: "platform",
  } satisfies OrgContext);

  assert.deepEqual(scope, {});
});

test("resolveWaybillAccessScope returns customerId for financier users", async () => {
  const scope = await resolveWaybillAccessScope({
    isPlatformUser: false,
    orgType: "financier",
    relatedEntityId: "financier-1",
  } satisfies OrgContext);

  assert.deepEqual(scope, {
    customerId: "financier-1",
  });
});

test("resolveWaybillAccessScope marks emptyResult when funder has no related financiers", async () => {
  const scope = await resolveWaybillAccessScope(
    {
      isPlatformUser: false,
      orgType: "funder",
      relatedEntityId: "funder-1",
    } satisfies OrgContext,
    async () => []
  );

  assert.deepEqual(scope, {
    customerIds: [],
    emptyResult: true,
  });
});

test("resolveWaybillAccessScope resolves customerIds for funder users", async () => {
  const scope = await resolveWaybillAccessScope(
    {
      isPlatformUser: false,
      orgType: "funder",
      relatedEntityId: "funder-1",
    } satisfies OrgContext,
    async () => [{ financierId: "fin-1" }, { financierId: "fin-2" }]
  );

  assert.deepEqual(scope, {
    customerIds: ["fin-1", "fin-2"],
  });
});

test("buildWaybillQueryParts builds filters compatible with current waybill list query", async () => {
  const parts = buildWaybillQueryParts(
    {
      customerName: "金罗",
      vehiclePlate: "川A",
      batchStatus: "已完成",
      batchSource: "导入来源",
      startDate: "2026-04-01",
      endDate: "2026-04-07",
      waybillNumber: "WB-01",
      contractNumber: "HT-01",
      businessMode: "brokerage",
      status: "settled",
    },
    {
      customerId: "fin-1",
      customerIds: ["fin-1", "fin-2"],
    },
    new Set(["project_name", "batch_status", "batch_source", "contract_number", "business_mode", "status", "departure_time"])
  );

  assert.equal(
    parts.fromAndJoinSql,
    "FROM waybills w LEFT JOIN financiers f ON w.customer_id = f.id"
  );
  assert.match(parts.whereSql, /w\.deleted_at IS NULL/);
  assert.match(parts.whereSql, /w\.customer_id = \?/);
  assert.match(parts.whereSql, /w\.customer_id IN \(\?,\?\)/);
  assert.match(parts.whereSql, /w\.vehicle_plate LIKE \?/);
  assert.match(parts.whereSql, /w\.batch_status = \?/);
  assert.match(parts.whereSql, /w\.batch_source = \?/);
  assert.match(parts.whereSql, /DATE\(w\.departure_time\) >= \? OR w\.waybill_date >= \?/);
  assert.match(parts.whereSql, /DATE\(w\.departure_time\) <= \? OR w\.waybill_date <= \?/);
  assert.match(parts.whereSql, /w\.waybill_number LIKE \?/);
  assert.match(parts.whereSql, /w\.contract_number LIKE \?/);
  assert.match(parts.whereSql, /w\.business_mode = \?/);
  assert.match(parts.whereSql, /w\.status = \?/);
  assert.deepEqual(parts.params, [
    "fin-1",
    "fin-1",
    "fin-2",
    "%金罗%",
    "%金罗%",
    "%金罗%",
    "%川A%",
    "已完成",
    "导入来源",
    "2026-04-01",
    "2026-04-01",
    "2026-04-07",
    "2026-04-07",
    "%WB-01%",
    "%HT-01%",
    "brokerage",
    "settled",
  ]);
});

test("buildWaybillQueryParts keeps query valid when optional columns are missing", async () => {
  const parts = buildWaybillQueryParts(
    {
      customerName: "融满",
      batchStatus: "已完成",
      batchSource: "手工",
      contractNumber: "HT-02",
      businessMode: "brokerage",
      status: "pending",
      startDate: "2026-04-01",
      endDate: "2026-04-02",
    },
    {},
    new Set(["status"])
  );

  assert.equal(
    parts.whereSql,
    "WHERE w.deleted_at IS NULL AND (w.customer_name LIKE ? OR f.enterprise_name LIKE ?) AND w.waybill_date >= ? AND w.waybill_date <= ? AND w.status = ?"
  );
  assert.deepEqual(parts.params, [
    "%融满%",
    "%融满%",
    "2026-04-01",
    "2026-04-02",
    "pending",
  ]);
});
