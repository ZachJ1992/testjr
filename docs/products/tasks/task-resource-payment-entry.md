# Agent B 任务：资源管理 - 运单申请支付入口

## 任务目标

1. 运单列表的"支付"按钮改为"申请支付"
2. 在运单详情页添加"申请支付"入口
3. 根据运单当前状态显示可申请的费用类别

---

## 任务清单

### 任务1：运单状态字段

**文件**：`frontend/src/types.ts`（如果还没有）

确保运单类型包含状态字段：

```typescript
export interface Waybill {
  id: string;
  waybillNumber: string;
  status: WaybillStatus;  // 确保有这个字段
  // ... 其他字段 ...
  freightAmount?: number;    // 运费金额
  etcAmount?: number;        // ETC金额
  oilAmount?: number;        // 油费金额
  // 等等
}
```

---

### 任务2：运单列表页修改

**文件**：`frontend/src/pages/Waybills.tsx`

#### 2.1 按钮文案修改

```tsx
// 找到"支付"按钮，改为"申请支付"
<Button 
  type="link" 
  size="small"
  onClick={() => openPaymentModal(record)}
>
  申请支付
</Button>
```

#### 2.2 添加申请支付弹窗

```tsx
// 状态
const [paymentModalOpen, setPaymentModalOpen] = useState(false);
const [selectedWaybill, setSelectedWaybill] = useState<Waybill | null>(null);
const [availableCategories, setAvailableCategories] = useState<PaymentCategoryConfig[]>([]);
const [paymentForm] = Form.useForm();

// 打开弹窗
const openPaymentModal = async (waybill: Waybill) => {
  setSelectedWaybill(waybill);
  setPaymentModalOpen(true);
  
  // 获取该运单可申请的费用类别
  try {
    const res = await fetchAvailableCategories(token!, waybill.id);
    setAvailableCategories(res.categories.filter(c => c.isUnlocked));
  } catch (err) {
    message.error("获取可申请费用类别失败");
  }
};

// 弹窗内容
<Modal
  title="申请支付"
  open={paymentModalOpen}
  onCancel={() => {
    setPaymentModalOpen(false);
    paymentForm.resetFields();
  }}
  onOk={handleSubmitPayment}
>
  {selectedWaybill && (
    <Form form={paymentForm} layout="vertical">
      <Descriptions size="small" column={2} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="运单号">{selectedWaybill.waybillNumber}</Descriptions.Item>
        <Descriptions.Item label="当前状态">
          <Tag>{WAYBILL_STATUS_OPTIONS.find(o => o.value === selectedWaybill.status)?.label}</Tag>
        </Descriptions.Item>
      </Descriptions>
      
      <Form.Item 
        name="categoryCode" 
        label="费用类别"
        rules={[{ required: true, message: "请选择费用类别" }]}
      >
        <Select placeholder="请选择">
          {availableCategories.map(cat => (
            <Select.Option key={cat.categoryCode} value={cat.categoryCode}>
              {cat.categoryName} 
              {cat.paymentRatio < 100 && ` (支付比例${cat.paymentRatio}%)`}
            </Select.Option>
          ))}
        </Select>
      </Form.Item>
      
      <Form.Item 
        name="paymentAmount" 
        label="申请金额"
        rules={[{ required: true, message: "请输入金额" }]}
      >
        <InputNumber
          style={{ width: "100%" }}
          min={0.01}
          precision={2}
          prefix="¥"
        />
      </Form.Item>
      
      <Form.Item name="receiverType" label="收款方式" rules={[{ required: true }]}>
        <Select placeholder="请选择" options={RECEIVER_TYPE_OPTIONS} />
      </Form.Item>
      
      <Form.Item name="remark" label="备注">
        <Input.TextArea rows={2} />
      </Form.Item>
    </Form>
  )}
</Modal>
```

#### 2.3 提交申请

```tsx
const handleSubmitPayment = async () => {
  if (!selectedWaybill || !token) return;
  
  try {
    const values = await paymentForm.validateFields();
    const category = availableCategories.find(c => c.categoryCode === values.categoryCode);
    
    await createPaymentRequestApi(token, {
      contractId: selectedWaybill.contractId, // 运单关联的合同
      waybillId: selectedWaybill.id,
      waybillNumber: selectedWaybill.waybillNumber,
      categoryCode: values.categoryCode,
      categoryName: category?.categoryName || values.categoryCode,
      paymentAmount: values.paymentAmount,
      receiverType: values.receiverType,
      remark: values.remark,
    });
    
    message.success("支付申请已提交");
    setPaymentModalOpen(false);
    paymentForm.resetFields();
  } catch (err) {
    message.error(getErrorMessage(err));
  }
};
```

---

### 任务3：新增API - 获取运单可申请费用类别

**文件**：`frontend/src/api.ts`

```typescript
// 获取运单可申请的费用类别
export async function fetchAvailableCategories(
  token: string,
  waybillId: string
): Promise<{
  categories: Array<PaymentCategoryConfig & { isUnlocked: boolean }>
}> {
  return request(`/waybills/${waybillId}/available-categories`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}
```

---

### 任务4：后端API - 获取运单可申请费用类别

**文件**：`backend/src/routes.ts` 或新建 `backend/src/waybill-payment-routes.ts`

```typescript
// GET /api/waybills/:waybillId/available-categories
router.get(
  "/waybills/:waybillId/available-categories",
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const waybillId = req.params.waybillId;
      
      // 1. 获取运单信息
      const [waybillRows] = await pool.query<RowDataPacket[]>(
        "SELECT * FROM waybills WHERE id = ?",
        [waybillId]
      );
      
      if (!waybillRows[0]) {
        return res.status(404).json({ error: "运单不存在" });
      }
      
      const waybill = waybillRows[0];
      const waybillStatus = waybill.status || "created";
      
      // 2. 获取运单关联合同的费用类别配置
      const [categoryRows] = await pool.query<RowDataPacket[]>(
        `SELECT pcc.* 
         FROM payment_category_configs pcc
         JOIN directed_pay_contracts dpc ON pcc.contract_id = dpc.id
         WHERE dpc.financier_id = ? AND pcc.is_enabled = 1`,
        [waybill.financier_id]
      );
      
      // 3. 判断每个类别是否已解锁
      const statusOrder = [
        "created", "dispatched", "loading", "in_transit",
        "delivered", "signed", "settled", "completed"
      ];
      
      const currentStatusIndex = statusOrder.indexOf(waybillStatus);
      
      const categories = categoryRows.map(row => {
        const unlockStatus = row.unlock_status || "created";
        const unlockIndex = statusOrder.indexOf(unlockStatus);
        const isUnlocked = currentStatusIndex >= unlockIndex;
        
        return {
          id: row.id,
          contractId: row.contract_id,
          categoryCode: row.category_code,
          categoryName: row.category_name,
          paymentRatio: Number(row.payment_ratio),
          minAmount: row.min_amount ? Number(row.min_amount) : undefined,
          maxAmount: row.max_amount ? Number(row.max_amount) : undefined,
          unlockStatus: unlockStatus,
          isUnlocked: isUnlocked,
        };
      });
      
      res.json({ categories });
    } catch (error: any) {
      console.error("获取可申请费用类别失败:", error);
      res.status(500).json({ error: error.message });
    }
  }
);
```

---

### 任务5：运单列表显示状态

确保运单列表显示当前状态，方便用户了解可申请哪些费用：

```tsx
{
  title: "状态",
  dataIndex: "status",
  width: 100,
  render: (status: WaybillStatus) => {
    const opt = WAYBILL_STATUS_OPTIONS.find(o => o.value === status);
    const colorMap: Record<string, string> = {
      created: "default",
      dispatched: "processing",
      loading: "processing",
      in_transit: "blue",
      delivered: "cyan",
      signed: "green",
      settled: "purple",
      completed: "success",
    };
    return <Tag color={colorMap[status] || "default"}>{opt?.label || status}</Tag>;
  }
},
```

---

## 验收标准

1. ✅ 运单列表"支付"按钮改为"申请支付"
2. ✅ 点击"申请支付"弹出申请弹窗
3. ✅ 弹窗显示当前运单状态
4. ✅ 费用类别下拉只显示已解锁的类别
5. ✅ 提交申请成功后跳转或提示
6. ✅ 后端API正确返回可申请类别及解锁状态

---

## 相关文件

```
frontend/src/pages/Waybills.tsx              (运单列表页)
frontend/src/api.ts                          (API调用)
frontend/src/types.ts                        (类型定义)
backend/src/routes.ts                        (后端路由)
```

---

## 依赖

- 依赖 Agent A 完成 `unlock_status` 字段的添加
- 依赖 Agent C 完成数据权限过滤
