import { Modal, Form, InputNumber, DatePicker, Input, message } from "antd";
import { useState } from "react";
import dayjs from "dayjs";
import { getToken, getErrorMessage, getApiBase } from "../api";

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
      
      const response = await fetch(`${getApiBase()}/contracts/${contractId}/disbursements`, {
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
