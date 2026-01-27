# Agent 提示词：三方融资合同 UI 优化

## 角色定义

你是登途云项目的前端开发 Agent，负责优化三方融资合同模块的用户体验。

## 背景知识

在开始任务前，请先阅读以下文档了解项目架构：
- `docs/development/PROJECT_ARCHITECTURE.md` - 项目架构说明
- `docs/development/DEVELOPMENT_LOG.md` - 开发日志
- `docs/development/ERROR_HANDLING_LOG.md` - 错误处理规范

## 任务目标

完成两项 UI 优化：
1. 修复合同详情弹窗的排版错位问题
2. 在合同列表中添加放款/还款快捷操作按钮

## 详细需求

### 需求 1：修复弹窗排版

**当前问题**：
- 日期显示带时区（`2026-01-12T16:00:00.000Z`），应简化为 `2026-01-12`
- 信息区块对齐不一致，存在错位

**修改文件**：`frontend/src/pages/Contracts.tsx`

**修改要点**：
1. 日期使用 `dayjs(date).format('YYYY-MM-DD')` 格式化
2. 使用 Ant Design 的 `Descriptions` 组件或 `Row/Col` 布局确保对齐
3. 金额使用 `.toLocaleString('zh-CN', { minimumFractionDigits: 2 })` 格式化

### 需求 2：添加放款/还款快捷操作

**实现方案**：创建独立的放款和还款 Modal 组件

**步骤 1：创建放款弹窗组件**

创建文件 `frontend/src/components/DisbursementModal.tsx`：

```tsx
import { Modal, Form, InputNumber, DatePicker, Input, message } from "antd";
import { useState } from "react";
import dayjs from "dayjs";
import { getToken, getErrorMessage } from "../api";

interface DisbursementModalProps {
  open: boolean;
  contractId: string;
  contractName: string;
  creditLimit: number;
  availableCredit: number;
  onClose: () => void;
  onSuccess: () => void;
}

export default function DisbursementModal({
  open,
  contractId,
  contractName,
  creditLimit,
  availableCredit,
  onClose,
  onSuccess
}: DisbursementModalProps) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const token = getToken();
    if (!token) return;
    
    try {
      const values = await form.validateFields();
      setLoading(true);
      
      const response = await fetch(`/api/contracts/${contractId}/disbursements`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: values.amount,
          disbursementDate: values.disbursementDate.format("YYYY-MM-DD"),
          remark: values.remark
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "放款失败");
      }
      
      message.success("放款成功");
      form.resetFields();
      onSuccess();
      onClose();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={`放款 - ${contractName}`}
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={loading}
      destroyOnClose
    >
      <Form form={form} layout="vertical" initialValues={{ disbursementDate: dayjs() }}>
        <Form.Item label="可用额度">
          <span style={{ color: "#1890ff", fontWeight: 500 }}>
            ¥{availableCredit.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
          </span>
          <span style={{ color: "#999", marginLeft: 8 }}>
            / ¥{creditLimit.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
          </span>
        </Form.Item>
        <Form.Item
          name="amount"
          label="放款金额"
          rules={[
            { required: true, message: "请输入放款金额" },
            { type: "number", min: 0.01, message: "金额必须大于0" },
            { type: "number", max: availableCredit, message: "超出可用额度" }
          ]}
        >
          <InputNumber
            style={{ width: "100%" }}
            precision={2}
            prefix="¥"
            placeholder="请输入放款金额"
          />
        </Form.Item>
        <Form.Item
          name="disbursementDate"
          label="放款日期"
          rules={[{ required: true, message: "请选择放款日期" }]}
        >
          <DatePicker style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={2} placeholder="可选" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
```

**步骤 2：创建还款弹窗组件**

创建文件 `frontend/src/components/RepaymentModal.tsx`：

```tsx
import { Modal, Form, InputNumber, DatePicker, Input, message, Radio, Space } from "antd";
import { useState } from "react";
import dayjs from "dayjs";
import { getToken, getErrorMessage } from "../api";

interface RepaymentModalProps {
  open: boolean;
  contractId: string;
  contractName: string;
  outstandingPrincipal: number;
  accruedInterest: number;
  onClose: () => void;
  onSuccess: () => void;
}

export default function RepaymentModal({
  open,
  contractId,
  contractName,
  outstandingPrincipal,
  accruedInterest,
  onClose,
  onSuccess
}: RepaymentModalProps) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [repaymentType, setRepaymentType] = useState<"principal" | "interest" | "both">("both");

  const handleSubmit = async () => {
    const token = getToken();
    if (!token) return;
    
    try {
      const values = await form.validateFields();
      setLoading(true);
      
      const response = await fetch(`/api/contracts/${contractId}/repayments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          principalAmount: values.principalAmount || 0,
          interestAmount: values.interestAmount || 0,
          repaymentDate: values.repaymentDate.format("YYYY-MM-DD"),
          remark: values.remark
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "还款失败");
      }
      
      message.success("还款成功");
      form.resetFields();
      onSuccess();
      onClose();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={`还款 - ${contractName}`}
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      confirmLoading={loading}
      destroyOnClose
      width={500}
    >
      <Form form={form} layout="vertical" initialValues={{ repaymentDate: dayjs() }}>
        <Form.Item label="待还信息">
          <Space size="large">
            <span>
              本金：<span style={{ color: "#ff4d4f", fontWeight: 500 }}>
                ¥{outstandingPrincipal.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
              </span>
            </span>
            <span>
              利息：<span style={{ color: "#faad14", fontWeight: 500 }}>
                ¥{accruedInterest.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
              </span>
            </span>
          </Space>
        </Form.Item>
        
        <Form.Item label="还款类型">
          <Radio.Group value={repaymentType} onChange={(e) => setRepaymentType(e.target.value)}>
            <Radio value="principal">仅还本金</Radio>
            <Radio value="interest">仅还利息</Radio>
            <Radio value="both">本息一起还</Radio>
          </Radio.Group>
        </Form.Item>
        
        {(repaymentType === "principal" || repaymentType === "both") && (
          <Form.Item
            name="principalAmount"
            label="还款本金"
            rules={[
              { required: repaymentType !== "interest", message: "请输入还款本金" },
              { type: "number", min: 0, message: "金额不能为负" },
              { type: "number", max: outstandingPrincipal, message: "超出待还本金" }
            ]}
          >
            <InputNumber
              style={{ width: "100%" }}
              precision={2}
              prefix="¥"
              placeholder="请输入还款本金"
            />
          </Form.Item>
        )}
        
        {(repaymentType === "interest" || repaymentType === "both") && (
          <Form.Item
            name="interestAmount"
            label="还款利息"
            rules={[
              { required: repaymentType !== "principal", message: "请输入还款利息" },
              { type: "number", min: 0, message: "金额不能为负" }
            ]}
          >
            <InputNumber
              style={{ width: "100%" }}
              precision={2}
              prefix="¥"
              placeholder="请输入还款利息"
            />
          </Form.Item>
        )}
        
        <Form.Item
          name="repaymentDate"
          label="还款日期"
          rules={[{ required: true, message: "请选择还款日期" }]}
        >
          <DatePicker style={{ width: "100%" }} />
        </Form.Item>
        
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={2} placeholder="可选" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
```

**步骤 3：修改 Contracts.tsx**

在 `frontend/src/pages/Contracts.tsx` 中：

1. 导入新组件：
```tsx
import DisbursementModal from "../components/DisbursementModal";
import RepaymentModal from "../components/RepaymentModal";
```

2. 添加状态：
```tsx
const [disbursementModalOpen, setDisbursementModalOpen] = useState(false);
const [repaymentModalOpen, setRepaymentModalOpen] = useState(false);
const [selectedContractForAction, setSelectedContractForAction] = useState<Contract | null>(null);
```

3. 添加处理函数：
```tsx
const handleOpenDisbursement = (contract: Contract) => {
  setSelectedContractForAction(contract);
  setDisbursementModalOpen(true);
};

const handleOpenRepayment = (contract: Contract) => {
  setSelectedContractForAction(contract);
  setRepaymentModalOpen(true);
};
```

4. 修改表格操作列：
```tsx
{
  title: "操作",
  key: "actions",
  width: 280,
  render: (_, record) => (
    <Space size="small">
      <Button type="link" size="small" onClick={() => handleView(record)}>
        查看
      </Button>
      <Button 
        type="link" 
        size="small" 
        style={{ color: "#52c41a" }}
        onClick={() => handleOpenDisbursement(record)}
      >
        放款
      </Button>
      <Button 
        type="link" 
        size="small" 
        style={{ color: "#faad14" }}
        onClick={() => handleOpenRepayment(record)}
      >
        还款
      </Button>
      <Button type="link" size="small" onClick={() => handleEdit(record)}>
        编辑
      </Button>
      <Popconfirm
        title="确认删除"
        onConfirm={() => handleDelete(record)}
      >
        <Button type="link" size="small" danger>
          删除
        </Button>
      </Popconfirm>
    </Space>
  )
}
```

5. 在 return 中添加 Modal 组件：
```tsx
{selectedContractForAction && (
  <>
    <DisbursementModal
      open={disbursementModalOpen}
      contractId={selectedContractForAction.id}
      contractName={generateContractName(selectedContractForAction)}
      creditLimit={selectedContractForAction.creditLimit}
      availableCredit={selectedContractForAction.creditLimit - (selectedContractForAction as any).totalDisbursed || 0}
      onClose={() => setDisbursementModalOpen(false)}
      onSuccess={() => refresh()}
    />
    <RepaymentModal
      open={repaymentModalOpen}
      contractId={selectedContractForAction.id}
      contractName={generateContractName(selectedContractForAction)}
      outstandingPrincipal={(selectedContractForAction as any).outstandingPrincipal || 0}
      accruedInterest={(selectedContractForAction as any).accruedInterest || 0}
      onClose={() => setRepaymentModalOpen(false)}
      onSuccess={() => refresh()}
    />
  </>
)}
```

**步骤 4：修复弹窗日期格式**

在详情弹窗中，找到日期显示的地方，替换为：

```tsx
// 原来
{contract.startDate} ~ {contract.endDate}

// 改为
{dayjs(contract.startDate).format('YYYY-MM-DD')} ~ {dayjs(contract.endDate).format('YYYY-MM-DD')}
```

## 验收标准

完成后请检查：

1. [ ] 新建了 `DisbursementModal.tsx` 组件
2. [ ] 新建了 `RepaymentModal.tsx` 组件
3. [ ] 合同列表中显示"放款"和"还款"按钮
4. [ ] 点击"放款"弹出放款弹窗，可正常提交
5. [ ] 点击"还款"弹出还款弹窗，可正常提交
6. [ ] 操作成功后列表自动刷新
7. [ ] 详情弹窗中日期显示为 `YYYY-MM-DD` 格式
8. [ ] 详情弹窗布局整齐，无错位

## 开发规范

- 所有异步操作使用 `async/await`
- 操作成功后必须 `await refresh()` 刷新数据
- 金额显示统一使用 `toLocaleString('zh-CN', { minimumFractionDigits: 2 })`
- 日期显示使用 `dayjs(date).format('YYYY-MM-DD')`
- 错误处理使用 `getErrorMessage(err)` 获取错误信息

## 完成后

1. 测试所有功能正常
2. 更新 `docs/development/DEVELOPMENT_LOG.md` 记录本次开发
3. 如遇错误，记录到 `docs/development/ERROR_HANDLING_LOG.md`
