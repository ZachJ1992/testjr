# Agent A 任务：合同管理 - 费用类别解锁状态配置

## 任务目标

在定向支付合同的费用类别配置中，添加"解锁状态"字段，让用户可以配置每个费用类别在运单达到什么状态后才能申请。

---

## 任务清单

### 任务1：数据库迁移

**文件**：`backend/src/migrations/add-unlock-status.ts`

```typescript
/**
 * 为 payment_category_configs 表添加 unlock_status 字段
 */
import { pool } from "../db.js";

export async function runAddUnlockStatusMigration(): Promise<void> {
  console.log("[MIGRATION] 添加 unlock_status 字段...");

  try {
    // 检查字段是否已存在
    const [columns] = await pool.query<any[]>(
      "SHOW COLUMNS FROM payment_category_configs LIKE 'unlock_status'"
    );

    if (columns.length > 0) {
      console.log("[MIGRATION] unlock_status 字段已存在，跳过");
      return;
    }

    await pool.query(`
      ALTER TABLE payment_category_configs
      ADD COLUMN unlock_status VARCHAR(50) DEFAULT 'created'
      COMMENT '解锁状态：达到此状态后可申请该费用'
    `);

    console.log("[MIGRATION] unlock_status 字段添加成功");
  } catch (error: any) {
    console.error("[MIGRATION] 迁移失败:", error.message);
    throw error;
  }
}
```

**注册迁移**：在 `backend/src/index.ts` 中添加迁移调用

---

### 任务2：后端类型定义更新

**文件**：`backend/src/types.ts`

在 `PaymentCategoryConfig` 接口中添加：

```typescript
export interface PaymentCategoryConfig {
  // ... 现有字段 ...
  unlockStatus: WaybillStatus;  // 解锁状态
}

// 运单状态类型
export type WaybillStatus = 
  | "created"      // 已创建
  | "dispatched"   // 已派单  
  | "loading"      // 装货中
  | "in_transit"   // 运输中
  | "delivered"    // 已送达
  | "signed"       // 已签收
  | "settled"      // 已结算
  | "completed";   // 已完成

// 状态顺序常量
export const WAYBILL_STATUS_ORDER: WaybillStatus[] = [
  "created",
  "dispatched", 
  "loading",
  "in_transit",
  "delivered",
  "signed",
  "settled",
  "completed"
];

// 状态显示名映射
export const WAYBILL_STATUS_LABELS: Record<WaybillStatus, string> = {
  created: "已创建",
  dispatched: "已派单",
  loading: "装货中",
  in_transit: "运输中",
  delivered: "已送达",
  signed: "已签收",
  settled: "已结算",
  completed: "已完成"
};
```

---

### 任务3：后端路由更新

**文件**：`backend/src/directed-payment-routes.ts`

#### 3.1 获取类别时返回 unlock_status

```typescript
// 修改 mapCategoryRow 或相关查询
const categories = rows.map((row) => ({
  // ... 现有字段 ...
  unlockStatus: row.unlock_status || "created",
}));
```

#### 3.2 添加类别时支持 unlock_status

```typescript
// POST /directed-pay/contracts/:id/categories
const {
  // ... 现有字段 ...
  unlockStatus = "created",
} = req.body;

// INSERT 语句添加 unlock_status
```

#### 3.3 更新类别时支持 unlock_status

```typescript
// PUT /directed-pay/contracts/:id/categories/:catId
const fields = [
  "payment_ratio",
  // ... 现有字段 ...
  "unlock_status",  // 添加这个
];
```

---

### 任务4：前端类型定义更新

**文件**：`frontend/src/types.ts`

```typescript
export interface PaymentCategoryConfig {
  // ... 现有字段 ...
  unlockStatus: WaybillStatus;
}

export type WaybillStatus = 
  | "created" | "dispatched" | "loading" | "in_transit" 
  | "delivered" | "signed" | "settled" | "completed";

export const WAYBILL_STATUS_OPTIONS = [
  { value: "created", label: "已创建" },
  { value: "dispatched", label: "已派单" },
  { value: "loading", label: "装货中" },
  { value: "in_transit", label: "运输中" },
  { value: "delivered", label: "已送达" },
  { value: "signed", label: "已签收" },
  { value: "settled", label: "已结算" },
  { value: "completed", label: "已完成" },
];
```

---

### 任务5：前端创建页面更新

**文件**：`frontend/src/pages/CreateDirectedPayContract.tsx`

#### 5.1 接口更新

```typescript
interface CategoryConfigItem {
  // ... 现有字段 ...
  unlockStatus: WaybillStatus;  // 添加
}
```

#### 5.2 表格列添加"解锁状态"

在支付类别配置表格中添加一列：

```tsx
{
  title: "解锁状态",
  dataIndex: "unlockStatus",
  width: 140,
  render: (_, record) => (
    <Select
      size="small"
      value={record.unlockStatus}
      onChange={(v) => handleUpdateCategory(record.key, "unlockStatus", v)}
      style={{ width: 120 }}
      options={WAYBILL_STATUS_OPTIONS}
    />
  )
},
```

#### 5.3 添加类别时默认值

```typescript
const newCategory: CategoryConfigItem = {
  // ... 现有字段 ...
  unlockStatus: "created",  // 默认值
};
```

#### 5.4 提交时传递 unlockStatus

```typescript
await addPaymentCategoryApi(token, contractId, {
  // ... 现有字段 ...
  unlockStatus: cat.unlockStatus,
});
```

---

### 任务6：前端列表页更新

**文件**：`frontend/src/pages/DirectedPayContracts.tsx`

在合同详情抽屉的类别列表中显示解锁状态：

```tsx
{
  title: "解锁状态",
  dataIndex: "unlockStatus",
  key: "unlockStatus",
  render: (v: WaybillStatus) => {
    const opt = WAYBILL_STATUS_OPTIONS.find(o => o.value === v);
    return <Tag>{opt?.label || v}</Tag>;
  }
},
```

---

## 验收标准

1. ✅ 数据库 `payment_category_configs` 表有 `unlock_status` 字段
2. ✅ 创建合同时可以为每个费用类别配置解锁状态
3. ✅ 合同详情显示各费用类别的解锁状态
4. ✅ API 正确返回和保存 `unlockStatus` 字段

---

## 相关文件

```
backend/src/migrations/add-unlock-status.ts  (新建)
backend/src/index.ts                          (注册迁移)
backend/src/types.ts                          (类型更新)
backend/src/directed-payment-routes.ts        (路由更新)
frontend/src/types.ts                         (类型更新)
frontend/src/pages/CreateDirectedPayContract.tsx  (创建页面)
frontend/src/pages/DirectedPayContracts.tsx       (列表页面)
frontend/src/api.ts                           (API调用)
```
