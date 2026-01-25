# 结算中心模块任务 - 资金定向支付

## 模块职责

你负责为「资金定向支付」产品实现结算管理功能，包括：
1. 定向支付结算单生成
2. 利息计算
3. 还款处理
4. 与现有结算中心集成

---

## 背景信息

请先阅读产品设计文档：
- `docs/products/directed-payment-product.md` - 完整产品设计（重点阅读利息计算规则）

现有结算相关页面：
- `frontend/src/pages/FinancingRepaymentSettlement.tsx` - 融资还款结算
- `frontend/src/pages/PendingSettlements.tsx` - 待处理结算

---

## 利息计算规则

**重要**：请严格按照以下规则实现

```
规则1：从支付时刻开始计息（interest_start_time）
规则2：按日计息
规则3：不满一天按一天计算
规则4：计息基数默认360天（可配置为365）

公式：利息 = 本金 × (年化利率 / 计息基数) × 天数
```

---

## 任务清单

### 任务1：定向支付结算单数据库表

**目标**：创建结算单相关的数据库表

**文件**：`backend/src/store.ts` 的 `initSchema` 函数

**添加表结构**：

```sql
-- 定向支付结算单表
CREATE TABLE IF NOT EXISTS directed_pay_settlements (
  id VARCHAR(36) PRIMARY KEY,
  settlement_number VARCHAR(50) NOT NULL UNIQUE,
  contract_id VARCHAR(36) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  payment_count INT NOT NULL DEFAULT 0,
  principal_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  interest_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  service_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  actual_paid_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  paid_at DATETIME,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  remark TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_dps_contract (contract_id),
  INDEX idx_dps_status (status),
  INDEX idx_dps_period (period_start, period_end),
  INDEX idx_dps_due_date (due_date),
  FOREIGN KEY (contract_id) REFERENCES directed_pay_contracts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 结算单明细表（每笔支付的利息明细）
CREATE TABLE IF NOT EXISTS directed_pay_settlement_items (
  id VARCHAR(36) PRIMARY KEY,
  settlement_id VARCHAR(36) NOT NULL,
  payment_request_id VARCHAR(36) NOT NULL,
  payment_amount DECIMAL(18,2) NOT NULL,
  payment_time DATETIME NOT NULL,
  interest_days INT NOT NULL,
  interest_amount DECIMAL(18,2) NOT NULL,
  service_fee DECIMAL(18,2) NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_dpsi_settlement (settlement_id),
  INDEX idx_dpsi_payment (payment_request_id),
  FOREIGN KEY (settlement_id) REFERENCES directed_pay_settlements(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### 任务2：结算单 Store 函数

**目标**：实现结算单的数据操作函数

**文件**：创建新文件 `backend/src/directed-pay-settlements-store.ts`

**实现以下函数**：

```typescript
import { randomUUID } from "crypto";
import { pool } from "./db.js";

// 类型定义
export type SettlementStatus = "pending" | "confirmed" | "partial_paid" | "paid" | "overdue";

export interface DirectedPaySettlement {
  id: string;
  settlementNumber: string;
  contractId: string;
  contractNumber?: string;
  financierName?: string;
  periodStart: string;
  periodEnd: string;
  paymentCount: number;
  principalAmount: number;
  interestAmount: number;
  serviceAmount: number;
  totalAmount: number;
  dueDate: string;
  actualPaidAmount: number;
  paidAt?: string;
  status: SettlementStatus;
  remark?: string;
  createdAt: string;
}

export interface SettlementItem {
  id: string;
  settlementId: string;
  paymentRequestId: string;
  paymentAmount: number;
  paymentTime: string;
  interestDays: number;
  interestAmount: number;
  serviceFee: number;
  createdAt: string;
}

// 生成结算单号
function generateSettlementNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DPS${date}${random}`;
}

// ==================== 利息计算核心逻辑 ====================

/**
 * 计算单笔支付的利息
 * @param principal 本金
 * @param annualRate 年化利率（如 0.12 表示12%）
 * @param paymentTime 支付时间
 * @param settlementTime 结算时间
 * @param calcBase 计息基数（360 或 365）
 */
export function calculateInterest(
  principal: number,
  annualRate: number,
  paymentTime: Date,
  settlementTime: Date,
  calcBase: number = 360
): { days: number; interest: number } {
  // 计算天数（不满一天按一天）
  const diffMs = settlementTime.getTime() - paymentTime.getTime();
  const days = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  
  // 日利率
  const dailyRate = annualRate / calcBase;
  
  // 利息 = 本金 × 日利率 × 天数
  const interest = principal * dailyRate * days;
  
  // 保留两位小数（四舍五入）
  return {
    days,
    interest: Math.round(interest * 100) / 100
  };
}

// ==================== 结算单生成 ====================

/**
 * 为指定合同生成结算单
 */
export async function generateSettlement(
  contractId: string,
  periodEnd: Date
): Promise<DirectedPaySettlement> {
  // 1. 获取合同信息
  const contract = await getContractById(contractId); // 需要从合同模块导入
  if (!contract) throw new Error("合同不存在");
  
  // 2. 计算结算周期开始时间
  const periodStart = calculatePeriodStart(periodEnd, contract.settlementCycle);
  
  // 3. 获取本期所有成功的支付记录
  const payments = await getSuccessPaymentsInPeriod(contractId, periodStart, periodEnd);
  
  if (payments.length === 0) {
    throw new Error("本期无支付记录，无需生成结算单");
  }
  
  // 4. 计算各项金额
  let principalAmount = 0;
  let interestAmount = 0;
  let serviceAmount = 0;
  const items: Array<{
    paymentRequestId: string;
    paymentAmount: number;
    paymentTime: Date;
    interestDays: number;
    interestAmount: number;
    serviceFee: number;
  }> = [];
  
  for (const payment of payments) {
    principalAmount += payment.paymentAmount;
    serviceAmount += payment.serviceFee || 0;
    
    const { days, interest } = calculateInterest(
      payment.paymentAmount,
      contract.annualInterestRate,
      new Date(payment.interestStartTime),
      periodEnd,
      contract.interestCalcBase
    );
    
    interestAmount += interest;
    
    items.push({
      paymentRequestId: payment.id,
      paymentAmount: payment.paymentAmount,
      paymentTime: new Date(payment.interestStartTime),
      interestDays: days,
      interestAmount: interest,
      serviceFee: payment.serviceFee || 0,
    });
  }
  
  const totalAmount = principalAmount + interestAmount + serviceAmount;
  
  // 5. 计算应还日期（周期结束 + 宽限期）
  const dueDate = new Date(periodEnd);
  dueDate.setDate(dueDate.getDate() + contract.gracePeriodDays);
  
  // 6. 创建结算单
  const settlementId = randomUUID();
  const settlementNumber = generateSettlementNumber();
  
  await pool.query(
    `INSERT INTO directed_pay_settlements 
     (id, settlement_number, contract_id, period_start, period_end,
      payment_count, principal_amount, interest_amount, service_amount,
      total_amount, due_date, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      settlementId, settlementNumber, contractId,
      periodStart.toISOString().slice(0, 10),
      periodEnd.toISOString().slice(0, 10),
      payments.length, principalAmount, interestAmount, serviceAmount,
      totalAmount, dueDate.toISOString().slice(0, 10)
    ]
  );
  
  // 7. 创建结算单明细
  for (const item of items) {
    await pool.query(
      `INSERT INTO directed_pay_settlement_items 
       (id, settlement_id, payment_request_id, payment_amount, payment_time,
        interest_days, interest_amount, service_fee)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(), settlementId, item.paymentRequestId,
        item.paymentAmount, item.paymentTime,
        item.interestDays, item.interestAmount, item.serviceFee
      ]
    );
  }
  
  const settlement = await getSettlementById(settlementId);
  if (!settlement) throw new Error("生成结算单失败");
  return settlement;
}

// 计算周期开始时间
function calculatePeriodStart(periodEnd: Date, cycle: string): Date {
  const start = new Date(periodEnd);
  switch (cycle) {
    case "monthly":
      start.setMonth(start.getMonth() - 1);
      start.setDate(start.getDate() + 1);
      break;
    case "biweekly":
      start.setDate(start.getDate() - 13); // 14天周期
      break;
    case "weekly":
      start.setDate(start.getDate() - 6); // 7天周期
      break;
  }
  return start;
}

// 获取周期内的成功支付记录（需要从支付模块导入或实现）
async function getSuccessPaymentsInPeriod(
  contractId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<any[]> {
  const [rows] = await pool.query<any[]>(
    `SELECT id, payment_amount, service_fee, interest_start_time
     FROM directed_payment_requests
     WHERE contract_id = ? 
       AND status = 'success'
       AND interest_start_time >= ?
       AND interest_start_time <= ?`,
    [contractId, periodStart, periodEnd]
  );
  return rows.map(row => ({
    id: row.id,
    paymentAmount: Number(row.payment_amount),
    serviceFee: Number(row.service_fee || 0),
    interestStartTime: row.interest_start_time,
  }));
}

// 获取合同信息（需要从合同模块导入）
async function getContractById(id: string): Promise<any> {
  // 临时实现，实际应从合同模块导入
  const [rows] = await pool.query<any[]>(
    `SELECT * FROM directed_pay_contracts WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );
  if (!rows[0]) return undefined;
  return {
    ...rows[0],
    annualInterestRate: Number(rows[0].annual_interest_rate),
    interestCalcBase: Number(rows[0].interest_calc_base),
    gracePeriodDays: Number(rows[0].grace_period_days),
    settlementCycle: rows[0].settlement_cycle,
  };
}

// ==================== 结算单 CRUD ====================

// 获取结算单详情
export async function getSettlementById(id: string): Promise<DirectedPaySettlement | undefined> {
  // 实现查询，需要JOIN合同表获取合同号和融资方名称
}

// 获取结算单列表
export async function getSettlements(filters?: {
  contractId?: string;
  financierId?: string;
  status?: SettlementStatus;
  startDate?: string;
  endDate?: string;
}): Promise<DirectedPaySettlement[]> {
  // 实现查询
}

// 获取结算单明细
export async function getSettlementItems(settlementId: string): Promise<SettlementItem[]> {
  // 实现查询
}

// 确认结算单
export async function confirmSettlement(id: string): Promise<void> {
  await pool.query(
    `UPDATE directed_pay_settlements SET status = 'confirmed' WHERE id = ? AND status = 'pending'`,
    [id]
  );
}

// 还款处理
export async function processRepayment(
  settlementId: string,
  amount: number
): Promise<DirectedPaySettlement> {
  // 1. 获取结算单
  const settlement = await getSettlementById(settlementId);
  if (!settlement) throw new Error("结算单不存在");
  if (settlement.status === "paid") throw new Error("结算单已结清");
  
  // 2. 计算新的已还金额
  const newPaidAmount = settlement.actualPaidAmount + amount;
  
  // 3. 判断状态
  let newStatus: SettlementStatus;
  if (newPaidAmount >= settlement.totalAmount) {
    newStatus = "paid";
  } else {
    newStatus = "partial_paid";
  }
  
  // 4. 更新结算单
  await pool.query(
    `UPDATE directed_pay_settlements 
     SET actual_paid_amount = ?, status = ?, paid_at = NOW()
     WHERE id = ?`,
    [newPaidAmount, newStatus, settlementId]
  );
  
  // 5. 如果全额还款，恢复合同额度
  if (newStatus === "paid") {
    await restoreContractCredit(settlement.contractId, settlement.principalAmount);
  }
  
  return (await getSettlementById(settlementId))!;
}

// 恢复合同额度（需要从合同模块导入）
async function restoreContractCredit(contractId: string, amount: number): Promise<void> {
  await pool.query(
    `UPDATE directed_pay_contracts 
     SET used_amount = used_amount - ?, available_amount = available_amount + ?
     WHERE id = ?`,
    [amount, amount, contractId]
  );
}

// 标记逾期
export async function markOverdue(settlementId: string): Promise<void> {
  await pool.query(
    `UPDATE directed_pay_settlements SET status = 'overdue' 
     WHERE id = ? AND status IN ('pending', 'confirmed', 'partial_paid')`,
    [settlementId]
  );
}

// 获取逾期结算单（用于定时任务）
export async function getOverdueSettlements(): Promise<DirectedPaySettlement[]> {
  // 查询 due_date < 今天 且 status 不是 paid 的结算单
}

// ==================== 统计 ====================

// 获取结算统计
export async function getSettlementStats(contractId?: string): Promise<{
  totalPending: number;
  totalConfirmed: number;
  totalPaid: number;
  totalOverdue: number;
  totalAmount: number;
  totalPaidAmount: number;
}> {
  // 实现统计查询
}
```

---

### 任务3：结算单 API 路由

**目标**：实现结算单相关的API接口

**文件**：在 `backend/src/routes.ts` 中添加

**实现以下API**：

```typescript
// POST /api/directed-pay/settlements/generate - 生成结算单
router.post("/directed-pay/settlements/generate",
  authenticate,
  requirePermissions("manage_directed_pay_settlements"),
  async (req, res) => {
    const { contractId, periodEnd } = req.body;
    const settlement = await settlementStore.generateSettlement(
      contractId,
      new Date(periodEnd)
    );
    res.json({ settlement });
  }
);

// GET /api/directed-pay/settlements - 获取结算单列表
router.get("/directed-pay/settlements",
  authenticate,
  requirePermissions("view_directed_pay_settlements"),
  async (req, res) => {
    const { contractId, financierId, status, startDate, endDate } = req.query;
    const settlements = await settlementStore.getSettlements({
      contractId: contractId as string,
      financierId: financierId as string,
      status: status as any,
      startDate: startDate as string,
      endDate: endDate as string,
    });
    res.json({ settlements });
  }
);

// GET /api/directed-pay/settlements/:id - 获取结算单详情
router.get("/directed-pay/settlements/:id",
  authenticate,
  requirePermissions("view_directed_pay_settlements"),
  async (req, res) => {
    const settlement = await settlementStore.getSettlementById(req.params.id);
    if (!settlement) {
      return res.status(404).json({ error: "结算单不存在" });
    }
    const items = await settlementStore.getSettlementItems(req.params.id);
    res.json({ settlement, items });
  }
);

// POST /api/directed-pay/settlements/:id/confirm - 确认结算单
router.post("/directed-pay/settlements/:id/confirm",
  authenticate,
  requirePermissions("manage_directed_pay_settlements"),
  async (req, res) => {
    await settlementStore.confirmSettlement(req.params.id);
    res.json({ success: true });
  }
);

// POST /api/directed-pay/settlements/:id/pay - 还款
router.post("/directed-pay/settlements/:id/pay",
  authenticate,
  requirePermissions("manage_directed_pay_settlements"),
  async (req, res) => {
    const { amount } = req.body;
    const settlement = await settlementStore.processRepayment(req.params.id, amount);
    res.json({ settlement });
  }
);

// GET /api/directed-pay/settlements/stats - 结算统计
router.get("/directed-pay/settlements/stats",
  authenticate,
  requirePermissions("view_directed_pay_settlements"),
  async (req, res) => {
    const { contractId } = req.query;
    const stats = await settlementStore.getSettlementStats(contractId as string);
    res.json({ stats });
  }
);
```

---

### 任务4：结算单列表前端页面

**目标**：创建定向支付结算单列表页面

**文件**：创建 `frontend/src/pages/DirectedPaySettlements.tsx`

**页面功能**：
- 结算单列表展示（表格）
- 筛选：合同、融资方、状态、日期范围
- 统计卡片：待处理金额、已确认金额、已结清金额、逾期金额
- 操作：查看详情、确认、还款

**列表字段**：
- 结算单号
- 合同号
- 融资方
- 结算周期
- 本金
- 利息
- 服务费
- 应还总额
- 已还金额
- 应还日期
- 状态
- 操作

**参考**：`frontend/src/pages/FinancingRepaymentSettlement.tsx`

---

### 任务5：结算单详情弹窗

**目标**：创建结算单详情弹窗组件

**文件**：在 `DirectedPaySettlements.tsx` 中添加 Modal

**弹窗内容**：
- 结算单基本信息
- 明细列表（每笔支付的利息计算）
  - 支付金额
  - 支付时间
  - 计息天数
  - 利息金额
  - 服务费
- 还款操作（输入金额 + 确认按钮）

---

### 任务6：与现有结算中心集成

**目标**：将定向支付结算单集成到待处理结算页面

**文件**：`frontend/src/pages/PendingSettlements.tsx`

**修改内容**：
- 添加 Tab 或筛选条件，区分"融资还款"和"定向支付"
- 定向支付结算单显示在待处理列表中
- 点击可查看详情或处理

---

### 任务7：菜单配置

**目标**：将结算页面集成到系统菜单

**文件**：`frontend/src/layouts/AppLayout.tsx`

**菜单结构**：
```
结算中心
├── 融资还款结算
├── 抽成/分润结算
├── 待处理结算
└── 定向支付结算  <-- 新增
```

---

## 验收标准

1. 利息计算逻辑正确（按日计息，不满一天按一天）
2. 结算单生成功能正常，包含明细
3. 还款处理正确，全额还款后恢复合同额度
4. 结算单列表页面正常展示
5. 结算单详情显示完整
6. 与现有结算中心集成正常

---

## 注意事项

1. **利息计算是核心**：必须严格按照规则实现
2. 金额计算注意精度问题，使用 DECIMAL 和适当的四舍五入
3. 还款时需要判断是否全额还款
4. 逾期判断需要考虑定时任务
5. 结算单生成前需要检查是否有未结清的上期结算单

---

*任务文档版本: v1.0*
