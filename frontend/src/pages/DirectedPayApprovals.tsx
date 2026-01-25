import { useState, useEffect } from "react";
import {
  Card,
  Button,
  Space,
  Tag,
  Typography,
  message,
  Tabs,
  Badge,
  Modal,
  Form,
  Input,
  Popconfirm,
  Tooltip
} from "antd";
import {
  CheckOutlined,
  CloseOutlined,
  EyeOutlined,
  ReloadOutlined
} from "@ant-design/icons";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import DataTable from "../components/DataTable";
import {
  fetchPendingApprovals,
  platformApproveApi,
  platformRejectApi,
  funderApproveApi,
  funderRejectApi,
  getErrorMessage
} from "../api";
import {
  DirectedPaymentRequest,
  RECEIVER_TYPE_OPTIONS
} from "../types";
import dayjs from "dayjs";

const { Title, Text } = Typography;

function DirectedPayApprovalsPage() {
  const { token } = useAuth();
  const { t } = useI18n();
  
  const [activeTab, setActiveTab] = useState<"platform" | "funder">("platform");
  const [platformRequests, setPlatformRequests] = useState<DirectedPaymentRequest[]>([]);
  const [funderRequests, setFunderRequests] = useState<DirectedPaymentRequest[]>([]);
  const [loading, setLoading] = useState(false);
  
  // 审批弹窗
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<DirectedPaymentRequest | null>(null);
  const [approvalAction, setApprovalAction] = useState<"approve" | "reject">("approve");
  const [approvalForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [platformRes, funderRes] = await Promise.all([
        fetchPendingApprovals(token, "platform"),
        fetchPendingApprovals(token, "funder")
      ]);
      setPlatformRequests(platformRes.requests);
      setFunderRequests(funderRes.requests);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  const openApprovalModal = (request: DirectedPaymentRequest, action: "approve" | "reject") => {
    setSelectedRequest(request);
    setApprovalAction(action);
    setApprovalModalOpen(true);
  };

  const handleApproval = async () => {
    if (!selectedRequest || !token) return;
    try {
      const values = await approvalForm.validateFields();
      setSubmitting(true);
      const remark = values.remark;
      
      if (activeTab === "platform") {
        if (approvalAction === "approve") {
          await platformApproveApi(token, selectedRequest.id, remark);
          message.success("平台审批通过");
        } else {
          await platformRejectApi(token, selectedRequest.id, remark);
          message.success("平台审批拒绝");
        }
      } else {
        if (approvalAction === "approve") {
          await funderApproveApi(token, selectedRequest.id, remark);
          message.success("资金方审批通过");
        } else {
          await funderRejectApi(token, selectedRequest.id, remark);
          message.success("资金方审批拒绝");
        }
      }
      
      setApprovalModalOpen(false);
      approvalForm.resetFields();
      void refresh();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleBatchApprove = async (ids: string[]) => {
    if (!token) return;
    try {
      setLoading(true);
      for (const id of ids) {
        if (activeTab === "platform") {
          await platformApproveApi(token, id);
        } else {
          await funderApproveApi(token, id);
        }
      }
      message.success(`批量审批通过 ${ids.length} 条申请`);
      void refresh();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const formatMoney = (amount: number) => {
    return `¥${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`;
  };

  const columns = [
    {
      title: "申请编号",
      dataIndex: "requestNumber",
      width: 150
    },
    {
      title: "运单号",
      dataIndex: "waybillNumber",
      width: 140,
      render: (v: string) => v || "-"
    },
    {
      title: "支付类别",
      dataIndex: "categoryName",
      width: 100
    },
    {
      title: "支付金额",
      dataIndex: "paymentAmount",
      width: 120,
      render: (v: number) => <Text strong style={{ color: "#1890ff" }}>{formatMoney(v)}</Text>,
      sorter: (a: DirectedPaymentRequest, b: DirectedPaymentRequest) => a.paymentAmount - b.paymentAmount
    },
    {
      title: "收款方式",
      dataIndex: "receiverType",
      width: 130,
      render: (v: string) => {
        const opt = RECEIVER_TYPE_OPTIONS.find(o => o.value === v);
        return opt?.label || v;
      }
    },
    {
      title: "司机",
      dataIndex: "driverName",
      width: 100,
      render: (v: string) => v || "-"
    },
    {
      title: "申请时间",
      dataIndex: "createdAt",
      width: 160,
      render: (v: string) => dayjs(v).format("YYYY-MM-DD HH:mm"),
      sorter: (a: DirectedPaymentRequest, b: DirectedPaymentRequest) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      defaultSortOrder: "ascend" as const
    },
    {
      title: "操作",
      width: 150,
      fixed: "right" as const,
      render: (_: any, record: DirectedPaymentRequest) => (
        <Space size={0}>
          <Tooltip title="通过">
            <Button 
              type="link" 
              size="small" 
              icon={<CheckOutlined />}
              style={{ color: "green" }}
              onClick={() => openApprovalModal(record, "approve")}
            />
          </Tooltip>
          <Tooltip title="拒绝">
            <Button 
              type="link" 
              size="small" 
              icon={<CloseOutlined />}
              danger
              onClick={() => openApprovalModal(record, "reject")}
            />
          </Tooltip>
        </Space>
      )
    }
  ];

  const currentRequests = activeTab === "platform" ? platformRequests : funderRequests;
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys)
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Title level={4} style={{ margin: 0 }}>待审批</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
          {selectedRowKeys.length > 0 && (
            <Popconfirm
              title={`确定批量通过 ${selectedRowKeys.length} 条申请？`}
              onConfirm={() => handleBatchApprove(selectedRowKeys as string[])}
            >
              <Button type="primary">批量通过 ({selectedRowKeys.length})</Button>
            </Popconfirm>
          )}
        </Space>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={(key) => {
          setActiveTab(key as "platform" | "funder");
          setSelectedRowKeys([]);
        }}
        items={[
          {
            key: "platform",
            label: (
              <Badge count={platformRequests.length} offset={[10, 0]} size="small">
                平台待审批
              </Badge>
            ),
            children: (
              <DataTable
                loading={loading}
                dataSource={platformRequests}
                columns={columns}
                rowKey="id"
                scroll={{ x: 1100 }}
                rowSelection={rowSelection}
              />
            )
          },
          {
            key: "funder",
            label: (
              <Badge count={funderRequests.length} offset={[10, 0]} size="small">
                资金方待审批
              </Badge>
            ),
            children: (
              <DataTable
                loading={loading}
                dataSource={funderRequests}
                columns={columns}
                rowKey="id"
                scroll={{ x: 1100 }}
                rowSelection={rowSelection}
              />
            )
          }
        ]}
      />

      {/* 审批弹窗 */}
      <Modal
        title={`${activeTab === "platform" ? "平台" : "资金方"}审批 - ${approvalAction === "approve" ? "通过" : "拒绝"}`}
        open={approvalModalOpen}
        onCancel={() => {
          setApprovalModalOpen(false);
          approvalForm.resetFields();
        }}
        onOk={handleApproval}
        confirmLoading={submitting}
        okText={approvalAction === "approve" ? "确认通过" : "确认拒绝"}
        okButtonProps={{ danger: approvalAction === "reject" }}
      >
        <Form form={approvalForm} layout="vertical" style={{ marginTop: 16 }}>
          {selectedRequest && (
            <Card size="small" style={{ marginBottom: 16 }}>
              <Space direction="vertical" size={4}>
                <Text>申请编号：{selectedRequest.requestNumber}</Text>
                <Text>支付金额：<Text strong style={{ color: "#1890ff" }}>{formatMoney(selectedRequest.paymentAmount)}</Text></Text>
                <Text>支付类别：{selectedRequest.categoryName}</Text>
                <Text>司机：{selectedRequest.driverName || "-"}</Text>
              </Space>
            </Card>
          )}
          <Form.Item
            name="remark"
            label="审批备注"
            rules={approvalAction === "reject" ? [{ required: true, message: "拒绝时必须填写原因" }] : []}
          >
            <Input.TextArea rows={3} placeholder={approvalAction === "reject" ? "请输入拒绝原因" : "请输入审批备注（可选）"} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default DirectedPayApprovalsPage;
