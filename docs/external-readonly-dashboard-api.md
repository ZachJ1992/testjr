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

本批 dashboard 聚合接口为山海鲸数据大屏提供统一聚合口径，前端只取数和渲染，不直接拼底层明细。以下字段口径在首批 8 个接口中保持统一：

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

### 驾驶舱聚合接口（8 个）

1. 经营总览
2. 收益趋势分析
3. 经营趋势总览
4. 合作方贡献 TOP
5. 落地合作方贡献 TOP
6. 收益构成分析
7. 结算进度分析
8. 合作方效率分析

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

## 验数建议清单

以下建议用于首批 8 个 dashboard 聚合接口上线前的人工验数：

1. 先固定一个小时间窗，例如单日、单周，避免直接对全量历史数据做首次核对。
2. 优先选 1 到 2 个合作方、1 个落地合作方、1 条线路做穿透校验，确保维度不混用。
3. 先核对收益类字段，再核对运单数和撮合运费，顺序建议为：`platformIncome` -> `pendingSettlementIncome` / `settledIncome` -> `waybillCount` -> `grossFreightAmount`。
4. 所有趋势接口都建议验证“明细相加是否等于聚合桶结果”，特别是 `day` 与 `week/month` 之间是否可加总对齐。
5. 所有 TOP/散点接口都建议交叉核对同一维度下的 `waybillCount`、`platformIncome` 是否在不同接口中保持一致。
6. `income-structure` 与 `overview`、`settlement-progress` 三者之间，至少要核对一次 `settledIncome` 是否完全相等。
7. `grossFreightAmount` 当前含过渡期兜底逻辑，验数时应优先看 `waybills.receivable_total`，仅在缺失时再检查 `revenue_records.principal_amount`。
8. `effectiveContractCount` 当前只作为辅助观察指标，建议做趋势比对，不建议拿它与平台全局合同总数直接对账。

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
