import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import {
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Result,
  Row,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
  message,
  Progress,
  Space,
  Tooltip
} from "antd";
import {
  DollarOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  BankOutlined,
  FileTextOutlined,
  AccountBookOutlined,
  RiseOutlined,
  UploadOutlined,
  FileDoneOutlined,
  EyeOutlined,
  PaperClipOutlined,
} from "@ant-design/icons";
import { useEffect, useMemo, useState, useCallback } from "react";
import dayjs from "dayjs";
import {
  getToken,
  getErrorMessage,
  fetchSettlementStats,
  fetchSettlements,
  fetchDirectedPaySettlementStats,
  fetchDirectedPaySettlements,
  fetchReconStats,
  markSettlementPaidApi,
  registerSettlementInvoiceApi,
  settleSettlementApi,
  uploadFileApi,
  type Settlement,
  type SettlementStats,
  type DirectedPaySettlement,
  type DirectedPaySettlementStats,
  type ReconStats,
  resolveFileUrl,
} from "../api";

const { Title, Text } = Typography;

const statusMap: Record<string, { color: string; text: string }> = {
  pending: { color: "orange", text: "待处理" },
  confirmed: { color: "blue", text: "已确认" },
  paid: { color: "cyan", text: "已到账" },
  invoiced: { color: "geekblue", text: "已开票" },
  settled: { color: "green", text: "已结算" },
  overdue: { color: "red", text: "逾期" },
};

const typeMap: Record<string, { label: string; color: string }> = {
  financing_repayment: { label: "融资还款", color: "#1890ff" },
  commission: { label: "抽成结算", color: "#52c41a" },
  profit_sharing: { label: "分润结算", color: "#722ed1" },
  directed_pay: { label: "定向支付", color: "#13c2c2" },
};

function SettlementDashboardPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);

  const [generalStats, setGeneralStats] = useState<SettlementStats | null>(null);
  const [generalSettlements, setGeneralSettlements] = useState<Settlement[]>([]);

  const [dpStats, setDpStats] = useState<DirectedPaySettlementStats | null>(null);
  const [dpSettlements, setDpSettlements] = useState<DirectedPaySettlement[]>([]);

  const [reconStats, setReconStats] = useState<ReconStats | null>(null);

  // 标记到账弹窗
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<Settlement | null>(null);
  const [payProofUrl, setPayProofUrl] = useState("");
  const [payLoading, setPayLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // 发票登记弹窗
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [invoiceTarget, setInvoiceTarget] = useState<Settlement | null>(null);
  const [invoiceForm] = Form.useForm();
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceAttachmentUrl, setInvoiceAttachmentUrl] = useState("");
  const [invoiceUploading, setInvoiceUploading] = useState(false);

  // 结算单详情弹窗
  const [detailTarget, setDetailTarget] = useState<Settlement | null>(null);

  const canManageSettlements = user?.permissions?.includes("*") || user?.permissions?.includes("manage_settlements");
  const canViewDirectedPaySettlements = user?.permissions?.includes("*") ||
    user?.permissions?.includes("manage_directed_pay_settlements") ||
    user?.permissions?.includes("view_directed_pay_settlements");

  const loadData = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    setLoading(true);
    try {
      const promises: Promise<any>[] = [];
      const promiseLabels: string[] = [];

      if (canManageSettlements) {
        promises.push(fetchSettlementStats(token));
        promiseLabels.push("generalStats");
        promises.push(fetchSettlements(token));
        promiseLabels.push("generalSettlements");
      }

      if (canViewDirectedPaySettlements) {
        promises.push(fetchDirectedPaySettlementStats(token));
        promiseLabels.push("dpStats");
        promises.push(fetchDirectedPaySettlements(token, { status: "pending" }));
        promiseLabels.push("dpSettlements");
      }

      if (canManageSettlements) {
        promises.push(fetchReconStats(token));
        promiseLabels.push("reconStats");
      }

      const results = await Promise.all(promises);

      promiseLabels.forEach((label, index) => {
        if (label === "generalStats") setGeneralStats(results[index]);
        else if (label === "generalSettlements") setGeneralSettlements(results[index].settlements);
        else if (label === "dpStats") setDpStats(results[index]);
        else if (label === "dpSettlements") setDpSettlements(results[index].settlements);
        else if (label === "reconStats") setReconStats(results[index]);
      });
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [canManageSettlements, canViewDirectedPaySettlements]);

  useEffect(() => { loadData(); }, [loadData]);

  // 标记已到账
  const handleMarkPaid = async () => {
    if (!payTarget) return;
    const token = getToken();
    if (!token) return;
    setPayLoading(true);
    try {
      await markSettlementPaidApi(token, payTarget.id, payProofUrl || undefined);
      message.success("已标记到账");
      setPayModalOpen(false);
      setPayTarget(null);
      setPayProofUrl("");
      void loadData();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setPayLoading(false);
    }
  };

  // 登记发票
  const handleRegisterInvoice = async () => {
    if (!invoiceTarget) return;
    const token = getToken();
    if (!token) return;
    try {
      const values = await invoiceForm.validateFields();
      setInvoiceLoading(true);
      await registerSettlementInvoiceApi(token, invoiceTarget.id, {
        invoiceNumber: values.invoiceNumber,
        invoiceDate: values.invoiceDate.format("YYYY-MM-DD"),
        invoiceAmount: values.invoiceAmount,
        invoiceRemark: values.invoiceRemark,
        invoiceAttachmentUrl: invoiceAttachmentUrl || undefined,
      });
      message.success("发票已登记");
      setInvoiceModalOpen(false);
      setInvoiceTarget(null);
      setInvoiceAttachmentUrl("");
      invoiceForm.resetFields();
      void loadData();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(getErrorMessage(err));
    } finally {
      setInvoiceLoading(false);
    }
  };

  // 完结结算单
  const handleSettle = async (settlement: Settlement) => {
    const token = getToken();
    if (!token) return;
    try {
      await settleSettlementApi(token, settlement.id);
      message.success("已完结");
      void loadData();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const totalStats = useMemo(() => {
    const generalPending = generalStats?.pendingAmount || 0;
    const dpPending = dpStats?.pendingAmount || 0;
    const generalOverdue = generalStats?.overdueAmount || 0;
    const dpOverdue = dpStats?.overdueAmount || 0;
    const generalSettled = generalStats?.settledAmount || 0;
    const dpSettled = dpStats?.totalPaidAmount || 0;
    return {
      totalPending: generalPending + dpPending,
      totalOverdue: generalOverdue + dpOverdue,
      totalSettled: generalSettled + dpSettled,
      pendingCount: (generalStats?.pendingCount || 0) + (dpStats?.totalPending || 0),
      overdueCount: (generalStats?.overdueCount || 0) + (dpStats?.totalOverdue || 0),
    };
  }, [generalStats, dpStats]);

  const formatAmt = (v: number) => `¥${v.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`;

  // 操作按钮渲染
  const renderActions = (_: any, record: Settlement) => {
    const actions: React.ReactNode[] = [];

    actions.push(
      <Tooltip title="查看详情" key="view">
        <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailTarget(record)}>详情</Button>
      </Tooltip>
    );

    if (record.status === "pending" || record.status === "confirmed") {
      actions.push(
        <Button key="pay" type="primary" size="small" icon={<BankOutlined />}
          onClick={() => { setPayTarget(record); setPayProofUrl(""); setPayModalOpen(true); }}>
          标记已到账
        </Button>
      );
    }
    if (record.status === "paid") {
      actions.push(
        <Button key="invoice" size="small" icon={<FileDoneOutlined />}
          onClick={() => {
            setInvoiceTarget(record);
            invoiceForm.setFieldsValue({
              invoiceAmount: record.totalDue || record.totalAmount || 0,
              invoiceDate: dayjs(),
            });
            setInvoiceModalOpen(true);
          }}>
          登记发票
        </Button>
      );
    }
    if (record.status === "invoiced") {
      actions.push(
        <Button key="settle" type="primary" size="small" icon={<CheckCircleOutlined />}
          onClick={() => {
            Modal.confirm({
              title: "完结结算单",
              content: `确认结算单 ${record.settlementNumber} 已全部处理完成？`,
              okText: "确认完结",
              onOk: () => handleSettle(record),
            });
          }}>
          完结
        </Button>
      );
    }
    if (record.status === "settled") {
      actions.push(<Tag key="done" color="success">已完结</Tag>);
    }

    return <Space size={4}>{actions}</Space>;
  };

  const generalColumns = [
    { title: "结算单号", dataIndex: "settlementNumber", key: "settlementNumber", width: 150,
      render: (v: string, record: Settlement) => (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setDetailTarget(record)}>{v}</Button>
      )},
    {
      title: "类型", dataIndex: "type", key: "type", width: 100,
      render: (type: string) => {
        const config = typeMap[type] || { label: type, color: "#999" };
        return <Tag color={config.color}>{config.label}</Tag>;
      },
    },
    { title: "合作方", dataIndex: "customerName", key: "customerName", width: 120, ellipsis: true },
    { title: "落地合作方", dataIndex: "localPartnerName", key: "localPartnerName", width: 150, ellipsis: true,
      render: (v: string) => v ? <Tag color="cyan">{v}</Tag> : "-" },
    {
      title: "结算周期", key: "period", width: 180,
      render: (_: any, record: Settlement) => (
        <span style={{ fontSize: 12 }}>
          {dayjs(record.periodStart).format("MM-DD")} ~ {dayjs(record.periodEnd).format("MM-DD")}
        </span>
      ),
    },
    {
      title: "应还金额", key: "amount", width: 120, align: "right" as const,
      render: (_: any, record: Settlement) => (
        <Text strong>{formatAmt(record.totalDue || record.totalAmount || 0)}</Text>
      ),
    },
    {
      title: "应还日期", dataIndex: "dueDate", key: "dueDate", width: 100,
      render: (date: string) => {
        const isOverdue = dayjs(date).isBefore(dayjs(), "day");
        return <Text type={isOverdue ? "danger" : undefined}>{dayjs(date).format("MM-DD")}</Text>;
      },
    },
    {
      title: "状态", dataIndex: "status", key: "status", width: 90,
      render: (status: string) => {
        const config = statusMap[status] || { color: "default", text: status };
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    { title: "操作", key: "actions", width: 260, render: renderActions },
  ];

  const dpColumns = [
    { title: "结算单号", dataIndex: "settlementNumber", key: "settlementNumber", width: 150 },
    { title: "合同号", dataIndex: "contractNumber", key: "contractNumber", width: 130 },
    { title: "合作方", dataIndex: "financierName", key: "financierName", width: 150, ellipsis: true },
    {
      title: "本金", dataIndex: "principalAmount", key: "principalAmount", width: 100,
      align: "right" as const,
      render: (val: number) => formatAmt(val),
    },
    {
      title: "利息", dataIndex: "interestAmount", key: "interestAmount", width: 80,
      align: "right" as const,
      render: (val: number) => <Text type="warning">{formatAmt(val)}</Text>,
    },
    {
      title: "应还总额", dataIndex: "totalAmount", key: "totalAmount", width: 110,
      align: "right" as const,
      render: (val: number) => <Text strong>{formatAmt(val)}</Text>,
    },
    {
      title: "应还日期", dataIndex: "dueDate", key: "dueDate", width: 100,
      render: (date: string) => {
        const isOverdue = dayjs(date).isBefore(dayjs(), "day");
        return <Text type={isOverdue ? "danger" : undefined}>{dayjs(date).format("MM-DD")}</Text>;
      },
    },
    {
      title: "状态", dataIndex: "status", key: "status", width: 80,
      render: (status: string) => {
        const config = statusMap[status] || { color: "default", text: status };
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
  ];

  if (!canManageSettlements && !canViewDirectedPaySettlements) {
    return <Result status="403" title="无访问权限" subTitle="您没有权限访问结算中心" />;
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Title level={4} style={{ margin: 0 }}>
          <AccountBookOutlined style={{ marginRight: 8 }} />
          结算中心
        </Title>
        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>刷新数据</Button>
      </div>

      {/* 汇总统计 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title={<Space><ClockCircleOutlined style={{ color: "#fa8c16" }} />待处理金额</Space>}
              value={totalStats.totalPending} precision={2} prefix="¥"
              valueStyle={{ color: "#fa8c16" }}
            />
            <div style={{ marginTop: 8 }}><Text type="secondary">{totalStats.pendingCount} 笔待处理</Text></div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={<Space><ExclamationCircleOutlined style={{ color: "#ff4d4f" }} />逾期金额</Space>}
              value={totalStats.totalOverdue} precision={2} prefix="¥"
              valueStyle={{ color: "#ff4d4f" }}
            />
            <div style={{ marginTop: 8 }}><Text type="secondary">{totalStats.overdueCount} 笔逾期</Text></div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={<Space><CheckCircleOutlined style={{ color: "#52c41a" }} />已结算金额</Space>}
              value={totalStats.totalSettled} precision={2} prefix="¥"
              valueStyle={{ color: "#52c41a" }}
            />
            <div style={{ marginTop: 8 }}><Text type="secondary">累计结算</Text></div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <div style={{ marginBottom: 8 }}><Text type="secondary">结算完成率</Text></div>
            <Progress
              percent={totalStats.totalPending + totalStats.totalSettled > 0
                ? Math.round((totalStats.totalSettled / (totalStats.totalPending + totalStats.totalSettled)) * 100) : 0}
              strokeColor={{ "0%": "#108ee9", "100%": "#87d068" }}
            />
            <div style={{ marginTop: 8 }}><Text type="secondary">已结算 / 总金额</Text></div>
          </Card>
        </Col>
      </Row>

      {/* 分类统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        {canManageSettlements && (
          <Col span={canViewDirectedPaySettlements ? 8 : 12}>
            <Card title={<Space><BankOutlined style={{ color: "#1890ff" }} />对账结算</Space>} size="small">
              <Row gutter={16}>
                <Col span={12}><Statistic title="待处理" value={generalStats?.pendingAmount || 0} precision={2} prefix="¥" valueStyle={{ fontSize: 16 }} /></Col>
                <Col span={12}><Statistic title="已结算" value={generalStats?.settledAmount || 0} precision={2} prefix="¥" valueStyle={{ fontSize: 16, color: "#52c41a" }} /></Col>
              </Row>
            </Card>
          </Col>
        )}
        {canViewDirectedPaySettlements && (
          <Col span={canManageSettlements ? 8 : 12}>
            <Card title={<Space><DollarOutlined style={{ color: "#13c2c2" }} />定向支付结算</Space>} size="small">
              <Row gutter={16}>
                <Col span={12}><Statistic title="待处理" value={dpStats?.pendingAmount || 0} precision={2} prefix="¥" valueStyle={{ fontSize: 16 }} /></Col>
                <Col span={12}><Statistic title="已结清" value={dpStats?.totalPaidAmount || 0} precision={2} prefix="¥" valueStyle={{ fontSize: 16, color: "#52c41a" }} /></Col>
              </Row>
            </Card>
          </Col>
        )}
        {canManageSettlements && (
          <Col span={canViewDirectedPaySettlements ? 8 : 12}>
            <Card title={<Space><RiseOutlined style={{ color: "#722ed1" }} />抽成对账</Space>} size="small">
              <Row gutter={8}>
                <Col span={8}><Statistic title="总收入" value={reconStats?.totalRevenue || 0} precision={2} prefix="¥" valueStyle={{ fontSize: 14, color: "#1890ff" }} /></Col>
                <Col span={8}><Statistic title="待入账" value={reconStats?.pendingAmount || 0} precision={2} prefix="¥" valueStyle={{ fontSize: 14, color: "#faad14" }} /></Col>
                <Col span={8}><Statistic title="已入账" value={reconStats?.accountedAmount || 0} precision={2} prefix="¥" valueStyle={{ fontSize: 14, color: "#52c41a" }} /></Col>
              </Row>
            </Card>
          </Col>
        )}
      </Row>

      {/* 结算单列表 */}
      <Card title="结算单管理">
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary">流程：生成结算单 → 收到打款标记已到账（上传水单）→ 线下开票登记发票 → 完结</Text>
        </div>
        <Tabs
          defaultActiveKey={canManageSettlements ? "general" : "directed_pay"}
          items={[
            ...(canManageSettlements ? [{
              key: "general",
              label: (
                <Space>
                  <FileTextOutlined />
                  融资/抽成/分润
                  {generalSettlements.filter(s => s.status !== "settled").length > 0 && (
                    <Tag color="orange">{generalSettlements.filter(s => s.status !== "settled").length}</Tag>
                  )}
                </Space>
              ),
              children: (
                <Table
                  columns={generalColumns}
                  dataSource={generalSettlements}
                  rowKey="id"
                  loading={loading}
                  scroll={{ x: 1200 }}
                  size="small"
                  pagination={{ showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
                  locale={{ emptyText: "暂无结算单" }}
                />
              ),
            }] : []),
            ...(canViewDirectedPaySettlements ? [{
              key: "directed_pay",
              label: (
                <Space>
                  <DollarOutlined />
                  定向支付
                  {dpSettlements.length > 0 && <Tag color="orange">{dpSettlements.length}</Tag>}
                </Space>
              ),
              children: (
                <Table
                  columns={dpColumns}
                  dataSource={dpSettlements}
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 10 }}
                  size="small"
                  locale={{ emptyText: "暂无待处理结算单" }}
                />
              ),
            }] : []),
          ]}
        />
      </Card>

      {/* 标记已到账弹窗 */}
      <Modal
        title="标记已到账"
        open={payModalOpen}
        onCancel={() => { setPayModalOpen(false); setPayTarget(null); setPayProofUrl(""); }}
        onOk={handleMarkPaid}
        confirmLoading={payLoading}
        okText="确认到账"
      >
        {payTarget && (
          <div>
            <div style={{ background: "#f6ffed", padding: 12, borderRadius: 6, marginBottom: 16 }}>
              <Row gutter={[16, 8]}>
                <Col span={12}><Text type="secondary">结算单号：</Text><Text strong>{payTarget.settlementNumber}</Text></Col>
                <Col span={12}><Text type="secondary">金额：</Text><Text strong style={{ color: "#1890ff" }}>{formatAmt(payTarget.totalDue || payTarget.totalAmount || 0)}</Text></Col>
                <Col span={24}><Text type="secondary">合作方：</Text><Text strong>{payTarget.customerName}</Text></Col>
              </Row>
            </div>
            <div style={{ marginBottom: 8 }}><Text>上传水单（可选）：</Text></div>
            <Upload.Dragger
              accept=".jpg,.jpeg,.png,.pdf"
              maxCount={1}
              showUploadList={true}
              customRequest={async ({ file, onSuccess, onError }) => {
                const token = getToken();
                if (!token) { onError?.(new Error("未登录")); return; }
                setUploading(true);
                try {
                  const res = await uploadFileApi(token, file as File);
                  setPayProofUrl(res.url);
                  onSuccess?.(res);
                  message.success("水单上传成功");
                } catch (err: any) {
                  onError?.(err);
                  message.error(getErrorMessage(err));
                } finally {
                  setUploading(false);
                }
              }}
              onRemove={() => { setPayProofUrl(""); }}
            >
              <p className="ant-upload-drag-icon"><UploadOutlined style={{ fontSize: 32, color: "#1890ff" }} /></p>
              <p className="ant-upload-text">点击或拖拽上传水单</p>
              <p className="ant-upload-hint">支持 JPG、PNG、PDF 格式，最大 10MB</p>
            </Upload.Dragger>
            {payProofUrl && (
              <div style={{ marginTop: 8 }}>
                <Tag color="green">已上传</Tag>
              </div>
            )}
            <div style={{ marginTop: 8 }}><Text type="secondary">收到合作方打款后确认到账，下一步可登记发票</Text></div>
          </div>
        )}
      </Modal>

      {/* 发票登记弹窗 */}
      <Modal
        title="登记发票"
        open={invoiceModalOpen}
        onCancel={() => { setInvoiceModalOpen(false); setInvoiceTarget(null); setInvoiceAttachmentUrl(""); invoiceForm.resetFields(); }}
        onOk={handleRegisterInvoice}
        confirmLoading={invoiceLoading}
        okText="确认登记"
      >
        {invoiceTarget && (
          <div>
            <div style={{ background: "#e6f7ff", padding: 12, borderRadius: 6, marginBottom: 16 }}>
              <Row gutter={[16, 8]}>
                <Col span={12}><Text type="secondary">结算单号：</Text><Text strong>{invoiceTarget.settlementNumber}</Text></Col>
                <Col span={12}><Text type="secondary">金额：</Text><Text strong style={{ color: "#1890ff" }}>{formatAmt(invoiceTarget.totalDue || invoiceTarget.totalAmount || 0)}</Text></Col>
                <Col span={24}><Text type="secondary">合作方：</Text><Text strong>{invoiceTarget.customerName}</Text></Col>
              </Row>
            </div>
            <Form form={invoiceForm} layout="vertical">
              <Form.Item label="发票号" name="invoiceNumber" rules={[{ required: true, message: "请输入发票号" }]}>
                <Input placeholder="请输入发票号" />
              </Form.Item>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="开票日期" name="invoiceDate" rules={[{ required: true, message: "请选择开票日期" }]}>
                    <DatePicker style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="发票金额" name="invoiceAmount" rules={[{ required: true, message: "请输入发票金额" }]}>
                    <InputNumber style={{ width: "100%" }} min={0} precision={2} prefix="¥" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item label="备注" name="invoiceRemark">
                <Input.TextArea rows={2} placeholder="开票备注（选填）" />
              </Form.Item>
              <Form.Item label="发票附件（可选）">
                <Upload.Dragger
                  accept=".jpg,.jpeg,.png,.pdf"
                  maxCount={1}
                  showUploadList={true}
                  customRequest={async ({ file, onSuccess, onError }) => {
                    const token = getToken();
                    if (!token) { onError?.(new Error("未登录")); return; }
                    setInvoiceUploading(true);
                    try {
                      const res = await uploadFileApi(token, file as File);
                      setInvoiceAttachmentUrl(res.url);
                      onSuccess?.(res);
                      message.success("附件上传成功");
                    } catch (err: any) {
                      onError?.(err);
                      message.error(getErrorMessage(err));
                    } finally {
                      setInvoiceUploading(false);
                    }
                  }}
                  onRemove={() => { setInvoiceAttachmentUrl(""); }}
                >
                  <p className="ant-upload-drag-icon"><UploadOutlined style={{ fontSize: 24, color: "#1890ff" }} /></p>
                  <p className="ant-upload-text">点击或拖拽上传发票附件</p>
                  <p className="ant-upload-hint">支持 JPG、PNG、PDF 格式</p>
                </Upload.Dragger>
              </Form.Item>
            </Form>
          </div>
        )}
      </Modal>

      {/* 结算单详情弹窗 */}
      <Modal
        title={`结算单详情 - ${detailTarget?.settlementNumber || ""}`}
        open={!!detailTarget}
        onCancel={() => setDetailTarget(null)}
        footer={null}
        width={600}
      >
        {detailTarget && (
          <div>
            <Row gutter={[16, 12]} style={{ marginBottom: 16 }}>
              <Col span={12}><Text type="secondary">结算单号：</Text><Text strong>{detailTarget.settlementNumber}</Text></Col>
              <Col span={12}><Text type="secondary">类型：</Text><Tag color={typeMap[detailTarget.type]?.color || "#999"}>{typeMap[detailTarget.type]?.label || detailTarget.type}</Tag></Col>
              <Col span={12}><Text type="secondary">合作方：</Text><Text strong>{detailTarget.customerName}</Text></Col>
              <Col span={12}><Text type="secondary">落地合作方：</Text>{detailTarget.localPartnerName ? <Tag color="cyan">{detailTarget.localPartnerName}</Tag> : <Text>-</Text>}</Col>
              <Col span={12}><Text type="secondary">状态：</Text><Tag color={statusMap[detailTarget.status]?.color || "default"}>{statusMap[detailTarget.status]?.text || detailTarget.status}</Tag></Col>
              <Col span={12}><Text type="secondary">结算周期：</Text><Text>{dayjs(detailTarget.periodStart).format("YYYY-MM-DD")} ~ {dayjs(detailTarget.periodEnd).format("YYYY-MM-DD")}</Text></Col>
              <Col span={12}><Text type="secondary">应还金额：</Text><Text strong style={{ color: "#1890ff" }}>{formatAmt(detailTarget.totalDue || detailTarget.totalAmount || 0)}</Text></Col>
              <Col span={12}><Text type="secondary">应还日期：</Text><Text>{dayjs(detailTarget.dueDate).format("YYYY-MM-DD")}</Text></Col>
              {detailTarget.paidDate && (
                <Col span={12}><Text type="secondary">到账日期：</Text><Text>{detailTarget.paidDate}</Text></Col>
              )}
            </Row>

            {detailTarget.paymentProofUrl && (
              <Card size="small" title={<Space><PaperClipOutlined />到账水单</Space>} style={{ marginBottom: 12 }}>
                {/\.(jpg|jpeg|png|gif|webp)$/i.test(detailTarget.paymentProofUrl) ? (
                  <img src={resolveFileUrl(detailTarget.paymentProofUrl)} alt="水单" style={{ maxWidth: "100%", maxHeight: 300, cursor: "pointer" }} onClick={() => window.open(resolveFileUrl(detailTarget.paymentProofUrl!), "_blank")} />
                ) : (
                  <Button type="link" href={resolveFileUrl(detailTarget.paymentProofUrl)} target="_blank">
                    <PaperClipOutlined /> 查看水单附件
                  </Button>
                )}
              </Card>
            )}

            {detailTarget.invoiceNumber && (
              <Card size="small" title={<Space><FileDoneOutlined />发票信息</Space>} style={{ marginBottom: 12 }}>
                <Row gutter={[16, 8]}>
                  <Col span={12}><Text type="secondary">发票号：</Text><Text>{detailTarget.invoiceNumber}</Text></Col>
                  <Col span={12}><Text type="secondary">开票日期：</Text><Text>{detailTarget.invoiceDate}</Text></Col>
                  <Col span={12}><Text type="secondary">发票金额：</Text><Text strong>{formatAmt(detailTarget.invoiceAmount || 0)}</Text></Col>
                  {detailTarget.invoiceRemark && (
                    <Col span={24}><Text type="secondary">备注：</Text><Text>{detailTarget.invoiceRemark}</Text></Col>
                  )}
                </Row>
                {detailTarget.invoiceAttachmentUrl && (
                  <div style={{ marginTop: 8 }}>
                    {/\.(jpg|jpeg|png|gif|webp)$/i.test(detailTarget.invoiceAttachmentUrl) ? (
                      <img src={resolveFileUrl(detailTarget.invoiceAttachmentUrl)} alt="发票" style={{ maxWidth: "100%", maxHeight: 300, cursor: "pointer" }} onClick={() => window.open(resolveFileUrl(detailTarget.invoiceAttachmentUrl!), "_blank")} />
                    ) : (
                      <Button type="link" href={resolveFileUrl(detailTarget.invoiceAttachmentUrl)} target="_blank">
                        <PaperClipOutlined /> 查看发票附件
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            )}

            {detailTarget.settledDate && (
              <div><Text type="secondary">完结日期：</Text><Text>{detailTarget.settledDate}</Text></div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export default SettlementDashboardPage;
