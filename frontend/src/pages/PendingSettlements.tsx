import { useAuth } from "../auth";
import {
  getErrorMessage,
  fetchSettlements,
  markSettlementPaidApi,
  uploadFileApi,
  resolveFileUrl,
  type Settlement,
} from "../api";
import {
  Button,
  Card,
  Col,
  Modal,
  Result,
  Row,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from "antd";
import {
  CheckCircleOutlined,
  BankOutlined,
  UploadOutlined,
  EyeOutlined,
  PaperClipOutlined,
  FileDoneOutlined,
} from "@ant-design/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";

const { Title, Text } = Typography;

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  pending: { text: "待处理", color: "warning" },
  paid: { text: "已到账", color: "processing" },
  invoiced: { text: "已开票", color: "blue" },
  settled: { text: "已结算", color: "success" },
};

function PendingSettlementsPage() {
  const { token, user } = useAuth();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailTarget, setDetailTarget] = useState<Settlement | null>(null);
  const [payTarget, setPayTarget] = useState<Settlement | null>(null);
  const [payProofUrl, setPayProofUrl] = useState("");
  const [payLoading, setPayLoading] = useState(false);

  const loadSettlements = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetchSettlements(token, { status: "pending" });
      setSettlements(res.settlements);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void loadSettlements(); }, [loadSettlements]);

  const formatAmount = (n: number) =>
    `¥${n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const stats = useMemo(() => {
    const total = settlements.length;
    const totalAmount = settlements.reduce((s, r) => s + Number(r.totalDue || r.totalAmount || 0), 0);
    return { total, totalAmount };
  }, [settlements]);

  const handleMarkPaid = async () => {
    if (!token || !payTarget) return;
    setPayLoading(true);
    try {
      await markSettlementPaidApi(token, payTarget.id, {
        paidDate: dayjs().format("YYYY-MM-DD"),
        paymentProofUrl: payProofUrl || undefined,
      });
      message.success("已标记到账");
      setPayTarget(null);
      setPayProofUrl("");
      void loadSettlements();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setPayLoading(false);
    }
  };

  const columns = [
    {
      title: "结算单号", dataIndex: "settlementNumber", key: "settlementNumber", width: 180,
      render: (v: string, r: Settlement) => (
        <Button type="link" size="small" onClick={() => setDetailTarget(r)}>{v}</Button>
      ),
    },
    {
      title: "类型", dataIndex: "type", key: "type", width: 100,
      render: (v: string) => {
        const map: Record<string, { text: string; color: string }> = {
          commission: { text: "抽成结算", color: "cyan" },
          repayment: { text: "还款结算", color: "blue" },
          directed_pay: { text: "定向支付", color: "purple" },
        };
        const cfg = map[v] || { text: v, color: "default" };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    { title: "合作方", dataIndex: "customerName", key: "customerName", width: 120, ellipsis: true },
    {
      title: "落地合作方", dataIndex: "localPartnerName", key: "localPartnerName", width: 150, ellipsis: true,
      render: (v: string) => v ? <Tag color="cyan">{v}</Tag> : "-",
    },
    {
      title: "结算周期", key: "period", width: 200,
      render: (_: any, r: Settlement) => {
        const fmt = (v: string) => v ? dayjs(v).format("YYYY-MM-DD") : "-";
        return `${fmt(r.periodStart)} ~ ${fmt(r.periodEnd)}`;
      },
    },
    {
      title: "应还金额", dataIndex: "totalDue", key: "totalDue", width: 130, align: "right" as const,
      render: (v: any, r: Settlement) => <Text strong style={{ color: "#1890ff" }}>{formatAmount(Number(v || r.totalAmount || 0))}</Text>,
    },
    {
      title: "状态", dataIndex: "status", key: "status", width: 100,
      render: (s: string) => {
        const cfg = STATUS_MAP[s] || { text: s, color: "default" };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      },
    },
    {
      title: "创建时间", dataIndex: "createdAt", key: "createdAt", width: 170,
      render: (v: string) => v ? dayjs(v).format("YYYY/M/D HH:mm:ss") : "-",
    },
    {
      title: "操作", key: "actions", width: 140,
      render: (_: any, r: Settlement) => (
        <Space>
          <Button type="primary" size="small" icon={<BankOutlined />} onClick={() => { setPayTarget(r); setPayProofUrl(""); }}>
            标记已付款
          </Button>
        </Space>
      ),
    },
  ];

  if (!user?.permissions?.includes("manage_settlements") && !user?.permissions?.includes("manage_contracts")) {
    return <Result status="403" title="无权限" subTitle="需要 manage_settlements 或 manage_contracts 权限" />;
  }

  return (
    <div style={{ padding: 24 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={2} style={{ margin: 0 }}>待处理结算单</Title>
          <Text type="secondary">显示所有状态为"待处理"的结算单，可在此标记到账</Text>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>待处理数</div>
            <div style={{ fontSize: 24, fontWeight: "bold", color: "#faad14" }}>{stats.total}</div>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>待处理金额</div>
            <div style={{ fontSize: 24, fontWeight: "bold", color: "#1890ff" }}>{formatAmount(stats.totalAmount)}</div>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CheckCircleOutlined style={{ fontSize: 24, color: "#52c41a" }} />
              <div>
                <div style={{ fontSize: 14, color: "#8c8c8c" }}>说明</div>
                <div style={{ fontSize: 12 }}>结算单从业务抽成结算生成，在此标记到账</div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      <Card>
        <Table
          columns={columns}
          dataSource={settlements}
          loading={loading}
          rowKey="id"
          scroll={{ x: 1200 }}
          size="small"
          pagination={{ showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
        />
      </Card>

      {/* 标记到账弹窗 */}
      <Modal
        title="标记已到账"
        open={!!payTarget}
        onCancel={() => { setPayTarget(null); setPayProofUrl(""); }}
        onOk={handleMarkPaid}
        confirmLoading={payLoading}
        okText="确认到账"
        cancelText="取消"
      >
        {payTarget && (
          <div>
            <div style={{ background: "#fafafa", padding: 16, borderRadius: 8, marginBottom: 16 }}>
              <Row gutter={[16, 8]}>
                <Col span={12}><Text type="secondary">结算单号：</Text><Text strong>{payTarget.settlementNumber}</Text></Col>
                <Col span={12}><Text type="secondary">金额：</Text><Text strong style={{ color: "#1890ff" }}>{formatAmount(payTarget.totalDue || payTarget.totalAmount || 0)}</Text></Col>
                <Col span={24}><Text type="secondary">合作方：</Text><Text strong>{payTarget.customerName}</Text></Col>
              </Row>
            </div>
            <div style={{ marginBottom: 8 }}><Text>上传水单（可选）：</Text></div>
            <Upload.Dragger
              accept=".jpg,.jpeg,.png,.pdf"
              maxCount={1}
              showUploadList={{ showPreviewIcon: true, showRemoveIcon: true }}
              customRequest={async ({ file, onSuccess, onError }) => {
                try {
                  const res = await uploadFileApi(token!, file as File);
                  setPayProofUrl(res.url);
                  onSuccess?.(res);
                  message.success("水单上传成功");
                } catch (err: any) {
                  onError?.(err);
                  message.error(getErrorMessage(err));
                }
              }}
              onRemove={() => { setPayProofUrl(""); }}
            >
              <p className="ant-upload-drag-icon"><UploadOutlined style={{ fontSize: 32, color: "#1890ff" }} /></p>
              <p className="ant-upload-text">点击或拖拽上传水单</p>
              <p className="ant-upload-hint">支持 JPG、PNG、PDF 格式</p>
            </Upload.Dragger>
          </div>
        )}
      </Modal>

      {/* 结算单详情弹窗 */}
      <Modal
        title={`结算单详情 - ${detailTarget?.settlementNumber || ""}`}
        open={!!detailTarget}
        onCancel={() => setDetailTarget(null)}
        footer={[<Button key="close" onClick={() => setDetailTarget(null)}>关闭</Button>]}
        width={600}
      >
        {detailTarget && (
          <div>
            <div style={{ background: "#fafafa", padding: 16, borderRadius: 8, marginBottom: 16 }}>
              <Row gutter={[16, 12]}>
                <Col span={12}><Text type="secondary">结算单号：</Text><Text strong>{detailTarget.settlementNumber}</Text></Col>
                <Col span={12}><Text type="secondary">类型：</Text><Tag color="cyan">{detailTarget.type === "commission" ? "抽成结算" : detailTarget.type}</Tag></Col>
                <Col span={12}><Text type="secondary">合作方：</Text><Text strong>{detailTarget.customerName}</Text></Col>
                <Col span={12}><Text type="secondary">落地合作方：</Text>{detailTarget.localPartnerName ? <Tag color="cyan">{detailTarget.localPartnerName}</Tag> : <Text>-</Text>}</Col>
                <Col span={12}><Text type="secondary">状态：</Text><Tag color={STATUS_MAP[detailTarget.status]?.color || "default"}>{STATUS_MAP[detailTarget.status]?.text || detailTarget.status}</Tag></Col>
                <Col span={12}><Text type="secondary">结算周期：</Text><Text>{detailTarget.periodStart} ~ {detailTarget.periodEnd}</Text></Col>
                <Col span={12}><Text type="secondary">应还金额：</Text><Text strong style={{ color: "#1890ff" }}>{formatAmount(detailTarget.totalDue || detailTarget.totalAmount || 0)}</Text></Col>
                <Col span={12}><Text type="secondary">应还日期：</Text><Text>{detailTarget.dueDate ? dayjs(detailTarget.dueDate).format("YYYY-MM-DD") : "-"}</Text></Col>
              </Row>
            </div>

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
                  <Col span={12}><Text type="secondary">发票金额：</Text><Text strong>{formatAmount(detailTarget.invoiceAmount || 0)}</Text></Col>
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
          </div>
        )}
      </Modal>
    </div>
  );
}

export default PendingSettlementsPage;
