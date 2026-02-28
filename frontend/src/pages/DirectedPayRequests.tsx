import { useState, useEffect } from "react";
import {
  Card,
  Button,
  Space,
  Tag,
  Typography,
  message,
  Statistic,
  Row,
  Col,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  DatePicker,
  Tooltip,
  Popconfirm,
  Descriptions,
  Drawer
} from "antd";
import {
  PlusOutlined,
  CheckOutlined,
  CloseOutlined,
  PlayCircleOutlined,
  EyeOutlined,
  StopOutlined,
  ReloadOutlined
} from "@ant-design/icons";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import DataTable from "../components/DataTable";
import {
  fetchPaymentRequests,
  fetchPaymentRequestStats,
  createPaymentRequestApi,
  cancelPaymentRequestApi,
  executePaymentApi,
  platformApproveApi,
  platformRejectApi,
  funderApproveApi,
  funderRejectApi,
  fetchWaybills,
  fetchAvailableCategories,
  getErrorMessage,
  AvailablePaymentCategory
} from "../api";
import {
  DirectedPaymentRequest,
  PaymentRequestStatus,
  PaymentRequestStats,
  ReceiverType,
  PAYMENT_CATEGORY_TEMPLATES,
  RECEIVER_TYPE_OPTIONS,
  WAYBILL_STATUS_OPTIONS,
  Waybill
} from "../types";
import dayjs from "dayjs";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

// 状态配置
const STATUS_CONFIG: Record<PaymentRequestStatus, { color: string; label: string }> = {
  pending: { color: "default", label: "待处理" },
  platform_pending: { color: "processing", label: "待平台审批" },
  funder_pending: { color: "warning", label: "待资金方审批" },
  approved: { color: "blue", label: "审批通过" },
  rejected: { color: "red", label: "已拒绝" },
  processing: { color: "purple", label: "处理中" },
  success: { color: "green", label: "支付成功" },
  failed: { color: "error", label: "支付失败" },
  cancelled: { color: "default", label: "已取消" }
};

function DirectedPayRequestsPage() {
  const { token, user } = useAuth();
  const { t } = useI18n();
  
  const [requests, setRequests] = useState<DirectedPaymentRequest[]>([]);
  const [stats, setStats] = useState<PaymentRequestStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<{
    status?: PaymentRequestStatus;
    categoryCode?: string;
    startDate?: string;
    endDate?: string;
  }>({});
  
  // 新建弹窗
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [creating, setCreating] = useState(false);
  
  // 运单选择相关
  const [waybillSearching, setWaybillSearching] = useState(false);
  const [waybillOptions, setWaybillOptions] = useState<Waybill[]>([]);
  const [selectedWaybill, setSelectedWaybill] = useState<Waybill | null>(null);
  const [availableCategories, setAvailableCategories] = useState<AvailablePaymentCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  
  // 详情抽屉
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<DirectedPaymentRequest | null>(null);
  
  // 审批弹窗
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [approvalType, setApprovalType] = useState<"platform" | "funder">("platform");
  const [approvalAction, setApprovalAction] = useState<"approve" | "reject">("approve");
  const [approvalForm] = Form.useForm();

  const isAdmin = user?.username === "admin";
  
  // 用户类型判断
  const isPlatformUser = user?.permissions?.includes("*") || 
                         user?.orgContext?.orgType === 'platform';
  const isFunderUser = user?.orgContext?.orgType === 'funder';
  const isFinancierUser = user?.orgContext?.orgType === 'financier';
  
  // 是否有执行支付权限（平台用户或资金方用户）
  const canExecutePayment = isPlatformUser || isFunderUser;

  const refresh = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [reqRes, statsRes] = await Promise.all([
        fetchPaymentRequests(token, filters),
        fetchPaymentRequestStats(token, filters)
      ]);
      setRequests(reqRes.requests);
      setStats(statsRes);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [token, filters]);

  // 搜索运单
  const handleSearchWaybill = async (searchText: string) => {
    if (!token || !searchText || searchText.length < 2) {
      setWaybillOptions([]);
      return;
    }
    
    setWaybillSearching(true);
    try {
      const res = await fetchWaybills(token, { waybillNumber: searchText });
      setWaybillOptions(res.waybills || []);
    } catch (err) {
      console.error("搜索运单失败:", err);
      setWaybillOptions([]);
    } finally {
      setWaybillSearching(false);
    }
  };

  // 选择运单后加载可申请的费用类别
  const handleSelectWaybill = async (waybillId: string) => {
    if (!token) return;
    
    const waybill = waybillOptions.find(w => w.id === waybillId);
    if (!waybill) return;
    
    setSelectedWaybill(waybill);
    setLoadingCategories(true);
    
    // 自动填充运单相关信息
    createForm.setFieldsValue({
      waybillId: waybill.id,
      waybillNumber: waybill.waybillNumber,
      driverName: waybill.driverName,
      driverPhone: waybill.driverPhone,
    });
    
    try {
      const res = await fetchAvailableCategories(token, waybillId);
      // 只显示已解锁的类别
      setAvailableCategories(res.categories || []);
    } catch (err) {
      message.error("获取可申请费用类别失败");
      setAvailableCategories([]);
    } finally {
      setLoadingCategories(false);
    }
  };

  // 重置创建弹窗状态
  const resetCreateModal = () => {
    createForm.resetFields();
    setSelectedWaybill(null);
    setAvailableCategories([]);
    setWaybillOptions([]);
  };

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      setCreating(true);
      
      await createPaymentRequestApi(token!, {
        ...values,
        paymentAmount: Number(values.paymentAmount),
        serviceFee: values.serviceFee ? Number(values.serviceFee) : undefined,
        skipApproval: isAdmin && values.skipApproval
      });
      
      message.success("支付申请创建成功");
      setCreateModalOpen(false);
      createForm.resetFields();
      void refresh();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await cancelPaymentRequestApi(token!, id);
      message.success("申请已取消");
      void refresh();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const handleExecute = async (id: string) => {
    try {
      await executePaymentApi(token!, id);
      message.success("支付执行成功");
      void refresh();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const openApprovalModal = (
    request: DirectedPaymentRequest,
    type: "platform" | "funder",
    action: "approve" | "reject"
  ) => {
    setSelectedRequest(request);
    setApprovalType(type);
    setApprovalAction(action);
    setApprovalModalOpen(true);
  };

  const handleApproval = async () => {
    if (!selectedRequest) return;
    try {
      const values = await approvalForm.validateFields();
      const remark = values.remark;
      
      if (approvalType === "platform") {
        if (approvalAction === "approve") {
          await platformApproveApi(token!, selectedRequest.id, remark);
          message.success("平台审批通过");
        } else {
          await platformRejectApi(token!, selectedRequest.id, remark);
          message.success("平台审批拒绝");
        }
      } else {
        if (approvalAction === "approve") {
          await funderApproveApi(token!, selectedRequest.id, remark);
          message.success("资金方审批通过");
        } else {
          await funderRejectApi(token!, selectedRequest.id, remark);
          message.success("资金方审批拒绝");
        }
      }
      
      setApprovalModalOpen(false);
      approvalForm.resetFields();
      void refresh();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(getErrorMessage(err));
    }
  };

  const openDetail = (request: DirectedPaymentRequest) => {
    setSelectedRequest(request);
    setDetailDrawerOpen(true);
  };

  const formatMoney = (amount: number) => {
    return `¥${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`;
  };

  const columns = [
    {
      title: "申请编号",
      dataIndex: "requestNumber",
      width: 150,
      render: (v: string, record: DirectedPaymentRequest) => (
        <Button type="link" size="small" onClick={() => openDetail(record)}>
          {v}
        </Button>
      )
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
      render: (v: ReceiverType) => {
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
      title: "状态",
      dataIndex: "status",
      width: 120,
      render: (status: PaymentRequestStatus) => {
        const config = STATUS_CONFIG[status];
        return <Tag color={config.color}>{config.label}</Tag>;
      }
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      width: 160,
      render: (v: string) => dayjs(v).format("YYYY-MM-DD HH:mm"),
      sorter: (a: DirectedPaymentRequest, b: DirectedPaymentRequest) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    },
    {
      title: "操作",
      width: 180,
      fixed: "right" as const,
      render: (_: any, record: DirectedPaymentRequest) => {
        const actions: JSX.Element[] = [];
        
        // 查看详情
        actions.push(
          <Tooltip key="view" title="查看详情">
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openDetail(record)} />
          </Tooltip>
        );
        
        // 平台审批
        if (record.status === "platform_pending") {
          actions.push(
            <Tooltip key="p-approve" title="平台通过">
              <Button 
                type="link" 
                size="small" 
                icon={<CheckOutlined />}
                style={{ color: "green" }}
                onClick={() => openApprovalModal(record, "platform", "approve")}
              />
            </Tooltip>
          );
          actions.push(
            <Tooltip key="p-reject" title="平台拒绝">
              <Button 
                type="link" 
                size="small" 
                icon={<CloseOutlined />}
                danger
                onClick={() => openApprovalModal(record, "platform", "reject")}
              />
            </Tooltip>
          );
        }
        
        // 资金方审批
        if (record.status === "funder_pending") {
          actions.push(
            <Tooltip key="f-approve" title="资金方通过">
              <Button 
                type="link" 
                size="small" 
                icon={<CheckOutlined />}
                style={{ color: "green" }}
                onClick={() => openApprovalModal(record, "funder", "approve")}
              />
            </Tooltip>
          );
          actions.push(
            <Tooltip key="f-reject" title="资金方拒绝">
              <Button 
                type="link" 
                size="small" 
                icon={<CloseOutlined />}
                danger
                onClick={() => openApprovalModal(record, "funder", "reject")}
              />
            </Tooltip>
          );
        }
        
        // 执行支付 - 只有平台用户或资金方用户可以执行
        if (record.status === "approved" && canExecutePayment) {
          actions.push(
            <Tooltip key="execute" title="执行支付">
              <Popconfirm
                title="确定执行支付？"
                onConfirm={() => handleExecute(record.id)}
              >
                <Button type="link" size="small" icon={<PlayCircleOutlined />} style={{ color: "#722ed1" }} />
              </Popconfirm>
            </Tooltip>
          );
        }
        
        // 取消
        if (["pending", "platform_pending", "funder_pending"].includes(record.status)) {
          actions.push(
            <Tooltip key="cancel" title="取消申请">
              <Popconfirm
                title="确定取消此申请？"
                onConfirm={() => handleCancel(record.id)}
              >
                <Button type="link" size="small" icon={<StopOutlined />} danger />
              </Popconfirm>
            </Tooltip>
          );
        }
        
        return <Space size={0}>{actions}</Space>;
      }
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Title level={4} style={{ margin: 0 }}>定向支付申请</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={refresh}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
            发起支付
          </Button>
        </Space>
      </div>

      {/* 统计卡片 */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={4}>
            <Card size="small">
              <Statistic title="总申请数" value={stats.totalCount} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="待处理" value={stats.pendingCount} valueStyle={{ color: "#faad14" }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="处理中" value={stats.processingCount} valueStyle={{ color: "#722ed1" }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="成功" value={stats.successCount} valueStyle={{ color: "#52c41a" }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="失败/拒绝" value={stats.failedCount + stats.rejectedCount} valueStyle={{ color: "#ff4d4f" }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic 
                title="成功金额" 
                value={stats.successAmount} 
                prefix="¥" 
                precision={2}
                valueStyle={{ color: "#1890ff" }}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* 筛选 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <RangePicker
            placeholder={["开始日期", "结束日期"]}
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                setFilters(f => ({
                  ...f,
                  startDate: dates[0]!.format("YYYY-MM-DD"),
                  endDate: dates[1]!.format("YYYY-MM-DD")
                }));
              } else {
                setFilters(f => ({ ...f, startDate: undefined, endDate: undefined }));
              }
            }}
          />
          <Select
            allowClear
            placeholder="状态"
            style={{ width: 150 }}
            options={Object.entries(STATUS_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))}
            onChange={(v) => setFilters(f => ({ ...f, status: v }))}
          />
          <Select
            allowClear
            placeholder="支付类别"
            style={{ width: 120 }}
            options={PAYMENT_CATEGORY_TEMPLATES.map(c => ({ value: c.code, label: c.name }))}
            onChange={(v) => setFilters(f => ({ ...f, categoryCode: v }))}
          />
        </Space>
      </Card>

      {/* 列表 */}
      <DataTable
        loading={loading}
        dataSource={requests}
        columns={columns}
        rowKey="id"
        scroll={{ x: 1300 }}
      />

      {/* 新建弹窗 */}
      <Modal
        title="发起定向支付"
        open={createModalOpen}
        onCancel={() => {
          setCreateModalOpen(false);
          resetCreateModal();
        }}
        onOk={handleCreate}
        confirmLoading={creating}
        width={650}
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          {/* 运单选择 */}
          <Form.Item
            label="选择运单"
            extra="输入运单号搜索，选择后自动加载可申请的费用类别"
          >
            <Select
              showSearch
              placeholder="输入运单号搜索..."
              filterOption={false}
              onSearch={handleSearchWaybill}
              onChange={handleSelectWaybill}
              loading={waybillSearching}
              notFoundContent={waybillSearching ? "搜索中..." : "未找到运单"}
              value={selectedWaybill?.id}
              style={{ width: "100%" }}
            >
              {waybillOptions.map(w => (
                <Select.Option key={w.id} value={w.id}>
                  <Space>
                    <span>{w.waybillNumber}</span>
                    <Tag color="blue" style={{ marginLeft: 8 }}>
                      {WAYBILL_STATUS_OPTIONS.find(o => o.value === w.status)?.label || w.status}
                    </Tag>
                    {w.driverName && <span style={{ color: "#999" }}>{w.driverName}</span>}
                  </Space>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          
          {/* 选中运单后显示详情 */}
          {selectedWaybill && (
            <Card size="small" style={{ marginBottom: 16, background: "#f5f5f5" }}>
              <Descriptions size="small" column={3}>
                <Descriptions.Item label="运单号">{selectedWaybill.waybillNumber}</Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color="blue">
                    {WAYBILL_STATUS_OPTIONS.find(o => o.value === selectedWaybill.status)?.label}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="司机">{selectedWaybill.driverName || "-"}</Descriptions.Item>
              </Descriptions>
            </Card>
          )}

          {/* 隐藏字段 */}
          <Form.Item name="waybillId" hidden><Input /></Form.Item>
          <Form.Item name="waybillNumber" hidden><Input /></Form.Item>
          <Form.Item name="contractId" hidden><Input /></Form.Item>
          <Form.Item name="categoryName" hidden><Input /></Form.Item>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="categoryCode"
                label="支付类别"
                rules={[{ required: true, message: "请选择支付类别" }]}
                extra={loadingCategories ? "加载中..." : (availableCategories.length === 0 && selectedWaybill ? "该运单当前状态无可申请的费用" : "")}
              >
                <Select 
                  placeholder={selectedWaybill ? "请选择" : "请先选择运单"}
                  disabled={!selectedWaybill || loadingCategories}
                  loading={loadingCategories}
                  onChange={(v) => {
                    const cat = availableCategories.find(c => c.categoryCode === v);
                    if (cat) {
                      createForm.setFieldsValue({
                        categoryName: cat.categoryName,
                        contractId: cat.contractId,
                      });
                    }
                  }}
                >
                  {availableCategories.filter(c => c.isUnlocked).map(cat => (
                    <Select.Option key={cat.categoryCode} value={cat.categoryCode}>
                      <Space>
                        <span>{cat.categoryName}</span>
                        {cat.paymentRatio < 100 && (
                          <Tag color="orange">支付比例 {cat.paymentRatio}%</Tag>
                        )}
                      </Space>
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
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
                  placeholder="请输入"
                  disabled={!selectedWaybill}
                />
              </Form.Item>
            </Col>
          </Row>
          
          <Form.Item
            name="receiverType"
            label="收款方式"
            rules={[{ required: true, message: "请选择收款方式" }]}
          >
            <Select 
              placeholder="请选择" 
              options={RECEIVER_TYPE_OPTIONS.map(o => ({ value: o.value, label: o.label }))} 
              disabled={!selectedWaybill}
            />
          </Form.Item>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="driverName" label="司机姓名">
                <Input placeholder="自动填充" disabled />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="driverPhone" label="司机电话">
                <Input placeholder="自动填充" disabled />
              </Form.Item>
            </Col>
          </Row>
          
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="请输入备注" />
          </Form.Item>
          
          {isAdmin && (
            <Form.Item name="skipApproval" label="审批流程">
              <Select
                placeholder="审批流程"
                defaultValue={false}
                options={[
                  { value: false, label: "正常审批流程" },
                  { value: true, label: "跳过审批（Admin特权）" }
                ]}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* 审批弹窗 */}
      <Modal
        title={`${approvalType === "platform" ? "平台" : "资金方"}审批 - ${approvalAction === "approve" ? "通过" : "拒绝"}`}
        open={approvalModalOpen}
        onCancel={() => {
          setApprovalModalOpen(false);
          approvalForm.resetFields();
        }}
        onOk={handleApproval}
        okText={approvalAction === "approve" ? "确认通过" : "确认拒绝"}
        okButtonProps={{ danger: approvalAction === "reject" }}
      >
        <Form form={approvalForm} layout="vertical" style={{ marginTop: 16 }}>
          {selectedRequest && (
            <div style={{ marginBottom: 16, padding: 12, background: "#f5f5f5", borderRadius: 4 }}>
              <Text>申请编号：{selectedRequest.requestNumber}</Text><br />
              <Text>支付金额：{formatMoney(selectedRequest.paymentAmount)}</Text><br />
              <Text>支付类别：{selectedRequest.categoryName}</Text>
            </div>
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

      {/* 详情抽屉 */}
      <Drawer
        title="支付申请详情"
        open={detailDrawerOpen}
        onClose={() => setDetailDrawerOpen(false)}
        width={600}
      >
        {selectedRequest && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="申请编号" span={2}>{selectedRequest.requestNumber}</Descriptions.Item>
            <Descriptions.Item label="合同号">{selectedRequest.contractNumber || "-"}</Descriptions.Item>
            <Descriptions.Item label="运单号">{selectedRequest.waybillNumber || "-"}</Descriptions.Item>
            <Descriptions.Item label="支付类别">{selectedRequest.categoryName}</Descriptions.Item>
            <Descriptions.Item label="支付金额">
              <Text strong style={{ color: "#1890ff" }}>{formatMoney(selectedRequest.paymentAmount)}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="服务费">{formatMoney(selectedRequest.serviceFee)}</Descriptions.Item>
            <Descriptions.Item label="收款方式">
              {RECEIVER_TYPE_OPTIONS.find(o => o.value === selectedRequest.receiverType)?.label || selectedRequest.receiverType}
            </Descriptions.Item>
            <Descriptions.Item label="司机姓名">{selectedRequest.driverName || "-"}</Descriptions.Item>
            <Descriptions.Item label="司机电话">{selectedRequest.driverPhone || "-"}</Descriptions.Item>
            <Descriptions.Item label="状态" span={2}>
              <Tag color={STATUS_CONFIG[selectedRequest.status].color}>
                {STATUS_CONFIG[selectedRequest.status].label}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="平台审批" span={2}>
              <Space>
                <Tag color={selectedRequest.platformApprovalStatus === "approved" ? "green" : selectedRequest.platformApprovalStatus === "rejected" ? "red" : "default"}>
                  {selectedRequest.platformApprovalStatus === "approved" ? "已通过" : selectedRequest.platformApprovalStatus === "rejected" ? "已拒绝" : "待审批"}
                </Tag>
                {selectedRequest.platformApprovedAt && (
                  <Text type="secondary">{dayjs(selectedRequest.platformApprovedAt).format("YYYY-MM-DD HH:mm")}</Text>
                )}
              </Space>
              {selectedRequest.platformApprovalRemark && (
                <div><Text type="secondary">备注：{selectedRequest.platformApprovalRemark}</Text></div>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="资金方审批" span={2}>
              <Space>
                <Tag color={selectedRequest.funderApprovalStatus === "approved" ? "green" : selectedRequest.funderApprovalStatus === "rejected" ? "red" : "default"}>
                  {selectedRequest.funderApprovalStatus === "approved" ? "已通过" : selectedRequest.funderApprovalStatus === "rejected" ? "已拒绝" : "待审批"}
                </Tag>
                {selectedRequest.funderApprovedAt && (
                  <Text type="secondary">{dayjs(selectedRequest.funderApprovedAt).format("YYYY-MM-DD HH:mm")}</Text>
                )}
              </Space>
              {selectedRequest.funderApprovalRemark && (
                <div><Text type="secondary">备注：{selectedRequest.funderApprovalRemark}</Text></div>
              )}
            </Descriptions.Item>
            {selectedRequest.executionTime && (
              <>
                <Descriptions.Item label="执行时间">{dayjs(selectedRequest.executionTime).format("YYYY-MM-DD HH:mm:ss")}</Descriptions.Item>
                <Descriptions.Item label="交易号">{selectedRequest.executionTransactionId || "-"}</Descriptions.Item>
              </>
            )}
            {selectedRequest.executionFailureReason && (
              <Descriptions.Item label="失败原因" span={2}>
                <Text type="danger">{selectedRequest.executionFailureReason}</Text>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="备注" span={2}>{selectedRequest.remark || "-"}</Descriptions.Item>
            <Descriptions.Item label="创建时间" span={2}>{dayjs(selectedRequest.createdAt).format("YYYY-MM-DD HH:mm:ss")}</Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
}

export default DirectedPayRequestsPage;
