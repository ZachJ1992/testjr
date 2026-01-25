# Task: 收益系统后端开发

## 任务概述

| 项目 | 说明 |
|------|------|
| 负责Agent | Agent-Backend |
| 任务类型 | 后端开发 |
| 优先级 | 高 |
| 预估工时 | 4-6小时 |

## 业务背景

系统需要一个收益/支出管理模块，用于：
- 平台查看所有收益汇总和明细
- 资金方查看自己的利息收益
- 融资方查看自己的支出明细

收益来源包括：
1. **三方融资合同利息** - 资金方提供融资，按日计息
2. **定向支付利息** - 资金方垫付费用，按日计息
3. **撮合业务抽成** - 平台从运费中抽成
4. **抽成合同费用** - 平台从指定费用中抽成

---

## 任务清单

### 1. 数据库表创建

在 `backend/src/migrations/` 创建迁移文件 `revenue-tables.ts`：

```sql
-- 收益/支出记录表
CREATE TABLE IF NOT EXISTS revenue_records (
  id VARCHAR(255) PRIMARY KEY,
  
  -- 记录类型：收益 or 支出
  record_type ENUM('revenue', 'expense') NOT NULL,
  
  -- 收益/支出归属方
  beneficiary_type ENUM('platform', 'funder', 'financier') NOT NULL,
  beneficiary_id VARCHAR(255),  -- 资金方ID或融资方ID
  
  -- 收益来源类型
  source_type ENUM(
    'financing_interest',      -- 三方融资利息
    'directed_pay_interest',   -- 定向支付利息  
    'brokerage_commission',    -- 撮合业务抽成
    'commission_fee'           -- 抽成合同费用
  ) NOT NULL,
  
  -- 关联合同信息
  contract_id VARCHAR(255) NOT NULL,
  contract_number VARCHAR(255),
  contract_type VARCHAR(50),
  
  -- 资金方信息
  funder_id VARCHAR(255),
  funder_name VARCHAR(255),
  
  -- 融资方信息
  financier_id VARCHAR(255),
  financier_name VARCHAR(255),
  
  -- 金额信息
  amount DECIMAL(15,2) NOT NULL,           -- 收益/支出金额
  principal_amount DECIMAL(15,2),          -- 本金(计息用)
  rate DECIMAL(10,6),                      -- 年化利率/费率
  
  -- 收益日期
  revenue_date DATE NOT NULL,
  
  -- 状态
  status ENUM('pending', 'confirmed', 'settled') DEFAULT 'pending',
  -- pending: 预估/待确认 (未还款/未结算)
  -- confirmed: 已确认 (已还款/已结算)
  -- settled: 已结算到账
  
  -- 关联单据
  settlement_id VARCHAR(255),              -- 关联结算单
  payment_request_id VARCHAR(255),         -- 关联支付申请(定向支付)
  waybill_id VARCHAR(255),                 -- 关联运单(抽成类)
  
  remark TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- 索引
  INDEX idx_record_type (record_type),
  INDEX idx_beneficiary (beneficiary_type, beneficiary_id),
  INDEX idx_date (revenue_date),
  INDEX idx_source (source_type),
  INDEX idx_status (status),
  INDEX idx_contract (contract_id),
  INDEX idx_funder (funder_id),
  INDEX idx_financier (financier_id)
);
```

### 2. 类型定义

在 `backend/src/types.ts` 添加：

```typescript
// 收益记录类型
export type RevenueRecordType = 'revenue' | 'expense';

// 收益来源类型
export type RevenueSourceType = 
  | 'financing_interest'      // 三方融资利息
  | 'directed_pay_interest'   // 定向支付利息
  | 'brokerage_commission'    // 撮合业务抽成
  | 'commission_fee';         // 抽成合同费用

// 收益状态
export type RevenueStatus = 'pending' | 'confirmed' | 'settled';

// 受益方类型
export type BeneficiaryType = 'platform' | 'funder' | 'financier';

// 收益记录
export interface RevenueRecord {
  id: string;
  recordType: RevenueRecordType;
  beneficiaryType: BeneficiaryType;
  beneficiaryId?: string;
  sourceType: RevenueSourceType;
  contractId: string;
  contractNumber?: string;
  contractType?: string;
  funderId?: string;
  funderName?: string;
  financierId?: string;
  financierName?: string;
  amount: number;
  principalAmount?: number;
  rate?: number;
  revenueDate: string;
  status: RevenueStatus;
  settlementId?: string;
  paymentRequestId?: string;
  waybillId?: string;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

// 收益统计
export interface RevenueStats {
  totalRevenue: number;         // 总收益/支出
  confirmedRevenue: number;     // 已确认
  pendingRevenue: number;       // 待确认
  estimatedRevenue: number;     // 预估(未来30天)
  periodRevenue: number;        // 本期新增
}

// 收益趋势数据点
export interface RevenueTrendPoint {
  date: string;
  amount: number;
  confirmedAmount: number;
  pendingAmount: number;
}

// 收益构成
export interface RevenueComposition {
  sourceType: RevenueSourceType;
  sourceName: string;
  amount: number;
  percentage: number;
}

// 排行榜项
export interface RevenueRankItem {
  id: string;
  name: string;
  amount: number;
  count: number;
}
```

### 3. 数据存储层

创建 `backend/src/revenue-store.ts`：

```typescript
import { pool } from "./db.js";
import { randomUUID } from "crypto";
import { RevenueRecord, RevenueStats, RevenueTrendPoint, RevenueComposition, RevenueRankItem } from "./types.js";

// 创建收益记录
export async function createRevenueRecord(input: Omit<RevenueRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<RevenueRecord>;

// 批量创建收益记录
export async function batchCreateRevenueRecords(records: Omit<RevenueRecord, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<number>;

// 查询收益记录列表
export async function getRevenueRecords(filters: {
  recordType?: 'revenue' | 'expense';
  beneficiaryType?: string;
  beneficiaryId?: string;
  sourceType?: string;
  financierId?: string;
  funderId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ records: RevenueRecord[]; total: number }>;

// 获取收益统计
export async function getRevenueStats(filters: {
  recordType?: 'revenue' | 'expense';
  beneficiaryType?: string;
  beneficiaryId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<RevenueStats>;

// 获取收益趋势
export async function getRevenueTrend(filters: {
  recordType?: 'revenue' | 'expense';
  beneficiaryType?: string;
  beneficiaryId?: string;
  startDate: string;
  endDate: string;
  groupBy: 'day' | 'week' | 'month' | 'year';
}): Promise<RevenueTrendPoint[]>;

// 获取收益构成
export async function getRevenueComposition(filters: {
  recordType?: 'revenue' | 'expense';
  beneficiaryType?: string;
  beneficiaryId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<RevenueComposition[]>;

// 获取排行榜
export async function getRevenueRanking(filters: {
  recordType?: 'revenue' | 'expense';
  beneficiaryType?: string;
  beneficiaryId?: string;
  rankBy: 'funder' | 'financier';
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<RevenueRankItem[]>;

// 计算预估收益 (未来30天)
export async function calculateEstimatedRevenue(filters: {
  beneficiaryType?: string;
  beneficiaryId?: string;
}): Promise<number>;

// 检查某日收益是否已生成
export async function checkDailyRevenueExists(date: string, contractId: string, sourceType: string): Promise<boolean>;

// 更新收益状态
export async function updateRevenueStatus(id: string, status: string): Promise<void>;

// 按结算单更新状态
export async function updateRevenueStatusBySettlement(settlementId: string, status: string): Promise<void>;
```

### 4. API路由

创建 `backend/src/revenue-routes.ts`：

```typescript
import { Router } from "express";
import { authenticate, requirePermissions, AuthenticatedRequest } from "./auth.js";

const router = Router();

// ==================== 平台收益接口 ====================

// 平台收益统计
router.get("/revenue/platform/stats", 
  authenticate, 
  requirePermissions(["view_platform_revenue"]),
  async (req: AuthenticatedRequest, res) => {
    // 参数: startDate, endDate
    // 返回: RevenueStats
  }
);

// 平台收益明细
router.get("/revenue/platform/list",
  authenticate,
  requirePermissions(["view_platform_revenue"]),
  async (req: AuthenticatedRequest, res) => {
    // 参数: startDate, endDate, sourceType, funderId, financierId, status, page, pageSize
    // 返回: { records: RevenueRecord[], total: number }
  }
);

// 平台收益趋势
router.get("/revenue/platform/trend",
  authenticate,
  requirePermissions(["view_platform_revenue"]),
  async (req: AuthenticatedRequest, res) => {
    // 参数: startDate, endDate, groupBy (day/week/month/year)
    // 返回: RevenueTrendPoint[]
  }
);

// 平台收益构成
router.get("/revenue/platform/composition",
  authenticate,
  requirePermissions(["view_platform_revenue"]),
  async (req: AuthenticatedRequest, res) => {
    // 参数: startDate, endDate
    // 返回: RevenueComposition[]
  }
);

// 平台收益排行 - 资金方
router.get("/revenue/platform/ranking/funders",
  authenticate,
  requirePermissions(["view_platform_revenue"]),
  async (req: AuthenticatedRequest, res) => {
    // 参数: startDate, endDate, limit
    // 返回: RevenueRankItem[]
  }
);

// 平台收益排行 - 融资方
router.get("/revenue/platform/ranking/financiers",
  authenticate,
  requirePermissions(["view_platform_revenue"]),
  async (req: AuthenticatedRequest, res) => {
    // 参数: startDate, endDate, limit
    // 返回: RevenueRankItem[]
  }
);

// 平台收益导出
router.get("/revenue/platform/export",
  authenticate,
  requirePermissions(["view_platform_revenue"]),
  async (req: AuthenticatedRequest, res) => {
    // 参数: startDate, endDate, sourceType, funderId, financierId, status
    // 返回: CSV文件
  }
);

// ==================== 资金方收益接口 ====================

// 资金方收益统计
router.get("/revenue/funder/stats",
  authenticate,
  requirePermissions(["view_funder_revenue"]),
  async (req: AuthenticatedRequest, res) => {
    // 自动根据 orgContext 过滤
    // 返回: RevenueStats
  }
);

// 资金方收益明细
router.get("/revenue/funder/list",
  authenticate,
  requirePermissions(["view_funder_revenue"]),
  async (req: AuthenticatedRequest, res) => {
    // 参数: startDate, endDate, sourceType, financierId, status, page, pageSize
    // 返回: { records: RevenueRecord[], total: number }
  }
);

// 资金方收益趋势
router.get("/revenue/funder/trend",
  authenticate,
  requirePermissions(["view_funder_revenue"]),
  async (req: AuthenticatedRequest, res) => {
    // 参数: startDate, endDate, groupBy
    // 返回: RevenueTrendPoint[]
  }
);

// 资金方收益构成
router.get("/revenue/funder/composition",
  authenticate,
  requirePermissions(["view_funder_revenue"]),
  async (req: AuthenticatedRequest, res) => {
    // 返回: RevenueComposition[]
  }
);

// 资金方合作融资方排行
router.get("/revenue/funder/ranking/financiers",
  authenticate,
  requirePermissions(["view_funder_revenue"]),
  async (req: AuthenticatedRequest, res) => {
    // 返回: RevenueRankItem[]
  }
);

// 资金方收益导出
router.get("/revenue/funder/export",
  authenticate,
  requirePermissions(["view_funder_revenue"]),
  async (req: AuthenticatedRequest, res) => {
    // 返回: CSV文件
  }
);

// ==================== 融资方支出接口 ====================

// 融资方支出统计
router.get("/expense/financier/stats",
  authenticate,
  requirePermissions(["view_financier_expense"]),
  async (req: AuthenticatedRequest, res) => {
    // 自动根据 orgContext 过滤
    // 返回: RevenueStats (字段含义为支出)
  }
);

// 融资方支出明细
router.get("/expense/financier/list",
  authenticate,
  requirePermissions(["view_financier_expense"]),
  async (req: AuthenticatedRequest, res) => {
    // 参数: startDate, endDate, sourceType, funderId, status, page, pageSize
    // 返回: { records: RevenueRecord[], total: number }
  }
);

// 融资方支出趋势
router.get("/expense/financier/trend",
  authenticate,
  requirePermissions(["view_financier_expense"]),
  async (req: AuthenticatedRequest, res) => {
    // 参数: startDate, endDate, groupBy
    // 返回: RevenueTrendPoint[]
  }
);

// 融资方支出构成
router.get("/expense/financier/composition",
  authenticate,
  requirePermissions(["view_financier_expense"]),
  async (req: AuthenticatedRequest, res) => {
    // 返回: RevenueComposition[]
  }
);

// 融资方合作资金方排行
router.get("/expense/financier/ranking/funders",
  authenticate,
  requirePermissions(["view_financier_expense"]),
  async (req: AuthenticatedRequest, res) => {
    // 返回: RevenueRankItem[]
  }
);

// 融资方支出导出
router.get("/expense/financier/export",
  authenticate,
  requirePermissions(["view_financier_expense"]),
  async (req: AuthenticatedRequest, res) => {
    // 返回: CSV文件
  }
);

export default router;
```

### 5. 定时任务 - 每日收益计算

创建 `backend/src/revenue-scheduler.ts`：

```typescript
import { pool } from "./db.js";
import * as revenueStore from "./revenue-store.js";

/**
 * 每日收益计算任务
 * 建议在每日凌晨 00:30 执行，计算前一天的收益
 */
export async function calculateDailyRevenue(targetDate?: string): Promise<{
  financingInterest: number;
  directedPayInterest: number;
  brokerageCommission: number;
  commissionFee: number;
  totalRecords: number;
}> {
  const date = targetDate || getPreviousDate();
  console.log(`开始计算 ${date} 的收益...`);
  
  let totalRecords = 0;
  
  // 1. 计算三方融资合同利息
  const financingRecords = await calculateFinancingInterest(date);
  totalRecords += financingRecords;
  
  // 2. 计算定向支付利息
  const directedPayRecords = await calculateDirectedPayInterest(date);
  totalRecords += directedPayRecords;
  
  // 3. 撮合业务抽成 (在结算时生成，这里不处理)
  
  // 4. 抽成合同费用 (在结算时生成，这里不处理)
  
  console.log(`${date} 收益计算完成，共生成 ${totalRecords} 条记录`);
  
  return {
    financingInterest: financingRecords,
    directedPayInterest: directedPayRecords,
    brokerageCommission: 0,
    commissionFee: 0,
    totalRecords
  };
}

/**
 * 计算三方融资合同每日利息
 */
async function calculateFinancingInterest(date: string): Promise<number> {
  // 1. 查询所有 active 状态的融资合同
  // 2. 对于每个合同，计算当日利息：
  //    日利息 = usedAmount × annualRate / 360
  // 3. 生成两条记录：
  //    - 资金方收益 (record_type=revenue, beneficiary_type=funder)
  //    - 融资方支出 (record_type=expense, beneficiary_type=financier)
  
  const [contracts] = await pool.query(`
    SELECT c.*, f.institution_name as funder_name, fn.enterprise_name as financier_name
    FROM contracts c
    LEFT JOIN funders f ON c.funder_id = f.id
    LEFT JOIN financiers fn ON c.financier_id = fn.id
    WHERE c.type = 'financing' 
    AND c.status = 'active'
    AND c.used_amount > 0
  `);
  
  let count = 0;
  for (const contract of contracts as any[]) {
    // 检查是否已生成
    const exists = await revenueStore.checkDailyRevenueExists(date, contract.id, 'financing_interest');
    if (exists) continue;
    
    const dailyInterest = (contract.used_amount * contract.interest_rate) / 360;
    
    // 资金方收益
    await revenueStore.createRevenueRecord({
      recordType: 'revenue',
      beneficiaryType: 'funder',
      beneficiaryId: contract.funder_id,
      sourceType: 'financing_interest',
      contractId: contract.id,
      contractNumber: contract.contract_number,
      contractType: 'financing',
      funderId: contract.funder_id,
      funderName: contract.funder_name,
      financierId: contract.financier_id,
      financierName: contract.financier_name,
      amount: dailyInterest,
      principalAmount: contract.used_amount,
      rate: contract.interest_rate,
      revenueDate: date,
      status: 'pending',
    });
    
    // 融资方支出
    await revenueStore.createRevenueRecord({
      recordType: 'expense',
      beneficiaryType: 'financier',
      beneficiaryId: contract.financier_id,
      sourceType: 'financing_interest',
      contractId: contract.id,
      contractNumber: contract.contract_number,
      contractType: 'financing',
      funderId: contract.funder_id,
      funderName: contract.funder_name,
      financierId: contract.financier_id,
      financierName: contract.financier_name,
      amount: dailyInterest,
      principalAmount: contract.used_amount,
      rate: contract.interest_rate,
      revenueDate: date,
      status: 'pending',
    });
    
    count += 2;
  }
  
  return count;
}

/**
 * 计算定向支付每日利息
 */
async function calculateDirectedPayInterest(date: string): Promise<number> {
  // 1. 查询所有已成功支付(status=success)且未完全还款的支付申请
  // 2. 计算当日利息
  // 3. 生成收益/支出记录
  
  const [requests] = await pool.query(`
    SELECT 
      dpr.*,
      dpc.annual_rate,
      dpc.contract_number,
      f.institution_name as funder_name,
      fn.enterprise_name as financier_name
    FROM directed_payment_requests dpr
    JOIN directed_pay_contracts dpc ON dpr.contract_id = dpc.id
    LEFT JOIN funders f ON dpc.funder_id = f.id
    LEFT JOIN financiers fn ON dpc.financier_id = fn.id
    WHERE dpr.status = 'success'
    AND dpr.interest_start_time IS NOT NULL
    AND (dpr.repaid_at IS NULL OR dpr.repaid_at > ?)
  `, [date]);
  
  let count = 0;
  for (const request of requests as any[]) {
    // 检查是否已生成
    const exists = await revenueStore.checkDailyRevenueExists(date, request.contract_id, 'directed_pay_interest');
    if (exists) continue;
    
    const dailyInterest = (request.payment_amount * request.annual_rate) / 360;
    
    // 资金方收益
    await revenueStore.createRevenueRecord({
      recordType: 'revenue',
      beneficiaryType: 'funder',
      beneficiaryId: request.funder_id,
      sourceType: 'directed_pay_interest',
      contractId: request.contract_id,
      contractNumber: request.contract_number,
      contractType: 'directed_pay',
      funderId: request.funder_id,
      funderName: request.funder_name,
      financierId: request.financier_id,
      financierName: request.financier_name,
      amount: dailyInterest,
      principalAmount: request.payment_amount,
      rate: request.annual_rate,
      revenueDate: date,
      status: 'pending',
      paymentRequestId: request.id,
    });
    
    // 融资方支出
    await revenueStore.createRevenueRecord({
      recordType: 'expense',
      beneficiaryType: 'financier',
      beneficiaryId: request.financier_id,
      sourceType: 'directed_pay_interest',
      contractId: request.contract_id,
      contractNumber: request.contract_number,
      contractType: 'directed_pay',
      funderId: request.funder_id,
      funderName: request.funder_name,
      financierId: request.financier_id,
      financierName: request.financier_name,
      amount: dailyInterest,
      principalAmount: request.payment_amount,
      rate: request.annual_rate,
      revenueDate: date,
      status: 'pending',
      paymentRequestId: request.id,
    });
    
    count += 2;
  }
  
  return count;
}

/**
 * 计算预估收益 (未来30天)
 */
export async function calculateEstimatedRevenue(
  beneficiaryType?: string,
  beneficiaryId?: string
): Promise<number> {
  // 基于当前未还款本金，计算未来30天预估收益
  // 预估收益 = 当前本金 × 年化利率 / 360 × 30
  
  let totalEstimated = 0;
  
  // 1. 三方融资合同预估
  // 2. 定向支付预估
  
  return totalEstimated;
}

// 辅助函数
function getPreviousDate(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().split('T')[0];
}
```

### 6. 手动触发接口

在 `revenue-routes.ts` 添加：

```typescript
// 手动触发收益计算 (仅admin)
router.post("/revenue/calculate",
  authenticate,
  requirePermissions(["admin"]),
  async (req: AuthenticatedRequest, res) => {
    const { date } = req.body; // 可选，默认计算昨天
    const result = await calculateDailyRevenue(date);
    res.json({ success: true, ...result });
  }
);
```

### 7. 权限配置

在系统中添加以下权限：

```typescript
// 新增权限
const newPermissions = [
  { code: 'view_platform_revenue', name: '查看平台收益', module: 'revenue' },
  { code: 'view_funder_revenue', name: '查看资金方收益', module: 'revenue' },
  { code: 'view_financier_expense', name: '查看融资方支出', module: 'revenue' },
  { code: 'export_revenue', name: '导出收益数据', module: 'revenue' },
];
```

### 8. 路由注册

在 `backend/src/index.ts` 或 `backend/src/routes.ts` 注册路由：

```typescript
import revenueRoutes from "./revenue-routes.js";

// 注册路由
router.use(revenueRoutes);
```

---

## 数据权限说明

| 接口 | 平台用户 | 资金方用户 | 融资方用户 |
|------|---------|-----------|-----------|
| /revenue/platform/* | ✅ 全部数据 | ❌ | ❌ |
| /revenue/funder/* | ✅ 全部数据 | ✅ 仅自己 | ❌ |
| /expense/financier/* | ✅ 全部数据 | ❌ | ✅ 仅自己 |

---

## 注意事项

1. **防重复生成**：每次计算前检查该日期该合同的记录是否已存在
2. **金额精度**：使用 DECIMAL(15,2)，计算时保留足够精度
3. **时区处理**：统一使用 UTC 或服务器时区
4. **性能优化**：大量数据时使用批量插入
5. **事务处理**：收益计算应在事务中执行

---

## 验收标准

- [ ] 数据库表创建成功
- [ ] 所有API接口可访问
- [ ] 数据权限隔离正确
- [ ] 定时任务逻辑正确
- [ ] 导出功能正常
- [ ] 预估收益计算正确
