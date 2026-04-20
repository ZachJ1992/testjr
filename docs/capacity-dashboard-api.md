# 运力中枢大屏 API（Capacity Dashboard）

独立接口组，前缀：`/api/dashboard/capacity/...`  

与「经营中枢」`/api/dashboard/*`（基于 `revenue_records` 抽成事实）**完全解耦**：运力接口**不读取** `revenue_records`，仅以 **`waybills`** 为主事实，并 JOIN `financiers`、`routes`、`local_partners`、`areas` 解析区域与线路。

## 鉴权

与经营大屏一致：请求头携带 `X-API-Key`（见环境变量配置，与 `requireApiKey` 行为一致）。

## 通用查询参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `startDate` | `YYYY-MM-DD` | 可选；与 `endDate` 组成闭区间，过滤**运力业务日** |
| `endDate` | `YYYY-MM-DD` | 可选 |

### 默认时间窗

若 **未传** `startDate` 且 **未传** `endDate`：使用**含服务器「今天」在内共 30 个自然日**（今天往前 29 天 ～ 今天，按服务器本地日历）。  

响应中 `dateScope.usedDefaultDateRange === true` 表示触发了该默认窗。

### 运力业务日（每行运单一条）

单条运单落入窗口的日期定义为（优先级从高到低）：

1. `DATE(departure_time)`（非空非空串时）
2. `DATE(created_time)`
3. `waybill_date`
4. `DATE(created_at)`

实现见 `backend/src/dashboard-capacity-store.ts` 中 `capacityBusinessDayExpr`。

---

## 代理指标与非实时监控声明

| 概念 | 首版口径 | 说明 |
|------|-----------|------|
| 车辆 | `COUNT(DISTINCT vehicle_plate)`，空车牌不计 | **不是**车联网在线车辆数 |
| 网点 | `COUNT(DISTINCT branch)`，空 branch 不计 | **不是**独立网点主数据维表 |
| 专线 / 方向 | 有 `routes.id`（与运单通过 `sub_financier`/`branch` 匹配到线路名）时按 **`route_id` 去重**；否则按 **`发站→到站`** 文本去重 | 文本桶受 TMS 填单质量影响 |
| 覆盖城市 | 标准化后的 `regionName`（见下）去重，**排除**占位城市「未维护区域」 | 未命中省映射时省份可为「未知」，城市仍会计入覆盖城市（若城市名有效） |
| 在途车辆 | **不提供** | 响应中 `inTransitVehicleCount` 恒为 `null`；库内无统一在途枚举与 GPS，避免伪实时 |

**区域标准化**：与经营地图共用 `normalizeDashboardRegionName`（`backend/src/dashboard-region.ts`），输入为合作方展示名 `financiers.enterprise_name` 与 `areas.name`。未命中 `DASHBOARD_CITY_TO_PROVINCE` 时 **`provinceName` 为「未知」**，**不伪造**省份。

---

## 接口列表

### 1. `GET /api/dashboard/capacity/overview`（P0）

**用途**：顶部 KPI。

**响应 `data` 主要字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `dateScope` | `{ startDate, endDate, usedDefaultDateRange }` | 实际统计窗 |
| `coveredCityCount` | number | 见上 |
| `activeVehicleCount` | number | DISTINCT `vehicle_plate` |
| `activeRouteCount` | number | 专线键去重 |
| `activeOutletCount` | number | DISTINCT `branch` |
| `inTransitVehicleCount` | `null` | 首版不支持 |
| `inTransitVehicleAvailability` | `"unsupported_v1"` | 版本标记 |
| `inTransitVehicleNote` | string | 人读说明 |

---

### 2. `GET /api/dashboard/capacity/province-map`（P0）

**用途**：全国省级运力地图。

**固定底表补齐（store 聚合层 merge，非 SQL）**：

- 省级顺序与 `backend/src/dashboard-region-summary-template.ts` 中 `DASHBOARD_REGION_SUMMARY_TEMPLATE` 的**省名去重顺序**一致（与经营地图底表同源清单）。
- 若某省在本时间窗内**无运单**，仍返回该省一行，指标为 `0`。
- 当 `waybillCount === 0` 时：`displayText` 固定为 **`该区域数据持续接入中`**（与经营地图零数据兜底句一致）。
- `isFallback === true` 表示该行**仅由底表补齐**且本窗 `waybillCount === 0`；有真实运单或该省不在底表顺序中（如「未知」）则为 `false`。

**响应 `data`**：

| 字段 | 说明 |
|------|------|
| `usedFixedProvinceTemplate` | 固定为 `true`（本接口始终做底表合并） |
| `items[]` | 见下 |

**`items[]` 字段**：

| 字段 | 说明 |
|------|------|
| `provinceName` | 含「未知」等数据溢出省 |
| `waybillCount` | 本窗内落入该省的运单行数；为 `0` 时用接入中文案 |
| `activeVehicleCount` / `activeRouteCount` / `activeOutletCount` / `coveredCityCount` | 省桶内 DISTINCT 口径同上 |
| `displayText` | 有运单：`{省}｜活跃车辆…`；无运单：`该区域数据持续接入中` |
| `isFallback` | 是否纯底表零数据行（见上） |

---

### 3. `GET /api/dashboard/capacity/city-heat`（P0）

**用途**：城市运力热度。

**响应 `data.items[]`**：

| 字段 | 说明 |
|------|------|
| `cityName` | 标准化后的 `regionName` |
| `provinceName` | 标准化省份 |
| `activeVehicleCount` / `activeOutletCount` / `activeRouteCount` | 城市桶内 DISTINCT |

---

### 4. 省际飞线（`province-flow` 族，P0）

与 `province-map`（省级点/面聚合）**职责分离**：本族接口只描述**省与省之间的边**，不混入省级汇总行。

**为何曾返回三组数组、又拆出子接口**

- 飞线组件**不能**按数据字段动态控制线宽/速度；粗细、颜色、飞行速度需在组件上**手工配置**。后端按运单量**固定 Top 分层**得到核心 / 重点 / 常规三档。
- 部分山海鲸版本在**一个数据源里解析多组并列数组**（`coreFlows` + `importantFlows` + `normalFlows`）时会出现展示异常或不显示；因此除**总接口**外，再提供 **3 个独立 URL**，每层只消费 **`data.items[]`**，结构稳定。

**聚合逻辑**：总接口与子接口共用同一套 store 计算（`queryCapacityWaybillFacts` → `aggregateCapacityProvinceFlow`），子接口仅在输出层用 `buildCapacityProvinceFlowLayerResponse` 拆出单层，**不复制三份聚合代码**。

---

#### 4.1 `GET /api/dashboard/capacity/province-flow`（总览 / 调试）

**用途**：一次返回三组飞线，便于调试、全量排查、对照 `coreFlows` / `importantFlows` / `normalFlows` 结构。

**查询参数**：与通用节一致，仅 `startDate` / `endDate`（可选）；默认时间窗与其它运力接口相同（未传两端日期 → 含今日共 30 自然日）。**子接口（§4.2～4.4）** 使用相同查询参数。

**响应 `data`**：`dateScope`、`coreFlows[]`、`importantFlows[]`、`normalFlows[]`（单条飞线结构见下文「飞线单条字段」）。

**零数据**：三组均可为 `[]`，HTTP 200、`code: 0`。

---

#### 4.2 `GET /api/dashboard/capacity/province-flow-core`（山海鲸·核心干线层）

**用途**：飞线层 1 专用；响应中 **`data.items` 与总接口 `data.coreFlows` 元素与顺序一致**（实现上对同一聚合结果直接取 `coreFlows` 分支，不重复聚合、不拷贝 leg 对象）。

| 字段 | 值 |
|------|-----|
| `flowType` | `"core"` |
| `flowTypeName` | `核心干线` |
| `dateScope` | 同总接口 |
| `items` | 同总接口 `coreFlows` |

---

#### 4.3 `GET /api/dashboard/capacity/province-flow-important`（山海鲸·重点干线层）

| 字段 | 值 |
|------|-----|
| `flowType` | `"important"` |
| `flowTypeName` | `重点干线` |
| `items` | 同总接口 `importantFlows` |

---

#### 4.4 `GET /api/dashboard/capacity/province-flow-normal`（山海鲸·常规干线层）

| 字段 | 值 |
|------|-----|
| `flowType` | `"normal"` |
| `flowTypeName` | `常规干线` |
| `items` | 同总接口 `normalFlows` |

**山海鲸推荐绑定（生产）**

| 飞线层 | 请求 URL | 数据路径 | 样式（仍须手工） |
|--------|-----------|-----------|------------------|
| 核心干线 | `/api/dashboard/capacity/province-flow-core` | `data.items` | 最粗、高对比色等 |
| 重点干线 | `/api/dashboard/capacity/province-flow-important` | `data.items` | 中等 |
| 常规干线 | `/api/dashboard/capacity/province-flow-normal` | `data.items` | 最细、弱化 |

总接口 `province-flow` 建议保留给开发/联调；大屏图层请优先绑定上表三个子接口。

**子接口零数据**：`items: []`，其余字段照常；HTTP 200、`code: 0`。

---

#### 4.5 分组与排序（总接口与子接口共用）

**分组规则（按 `waybillCount` 降序后的名次）**

| 字段 | 名次区间（含） | 最多条数 |
|------|----------------|----------|
| `coreFlows` | Top 1～5 | 5 |
| `importantFlows` | Top 6～15 | 10 |
| `normalFlows` | Top 16～30 | 15 |

第 31 名及以后的省际方向**不返回**（避免单层数据过多）。同运单量时按**内部省名简称**的 `from`→`to` 字典序稳定排序（与响应里 `lineLabel` 的简称一致）；**不**按标准全称排序，避免与简称分层习惯不一致。

**数据来源与过滤**

- 方向来自运单字段 **`departure_place`**、**`arrival_place`**（与 `vehicle-monitor` 城市清洗同源：`normalizePlaceToDisplayCity` 子串匹配 `DASHBOARD_CITY_TO_PROVINCE` 城市键）。
- **仅跨省**：`fromProvince !== toProvince`。
- **任一端省份为「未知」** 的方向**丢弃**：映射失败时不伪造省份，且无法在省级底图上稳定落点；与「静默错连」相比，宁可不展示该边。
- **不是**车辆 GPS 轨迹、不是全量线路铺开；指标为时间窗内该省际方向的**运单行数**与 **DISTINCT `vehicle_plate`**（空车牌不计）。

**总接口 `data` 字段**：`dateScope`、`coreFlows[]`、`importantFlows[]`、`normalFlows[]`。

**子接口 `data` 字段**：`flowType`、`flowTypeName`、`dateScope`、`items[]`（`items` 中单条与总接口三组内单条**字段与语义完全一致**）。

**飞线单条字段**（`coreFlows` / `importantFlows` / `normalFlows` / `items` 元素相同）

| 字段 | 说明 |
|------|------|
| `fromProvince` / `toProvince` | 出发 / 到达省：**中国省级行政区标准全称**（如 `四川省`、`重庆市`、`新疆维吾尔自治区`），由内部简称经 `DASHBOARD_PROVINCE_SHORT_TO_OFFICIAL_FULL_NAME`（`backend/src/dashboard-region.ts`）转换，便于山海鲸与地图底图行政区名称对齐 |
| `fromCity` / `toCity` | 出发 / 到达展示城市；无法稳定提取时为空串 |
| `lineLabel` | 建议 tooltip；仍为**省名简称 + 箭头**（如 `四川 → 重庆`），与上两列全称区分、便于阅读；**不要求**与 `fromProvince`/`toProvince` 字符串一致 |
| `waybillCount` | 该省际方向桶内运单行数 |
| `activeVehicleCount` | 该桶内 DISTINCT 车牌（`TRIM` 后非空），与 overview 口径一致 |

**简称 → 全称未命中时的兜底**（不静默伪造「某某省」）：

- 空简称：`未映射省份（空简称）`
- 简称为 `未知`：`未映射省份（未知）`（本接口聚合已丢弃「未知」省际边，此为防御性分支）
- 其它未在表中的简称：`未映射省份（{原文}）` —— 需在 `dashboard-region.ts` 中补充映射

**`lineLabel` 不随全称同步改写**：仅 `fromProvince`、`toProvince` 使用全称。

**桶内 `fromCity` / `toCity` 取值**：同一省际方向上，取时间窗内出现次数最多的「发站展示城市 + 到站展示城市」组合；并列时取组合键字典序较小者，保证稳定。

**返回示例：总接口（节选）**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "dateScope": {
      "startDate": "2026-04-01",
      "endDate": "2026-04-17",
      "usedDefaultDateRange": false
    },
    "coreFlows": [
      {
        "fromProvince": "山东省",
        "toProvince": "新疆维吾尔自治区",
        "fromCity": "济南",
        "toCity": "乌鲁木齐",
        "lineLabel": "山东 → 新疆",
        "waybillCount": 186,
        "activeVehicleCount": 42
      }
    ],
    "importantFlows": [],
    "normalFlows": []
  }
}
```

（示例中城市名依赖 TMS 文本能否命中映射表；未命中时对应省为「未知」且该边不会进入本接口。）

**返回示例子接口（`province-flow-core`，节选）**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "flowType": "core",
    "flowTypeName": "核心干线",
    "dateScope": {
      "startDate": "2026-04-01",
      "endDate": "2026-04-17",
      "usedDefaultDateRange": false
    },
    "items": [
      {
        "fromProvince": "山东省",
        "toProvince": "广东省",
        "fromCity": "济南",
        "toCity": "广州",
        "lineLabel": "山东 → 广东",
        "waybillCount": 71,
        "activeVehicleCount": 30
      }
    ]
  }
}
```

---

### 5. `GET /api/dashboard/capacity/route-top`（P1）

**用途**：重点线路 / 方向 TOP。

**查询参数**：`limit` 可选，默认 `20`，最大 `100`。

**响应 `data.items[]`**：

| 字段 | 说明 |
|------|------|
| `routeDirectionName` | 有 `route_id` 时为 `routes.name`；无名为 `route:{id}`；无 id 时为 `发站→到站` |
| `waybillCount` | **运单条数**（非任务表 dispatch） |
| `activeVehicleCount` | 该桶内 DISTINCT 车牌 |

---

### 6. `GET /api/dashboard/capacity/region-detail`（P1）

**用途**：区域详情卡（山海鲸联动：筛选与「当前选中」由前端完成，后端只返回列表）。

**查询参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `provinceName` | **否** | 与地图标准化结果一致，如 `四川`；**不传**则返回多省列表 |
| `regionName` | 否 | 若传则为**市**级桶（如 `成都`）；需同时传 `provinceName` |
| `topLimit` | 否 | 每条详情内 `topRouteDirections` 条数，默认 `8`，最大 `50` |

**响应 `data`**（**统一**为下列结构，不再返回单对象）：

| 字段 | 说明 |
|------|------|
| `dateScope` | 同其它接口 |
| `items[]` | 区域详情条目列表 |

**`items[]` 每条字段**：

| 字段 | 说明 |
|------|------|
| `regionLevel` | `"province"` \| `"city"` |
| `regionName` | 市模式为城市名；省模式为省名 |
| `provinceName` | 省名 |
| `waybillCount` | **代理**：当前区域子集内**运单行数**（与 `province-map` 的 `waybillCount` 计数一致）；含空车牌/空 `branch` 的运单仍计入 |
| `activeVehicleCount` / `activeOutletCount` / `activeRouteCount` | 子集内 DISTINCT（车辆、网点口径同文档首段「代理指标」） |
| `avgWaybillsPerVehicle` | **代理（大屏）**：`waybillCount === 0` 或 `activeVehicleCount === 0` 时为 **`0`**；否则为 `waybillCount / activeVehicleCount`，商**保留 1 位小数**（不返回 `null`） |
| `avgWaybillsPerOutlet` | **代理（大屏）**：`waybillCount === 0` 或 `activeOutletCount === 0` 时为 **`0`**；否则为商**保留 1 位小数** |
| `coveredCityCount` | 省模式 = 子集内覆盖城市数；市模式有数据则为 `1` |
| `topRouteDirections` | `{ routeDirectionName, waybillCount, activeVehicleCount }[]`（线路桶内条数，**不等于**本条 `waybillCount`） |

**行为摘要**：

- **不传 `provinceName`**：`items` 为**多元素**数组——顺序为「底表省序」∪「数据中出现的其它省（字典序）」；每个元素为该省**全省聚合**一条（`regionLevel: "province"`）。
- **传 `provinceName`，不传 `regionName`**：`items` 长度 **1**，为该省全省聚合。
- **传 `provinceName` + `regionName`**：`items` 长度 **1**，为该省该市桶。

**与轮播接口对齐的「未知」省桶**：多省列表模式下，`items` **不包含** `provinceName === "未知"` 的条目（与 `normalizeDashboardRegionName` 溢出桶一致）。显式传 `provinceName=未知` 时仍返回该省一条（用于排查数据）；`province-map` 等接口仍可按产品需要保留「未知」行。

**`items[]` 单条示例（字段节选）**：

```json
{
  "regionName": "四川",
  "regionLevel": "province",
  "provinceName": "四川",
  "waybillCount": 120,
  "activeVehicleCount": 15,
  "activeOutletCount": 4,
  "avgWaybillsPerVehicle": 8,
  "avgWaybillsPerOutlet": 30,
  "coveredCityCount": 3,
  "activeRouteCount": 5,
  "topRouteDirections": []
}
```

`waybillCount === 0` 或对应分母为 0 时：`avgWaybillsPerVehicle` / `avgWaybillsPerOutlet` 均为数字 **`0`**（便于大屏直接展示，无 `null`）。

**零运单 / 无法作商时示例**：

```json
{
  "regionName": "吉林",
  "regionLevel": "province",
  "provinceName": "吉林",
  "waybillCount": 0,
  "activeVehicleCount": 0,
  "activeOutletCount": 0,
  "avgWaybillsPerVehicle": 0,
  "avgWaybillsPerOutlet": 0,
  "coveredCityCount": 0,
  "activeRouteCount": 0,
  "topRouteDirections": []
}
```

---

### 7. `GET /api/dashboard/capacity/region-detail-current`（P1）

**用途**：山海鲸等指标卡组件**不会自动轮播数组**时，由大屏按**与接口一致的轮播周期**（默认 **5 秒**，可改）定时请求本接口，只取**当前应展示的一条**区域详情，实现与 `region-detail` 多省列表同序的「伪轮播」。

**查询参数**：

| 参数 | 必填 | 说明 |
|------|------|------|
| `startDate` / `endDate` / `provinceName` / `regionName` / `topLimit` | 否 | 与「6. `region-detail`」相同 |
| `rotationIntervalSeconds` | 否 | 轮播周期（**秒**）。**不传**时默认 **`5`**。非数字、空串、`<= 0`、非有限数时**回落为 `5`**；合法正数先 `Math.floor` 再限制在 **`[1, 600]`** 秒内（含边界），超出上下限则**夹取**到 `1` 或 `600` |

**轮播规则（服务端无状态）**：

1. 每次请求基于**最新**运单聚合结果，先得到与 `region-detail` **相同**的 `items[]` 列表（相同筛选参数下）。
2. 在取模前**过滤** `provinceName === "未知"` 的条目（不参与轮播索引）。
3. 设过滤后长度为 `n`，当前毫秒时间戳为 `t`，**生效**周期为 `R` 秒（见上规范化）：  
   `currentIndex = floor(t / (R * 1000)) % n`（`n > 0` 时），取该下标对应元素作为 `item`。  
   多终端、多大屏在**同一时刻**且**同一 `R`** 下请求会得到**同一**下标；不保存客户端游标。

**响应 `data` 字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `rotationIntervalSeconds` | number | **最终生效**的轮播周期（秒），与上式中的 `R` 一致（非原始 query 未校验前的值） |
| `currentIndex` | number | 当前轮播下标（从 `0` 起）；无可用项时为 `-1` |
| `totalItems` | number | 过滤「未知」后的可轮播条数 |
| `item` | object \| `null` | 与 `region-detail` 的 `items[]` **单条**结构一致（含 `waybillCount`、`avgWaybillsPerVehicle`、`avgWaybillsPerOutlet`）；无可用项时为 `null` |

**无可用轮播项时**（过滤后 `n === 0`，例如仅有「未知」省桶、或显式筛选导致无可展示项）：HTTP 200，业务仍成功；`rotationIntervalSeconds` 仍为**规范化后的生效值**（默认场景为 `5`）：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "rotationIntervalSeconds": 5,
    "currentIndex": -1,
    "totalItems": 0,
    "item": null
  }
}
```

**联调示例**：

```bash
# 默认 5 秒周期
curl -s -H "X-API-Key: $API_KEY" \
  "http://127.0.0.1:3001/api/dashboard/capacity/region-detail-current"

# 自定义 8 秒周期（非法值会回落/夹取，响应中的 rotationIntervalSeconds 为生效值）
curl -s -H "X-API-Key: $API_KEY" \
  "http://127.0.0.1:3001/api/dashboard/capacity/region-detail-current?rotationIntervalSeconds=8"
```

---

### 8. `GET /api/dashboard/capacity/trend`（P2）

**用途**：运力趋势（按业务日）。

**响应 `data.items[]`**：

| 字段 | 说明 |
|------|------|
| `date` | `YYYY-MM-DD` |
| `activeVehicleCount` | 当日内 DISTINCT 车牌 |
| `inTransitVehicleCount` | **恒 `null`** |
| `inTransitVehicleNote` | 说明文字 |
| `activeRouteCount` | 当日内 DISTINCT 专线键（**补充观察指标，非在途替代真值**） |

---

### 9. `GET /api/dashboard/capacity/vehicle-monitor`（P2，降级）

**用途**：**运单 / 运输动态列表**，用于大屏「动态卡片」。  

**不是** GPS 实时监控：响应**不包含** `currentLocation`、`speed`、`eta`、车联网含义的 `lastReportTime`。

**查询参数**：`limit` 可选，默认 `50`，最大 `200`。

**默认过滤空车牌（SQL）**：仅返回 `vehicle_plate IS NOT NULL AND TRIM(vehicle_plate) <> ''` 的运单，避免无车牌占位行污染列表。

**起终点城市（启发式）**：

- 基于 `departure_place` / `arrival_place`，在 `DASHBOARD_CITY_TO_PROVINCE` 的**城市键**上按长度降序做**子串包含**匹配；命中则 `originCity` / `destinationCity` 为标准城市名，`originNormalization` / `destinationNormalization` 为 `known_city_substring`。
- **未命中则不伪造**：`originCity` / `destinationCity` 与原文相同，`…Normalization` 为 `raw_fallback`。
- **稳定性说明**：子串规则可能误匹配（如路名含「南京」）；展示层应以清洗字段为主，排查可对照 `originRaw` / `destinationRaw`。

**响应 `data`**：

| 字段 | 说明 |
|------|------|
| `mode` | 固定 `"waybill_activity_list"` |
| `modeNote` | 人读说明 |
| `items[]` | 列表 |
| `items[].plateNumber` | 车牌 |
| `items[].status` | 优先 `batch_status`，否则 `status`，否则 `dispatch_status` |
| `items[].taskName` | `project_name` 优先，否则 `waybill_number` |
| `items[].originCity` / `destinationCity` | 清洗后展示城市（见上） |
| `items[].originRaw` / `destinationRaw` | TMS 原始发/到站文本 |
| `items[].originNormalization` / `destinationNormalization` | `known_city_substring` \| `raw_fallback` |
| `items[].lastBusinessTime` | `created_at` / `updated_at` / `departure_time` / `created_time` 的最大值（ISO）；不含 `dest_arrival_time` 列以降低旧库缺列风险 |

**排序**：按上述时间最大值倒序。

---

## 响应包装

与现有大屏一致：

```json
{
  "code": 0,
  "message": "success",
  "data": { }
}
```

错误时 HTTP 状态码与 `code` 以全局 `handleError` 行为为准。

---

## 测试方式

```bash
cd backend
npm run build
node --test dist/backend/src/dashboard-capacity-store.test.js
```

（测试为纯聚合逻辑 + 默认窗，不依赖数据库。）

联调示例（需有效 API Key）：

```bash
curl -s -H "X-API-Key: $API_KEY" \
  "http://127.0.0.1:3001/api/dashboard/capacity/overview?startDate=2026-04-01&endDate=2026-04-17"

curl -s -H "X-API-Key: $API_KEY" \
  "http://127.0.0.1:3001/api/dashboard/capacity/province-flow?startDate=2026-04-01&endDate=2026-04-17"

curl -s -H "X-API-Key: $API_KEY" \
  "http://127.0.0.1:3001/api/dashboard/capacity/province-flow-core?startDate=2026-04-01&endDate=2026-04-17"

curl -s -H "X-API-Key: $API_KEY" \
  "http://127.0.0.1:3001/api/dashboard/capacity/province-flow-important?startDate=2026-04-01&endDate=2026-04-17"

curl -s -H "X-API-Key: $API_KEY" \
  "http://127.0.0.1:3001/api/dashboard/capacity/province-flow-normal?startDate=2026-04-01&endDate=2026-04-17"
```

---

## 代码入口

| 文件 | 职责 |
|------|------|
| `backend/src/dashboard-capacity-store.ts` | SQL、聚合、口径注释 |
| `backend/src/dashboard-capacity-routes.ts` | 路由注册 |
| `backend/src/index.ts` | `app.use("/api", capacityDashboardRoutes)` |
