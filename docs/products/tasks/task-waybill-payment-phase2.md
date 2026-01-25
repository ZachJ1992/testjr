# 定向支付产品 - 第二阶段：运单状态费用申请

## 需求概述

实现运单状态与费用申请的关联：
1. 运单有多个状态（创建→运输中→已签收→已完成）
2. 每个费用类别配置"解锁状态"，达到该状态后才能申请
3. 支持自动申请和手动申请两种方式
4. 融资方只能看到自己的申请，平台看全部

---

## 运单状态定义（暂定，后续根据TMS调整）

```typescript
export type WaybillStatus = 
  | "created"      // 已创建
  | "dispatched"   // 已派单  
  | "loading"      // 装货中
  | "in_transit"   // 运输中
  | "delivered"    // 已送达
  | "signed"       // 已签收
  | "settled"      // 已结算
  | "completed"    // 已完成
  | "cancelled";   // 已取消

// 状态顺序（用于判断"该状态及之后"）
export const WAYBILL_STATUS_ORDER = [
  "created",
  "dispatched", 
  "loading",
  "in_transit",
  "delivered",
  "signed",
  "settled",
  "completed"
];
```

---

## 分工说明

### Agent A - 合同管理模块
负责人：合同管理Agent
文件：`docs/products/tasks/task-contract-waybill-status.md`

### Agent B - 资源管理模块  
负责人：资源管理Agent
文件：`docs/products/tasks/task-resource-payment-entry.md`

### Agent C - 定向支付模块（整体协调）
负责人：当前Agent
任务：支付申请页面优化 + 数据权限

---

## 数据模型变更

### 1. 修改 payment_category_configs 表

在现有的支付类别配置表中添加字段：

```sql
ALTER TABLE payment_category_configs
ADD COLUMN unlock_status VARCHAR(50) DEFAULT 'created' 
  COMMENT '解锁状态：达到此状态后可申请该费用';
```

### 2. 修改 directed_payment_requests 表

添加原始金额字段：

```sql
ALTER TABLE directed_payment_requests
ADD COLUMN original_amount DECIMAL(18,2) 
  COMMENT '原始费用金额（用于支付比例计算）';
```

---

## 业务规则

### 费用解锁逻辑

```
配置示例：
- 油卡费用：unlock_status = "dispatched"（派单后可申请）
- ETC费用：unlock_status = "in_transit"（运输中可申请）
- 运费：unlock_status = "signed"（签收后可申请）
- 工资：unlock_status = "completed"（完成后可申请）

判断逻辑：
当前运单状态 >= 配置的解锁状态 → 允许申请
```

### 手动申请流程

```
融资方操作：
1. 进入运单详情页 或 支付申请页面
2. 选择运单
3. 系统显示该运单当前状态可申请的费用类别
4. 选择费用类别，填写金额（受支付比例限制）
5. 提交申请
6. 进入审批流程
```

### 自动申请流程（后续实现）

```
运单状态变更时：
1. 运单状态更新
2. 检查合同配置的费用类别
3. 找出 unlock_status == 当前状态 且 autoPaymentEnabled = true 的类别
4. 自动创建支付申请
```

---

## 数据权限规则

| 用户角色 | 可见数据 |
|---------|---------|
| 平台管理员 | 全部申请 |
| 资金方用户 | 与该资金方相关的合同的申请 |
| 融资方用户 | 仅自己组织的申请 |

---

## 接口变更

### 1. 获取运单可申请费用类别

```
GET /api/waybills/:waybillId/available-categories

Response:
{
  categories: [
    {
      categoryCode: "OIL_CARD",
      categoryName: "油卡",
      paymentRatio: 80,
      maxAmount: 5000,
      unlockStatus: "dispatched",
      isUnlocked: true  // 当前运单状态已解锁
    },
    {
      categoryCode: "FREIGHT", 
      categoryName: "运费",
      paymentRatio: 100,
      unlockStatus: "signed",
      isUnlocked: false  // 当前运单状态未解锁
    }
  ]
}
```

### 2. 支付申请列表（带权限过滤）

```
GET /api/directed-pay/requests

Headers: Authorization: Bearer <token>

后端逻辑：
- 从 token 解析用户信息
- 根据用户组织类型过滤数据
- 平台用户返回全部，融资方用户返回自己组织的
```
