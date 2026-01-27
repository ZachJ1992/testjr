# 登途云开发日志

> 本文档记录每次功能开发的设计逻辑、实现细节和关键决策，帮助保持项目全局认知。

---

## 2026-01-26: 平台收益看板业务指标数据源优化

### 问题

平台收益看板中的"有效合同"、"合作伙伴"、"运营数据"显示与实际不符。

### 原因分析

| 指标 | 原查询问题 |
|-----|----------|
| 有效合同 | 未排除软删除记录，且未统计 commission_contracts 表 |
| 本期新增 | 未排除软删除记录，且未统计 commission_contracts 表 |
| 资金方数量 | 统计的是 funders 表总数，而非活跃合作方 |
| 融资方数量 | 统计的是 financiers 表总数，而非活跃合作方 |
| 运单数 | 未排除软删除记录 (`deleted_at IS NULL`) |

### 修复方案

**`backend/src/revenue-store.ts`**：

1. **有效合同数**：统计 `contracts` 表 + `commission_contracts` 表的有效合同总和
2. **本期新增合同**：统计两个表的新增合同总和
3. **活跃资金方**：改为统计有效合同中 `DISTINCT funder_id`
4. **活跃融资方**：改为统计有效合同中 `DISTINCT logistics_provider_id`
5. **运单数**：添加 `deleted_at IS NULL` 条件，与运单管理页面保持一致

### 修改后的查询逻辑

```sql
-- 有效合同数（四种类型总和）
SELECT COUNT(*) FROM contracts WHERE status = 'active' AND deleted_at IS NULL
+
SELECT COUNT(*) FROM commission_contracts WHERE status = 'active'

-- 活跃资金方（在有效合同中出现过）
SELECT COUNT(DISTINCT funder_id) FROM contracts 
WHERE status = 'active' AND deleted_at IS NULL AND funder_id IS NOT NULL

-- 活跃融资方（在有效合同中出现过）
SELECT COUNT(DISTINCT logistics_provider_id) FROM contracts 
WHERE status = 'active' AND deleted_at IS NULL AND logistics_provider_id IS NOT NULL

-- 运单数（与运单管理页面一致）
SELECT COUNT(*) FROM waybills 
WHERE waybill_date BETWEEN ? AND ? AND deleted_at IS NULL
```

---

## 2026-01-26: 三方融资合同利润分配配置

### 需求

新建三方融资合同第三步（利润分配规则配置）需要改进：
1. 利润分配规则改为可配置 - 是否启用分润、分润比例
2. 分润示例根据配置动态显示

### 实现方案

#### 后端修改

**`backend/src/store.ts` - `createFinancingContract` 函数**：
- 新增参数：`profitSharingEnabled?: boolean`、`profitSharingRatio?: number`
- 写入数据库字段：`sharing_mode`（percentage/null）、`profit_sharing_ratio`

**`backend/src/routes.ts` - `/contracts/financing` 路由**：
- 接收新参数并传递给 store 函数

#### 前端修改

**`frontend/src/pages/CreateFinancingContract.tsx`**：

1. **表单字段扩展**：
   - `profitSharingEnabled: boolean` - 是否启用利润分配
   - `profitSharingRatio: number` - 分成比例 (0-100)

2. **UI 组件**：
   - 添加"启用利润分配"开关
   - 条件渲染"分成比例"输入框（仅在启用时显示）
   - 动态分润示例：根据用户输入实时计算显示

3. **分润示例逻辑**：
   ```
   结算利润 = 业务总利润(100,000) - 资金利息(10,000) = 90,000
   平台分成 = 结算利润 × 分成比例
   合作方分成 = 结算利润 - 平台分成
   ```

**`frontend/src/pages/Contracts.tsx` - 列表显示**：
- 更新分润规则列，根据 `sharingMode` 显示不同内容：
  - `percentage`：显示 "X%净利润分成"
  - `fixed`：显示 "固定 ¥X"
  - 未配置：显示 "无分润"

### 数据库字段映射

| 前端字段 | 后端存储 | 说明 |
|---------|---------|------|
| `profitSharingEnabled=true` | `sharing_mode='percentage'` | 按比例分成 |
| `profitSharingEnabled=false` | `sharing_mode=null` | 不分成 |
| `profitSharingRatio` | `profit_sharing_ratio` | 分成比例 (%) |

---

## 2026-01-26: 合同管理功能补全

### 修复背景

各合同类型页面功能一致性问题：
- 抽成合同页面存在 `id.startsWith("cc-")` 条件限制，导致部分合同无法编辑/删除/启用停用
- 撮合业务合同操作列缺少启用/停用按钮
- 部分页面 `refresh()` 调用未使用 `await`

### 修复内容

#### 1. 抽成合同 (`frontend/src/pages/NewContracts.tsx`)

| 位置 | 修复前 | 修复后 |
|------|--------|--------|
| 第 448 行 | `disabled={!record.id.startsWith("cc-")}` | 移除 disabled 属性 |
| 第 467 行 | `{record.id.startsWith("cc-") && (...)}` | 移除条件包装 |
| 第 638 行 | `{viewingContract.id.startsWith("cc-") && (...)}` | 移除条件包装 |

**效果**：所有抽成合同现在都可以编辑、删除、启用/停用。

#### 2. 撮合业务合同 (`frontend/src/pages/BrokerageContracts.tsx`)

**修改要点**：
- 操作列宽度从 200px 增加到 240px
- 在"查看"按钮后添加"启用/停用"按钮
- 按钮颜色根据状态变化：启用(绿色 #52c41a)、停用(橙色 #faad14)

```tsx
<Button
  type="link"
  size="small"
  style={{ color: record.status === "disabled" ? "#52c41a" : "#faad14" }}
  onClick={() => handleToggleStatus(record)}
>
  {record.status === "disabled" ? "启用" : "停用"}
</Button>
```

#### 3. 异步刷新修复

**BrokerageContracts.tsx - handleEditSubmit**：
```tsx
// 修复前
refresh();

// 修复后
await refresh();
```

### 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/pages/NewContracts.tsx` | 修改 | 移除 3 处条件限制 |
| `frontend/src/pages/BrokerageContracts.tsx` | 修改 | 添加启用/停用按钮，修复 await |

### 功能一致性对照

修复后各合同页面功能：

| 功能 | 三方融资 | 撮合业务 | 抽成合同 | 定向支付 |
|------|:-------:|:-------:|:-------:|:-------:|
| 查看 | ✅ | ✅ | ✅ | ✅ |
| 编辑 | ✅ | ✅ | ✅ | ✅ |
| 删除 | ✅ | ✅ | ✅ | ✅ |
| 启用/停用 | ✅ | ✅ | ✅ | 状态流转 |
| await refresh | ✅ | ✅ | ✅ | ✅ |

---

## 2026-01-26: 三方融资合同 UI 优化

### 开发背景

根据产品需求，优化三方融资合同模块的用户体验：
- 修复合同详情弹窗的排版错位问题（日期显示带时区）
- 在合同列表中添加放款/还款快捷操作按钮

### 已完成功能

#### 1. 放款弹窗组件 (`frontend/src/components/DisbursementModal.tsx`)

**设计思路**：
- 独立的 Modal 组件，可从合同列表直接触发
- 显示可用额度信息，提供快速放款入口
- 支持金额校验，不能超过可用额度

**核心功能**：
- 显示可用额度 / 总额度
- 放款金额输入（带校验）
- 放款日期选择（默认今日）
- 备注输入
- 提交成功后自动刷新列表

#### 2. 还款弹窗组件 (`frontend/src/components/RepaymentModal.tsx`)

**设计思路**：
- 支持三种还款模式：仅还本金、仅还利息、本息一起还
- 显示待还本金和利息金额
- 灵活的表单校验

**核心功能**：
- 待还信息展示（本金/利息）
- 还款类型选择
- 动态表单字段显示
- 金额校验（不超过待还金额）
- 还款日期选择

#### 3. 合同列表操作列增强

**修改要点**：
- 操作列宽度从 200px 增加到 280px
- 新增"放款"按钮（绿色 #52c41a）
- 新增"还款"按钮（橙色 #faad14）
- 按钮顺序：查看 → 放款 → 还款 → 编辑 → 删除

#### 4. 日期格式修复

**修改要点**：
- 合同详情弹窗中的日期从 `2026-01-12T16:00:00.000Z` 格式改为 `2026-01-12` 格式
- 使用 `dayjs(date).format('YYYY-MM-DD')` 进行格式化

### 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/DisbursementModal.tsx` | 新建 | 放款弹窗组件 |
| `frontend/src/components/RepaymentModal.tsx` | 新建 | 还款弹窗组件 |
| `frontend/src/pages/Contracts.tsx` | 修改 | 添加放款/还款按钮、弹窗集成、日期格式修复 |

### 验收检查

- [x] 新建了 `DisbursementModal.tsx` 组件
- [x] 新建了 `RepaymentModal.tsx` 组件
- [x] 合同列表中显示"放款"和"还款"按钮
- [x] 点击"放款"弹出放款弹窗
- [x] 点击"还款"弹出还款弹窗
- [x] 操作成功后列表自动刷新
- [x] 详情弹窗中日期显示为 `YYYY-MM-DD` 格式

---

## 2026-01-25: 抽成合同与结算中心完善

### 开发背景

根据 `ARCHITECT_AGENT_PROMPT.md` 中的开发状态分析：
- **抽成合同**：⚠️ 待完善 - 费用抽取逻辑
- **结算中心**：⚠️ 部分完成 - 账单生成、利息计算

### 已完成功能

#### 1. 抽成计算逻辑 (`backend/src/commission-calculation.ts`)

**设计思路**：
- 根据抽成合同配置，从运单数据中提取对应字段金额
- 支持两种计算模式：百分比抽成 和 固定金额抽成
- 提供周期汇总计算，生成结算所需数据

**核心函数**：
```typescript
// 计算单个运单的抽成
calculateWaybillCommission(waybillId, commissionConfig)

// 计算合同周期内的抽成汇总
calculateCommissionForContract(contractId, periodStart, periodEnd)

// 判断是否到结算日
isSettlementDay(today, settlementCycle, settlementDay)

// 计算结算周期起始日期
calculatePeriodStart(periodEnd, settlementCycle)
```

**运单字段映射**：
```typescript
const WAYBILL_FIELD_MAP = {
  freight: "freight_amount",      // 运费
  waybillFee: "waybill_fee",      // 面单费
  trunkLineFee: "trunk_line_fee", // 干线费
  pickupFee: "pickup_fee",        // 提货费
  deliveryFee: "delivery_fee",    // 送货费
  receiptFee: "receipt_fee",      // 回单费
  ...
};
```

#### 2. 结算调度器 (`backend/src/settlement-scheduler.ts`)

**设计思路**：
- 每日凌晨2点自动执行结算任务
- 统一管理所有类型的结算生成
- 支持手动触发（用于测试和紧急处理）

**任务执行顺序**：
1. `runDailyInterestCalculation()` - 每日利息计算（融资合同）
2. `runOverdueCheck()` - 逾期状态更新
3. `runCommissionSettlement()` - 抽成合同结算
4. `runDirectedPaySettlement()` - 定向支付结算
5. `runFinancingRepaymentSettlement()` - 融资还款结算

**融资还款与利息台账集成**：
- 从 `contract_interest_accruals` 表汇总待结算利息
- 生成 `financing_repayment` 类型结算单
- 应还日期 = 结算日 + 15天宽限期

**API 端点**：
- `POST /api/settlements/trigger-scheduler` - 手动触发结算任务

#### 3. 结算中心仪表板 (`frontend/src/pages/SettlementDashboard.tsx`)

**设计思路**：
- 提供所有结算类型的统一视图
- 汇总显示待处理、逾期、已结算金额
- 分类展示不同业务的结算状态

**页面结构**：
```
┌─────────────────────────────────────────────────────────┐
│ 结算中心仪表板                              [刷新数据]   │
├─────────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│ │待处理金额│ │ 逾期金额 │ │已结算金额│ │结算完成率│    │
│ │ ¥xxx    │ │ ¥xxx    │ │ ¥xxx    │ │  xx%    │    │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘    │
├─────────────────────────────────────────────────────────┤
│ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐  │
│ │ 融资还款结算  │ │ 定向支付结算  │ │ 抽成/分润结算 │  │
│ └───────────────┘ └───────────────┘ └───────────────┘  │
├─────────────────────────────────────────────────────────┤
│ 待处理结算单                                            │
│ ┌─────────────────────────────────────────────────────┐│
│ │ [融资/抽成/分润] [定向支付]                          ││
│ │ 结算单列表...                                        ││
│ └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/commission-calculation.ts` | 新建 | 抽成计算逻辑 |
| `backend/src/settlement-scheduler.ts` | 新建 | 结算调度器 |
| `backend/src/routes.ts` | 修改 | 添加调度器API |
| `backend/src/index.ts` | 修改 | 启动时注册调度器 |
| `frontend/src/pages/SettlementDashboard.tsx` | 新建 | 结算仪表板页面 |
| `frontend/src/layouts/AppLayout.tsx` | 修改 | 添加菜单和Tab配置 |
| `frontend/src/App.tsx` | 修改 | 添加路由 |

### 数据流说明

```
[抽成合同配置] ──┐
                ├──▶ [抽成计算] ──▶ [结算单生成]
[运单数据] ─────┘

[融资合同] ──┐
             ├──▶ [每日计息] ──▶ [利息台账] ──▶ [融资结算单]
[放款记录] ──┘

[定向支付] ──▶ [支付记录] ──▶ [定向支付结算单]
```

---

## 模板：新功能开发记录

### [日期]: [功能名称]

#### 开发背景
- 需求来源
- 现有问题

#### 设计思路
- 技术方案
- 关键决策

#### 核心实现
- 主要函数/组件
- 数据结构

#### 文件变更
- 新建文件
- 修改文件

#### 测试要点
- 测试场景
- 验证方法

#### 待优化项
- 已知问题
- 后续计划
