import { Modal, Form, InputNumber, DatePicker, Input, message, Radio, Space } from "antd";
import { useState } from "react";
import dayjs from "dayjs";
import { getToken, getErrorMessage, getApiBase } from "../api";

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
      
      const response = await fetch(`${getApiBase()}/contracts/${contractId}/repayments`, {
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
