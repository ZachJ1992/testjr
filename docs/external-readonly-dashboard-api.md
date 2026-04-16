# 只读看板 API 文档

## 文档说明

本文档用于第三方系统、合作方系统或只读数据看板接入，覆盖当前系统开放的只读看板接口。

- 协议方式：`HTTP/HTTPS`
- 数据格式：`application/json`
- 鉴权方式：请求头 `X-API-Key`

> 注意：正式交付时请使用平台单独分发的只读密钥，不要在文档中直接记录真实密钥。

## 通用约定

### URL 约定

为避免 `/api` 重复拼接的歧义，本文档统一采用以下写法：

- `Base URL`：域名根地址，不包含接口前缀
- `接口路径`：以 `/api/...` 开头的相对路径
- `完整 URL`：`Base URL + 接口路径`

示例：

```text
Base URL: https://<your-domain>
接口路径: /api/dashboard/overview
完整 URL: https://<your-domain>/api/dashboard/overview
```

### 请求头

所有只读看板接口均需传入以下请求头：

```http
X-API-Key: <READONLY_API_KEY>
```

### 响应格式

成功响应：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

鉴权失败响应：

```json
{
  "code": 401,
  "message": "Unauthorized",
  "data": null
}
```

### 错误码

| HTTP 状态码 | 说明 |
|---|---|
| `200` | 请求成功 |
| `401` | 未提供 `X-API-Key` 或密钥不正确 |
| `500` | 服务端内部异常 |

### 核心口径说明

本批 dashboard 聚合接口为山海鲸数据大屏提供统一聚合口径，前端只取数和渲染，不直接拼底层明细。以下字段口径在驾驶舱聚合接口中保持统一（**区域汇总地图接口** `region-summary` 另含城市/省份展示与输出过滤规则，见 **第 11 节**）：

| 字段 | 口径说明 |
|---|---|
| `platformIncome` | 业务抽成金额求和 |
| `pendingSettlementIncome` | 未入账的业务抽成金额求和。当前实现按 `revenue_records.status != accounted` 统计，这是现阶段“未入账”口径的实现方式。 |
| `settledIncome` | 已入账的业务抽成金额求和 |
| `grossFreightAmount` | 当前优先取 `waybills.receivable_total`；当该字段缺失时，回退取 `revenue_records.principal_amount`。该回退逻辑属于过渡期兜底逻辑，后续若底层字段进一步收敛，可能统一为单一来源。该字段是驾驶舱聚合口径，不等同于旧接口 `totalReceivable` 的直出字段；两者都与运费相关，但来源范围和聚合语义不同，接入时不要直接混用。 |
| `totalWaybillCount` / `waybillCount` | 当前按命中聚合条件的业务抽成记录关联运单主键 `waybill_id` 去重统计 |
| `partnerName` | 当前映射字段，现阶段映射到底层 `revenue_records.financier_name`，用于驾驶舱聚合展示；它不应被直接理解为已经完全对齐合作方主数据后的最终标准字段。 |
| `landingPartnerName` | 当前映射底层 `local_partners.name` |
| `routeName` | 当前映射底层 `routes.name` |

### 状态口径说明

- `settledIncome` 只统计“已入账”的业务抽成金额，当前对应底层 `revenue_records.status = accounted`。
- `pendingSettlementIncome` 统计“未入账”的业务抽成金额，当前对应底层 `revenue_records.status != accounted`。
- `已生成对账单`、`对账完成`、`已生成结算单`、`已入账` 等阶段，均基于当前收益记录状态流转做聚合展示。
- 若后续引入异常、冻结、作废等独立收益状态，未入账口径将按状态枚举进一步细化。

## 接口列表

### 基础只读接口（2 个）

1. 平台收入概览
2. 运单概览

### 驾驶舱聚合接口（13 个）

1. 经营总览
2. 收益趋势分析
3. 经营趋势总览
4. 合作方贡献 TOP
5. 落地合作方贡献 TOP
6. 收益构成分析
7. 结算进度分析
8. 合作方效率分析
9. 区域汇总（地图，供山海鲸中间中国地图主视觉）
10. 业务规模趋势（山海鲸：撮合运费 `grossFreightAmount` 按日/周/月）
11. 融满发车批次趋势（按 `waybill_number` 去重；独立路径）
12. 城市业务规模分布（山海鲸：按城市聚合 `grossFreightAmount` 与运单数）
13. 线路业务规模分布（山海鲸：按线路聚合累计 `grossFreightAmount`）

---

## 1. 平台收入概览

### 接口说明

用于获取平台收入总览数据，适合用于大屏、BI 系统或第三方只读查询场景。

### 请求信息

- 请求方法：`GET`
- Base URL：`https://<your-domain>`
- 接口路径：`/api/dashboard/platform-revenue/overview`
- 完整 URL：`https://<your-domain>/api/dashboard/platform-revenue/overview`

### 请求头

```http
X-API-Key: <READONLY_API_KEY>
```

### 查询参数

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `startDate` | `string` | 否 | 开始日期，建议格式为 `YYYY-MM-DD` |
| `endDate` | `string` | 否 | 结束日期，建议格式为 `YYYY-MM-DD` |

### 请求示例

```bash
curl -G "https://<your-domain>/api/dashboard/platform-revenue/overview" \
  -H "X-API-Key: <READONLY_API_KEY>" \
  --data-urlencode "startDate=2026-04-01" \
  --data-urlencode "endDate=2026-04-07"
```

### 成功响应示例

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "totalRevenue": 1256000.32
  }
}
```

### 返回字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `code` | `number` | 业务状态码，成功固定为 `0` |
| `message` | `string` | 成功时固定为 `success` |
| `data.totalRevenue` | `number` | 平台收入总额 |

### 备注

- 当前实现中该接口返回的核心字段为 `totalRevenue`。
- 当前实现不会根据 `startDate`、`endDate` 对 `totalRevenue` 做时间范围过滤；传入这两个参数不会改变返回结果。

---

## 2. 运单概览

### 接口说明

用于获取运单总览数据，可按客户、合同、业务模式、时间范围等条件进行筛选。

### 请求信息

- 请求方法：`GET`
- Base URL：`https://<your-domain>`
- 接口路径：`/api/dashboard/waybills/overview`
- 完整 URL：`https://<your-domain>/api/dashboard/waybills/overview`

### 请求头

```http
X-API-Key: <READONLY_API_KEY>
```

### 查询参数

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `customerName` | `string` | 否 | 客户名称 |
| `contractNumber` | `string` | 否 | 合同编号 |
| `businessMode` | `string` | 否 | 业务模式 |
| `status` | `string` | 否 | 运单状态 |
| `startDate` | `string` | 否 | 开始日期，建议格式为 `YYYY-MM-DD` |
| `endDate` | `string` | 否 | 结束日期，建议格式为 `YYYY-MM-DD` |
| `waybillNumber` | `string` | 否 | 运单号 |
| `vehiclePlate` | `string` | 否 | 车牌号 |
| `batchStatus` | `string` | 否 | 批次状态 |
| `batchSource` | `string` | 否 | 批次来源 |

### 请求示例

```bash
curl -G "https://<your-domain>/api/dashboard/waybills/overview" \
  -H "X-API-Key: <READONLY_API_KEY>" \
  --data-urlencode "customerName=测试客户" \
  --data-urlencode "startDate=2026-04-01" \
  --data-urlencode "endDate=2026-04-07"
```

### 成功响应示例

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "waybillCount": 128,
    "totalReceivable": 562300.5
  }
}
```

### 返回字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `code` | `number` | 业务状态码，成功固定为 `0` |
| `message` | `string` | 成功时固定为 `success` |
| `data.waybillCount` | `number` | 运单总数 |
| `data.totalReceivable` | `number` | 运单应收总额 |

### 备注

- 所有查询参数均为可选。
- 服务端会按传入条件进行筛选统计。
- 该接口为只读接口，不会修改任何业务数据。
- `data.totalReceivable` 是旧接口直接输出的运单应收汇总字段；驾驶舱聚合接口中的 `grossFreightAmount` 与其都和运费相关，但不应直接视为同一个字段。

---

## 3. 经营总览

### 请求信息

- 请求方法：`GET`
- Base URL：`https://<your-domain>`
- 接口路径：`/api/dashboard/overview`
- 完整 URL：`https://<your-domain>/api/dashboard/overview`

### 查询参数

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `startDate` | `string` | 否 | 开始日期，格式 `YYYY-MM-DD` |
| `endDate` | `string` | 否 | 结束日期，格式 `YYYY-MM-DD` |
| `partnerName` | `string` | 否 | 合作方筛选值，当前匹配聚合字段 `partnerName` |
| `landingPartnerName` | `string` | 否 | 落地合作方筛选值 |
| `routeName` | `string` | 否 | 线路筛选值 |

成功响应示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "totalWaybillCount": 10910,
    "grossFreightAmount": 78652273.51,
    "platformIncome": 1075310.65,
    "pendingSettlementIncome": 1075310.65,
    "settledIncome": 0,
    "avgDailyIncome": 2938.01,
    "effectiveContractCount": 2,
    "partnerCount": 1,
    "landingPartnerCount": 2
  }
}
```

### 返回字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `data.totalWaybillCount` | `number` | 当前按命中聚合条件的业务抽成记录关联运单主键 `waybill_id` 去重统计 |
| `data.grossFreightAmount` | `number` | 当前优先取 `waybills.receivable_total` 汇总，缺失时回退 `revenue_records.principal_amount` 汇总；属于过渡期兜底逻辑。该字段用于驾驶舱聚合分析，不等同于旧接口 `data.totalReceivable`。 |
| `data.platformIncome` | `number` | 业务抽成金额求和 |
| `data.pendingSettlementIncome` | `number` | 未入账的业务抽成金额求和；当前实现按 `status != accounted` 统计，这是现阶段未入账口径的落地方式。 |
| `data.settledIncome` | `number` | 已入账的业务抽成金额求和 |
| `data.avgDailyIncome` | `number` | `platformIncome / 自然天数` |
| `data.effectiveContractCount` | `number` | 当前命中聚合条件的抽成合同去重数，用于辅助观察，不等同于平台全局有效合同总数 |
| `data.partnerCount` | `number` | 当前命中聚合条件的合作方去重数 |
| `data.landingPartnerCount` | `number` | 当前命中聚合条件的落地合作方去重数 |

### 验数建议

1. 先限定一段较短时间范围，例如 1 天或 7 天，避免总量过大难以人工核对。
2. 用同时间范围在收益明细里筛选平台业务抽成，手工汇总 `amount`，核对 `platformIncome`。
3. 再按收益状态分成“已入账”和“未入账”，分别核对 `settledIncome` 与 `pendingSettlementIncome`。
4. 抽样取若干运单，核对其撮合运费是否优先来自 `waybills.receivable_total`；若该字段为空，再看是否回退到 `revenue_records.principal_amount`。
5. `effectiveContractCount` 只建议做趋势观察，不建议与“全系统有效合同列表总数”直接对比。

---

## 4. 收益趋势分析

### 请求信息

- 请求方法：`GET`
- Base URL：`https://<your-domain>`
- 接口路径：`/api/dashboard/income-trend`
- 完整 URL：`https://<your-domain>/api/dashboard/income-trend`

### 查询参数

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `startDate` | `string` | 否 | 开始日期，格式 `YYYY-MM-DD` |
| `endDate` | `string` | 否 | 结束日期，格式 `YYYY-MM-DD` |
| `granularity` | `string` | 否 | 聚合粒度，支持 `day`、`week`、`month` |
| `partnerName` | `string` | 否 | 合作方筛选值，当前匹配聚合字段 `partnerName` |
| `landingPartnerName` | `string` | 否 | 落地合作方筛选值 |
| `routeName` | `string` | 否 | 线路筛选值 |

成功响应示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "granularity": "day",
    "items": [
      {
        "date": "2026-04-01",
        "platformIncome": 18500,
        "pendingSettlementIncome": 18500,
        "settledIncome": 0
      }
    ]
  }
}
```

### 返回字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `data.granularity` | `string` | 聚合粒度，支持 `day`、`week`、`month` |
| `data.items[].date` | `string` | 聚合日期标签，前端可直接展示 |
| `data.items[].platformIncome` | `number` | 该时间桶内业务抽成金额求和 |
| `data.items[].pendingSettlementIncome` | `number` | 该时间桶内未入账的业务抽成金额求和；当前实现按 `status != accounted` 统计 |
| `data.items[].settledIncome` | `number` | 该时间桶内已入账的业务抽成金额求和 |

### 验数建议

1. 选择一周内连续几天，按日核对每一天的收益明细汇总。
2. 同时验证同一时间桶内：`platformIncome = pendingSettlementIncome + settledIncome`。
3. 切换 `granularity=week` 或 `month` 后，确认多个日明细相加结果与周/月聚合结果一致。

---

## 5. 经营趋势总览

### 请求信息

- 请求方法：`GET`
- Base URL：`https://<your-domain>`
- 接口路径：`/api/dashboard/business-trend`
- 完整 URL：`https://<your-domain>/api/dashboard/business-trend`

### 查询参数

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `startDate` | `string` | 否 | 开始日期，格式 `YYYY-MM-DD` |
| `endDate` | `string` | 否 | 结束日期，格式 `YYYY-MM-DD` |
| `granularity` | `string` | 否 | 聚合粒度，支持 `day`、`week`、`month` |
| `partnerName` | `string` | 否 | 合作方筛选值，当前匹配聚合字段 `partnerName` |
| `landingPartnerName` | `string` | 否 | 落地合作方筛选值 |
| `routeName` | `string` | 否 | 线路筛选值 |

成功响应示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "granularity": "day",
    "items": [
      {
        "date": "2026-04-01",
        "waybillCount": 168,
        "grossFreightAmount": 1250000,
        "platformIncome": 18500
      }
    ]
  }
}
```

### 返回字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `data.items[].date` | `string` | 聚合日期标签 |
| `data.items[].waybillCount` | `number` | 当前时间桶内业务抽成记录关联运单主键 `waybill_id` 去重统计 |
| `data.items[].grossFreightAmount` | `number` | 当前时间桶内撮合运费汇总，优先取 `waybills.receivable_total`，缺失时回退 `revenue_records.principal_amount`。该字段用于驾驶舱聚合分析，不等同于旧接口 `data.totalReceivable`。 |
| `data.items[].platformIncome` | `number` | 当前时间桶内业务抽成金额求和 |

### 验数建议

1. 与“收益趋势分析”使用同一时间范围核对，确认相同时间桶内 `platformIncome` 一致。
2. 抽样核对若干时间桶中的 `waybillCount`，确认是按运单去重而不是按收益记录行数统计。
3. 将同时间桶内命中的运单撮合运费求和，核对 `grossFreightAmount`。

---

## 6. 合作方贡献 TOP

### 请求信息

- 请求方法：`GET`
- Base URL：`https://<your-domain>`
- 接口路径：`/api/dashboard/partner-top`
- 完整 URL：`https://<your-domain>/api/dashboard/partner-top`

### 查询参数

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `startDate` | `string` | 否 | 开始日期，格式 `YYYY-MM-DD` |
| `endDate` | `string` | 否 | 结束日期，格式 `YYYY-MM-DD` |
| `limit` | `number` | 否 | 返回条数上限 |
| `sortBy` | `string` | 否 | 排序字段，支持 `platformIncome`、`waybillCount`、`grossFreightAmount` |
| `landingPartnerName` | `string` | 否 | 落地合作方筛选值 |
| `routeName` | `string` | 否 | 线路筛选值 |

成功响应示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "dimension": "partner",
    "sortBy": "platformIncome",
    "items": [
      {
        "partnerName": "融满",
        "waybillCount": 4301,
        "grossFreightAmount": 32056000,
        "platformIncome": 104295.58,
        "avgIncomePerWaybill": 24.25
      }
    ]
  }
}
```

### 返回字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `data.dimension` | `string` | 固定为 `partner` |
| `data.sortBy` | `string` | 当前排序字段 |
| `data.items[].partnerName` | `string` | 当前映射字段，现阶段映射到底层 `revenue_records.financier_name`，同名聚合后返回；不应直接视为已完全对齐合作方主数据后的最终标准字段。 |
| `data.items[].waybillCount` | `number` | 该合作方关联运单主键 `waybill_id` 去重统计 |
| `data.items[].grossFreightAmount` | `number` | 该合作方撮合运费汇总 |
| `data.items[].platformIncome` | `number` | 该合作方业务抽成金额求和 |
| `data.items[].avgIncomePerWaybill` | `number` | `platformIncome / waybillCount` |

### 验数建议

1. 先挑榜单前 1 到 3 名合作方，按 `partnerName` 过滤收益明细人工汇总。
2. 核对同名合作方是否已合并，而不是拆成多条。
3. 切换 `sortBy=platformIncome|waybillCount|grossFreightAmount`，确认排序结果与对应字段值一致。

---

## 7. 落地合作方贡献 TOP

### 请求信息

- 请求方法：`GET`
- Base URL：`https://<your-domain>`
- 接口路径：`/api/dashboard/landing-partner-top`
- 完整 URL：`https://<your-domain>/api/dashboard/landing-partner-top`

### 查询参数

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `startDate` | `string` | 否 | 开始日期，格式 `YYYY-MM-DD` |
| `endDate` | `string` | 否 | 结束日期，格式 `YYYY-MM-DD` |
| `limit` | `number` | 否 | 返回条数上限 |
| `sortBy` | `string` | 否 | 排序字段，支持 `platformIncome`、`waybillCount`、`grossFreightAmount` |
| `partnerName` | `string` | 否 | 合作方筛选值，当前匹配聚合字段 `partnerName` |
| `routeName` | `string` | 否 | 线路筛选值 |

成功响应示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "dimension": "landingPartner",
    "sortBy": "platformIncome",
    "items": [
      {
        "landingPartnerName": "重庆嘉上嘉供应链有限公司",
        "waybillCount": 292,
        "grossFreightAmount": 2831787,
        "platformIncome": 28317.87,
        "avgIncomePerWaybill": 96.98
      }
    ]
  }
}
```

### 返回字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `data.dimension` | `string` | 固定为 `landingPartner` |
| `data.items[].landingPartnerName` | `string` | 当前映射底层 `local_partners.name` |
| `data.items[].waybillCount` | `number` | 该落地合作方关联运单主键 `waybill_id` 去重统计 |
| `data.items[].grossFreightAmount` | `number` | 该落地合作方撮合运费汇总 |
| `data.items[].platformIncome` | `number` | 该落地合作方业务抽成金额求和 |
| `data.items[].avgIncomePerWaybill` | `number` | `platformIncome / waybillCount` |

### 验数建议

1. 按 `landingPartnerName` 过滤后，核对收益、运单数和撮合运费汇总。
2. 对照线路主数据，确认同一落地合作方下多条线路已正确汇总到同一名称。
3. 核对该接口字段命名始终为 `landingPartnerName`，不与 `partnerName` 混用。

---

## 8. 收益构成分析

### 请求信息

- 请求方法：`GET`
- Base URL：`https://<your-domain>`
- 接口路径：`/api/dashboard/income-structure`
- 完整 URL：`https://<your-domain>/api/dashboard/income-structure`

### 查询参数

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `startDate` | `string` | 否 | 开始日期，格式 `YYYY-MM-DD` |
| `endDate` | `string` | 否 | 结束日期，格式 `YYYY-MM-DD` |
| `partnerName` | `string` | 否 | 合作方筛选值，当前匹配聚合字段 `partnerName` |
| `landingPartnerName` | `string` | 否 | 落地合作方筛选值 |
| `routeName` | `string` | 否 | 线路筛选值 |

成功响应示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      { "name": "待结算收益", "value": 1075310.65 },
      { "name": "已结算收益", "value": 0 }
    ]
  }
}
```

### 返回字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `data.items[].name` | `string` | 当前固定为 `待结算收益`、`已结算收益` |
| `data.items[].value` | `number` | 分别对应 `pendingSettlementIncome`、`settledIncome` |

### 验数建议

1. 直接与 `经营总览` 接口核对，确认两个接口中的 `pendingSettlementIncome`、`settledIncome` 数值一致。
2. 再对照收益明细中的已入账/未入账汇总，验证环图口径没有偏差。

---

## 9. 结算进度分析

### 请求信息

- 请求方法：`GET`
- Base URL：`https://<your-domain>`
- 接口路径：`/api/dashboard/settlement-progress`
- 完整 URL：`https://<your-domain>/api/dashboard/settlement-progress`

### 查询参数

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `startDate` | `string` | 否 | 开始日期，格式 `YYYY-MM-DD` |
| `endDate` | `string` | 否 | 结束日期，格式 `YYYY-MM-DD` |
| `partnerName` | `string` | 否 | 合作方筛选值，当前匹配聚合字段 `partnerName` |
| `landingPartnerName` | `string` | 否 | 落地合作方筛选值 |
| `routeName` | `string` | 否 | 线路筛选值 |

成功响应示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "recordProgress": [
      { "stage": "收益记录", "count": 4301, "amount": 1075310.65 },
      { "stage": "已生成对账单", "count": 4301, "amount": 1075310.65 },
      { "stage": "对账完成", "count": 4301, "amount": 1075310.65 },
      { "stage": "已生成结算单", "count": 0, "amount": 0 },
      { "stage": "已入账", "count": 0, "amount": 0 }
    ]
  }
}
```

### 返回字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `data.recordProgress[].stage` | `string` | 固定顺序输出：`收益记录`、`已生成对账单`、`对账完成`、`已生成结算单`、`已入账` |
| `data.recordProgress[].count` | `number` | 当前阶段对应记录数 |
| `data.recordProgress[].amount` | `number` | 当前阶段对应业务抽成金额 |

### 验数建议

1. 核对 `已入账` 阶段 `amount` 是否与 `经营总览.settledIncome` 完全一致。
2. 使用少量样本跟踪几条收益记录的状态流转，确认它们落入的阶段符合预期。
3. 若某阶段当前数据为 0，优先确认是业务上确实为空，还是底层尚未沉淀充分。

---

## 10. 合作方效率分析

### 请求信息

- 请求方法：`GET`
- Base URL：`https://<your-domain>`
- 接口路径：`/api/dashboard/partner-efficiency`
- 完整 URL：`https://<your-domain>/api/dashboard/partner-efficiency`

### 查询参数

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `startDate` | `string` | 否 | 开始日期，格式 `YYYY-MM-DD` |
| `endDate` | `string` | 否 | 结束日期，格式 `YYYY-MM-DD` |
| `limit` | `number` | 否 | 返回条数上限 |
| `landingPartnerName` | `string` | 否 | 落地合作方筛选值 |
| `routeName` | `string` | 否 | 线路筛选值 |

成功响应示例：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      {
        "partnerName": "融满",
        "xWaybillCount": 4301,
        "yPlatformIncome": 104295.58,
        "bubbleGrossFreightAmount": 32056000
      }
    ]
  }
}
```

### 返回字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `data.items[].partnerName` | `string` | 当前映射字段，现阶段映射到底层 `revenue_records.financier_name`；不应直接视为已完全对齐合作方主数据后的最终标准字段。 |
| `data.items[].xWaybillCount` | `number` | 该合作方关联运单主键 `waybill_id` 去重统计 |
| `data.items[].yPlatformIncome` | `number` | 该合作方业务抽成金额求和 |
| `data.items[].bubbleGrossFreightAmount` | `number` | 该合作方撮合运费汇总 |

### 验数建议

1. 任选 1 到 3 个散点，按 `partnerName` 过滤后人工汇总 3 个值。
2. 核对 `xWaybillCount` 与 TOP 榜单中同合作方的 `waybillCount` 是否一致。
3. 核对 `yPlatformIncome` 与 TOP 榜单中同合作方的 `platformIncome` 是否一致。

---

## 11. 区域汇总（地图）

### 接口说明

- **接口路径**：`/api/dashboard/region-summary`
- **接口用途**：供 **山海鲸中间中国地图主视觉** 使用，展示 **近 7 天（默认）** 或自定义时间范围内的 **区域业务分布**（按标准化城市聚合运单数、平台收益、落地合作方覆盖数）。
- **适合场景**：地图打点、省级定位/着色、tooltip 展示城市级指标；与其它 dashboard 接口共用同一套 `waybill_commission` 平台抽成事实口径。
- **字段角色**：`regionName` 用于 **展示名称**（tooltip、图例文案）；`provinceName` 用于 **地图定位与省级映射**（省界、按省聚合等）。

### 请求信息

- 请求方法：`GET`
- Base URL：`https://<your-domain>`
- 接口路径：`/api/dashboard/region-summary`
- 完整 URL：`https://<your-domain>/api/dashboard/region-summary`

### 查询参数

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `startDate` | `string` | 否 | 开始日期，格式 `YYYY-MM-DD` |
| `endDate` | `string` | 否 | 结束日期，格式 `YYYY-MM-DD` |
| `partnerName` | `string` | 否 | 合作方筛选，与其它 dashboard 一致，匹配 `revenue_records.financier_name` |
| `landingPartnerName` | `string` | 否 | 落地合作方筛选 |
| `routeName` | `string` | 否 | 线路筛选 |
| `includeZeroRegions` | `string`（布尔） | 否 | 传 `true`/`1`/`yes`（大小写不敏感）时，在**输出层**按固定省份/城市底表返回完整 `items`，无业务数据的区域指标为 **0**，并与真实聚合结果按 `provinceName`+`regionName` 合并；未传、`false`/`0`/`no` 或无法识别时保持旧行为（仅返回窗口内有数据的区域）。**不改变** SQL 聚合与区域标准化口径。响应中 `data.usedFixedRegionTemplate` 与该模式一致（`true`/`false`）。 |

**默认时间行为**：若请求中 **未传** `startDate` 且 **未传** `endDate`，则服务端按 **服务器本地日历** 自动取 **近 7 天（含今天）**：

- 默认 `endDate` = **今天**（本地日期的 `YYYY-MM-DD`）
- 默认 `startDate` = **今天往前 6 天**的同一本地日历日（与 `endDate` 闭区间合计 7 个自然日）
- 响应中 `data.dateScope` = `"last7days"`

若请求中 **传了** `startDate` 或 `endDate` 任意一个，则视为自定义区间，`data.dateScope` = `"custom"`；`data.startDate` / `data.endDate` 回显本次实际参与 SQL 过滤的日期（与入参一致；仅传一端时另一端可能为空，与底层 `WHERE` 条件一致）。

### 区域数据来源与映射规则

1. **原始区域字段**（聚合前）  
   - 来自主数据 **`areas.name`**，链路为：`revenue_records` → `routes` → `local_partners` → **`areas`**（`local_partners.area_id` → `areas.id`）。  
   - 与其它收益/运单列表中 `area_name` 来源一致。

2. **合作方字段**（用于金罗规则）  
   - 来自 **`revenue_records.financier_name`**，与驾驶舱 `partnerName` 映射一致。

3. **名称标准化**  
   - **`XX融满`**：去掉名称中的 **「融满」** 字样后 `trim`，得到 **城市名**（如 `武汉融满` → `武汉`）。  
   - **合作方 = `金罗`** 且 **无区域**（`areas.name` 为空或未维护）：统一映射为 **`regionName = 成都`**、`provinceName = 四川`（业务约定）。

4. **城市 → 省份（静态表，首版）**  
   在得到城市名后，按下表映射 `provinceName`；若城市不在表中，则聚合桶在输出层会被过滤（见下节「输出过滤」），不在 `items` 中返回：

| 城市 | 省份 |
|---|---|
| 武汉 | 湖北 |
| 成都 | 四川 |
| 昆明 | 云南 |
| 上海 | 上海 |
| 天津 | 天津 |
| 临沂 | 山东 |
| 南京 | 江苏 |
| 郑州 | 河南 |
| 济南 | 山东 |
| 泉州 | 福建 |
| 长沙 | 湖南 |
| 广州 | 广东 |
| 重庆 | 重庆 |

5. **聚合口径**（与其它 dashboard 一致）  
   - `platformIncome`：业务抽成 **`amount` 求和**（`source_type = waybill_commission` 等平台事实条件，见上文「核心口径说明」）。  
   - `waybillCount`：命中条件下的 **`waybill_id` 去重计数**。  
   - `landingPartnerCount`：该区域内 **落地合作方去重数**（优先 `local_partners.id`，否则按名称去重）。  
   - `routeCount`：该区域内命中事实的 **`routes.id`（即 `revenue_records.route_id`）去重数**；事实行已通过 `routes` → `local_partners` → `areas` 与区域对齐，等价于「经落地合作方关联到的线路数」在**本期有抽成记录**维度上的去重统计。

### 输出过滤说明（地图主视觉）

接口在 **返回 JSON 前** 对 `items` 做展示层过滤（**不改底层事实数据、不影响其它 dashboard 接口**）：

- **`regionName = 未维护区域`** 的桶 **不返回**，避免无地理语义的数据进入地图主视觉。  
- **`provinceName = 未知`** 的桶 **不返回**（首版无法可靠落省界/着色；若后续扩展映射表，可再评估是否透出）。

因此山海鲸首版 **只需渲染接口返回的 `items`**，无需再自行剔除「未维护区域」或「未知省」。

### `includeZeroRegions=true`（固定底表 + 零值补齐）

- **用途**：山海鲸地图等场景在**当前统计窗口内无业务数据**时，仍希望拿到**稳定、完整**的城市列表（便于占位与着色），而不改变既有金额/运单等**聚合口径**。
- **回显标志**：`data.usedFixedRegionTemplate` — 当且仅当本次请求生效为固定底表模式（`includeZeroRegions=true`）时为 **`true`**，否则为 **`false`**（含未传、传 `false`、无法解析等）。
- **底表**：固定 **20** 条「省 + 市」组合，顺序由服务端常量 `DASHBOARD_REGION_SUMMARY_TEMPLATE` 定义（代码文件 `backend/src/dashboard-region-summary-template.ts`）；本次清单由产品/大屏侧直接提供（吉林/长春、四川/成都、陕西/西安、广东/广州、山东/临沂、湖南/长沙、重庆/重庆、天津/天津、山东/济南、云南/昆明、江苏/镇江、湖北/武汉、辽宁/沈阳、福建/泉州、河南/郑州、安徽/合肥、上海/上海、贵州/贵阳、河北/石家庄、北京/北京）。
- **`items` 集合边界（必读）**：`includeZeroRegions=true` 时，**仅**返回上述固定底表中的 **20** 条省/市组合，**不会多也不会少**。即使当前统计窗口内、在默认模式下本会出现在 `items` 里的**底表外城市**（例如映射表已支持但未列入底表的城市）**存在业务数据**，在该模式下也**一律不会**出现在 `items` 中（数据仍在底层聚合中计算，只是本接口该模式下不向调用方透出这些行）。
- **处理顺序**：先按既有逻辑完成事实聚合与输出过滤（剔除「未维护区域」「未知」桶，与 `includeZeroRegions` 无关）；再在**响应组装阶段**以底表顺序生成 `items`，对每条底表记录查找 **`provinceName` + `regionName`** 与过滤后聚合结果是否一致，一致则**整项沿用真实值**（含 `routeCount`/`activeRouteCount`/`displayText`），否则数值字段均为 **0**。
- **`displayText` 与 `waybillCount`**：**全接口统一**——当 **`waybillCount === 0`** 时，`displayText` **固定为** **`该区域数据持续接入中`**（山海鲸在空串时仍会显示标记卡片，故用固定兜底句）；**`waybillCount > 0`** 时仍按「省｜平台收益…｜活跃线路…」生成。数值字段（含 `platformIncome` 等）不因本规则改变。
- **不追加项**：「未维护区域」「未知省」等已过滤桶**不会**混入；底表外城市见上条，同样不返回。
- **排序**：`includeZeroRegions=false`（默认）时仍为 **按 `platformIncome` 降序 → `waybillCount` 降序 → `regionName` 中文排序**；`includeZeroRegions=true` 时为 **底表定义顺序**，便于地图固定展示。

### 成功响应示例（默认近 7 天）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "dateScope": "last7days",
    "startDate": "2026-04-03",
    "endDate": "2026-04-09",
    "usedFixedRegionTemplate": false,
    "items": [
      {
        "regionName": "成都",
        "provinceName": "四川",
        "waybillCount": 1233,
        "platformIncome": 95781.15,
        "landingPartnerCount": 1,
        "routeCount": 12,
        "activeRouteCount": 12,
        "displayText": "四川｜平台收益，95781.15 元｜活跃线路，12 条"
      },
      {
        "regionName": "重庆",
        "provinceName": "重庆",
        "waybillCount": 127,
        "platformIncome": 22907.86,
        "landingPartnerCount": 1,
        "routeCount": 9,
        "activeRouteCount": 9,
        "displayText": "重庆｜平台收益，22907.86 元｜活跃线路，9 条"
      }
    ]
  }
}
```

### 成功响应示例（自定义时间范围）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "dateScope": "custom",
    "startDate": "2026-04-01",
    "endDate": "2026-04-07",
    "usedFixedRegionTemplate": false,
    "items": [
      {
        "regionName": "广州",
        "provinceName": "广东",
        "waybillCount": 69,
        "platformIncome": 10432.5,
        "landingPartnerCount": 1,
        "routeCount": 5,
        "activeRouteCount": 5,
        "displayText": "广东｜平台收益，10432.50 元｜活跃线路，5 条"
      }
    ]
  }
}
```

### 成功响应示例（`includeZeroRegions=true`，节选）

`items` **固定为 20 条**，顺序与底表一致；以下为示意（首条无数据补 0，第二条为窗口内有数据时的真实值）：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "dateScope": "last7days",
    "startDate": "2026-04-03",
    "endDate": "2026-04-09",
    "usedFixedRegionTemplate": true,
    "items": [
      {
        "regionName": "长春",
        "provinceName": "吉林",
        "waybillCount": 0,
        "platformIncome": 0,
        "landingPartnerCount": 0,
        "routeCount": 0,
        "activeRouteCount": 0,
        "displayText": "该区域数据持续接入中"
      },
      {
        "regionName": "成都",
        "provinceName": "四川",
        "waybillCount": 1233,
        "platformIncome": 95781.15,
        "landingPartnerCount": 1,
        "routeCount": 12,
        "activeRouteCount": 12,
        "displayText": "四川｜平台收益，95781.15 元｜活跃线路，12 条"
      }
    ]
  }
}
```

（实际响应中 `items` 含底表全部 20 个城市，此处 JSON 仅展示前 2 条结构。）

### 返回字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `data.dateScope` | `string` | `last7days`：未传 `startDate` 且未传 `endDate`；`custom`：传了任一端日期 |
| `data.startDate` | `string` | 本次统计 `revenue_date` 下界（含）；默认近 7 天时与自动计算的 `startDate` 一致，便于联调确认窗口 |
| `data.endDate` | `string` | 本次统计上界（含） |
| `data.usedFixedRegionTemplate` | `boolean` | **`true`**：本次为固定 20 城底表输出（请求 `includeZeroRegions` 生效为真）；**`false`**：默认模式（仅返回窗口内有数据的区域）。与 `items` 形态一致，便于前端分支渲染 |
| `data.items[].regionName` | `string` | **地图展示名**（城市级），用于 tooltip、标签；已排除「未维护区域」 |
| `data.items[].provinceName` | `string` | **省级定位/映射用**；已排除值为「未知」的桶 |
| `data.items[].waybillCount` | `number` | 该区域运单数，`waybill_id` 去重 |
| `data.items[].platformIncome` | `number` | 该区域平台收益，业务抽成金额求和，保留两位小数 |
| `data.items[].landingPartnerCount` | `number` | 该区域关联落地合作方去重数 |
| `data.items[].routeCount` | `number` | 该区域下命中事实的去重线路数（`route_id` / `routes.id`）；无 `route_id` 时为 `0` |
| `data.items[].activeRouteCount` | `number` | 与 `routeCount` 相同，供展示语义「活跃线路」 |
| `data.items[].displayText` | `string` | **`waybillCount > 0`** 时为「省｜平台收益…｜活跃线路…」；**`waybillCount === 0`** 时为固定句 **`该区域数据持续接入中`**（默认模式与底表补零行一致）；不改变各数值字段聚合口径 |

### 验数建议

1. 对照 `data.startDate` / `data.endDate` 与默认近 7 天或入参是否一致。  
2. 任选 1～2 个城市，在收益事实中按 `areas.name` + 金罗规则手工汇总，核对 `waybillCount`、`platformIncome`、`landingPartnerCount` 与 `routeCount`。  
3. 确认响应中 **不出现** `regionName` 为「未维护区域」或 `provinceName` 为「未知」的项。

---

## 12. 业务规模趋势

### 接口说明

- **接口路径**：`/api/dashboard/business-scale-trend`
- **接口用途**：供山海鲸等大屏展示 **业务规模（撮合运费 `grossFreightAmount`）** 的时间趋势；口径与本文档「核心口径说明」及 `/api/dashboard/business-trend` 中 `grossFreightAmount` **一致**（`waybills.receivable_total` 优先，缺失时 `revenue_records.principal_amount`）。
- **与 `business-trend` 的差异**：本接口**仅**返回趋势所需的周期标签与 `grossFreightAmount`，不混入 `waybillCount` / `platformIncome`；支持独立默认时间窗与周语义说明字段，避免改动既有 `business-trend` 结构。

### 请求信息

- 请求方法：`GET`
- Base URL：`https://<your-domain>`
- 接口路径：`/api/dashboard/business-scale-trend`
- 完整 URL：`https://<your-domain>/api/dashboard/business-scale-trend`

### 查询参数

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `startDate` | `string` | 否 | 开始日期，`YYYY-MM-DD`；与 `endDate` 均不传时使用默认窗口（见下） |
| `endDate` | `string` | 否 | 结束日期，`YYYY-MM-DD` |
| `granularity` | `string` | 否 | `day` \| `week` \| `month`；**不传或非法时默认 `week`**，此时 `data.usedDefaultGranularity` = `true` |
| `partnerName` | `string` | 否 | 与其它 dashboard 一致，匹配 `revenue_records.financier_name` |
| `landingPartnerName` | `string` | 否 | 落地合作方筛选 |
| `routeName` | `string` | 否 | 线路筛选 |

**默认时间行为（大屏首版）**：若 **未传** `startDate` 且 **未传** `endDate`，服务端按 **服务器本地日历** 取 **最近 8 个自然周** 的窗口（见代码 `getDefaultLast8WeeksDateRange`）：

- `endDate` = **今天**
- `startDate` = **今天所在周的周一**，再向前 **49 天**（即再往前 7 个整周的周一），使时间跨度覆盖 **8 个自然周**，避免无日期参数时拉全量历史。
- 响应中 `data.dateScope` = `"last8weeks"`，`data.usedDefaultDateRange` = `true`。

若请求中 **传了** `startDate` 或 `endDate` **任意一端**，则视为自定义区间：`data.dateScope` = `"custom"`，`data.usedDefaultDateRange` = `false`；`data.startDate` / `data.endDate` **回显**本次实际参与 SQL 的日期边界（与入参及底层 `WHERE` 一致）。

### 粒度与周语义

| `granularity` | 数据来源 | 说明 |
|---|---|---|
| `day` / `month` | 与 `business-trend` 相同的按桶 SQL | `data.weekPeriodSemantics` = `null` |
| `week`（默认） | 先按 **日** 取数，再在应用层按 **ISO 8601 周**汇总 | `data.weekPeriodSemantics` 非空，见下表 |

**`data.weekPeriodSemantics`（仅 `granularity=week`）**

| 字段 | 说明 |
|---|---|
| `periodLabelStandard` | 固定 `iso8601`：`items[].periodLabel` 为 **ISO 8601 周编号**（`YYYY-Www`），一周为 **周一至周日**。 |
| `itemDateBounds` | 固定 `query_window_intersection_per_iso_week`：`items[].startDate` / `endDate` 表示在 **本次查询** `data.startDate`～`data.endDate` 限定下，该 ISO 周内 **实际有 `revenue_date` 的最小日、最大日**（闭区间），**不是**强制铺满的整周日历边界。 |
| `partialWeekInterpretation` | 人类可读长文案：首尾周被查询窗口截断时，金额为 **交集片段** 的 `grossFreightAmount` 之和；**不可用** `items[].startDate`/`endDate` 反推完整周一至周日。 |

### 成功响应示例（默认 8 周 + 默认周粒度）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "dateScope": "last8weeks",
    "startDate": "2026-02-23",
    "endDate": "2026-04-16",
    "usedDefaultDateRange": true,
    "granularity": "week",
    "usedDefaultGranularity": true,
    "weekPeriodSemantics": {
      "periodLabelStandard": "iso8601",
      "itemDateBounds": "query_window_intersection_per_iso_week",
      "partialWeekInterpretation": "当查询下沿或上沿截断某一 ISO 周时……"
    },
    "items": [
      {
        "periodLabel": "2026-W10",
        "startDate": "2026-03-02",
        "endDate": "2026-03-08",
        "grossFreightAmount": 1250000
      }
    ]
  }
}
```

### 返回字段说明（`data` 顶层）

| 字段 | 类型 | 说明 |
|---|---|---|
| `dateScope` | `string` | `last8weeks`：未传两端日期；`custom`：至少传了一端日期 |
| `startDate` | `string` | 本次 `revenue_date` 下界（含），**始终回显** |
| `endDate` | `string` | 本次 `revenue_date` 上界（含），**始终回显** |
| `usedDefaultDateRange` | `boolean` | `true`：未传 `startDate` 且未传 `endDate`，使用默认 8 周 |
| `granularity` | `string` | 实际使用的 `day` \| `week` \| `month` |
| `usedDefaultGranularity` | `boolean` | `true`：未传或非法 `granularity`，服务端采用 `week` |
| `weekPeriodSemantics` | `object` \| `null` | 仅周粒度非 `null`，含义见上表 |
| `items[].periodLabel` | `string` | 日：`YYYY-MM-DD`；月：`YYYY-MM`；周：`YYYY-Www`（ISO） |
| `items[].startDate` | `string` | 该桶在查询窗口内的起始日（周/月见语义说明） |
| `items[].endDate` | `string` | 该桶在查询窗口内的结束日 |
| `items[].grossFreightAmount` | `number` | 该周期内撮合运费合计，两位小数 |

### 验数建议

1. 与 `/api/dashboard/business-trend` 在相同 `startDate`/`endDate`/`granularity` 下核对各桶 `grossFreightAmount`（周粒度本接口为日汇总后再卷周，应与按日相加一致）。  
2. 不传日期时核对 `dateScope`、`startDate`/`endDate` 与默认 8 周规则。  
3. 阅读 `weekPeriodSemantics.partialWeekInterpretation`，确认前端 tooltip 与坐标轴标签不与整周边界混淆。

---

## 13. 融满发车批次趋势（按批次号去重）

### 字段与口径确认（实现依据）

以下四点与当前库表及 dashboard 事实链路一致，供联调与验收对照：

1. **「合作方」来源**：`revenue_records.financier_name`（与其它 dashboard 中 `partnerName` 筛选、`PARTNER_NAME_SQL` 一致）。本接口首版 **固定** 筛选 `TRIM(rr.financier_name) = '融满'`，**不接受**查询参数覆盖合作方。
2. **「批次号」来源**：`waybills.waybill_number`（运单表「批次号」列；与导入/爬虫字段映射一致）。
3. **按周（及日/月）分桶使用的日期**：`COALESCE(DATE(waybills.departure_time), DATE(waybills.created_time))`。语义上优先 **发车日**；无有效发车日时回退 **批次创建/入库日**。**不是** `revenue_records.revenue_date`，因此与第 12 节「业务规模趋势」的日期轴含义不同；仅 **默认时间窗算法**（未传两端日期时最近 8 周）与第 12 节对齐。
4. **与下节「发车车次数（业务口径）」一致**：去重键为 `waybills.waybill_number`；空值处理见该节。

### 接口说明

- **接口路径**：`/api/dashboard/departure-batch-trend`
- **接口用途**：返回合作方 **融满** 下，按时间桶聚合的 **发车车次数** 趋势（口径见下节）。
- **事实链路**：与其它 dashboard 一致，从 `revenue_records`（`record_type=revenue`、`beneficiary_type=platform`、`source_type=waybill_commission`）关联 `waybills`，再用于批次号与分桶日期。

### 发车车次数（业务口径）

本接口中的 **「发车车次数」** 在首版与当前系统约定如下，**请勿**将其理解为「普通运单条数」或「任意运单号去重数量」：

- **统计定义**：每个时间桶内的 **发车车次数** = 对该桶内所有命中行，按 **`waybills.waybill_number` 去重后的个数**。
- **字段语义**：在本系统当前业务语义中，**`waybill_number` 承载的是「批次号」口径**（与运单导入、TMS 同步及列表展示中的「批次号」一致），**不是**泛指的「业务运单号」若另有定义时的替代含义。
- **排除规则**：**`waybill_number` 为空、仅空白或去首尾空格后为空的记录，一律不计入** 去重统计。

### 数据质量说明

- 若融满相关数据中 **`waybill_number` 大量为空或仅空白**，则本接口各桶的 **`departureBatchCount` 会系统性偏低**（可理解为「有批次号可数的车辆/批次数」变少）。
- 上述现象反映的是 **源数据或同步链路中批次号未填、未落库或未对齐** 等问题，**不属于** 本接口聚合逻辑错误；治理应优先在 TMS / 同步 / 清洗侧补齐 **`waybill_number`（批次号）**。

### 请求信息

- 请求方法：`GET`
- 接口路径：`/api/dashboard/departure-batch-trend`
- 完整 URL：`https://<your-domain>/api/dashboard/departure-batch-trend`

### 查询参数

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `startDate` | `string` | 否 | 分桶日期下界（含），`YYYY-MM-DD`；与 `endDate` 均不传时使用默认 8 周窗口（与第 12 节 `getDefaultLast8WeeksDateRange` 一致） |
| `endDate` | `string` | 否 | 分桶日期上界（含） |
| `granularity` | `string` | 否 | `day` \| `week` \| `month`；**不传或非法时默认 `week`**，`data.usedDefaultGranularity` = `true`。**山海鲸首版建议**：调用时 **显式传 `granularity=week`**，与当前后端默认一致；显式传参可避免日后若调整默认值时，大屏与文档理解不一致。 |

**说明**：本接口 **不提供** `partnerName` / `landingPartnerName` / `routeName` 等筛选参数（首版合作方写死为融满）。

### 成功响应示例

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "dateScope": "last8weeks",
    "startDate": "2026-02-23",
    "endDate": "2026-04-16",
    "usedDefaultDateRange": true,
    "granularity": "week",
    "usedDefaultGranularity": true,
    "items": [
      {
        "periodLabel": "2026-W10",
        "startDate": "2026-03-02",
        "endDate": "2026-03-08",
        "departureBatchCount": 186
      }
    ]
  }
}
```

### 返回字段说明（`data`）

| 字段 | 类型 | 说明 |
|---|---|---|
| `dateScope` | `string` | `last8weeks`：未传 `startDate` 且未传 `endDate`；`custom`：至少传了一端日期 |
| `startDate` | `string` | 本次参与过滤的 **分桶日期** 下界（含），**始终回显** |
| `endDate` | `string` | 本次 **分桶日期** 上界（含），**始终回显** |
| `usedDefaultDateRange` | `boolean` | 与第 12 节语义一致 |
| `granularity` | `string` | 实际粒度 |
| `usedDefaultGranularity` | `boolean` | 未传或非法 `granularity` 时为 `true` |
| `items[].periodLabel` | `string` | 日：`YYYY-MM-DD`；月：`YYYY-MM`；周：MySQL ISO 周格式 `YYYY-Www`（与第 12 节周标签一致） |
| `items[].startDate` | `string` | 该桶在查询窗口内的实际最小分桶日 |
| `items[].endDate` | `string` | 该桶在查询窗口内的实际最大分桶日 |
| `items[].departureBatchCount` | `number` | 该周期内按 **`waybill_number`（批次号）** 去重后的 **发车车次数**（空批次不计，语义见上节「发车车次数（业务口径）」） |

### 验数建议

1. 固定 `startDate`/`endDate` 与 `granularity=day`，按 SQL 手工 `COUNT(DISTINCT waybill_number)` 与某日 `items[].departureBatchCount` 对齐。  
2. 周桶与 ISO 周标签对照 MySQL `DATE_FORMAT(分桶日期, '%x-W%v')`。  
3. 抽样核对 `financier_name` 去空格后均为「融满」。

---

## 14. 城市业务规模分布

### 接口说明

- **接口路径**：`/api/dashboard/business-scale-by-city`
- **接口用途**：供山海鲸展示 **按城市聚合的业务规模**（`grossFreightAmount`）及 **运单数**（`waybillCount`），用于城市排行、分布图等。
- **区域规则**：与 **第 11 节 `region-summary`** **完全一致**——同一套 `normalizeDashboardRegionName`（融满字样、金罗缺省区域、城市→省静态表）及 **相同的 `items` 输出过滤**（不含「未维护区域」「未知省」桶）。
- **金额口径**：与 `grossFreightAmount` 全局说明一致；**`waybillCount`** 为区域内 **`waybill_id` 去重计数**，与 `region-summary` 一致。

### 请求信息

- 请求方法：`GET`
- Base URL：`https://<your-domain>`
- 接口路径：`/api/dashboard/business-scale-by-city`
- 完整 URL：`https://<your-domain>/api/dashboard/business-scale-by-city`

### 查询参数

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `startDate` | `string` | 否 | 开始日期，`YYYY-MM-DD` |
| `endDate` | `string` | 否 | 结束日期，`YYYY-MM-DD` |
| `partnerName` | `string` | 否 | 与其它 dashboard 一致 |
| `landingPartnerName` | `string` | 否 | 落地合作方筛选 |
| `routeName` | `string` | 否 | 线路筛选 |

**默认时间行为**：若 **未传** `startDate` 且 **未传** `endDate`，服务端按 **服务器本地日历** 取 **最近 30 天（含今天）**：

- `endDate` = **今天**
- `startDate` = **今天往前 29 天**（闭区间共 **30** 个自然日）
- 响应中 `data.dateScope` = `"last30days"`，`data.usedDefaultDateRange` = `true`。

若 **传了** 任一端日期：`data.dateScope` = `"custom"`，`data.usedDefaultDateRange` = `false`；**`data.startDate` / `data.endDate` 始终回显**本次实际参与过滤的边界（与入参及 SQL 一致）。

**排序**：`items` 按 `grossFreightAmount` **降序**；金额相同时按 `waybillCount` 降序，再按城市名。

### 成功响应示例（默认近 30 天）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "dateScope": "last30days",
    "startDate": "2026-03-18",
    "endDate": "2026-04-16",
    "usedDefaultDateRange": true,
    "items": [
      {
        "regionName": "成都",
        "provinceName": "四川",
        "waybillCount": 120,
        "grossFreightAmount": 32056000
      },
      {
        "regionName": "重庆",
        "provinceName": "重庆",
        "waybillCount": 45,
        "grossFreightAmount": 2831787
      }
    ]
  }
}
```

### 返回字段说明（`data` 顶层与 `items`）

| 字段 | 类型 | 说明 |
|---|---|---|
| `dateScope` | `string` | `last30days` \| `custom` |
| `startDate` | `string` | 本次 `revenue_date` 下界（含），**始终回显** |
| `endDate` | `string` | 本次上界（含），**始终回显** |
| `usedDefaultDateRange` | `boolean` | 是否与 `business-scale-trend` 同风格：`true` 表示使用了默认 30 天窗口 |
| `items[].regionName` | `string` | 展示用城市名 |
| `items[].provinceName` | `string` | 省级映射，规则同第 11 节 |
| `items[].waybillCount` | `number` | `waybill_id` 去重计数 |
| `items[].grossFreightAmount` | `number` | 撮合运费合计，两位小数 |

### 验数建议

1. 与第 11 节同一窗口、同一筛选下，抽样对比城市桶的 **`waybillCount`** 是否与 `region-summary` 一致（`grossFreightAmount` 与 `platformIncome` 不同维，勿混比）。  
2. 核对默认 `last30days` 时 `startDate`/`endDate` 与 `dateScope`。  
3. 验证列表按 `grossFreightAmount` 降序。

---

## 15. 线路业务规模分布（按线路累计撮合运费）

### 接口说明

- **接口路径**：`/api/dashboard/business-scale-by-route`
- **接口用途**：供山海鲸展示 **按线路分组的撮合运费累计**（`grossFreightAmount`），用于线路排行、线路分布等；**每行一条线路（或一类无 `route_id` 的兜底分桶）**，非「按线路名过滤后的单一总额」。
- **金额口径**：与本文档「核心口径说明」及 `overview` / `business-trend` / **第 14 节** `business-scale-by-city` 中的 **`grossFreightAmount` 完全一致**（`waybills.receivable_total` 优先，缺失时 `revenue_records.principal_amount`）。
- **线路维度**：有 `revenue_records.route_id` 时按 **线路 id** 聚合，展示名取 **`routes.name`**（与全局 `routeName` 映射一致）；`route_id` 为空时按 **`waybills.vehicle_route`** 文本分桶（展示同名），二者皆空时归入 **「未命名线路」** 桶，且 **`routeId` 回 `null`**。

### 请求信息

- 请求方法：`GET`
- Base URL：`https://<your-domain>`
- 接口路径：`/api/dashboard/business-scale-by-route`
- 完整 URL：`https://<your-domain>/api/dashboard/business-scale-by-route`

### 查询参数

| 参数名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `startDate` | `string` | 否 | 开始日期，`YYYY-MM-DD`，过滤 **`revenue_date`** 下界（含） |
| `endDate` | `string` | 否 | 结束日期，`YYYY-MM-DD`，过滤 **`revenue_date`** 上界（含） |
| `partnerName` | `string` | 否 | 与其它 dashboard 一致 |
| `landingPartnerName` | `string` | 否 | 落地合作方筛选 |
| `routeName` | `string` | 否 | 线路筛选（精确匹配 **`routes.name`**，与其它接口一致） |

**默认时间行为**：若 **未传** `startDate` 且 **未传** `endDate`，服务端按 **服务器本地日历** 使用：

- `startDate` = **`2026-03-01`**
- `endDate` = **今天**（含）
- 响应中 `data.dateScope` = `"fixedStartToToday"`，`data.usedDefaultDateRange` = `true`。

若 **传了** 任一端日期：`data.dateScope` = `"custom"`，`data.usedDefaultDateRange` = `false`；行为与 **第 14 节** `business-scale-by-city` **一致**——**仅传入的一端**参与 `revenue_date` 过滤，**未传的一端不加边界**（该侧为全历史开放）。`data.startDate` / `data.endDate` **始终回显**本次实际参与过滤的边界（与入参及 SQL 一致）。

**排序**：`items` 按 `grossFreightAmount` **降序**；金额相同时按 `routeName` 升序。

### 成功响应示例（默认窗）

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "dateScope": "fixedStartToToday",
    "startDate": "2026-03-01",
    "endDate": "2026-04-16",
    "usedDefaultDateRange": true,
    "items": [
      {
        "routeId": "xxx",
        "routeName": "嘉上嘉供应链重庆广西海南A",
        "grossFreightAmount": 32056000
      },
      {
        "routeId": "yyy",
        "routeName": "某某线路",
        "grossFreightAmount": 2831787.12
      }
    ]
  }
}
```

### 返回字段说明（`data` 顶层与 `items`）

| 字段 | 类型 | 说明 |
|---|---|---|
| `dateScope` | `string` | `fixedStartToToday`：未传两端日期；`custom`：至少传了一端日期 |
| `startDate` | `string` | 本次 `revenue_date` 下界（含），**始终回显** |
| `endDate` | `string` | 本次上界（含），**始终回显** |
| `usedDefaultDateRange` | `boolean` | 是否使用默认「2026-03-01～今天」窗口 |
| `items[].routeId` | `string` \| `null` | 有 `route_id` 时为线路主键字符串；无 id 的兜底分桶为 `null` |
| `items[].routeName` | `string` | 展示用线路名（有 id 时为 `routes.name`；无 id 时优先运单 `vehicle_route`） |
| `items[].grossFreightAmount` | `number` | 该线路（或该兜底桶）下撮合运费合计，两位小数 |

### 验数建议

1. 与 `overview` 或 `business-trend` 在 **相同** `startDate`/`endDate` 及相同筛选下，核对各线路 `grossFreightAmount` **之和**是否与全量口径一致（注意本接口为 **按线路拆分**，非平台收益维度）。  
2. 核对默认窗下 `dateScope`、`usedDefaultDateRange` 与回显 `startDate`/`endDate`。  
3. 验证 `items` 按 `grossFreightAmount` 降序；抽样有 `route_id` 的行核对底层 `routes.name`。

---

## 验数建议清单

以下建议用于驾驶舱 dashboard 聚合接口（含区域地图）上线前的人工验数：

1. 先固定一个小时间窗，例如单日、单周，避免直接对全量历史数据做首次核对。
2. 优先选 1 到 2 个合作方、1 个落地合作方、1 条线路做穿透校验，确保维度不混用。
3. 先核对收益类字段，再核对运单数和撮合运费，顺序建议为：`platformIncome` -> `pendingSettlementIncome` / `settledIncome` -> `waybillCount` -> `grossFreightAmount`。
4. 所有趋势接口都建议验证“明细相加是否等于聚合桶结果”，特别是 `day` 与 `week/month` 之间是否可加总对齐。
5. 所有 TOP/散点接口都建议交叉核对同一维度下的 `waybillCount`、`platformIncome` 是否在不同接口中保持一致。
6. `income-structure` 与 `overview`、`settlement-progress` 三者之间，至少要核对一次 `settledIncome` 是否完全相等。
7. `grossFreightAmount` 当前含过渡期兜底逻辑，验数时应优先看 `waybills.receivable_total`，仅在缺失时再检查 `revenue_records.principal_amount`。
8. `effectiveContractCount` 当前只作为辅助观察指标，建议做趋势比对，不建议拿它与平台全局合同总数直接对账。
9. `region-summary`：核对默认 `last7days` 窗口、`dateScope` 与 `startDate/endDate`；按区域手工汇总与 `items` 交叉验证。
10. `business-scale-trend`：默认 8 周与 `usedDefaultDateRange`；周粒度与 `business-trend` 日数据对齐验 `grossFreightAmount`。
11. `departure-batch-trend`：默认 8 周窗与回显；核对分桶日期为「发车/创建日」而非 `revenue_date`；按日粒度与手工 `COUNT(DISTINCT waybill_number)` 对齐。
12. `business-scale-by-city`：默认 30 天与回显日期；与 `region-summary` 对齐抽样验 `waybillCount` 与城市过滤。  
13. `business-scale-by-route`：默认 `2026-03-01`～今天与 `usedDefaultDateRange`；各线路 `grossFreightAmount` 之和与同期全量口径对齐；核对无 `route_id` 时 `vehicle_route` 分桶与 `routeId=null`。

---

## 鉴权失败示例

```json
{
  "code": 401,
  "message": "Unauthorized",
  "data": null
}
```

## 接入建议

- 生产环境请通过 HTTPS 调用。
- `X-API-Key` 应由接入方保存在服务端，不建议暴露到前端页面源码中。
- 如需轮换密钥，建议平台侧提前通知调用方并设置切换窗口。
- 如后续新增只读看板接口，建议沿用当前统一返回结构。
- 山海鲸中间地图请使用 **`/api/dashboard/region-summary`**：默认近 7 天；`regionName` 作展示、`provinceName` 作省界定位；返回 `items` 已排除无地理语义的桶。
- **线路维度撮合运费排行/分布**请使用 **`/api/dashboard/business-scale-by-route`**（**第 15 节**）：不传日期时默认自 **`2026-03-01`** 累计至今天；与 `grossFreightAmount` 全局口径一致。
- **融满发车批次趋势**（**`/api/dashboard/departure-batch-trend`**，见第 13 节）：首版调用建议 **始终显式携带 `granularity=week`**（与当前默认一致，避免依赖隐式默认）；`startDate`/`endDate` 可按大屏需求传自定义窗，不传则使用文档所述默认 8 周。图表建议：以 **`items[].periodLabel`** 为横轴（或类目轴）、**`departureBatchCount`** 为柱/折线序列；**`items[].startDate` / `endDate`** 用于 tooltip 说明该周在查询窗内的实际有数据日区间（非强制整周边界）。指标含义为 **按 `waybill_number`（批次号）去重的发车车次数**，勿与运单条数或其它接口的 `waybillCount` 混读。
