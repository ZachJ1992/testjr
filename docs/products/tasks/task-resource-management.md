# 资源管理模块任务 - 资金定向支付

## 模块职责

你负责为「资金定向支付」产品实现与运单系统的集成，包括：
1. 运单页面集成（手动发起支付）
2. 自动支付触发
3. 支付申请管理
4. TMS 对接

---

## 背景信息

请先阅读产品设计文档：
- `docs/products/directed-payment-product.md` - 完整产品设计（重点阅读支付申请和TMS对接部分）

现有运单相关页面：
- `frontend/src/pages/Waybills.tsx` - 运单列表

---

## 任务清单

### 任务1：支付申请数据库表

**目标**：创建支付申请相关的数据库表

**文件**：`backend/src/store.ts` 的 `initSchema` 函数

**添加表结构**：

```sql
-- 定向支付申请表
CREATE TABLE IF NOT EXISTS directed_payment_requests (
  id VARCHAR(36) PRIMARY KEY,
  request_number VARCHAR(50) NOT NULL UNIQUE,
  contract_id VARCHAR(36) NOT NULL,
  waybill_id VARCHAR(36),
  waybill_number VARCHAR(50),
  category_code VARCHAR(50) NOT NULL,
  category_name VARCHAR(100) NOT NULL,
  payment_amount DECIMAL(18,2) NOT NULL,
  service_fee DECIMAL(18,2) NOT NULL DEFAULT 0,
  interest_start_time DATETIME,
  receiver_type VARCHAR(20) NOT NULL,
  receiver_name VARCHAR(100),
  receiver_account VARCHAR(100),
  receiver_bank VARCHAR(100),
  driver_id VARCHAR(36),
  driver_name VARCHAR(100),
  driver_phone VARCHAR(20),
  remark TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  platform_approval_status VARCHAR(20) DEFAULT 'pending',
  platform_approved_by VARCHAR(36),
  platform_approved_at DATETIME,
  platform_approval_remark TEXT,
  funder_approval_status VARCHAR(20) DEFAULT 'pending',
  funder_approved_by VARCHAR(36),
  funder_approved_at DATETIME,
  funder_approval_remark TEXT,
  execution_time DATETIME,
  execution_channel VARCHAR(50),
  execution_transaction_id VARCHAR(100),
  execution_status VARCHAR(20),
  execution_failure_reason TEXT,
  created_by VARCHAR(36),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_dpr_contract (contract_id),
  INDEX idx_dpr_waybill (waybill_id),
  INDEX idx_dpr_status (status),
  INDEX idx_dpr_driver (driver_id),
  INDEX idx_dpr_category (category_code),
  INDEX idx_dpr_created (created_at),
  FOREIGN KEY (contract_id) REFERENCES directed_pay_contracts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

### 任务2：支付申请 Store 函数

**目标**：实现支付申请的数据操作函数

**文件**：创建新文件 `backend/src/directed-payment-requests-store.ts`

**实现以下函数**：

```typescript
import { randomUUID } from "crypto";
import { pool } from "./db.js";

// 类型定义
export type ReceiverType = "bank_transfer" | "virtual_account" | "payment_code" | "oil_card" | "etc_recharge";
export type PaymentRequestStatus = "pending" | "platform_pending" | "funder_pending" | "approved" | "rejected" | "processing" | "success" | "failed" | "cancelled";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface DirectedPaymentRequest {
  id: string;
  requestNumber: string;
  contractId: string;
  contractNumber?: string;
  waybillId?: string;
  waybillNumber?: string;
  categoryCode: string;
  categoryName: string;
  paymentAmount: number;
  serviceFee: number;
  interestStartTime?: string;
  receiverType: ReceiverType;
  receiverName?: string;
  receiverAccount?: string;
  receiverBank?: string;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  remark?: string;
  status: PaymentRequestStatus;
  platformApprovalStatus: ApprovalStatus;
  platformApprovedBy?: string;
  platformApprovedAt?: string;
  platformApprovalRemark?: string;
  funderApprovalStatus: ApprovalStatus;
  funderApprovedBy?: string;
  funderApprovedAt?: string;
  funderApprovalRemark?: string;
  executionTime?: string;
  executionChannel?: string;
  executionTransactionId?: string;
  executionStatus?: string;
  executionFailureReason?: string;
  createdBy?: string;
  createdAt: string;
}

// 生成申请编号
function generateRequestNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DPR${date}${random}`;
}

// ==================== 支付申请 CRUD ====================

// 创建支付申请
export async function createPaymentRequest(input: {
  contractId: string;
  waybillId?: string;
  waybillNumber?: string;
  categoryCode: string;
  categoryName: string;
  paymentAmount: number;
  serviceFee?: number;
  receiverType: ReceiverType;
  receiverName?: string;
  receiverAccount?: string;
  receiverBank?: string;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  remark?: string;
  createdBy?: string;
}): Promise<DirectedPaymentRequest> {
  const id = randomUUID();
  const requestNumber = generateRequestNumber();

  // 获取类别配置，判断是否需要审批
  const categoryConfig = await getPaymentCategoryConfig(input.contractId, input.categoryCode);
  
  // 判断初始状态
  let status: PaymentRequestStatus = "pending";
  let platformApprovalStatus: ApprovalStatus = "pending";
  let funderApprovalStatus: ApprovalStatus = "pending";
  
  // 如果金额低于审批阈值，可以跳过审批
  const needPlatformApproval = categoryConfig?.requirePlatformApproval && 
    (!categoryConfig.platformApprovalThreshold || input.paymentAmount >= categoryConfig.platformApprovalThreshold);
  const needFunderApproval = categoryConfig?.requireFunderApproval && 
    (!categoryConfig.funderApprovalThreshold || input.paymentAmount >= categoryConfig.funderApprovalThreshold);
  
  if (needPlatformApproval) {
    status = "platform_pending";
  } else if (needFunderApproval) {
    status = "funder_pending";
    platformApprovalStatus = "approved";
  } else {
    status = "approved";
    platformApprovalStatus = "approved";
    funderApprovalStatus = "approved";
  }

  await pool.query(
    `INSERT INTO directed_payment_requests 
     (id, request_number, contract_id, waybill_id, waybill_number,
      category_code, category_name, payment_amount, service_fee,
      receiver_type, receiver_name, receiver_account, receiver_bank,
      driver_id, driver_name, driver_phone, remark,
      status, platform_approval_status, funder_approval_status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, requestNumber, input.contractId, input.waybillId || null, input.waybillNumber || null,
      input.categoryCode, input.categoryName, input.paymentAmount, input.serviceFee || 0,
      input.receiverType, input.receiverName || null, input.receiverAccount || null, input.receiverBank || null,
      input.driverId || null, input.driverName || null, input.driverPhone || null, input.remark || null,
      status, platformApprovalStatus, funderApprovalStatus, input.createdBy || null
    ]
  );

  const request = await getPaymentRequestById(id);
  if (!request) throw new Error("创建支付申请失败");
  return request;
}

// 获取类别配置（需要从合同模块导入）
async function getPaymentCategoryConfig(contractId: string, categoryCode: string): Promise<any> {
  const [rows] = await pool.query<any[]>(
    `SELECT * FROM payment_category_configs 
     WHERE contract_id = ? AND category_code = ? AND is_enabled = 1`,
    [contractId, categoryCode]
  );
  return rows[0] ? {
    requirePlatformApproval: rows[0].require_platform_approval === 1,
    requireFunderApproval: rows[0].require_funder_approval === 1,
    platformApprovalThreshold: rows[0].platform_approval_threshold,
    funderApprovalThreshold: rows[0].funder_approval_threshold,
  } : null;
}

// 获取支付申请详情
export async function getPaymentRequestById(id: string): Promise<DirectedPaymentRequest | undefined> {
  // 实现查询，JOIN 合同表获取合同号
}

// 获取支付申请列表
export async function getPaymentRequests(filters?: {
  contractId?: string;
  waybillId?: string;
  status?: PaymentRequestStatus;
  driverId?: string;
  categoryCode?: string;
  startDate?: string;
  endDate?: string;
}): Promise<DirectedPaymentRequest[]> {
  // 实现查询
}

// 获取待审批列表
export async function getPendingApprovals(filters?: {
  type: "platform" | "funder";
  userId?: string;
}): Promise<DirectedPaymentRequest[]> {
  let statusCondition: string;
  if (filters?.type === "platform") {
    statusCondition = "status = 'platform_pending'";
  } else {
    statusCondition = "status = 'funder_pending'";
  }
  
  const [rows] = await pool.query<any[]>(
    `SELECT * FROM directed_payment_requests WHERE ${statusCondition} ORDER BY created_at DESC`
  );
  // 返回映射后的数据
}

// ==================== 审批流程 ====================

// 平台审批通过
export async function platformApprove(
  requestId: string,
  approvedBy: string,
  remark?: string
): Promise<DirectedPaymentRequest> {
  const request = await getPaymentRequestById(requestId);
  if (!request) throw new Error("申请不存在");
  if (request.status !== "platform_pending") throw new Error("申请状态不正确");
  
  // 检查是否还需要资金方审批
  const categoryConfig = await getPaymentCategoryConfig(request.contractId, request.categoryCode);
  const needFunderApproval = categoryConfig?.requireFunderApproval;
  
  const newStatus = needFunderApproval ? "funder_pending" : "approved";
  const newFunderStatus = needFunderApproval ? "pending" : "approved";
  
  await pool.query(
    `UPDATE directed_payment_requests 
     SET status = ?, platform_approval_status = 'approved',
         platform_approved_by = ?, platform_approved_at = NOW(),
         platform_approval_remark = ?, funder_approval_status = ?
     WHERE id = ?`,
    [newStatus, approvedBy, remark || null, newFunderStatus, requestId]
  );
  
  return (await getPaymentRequestById(requestId))!;
}

// 平台审批拒绝
export async function platformReject(
  requestId: string,
  approvedBy: string,
  remark?: string
): Promise<DirectedPaymentRequest> {
  await pool.query(
    `UPDATE directed_payment_requests 
     SET status = 'rejected', platform_approval_status = 'rejected',
         platform_approved_by = ?, platform_approved_at = NOW(),
         platform_approval_remark = ?
     WHERE id = ? AND status = 'platform_pending'`,
    [approvedBy, remark || null, requestId]
  );
  
  return (await getPaymentRequestById(requestId))!;
}

// 资金方审批通过
export async function funderApprove(
  requestId: string,
  approvedBy: string,
  remark?: string
): Promise<DirectedPaymentRequest> {
  await pool.query(
    `UPDATE directed_payment_requests 
     SET status = 'approved', funder_approval_status = 'approved',
         funder_approved_by = ?, funder_approved_at = NOW(),
         funder_approval_remark = ?
     WHERE id = ? AND status = 'funder_pending'`,
    [approvedBy, remark || null, requestId]
  );
  
  return (await getPaymentRequestById(requestId))!;
}

// 资金方审批拒绝
export async function funderReject(
  requestId: string,
  approvedBy: string,
  remark?: string
): Promise<DirectedPaymentRequest> {
  await pool.query(
    `UPDATE directed_payment_requests 
     SET status = 'rejected', funder_approval_status = 'rejected',
         funder_approved_by = ?, funder_approved_at = NOW(),
         funder_approval_remark = ?
     WHERE id = ? AND status = 'funder_pending'`,
    [approvedBy, remark || null, requestId]
  );
  
  return (await getPaymentRequestById(requestId))!;
}

// 取消申请
export async function cancelRequest(requestId: string): Promise<void> {
  await pool.query(
    `UPDATE directed_payment_requests SET status = 'cancelled' 
     WHERE id = ? AND status IN ('pending', 'platform_pending', 'funder_pending')`,
    [requestId]
  );
}

// ==================== 支付执行 ====================

// 执行支付（模拟）
export async function executePayment(requestId: string): Promise<DirectedPaymentRequest> {
  const request = await getPaymentRequestById(requestId);
  if (!request) throw new Error("申请不存在");
  if (request.status !== "approved") throw new Error("申请未审批通过");
  
  // 更新状态为处理中
  await pool.query(
    `UPDATE directed_payment_requests SET status = 'processing' WHERE id = ?`,
    [requestId]
  );
  
  try {
    // 1. 扣减合同额度
    await deductContractCredit(request.contractId, request.paymentAmount);
    
    // 2. 根据收款方式执行支付
    let transactionId: string;
    let paymentCodeId: string | undefined;
    
    switch (request.receiverType) {
      case "payment_code":
        // 生成付款码并推送到TMS
        const paymentCode = await createPaymentCodeForRequest(request);
        paymentCodeId = paymentCode.id;
        transactionId = paymentCode.code;
        await syncPaymentCodeToTms(paymentCode);
        break;
        
      case "virtual_account":
        // 充值到虚拟账户
        transactionId = await creditVirtualAccount(request);
        break;
        
      case "bank_transfer":
      case "oil_card":
      case "etc_recharge":
      default:
        // 模拟支付
        transactionId = `MOCK${Date.now()}`;
        break;
    }
    
    // 3. 更新支付成功
    await pool.query(
      `UPDATE directed_payment_requests 
       SET status = 'success', execution_time = NOW(), execution_channel = 'mock',
           execution_transaction_id = ?, execution_status = 'success',
           interest_start_time = NOW()
       WHERE id = ?`,
      [transactionId, requestId]
    );
    
  } catch (error: any) {
    // 回滚额度
    await restoreContractCredit(request.contractId, request.paymentAmount);
    
    // 更新支付失败
    await pool.query(
      `UPDATE directed_payment_requests 
       SET status = 'failed', execution_time = NOW(),
           execution_status = 'failed', execution_failure_reason = ?
       WHERE id = ?`,
      [error.message, requestId]
    );
    
    throw error;
  }
  
  return (await getPaymentRequestById(requestId))!;
}

// 扣减合同额度（需要从合同模块导入）
async function deductContractCredit(contractId: string, amount: number): Promise<void> {
  const [result] = await pool.query(
    `UPDATE directed_pay_contracts 
     SET used_amount = used_amount + ?, available_amount = available_amount - ?
     WHERE id = ? AND available_amount >= ? AND status = 'active'`,
    [amount, amount, contractId, amount]
  );
  if ((result as any).affectedRows === 0) {
    throw new Error("扣减额度失败：额度不足或合同状态异常");
  }
}

// 恢复合同额度
async function restoreContractCredit(contractId: string, amount: number): Promise<void> {
  await pool.query(
    `UPDATE directed_pay_contracts 
     SET used_amount = used_amount - ?, available_amount = available_amount + ?
     WHERE id = ?`,
    [amount, amount, contractId]
  );
}

// 为支付申请创建付款码（需要从系统模块导入）
async function createPaymentCodeForRequest(request: DirectedPaymentRequest): Promise<any> {
  // 调用付款码创建函数
  // import { createPaymentCode } from "./payment-codes-store.js";
  // return await createPaymentCode({ ... });
}

// 推送付款码到TMS
async function syncPaymentCodeToTms(paymentCode: any): Promise<void> {
  // TODO: 实现TMS接口调用
  // 这里先模拟
  console.log("Syncing payment code to TMS:", paymentCode.code);
}

// 充值到虚拟账户
async function creditVirtualAccount(request: DirectedPaymentRequest): Promise<string> {
  // 调用虚拟账户入账函数
  // import { creditAccount, getVirtualAccountByOwner } from "./virtual-accounts-store.js";
  // const account = await getVirtualAccountByOwner("driver", request.driverId);
  // const txn = await creditAccount(account.id, request.paymentAmount, "directed_payment", request.id);
  // return txn.transactionNumber;
  return `VA${Date.now()}`;
}

// ==================== 自动支付 ====================

/**
 * 检查运单是否触发自动支付
 * 当运单创建或更新时调用
 */
export async function checkAutoPayment(waybillId: string): Promise<void> {
  // 1. 获取运单信息
  const waybill = await getWaybillById(waybillId);
  if (!waybill) return;
  
  // 2. 查找融资方对应的活动合同
  const contract = await getActiveContractByFinancier(waybill.customerId);
  if (!contract || !contract.autoPaymentEnabled) return;
  
  // 3. 获取合同的自动支付类别
  const categories = await getAutoPaymentCategories(contract.id);
  
  // 4. 对每个启用自动支付的类别，检查运单是否有对应费用
  for (const category of categories) {
    const amount = extractAmountFromWaybill(waybill, category.categoryCode);
    if (amount > 0) {
      // 创建支付申请
      await createPaymentRequest({
        contractId: contract.id,
        waybillId: waybill.id,
        waybillNumber: waybill.waybillNumber,
        categoryCode: category.categoryCode,
        categoryName: category.categoryName,
        paymentAmount: amount,
        serviceFee: amount * category.serviceRate,
        receiverType: "payment_code", // 默认使用付款码
        driverId: waybill.driverId,
        driverName: waybill.driverName,
        driverPhone: waybill.driverPhone,
        remark: `自动支付 - ${category.categoryName}`,
      });
    }
  }
}

// 从运单提取费用金额
function extractAmountFromWaybill(waybill: any, categoryCode: string): number {
  switch (categoryCode) {
    case "FREIGHT":
      return waybill.freightAmount || 0;
    case "OIL_CARD":
      return waybill.oilCardAmount || 0;
    case "ETC":
      return waybill.etcAmount || 0;
    case "SALARY":
      return waybill.cashAmount || 0; // 假设现金部分是工资
    default:
      return 0;
  }
}

// 获取运单（需要从运单模块导入）
async function getWaybillById(id: string): Promise<any> {
  const [rows] = await pool.query<any[]>(
    `SELECT * FROM waybills WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );
  return rows[0];
}

// 获取活动合同（需要从合同模块导入）
async function getActiveContractByFinancier(financierId: string): Promise<any> {
  const [rows] = await pool.query<any[]>(
    `SELECT * FROM directed_pay_contracts 
     WHERE financier_id = ? AND status = 'active' 
     AND start_date <= CURDATE() AND end_date >= CURDATE()
     AND deleted_at IS NULL
     LIMIT 1`,
    [financierId]
  );
  return rows[0] ? {
    ...rows[0],
    autoPaymentEnabled: rows[0].auto_payment_enabled === 1,
  } : null;
}

// 获取自动支付类别
async function getAutoPaymentCategories(contractId: string): Promise<any[]> {
  const [rows] = await pool.query<any[]>(
    `SELECT * FROM payment_category_configs 
     WHERE contract_id = ? AND is_enabled = 1 AND auto_payment_enabled = 1`,
    [contractId]
  );
  return rows.map(row => ({
    categoryCode: row.category_code,
    categoryName: row.category_name,
    serviceRate: Number(row.service_rate),
  }));
}
```

---

### 任务3：支付申请 API 路由

**目标**：实现支付申请相关的API接口

**文件**：在 `backend/src/routes.ts` 中添加

**实现以下API**：

```typescript
// POST /api/directed-pay/requests - 创建支付申请
// GET /api/directed-pay/requests - 获取申请列表
// GET /api/directed-pay/requests/:id - 获取申请详情
// POST /api/directed-pay/requests/:id/platform-approve - 平台审批通过
// POST /api/directed-pay/requests/:id/platform-reject - 平台审批拒绝
// POST /api/directed-pay/requests/:id/funder-approve - 资金方审批通过
// POST /api/directed-pay/requests/:id/funder-reject - 资金方审批拒绝
// POST /api/directed-pay/requests/:id/cancel - 取消申请
// POST /api/directed-pay/requests/:id/execute - 执行支付
// POST /api/directed-pay/requests/batch - 批量创建申请
// GET /api/directed-pay/requests/pending-approvals - 获取待审批列表
```

---

### 任务4：运单页面集成 - 手动发起支付

**目标**：在运单详情/列表页面添加"发起定向支付"功能

**文件**：修改 `frontend/src/pages/Waybills.tsx`

**修改内容**：

1. **运单列表操作列**添加"定向支付"按钮
```tsx
<Button 
  type="link" 
  onClick={() => openPaymentModal(record)}
  disabled={!canDirectedPay(record)}
>
  定向支付
</Button>
```

2. **添加支付弹窗**
```tsx
const [paymentModalOpen, setPaymentModalOpen] = useState(false);
const [selectedWaybill, setSelectedWaybill] = useState<Waybill | null>(null);

<Modal
  title="发起定向支付"
  open={paymentModalOpen}
  onCancel={() => {
    setPaymentModalOpen(false);
    paymentForm.resetFields();
  }}
  onOk={handleSubmitPayment}
>
  <Form form={paymentForm} layout="vertical">
    {/* 运单信息展示（只读） */}
    <div style={{ marginBottom: 16, background: '#f5f5f5', padding: 12, borderRadius: 4 }}>
      <p>运单号: {selectedWaybill?.waybillNumber}</p>
      <p>司机: {selectedWaybill?.driverName}</p>
      <p>运费: ¥{selectedWaybill?.freightAmount}</p>
    </div>
    
    {/* 选择支付类别 */}
    <Form.Item name="categoryCode" label="支付类别" rules={[{ required: true }]}>
      <Select options={paymentCategories} />
    </Form.Item>
    
    {/* 支付金额 */}
    <Form.Item name="paymentAmount" label="支付金额" rules={[{ required: true }]}>
      <InputNumber style={{ width: '100%' }} min={0} precision={2} />
    </Form.Item>
    
    {/* 收款方式 */}
    <Form.Item name="receiverType" label="收款方式" rules={[{ required: true }]}>
      <Select>
        <Select.Option value="payment_code">平台直付</Select.Option>
        <Select.Option value="virtual_account">虚拟账户</Select.Option>
        <Select.Option value="bank_transfer">银行卡转账</Select.Option>
      </Select>
    </Form.Item>
    
    {/* 备注 */}
    <Form.Item name="remark" label="备注">
      <Input.TextArea rows={2} />
    </Form.Item>
  </Form>
</Modal>
```

3. **检查是否可以发起定向支付**
```typescript
const canDirectedPay = (waybill: Waybill) => {
  // 检查运单是否已关联定向支付合同
  // 检查合同是否有效
  // 检查用户是否有权限
  return true; // 实际需要调用API检查
};
```

---

### 任务5：支付申请列表页面

**目标**：创建支付申请列表页面

**文件**：创建 `frontend/src/pages/DirectedPayRequests.tsx`

**页面功能**：
- 支付申请列表展示
- 筛选：合同、运单、状态、类别、日期
- 统计卡片：待审批、处理中、成功、失败
- 操作：查看详情、取消、执行支付

**列表字段**：
- 申请编号
- 合同号
- 运单号
- 支付类别
- 支付金额
- 收款方式
- 司机
- 平台审批
- 资金方审批
- 状态
- 创建时间
- 操作

---

### 任务6：待审批页面

**目标**：创建待审批列表页面

**文件**：创建 `frontend/src/pages/DirectedPayApprovals.tsx`

**页面功能**：
- Tab切换：平台待审批 / 资金方待审批
- 审批列表展示
- 操作：通过、拒绝（带备注）
- 批量审批

---

### 任务7：TMS 对接接口

**目标**：实现与 TMS 系统的对接

**文件**：创建 `backend/src/tms-service.ts`

**实现内容**：

```typescript
import fetch from "node-fetch";

const TMS_BASE_URL = process.env.TMS_BASE_URL || "http://tms-api.example.com";
const TMS_API_KEY = process.env.TMS_API_KEY || "";

interface TmsSyncResult {
  success: boolean;
  tmsCodeId?: string;
  error?: string;
}

/**
 * 推送付款码到 TMS 系统
 */
export async function syncPaymentCodeToTms(paymentCode: {
  code: string;
  amount: number;
  expireAt: string;
  driverId?: string;
  driverPhone?: string;
  waybillNumber?: string;
  categoryName: string;
  remark?: string;
}): Promise<TmsSyncResult> {
  try {
    const response = await fetch(`${TMS_BASE_URL}/api/payment-codes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": TMS_API_KEY,
      },
      body: JSON.stringify({
        platformCode: "DENGTU",
        driverId: paymentCode.driverId,
        driverPhone: paymentCode.driverPhone,
        paymentCode: paymentCode.code,
        amount: paymentCode.amount,
        expireAt: paymentCode.expireAt,
        waybillNumber: paymentCode.waybillNumber,
        categoryName: paymentCode.categoryName,
        remark: paymentCode.remark,
      }),
    });

    const data = await response.json() as any;
    
    if (data.success) {
      return {
        success: true,
        tmsCodeId: data.data.tmsCodeId,
      };
    } else {
      return {
        success: false,
        error: data.error || "TMS同步失败",
      };
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * TMS 回调处理
 */
export async function handleTmsCallback(payload: {
  paymentCode: string;
  status: "used" | "expired" | "cancelled";
  usedAt?: string;
  usedLocation?: string;
}): Promise<void> {
  // 1. 更新付款码状态
  // 2. 如果是使用，可能需要触发后续流程
}
```

**添加环境变量**：
```
TMS_BASE_URL=http://tms-api.example.com
TMS_API_KEY=your-api-key
```

---

### 任务8：菜单和路由配置

**目标**：将支付申请页面集成到系统菜单

**文件**：
- `frontend/src/App.tsx`
- `frontend/src/layouts/AppLayout.tsx`

**菜单结构**：
```
定向支付
├── 合同管理        (合同模块负责)
├── 支付管理
│   ├── 支付申请    <-- 你负责
│   ├── 发起支付    <-- 你负责 (可选独立页面或在运单页面操作)
│   └── 待审批      <-- 你负责
├── 虚拟账户        (系统模块负责)
└── 结算管理        (结算模块负责)
```

---

## 验收标准

1. 支付申请 CRUD 功能正常
2. 审批流程（平台→资金方）正确执行
3. 支付执行逻辑正确（扣减额度、生成付款码等）
4. 运单页面可发起定向支付
5. 支付申请列表页面正常
6. 待审批页面正常
7. TMS 对接接口可用（模拟或真实）

---

## 注意事项

1. admin 用户拥有全部权限，可跳过审批直接执行
2. 支付执行需要事务保证，失败要回滚额度
3. 付款码有时效性，需要记录过期时间
4. 自动支付逻辑要考虑幂等性（避免重复创建）
5. TMS 对接先用模拟实现，预留真实接口

---

## 依赖其他模块

- **系统模块**：付款码表和函数、虚拟账户函数
- **合同模块**：合同查询、类别配置查询、额度扣减/恢复
- **结算模块**：支付成功后记录用于结算

---

*任务文档版本: v1.0*
