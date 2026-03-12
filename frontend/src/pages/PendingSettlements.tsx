import { useAuth } from "../auth";
import { useI18n } from "../i18n";
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
  message
} from "antd";
import {
  EyeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileTextOutlined,
  WalletOutlined,
  ClockCircleOutlined
} from "@ant-design/icons";
import { useMemo, useState } from "react";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";

const { Title, Text } = Typography;

interface SettlementOrder {
  id: string;
  settlementNumber: string;
  type: "repayment" | "profit_sharing" | "refund";
  logisticsProviderName: string;
  contractNumber: string;
  amount: number;
  createdAt: string;
  dueDate?: string;
  status: "pending" | "approved" | "rejected";
}

// Mock数据
const mockSettlements: SettlementOrder[] = [
  {
    id: "1",
    settlementNumber: "JS2024121801",
    type: "repayment",
    logisticsProviderName: "顺丰物流有限公司",
    contractNumber: "RZ2024010001",
    amount: 125800,
    createdAt: "2024-12-18T09:30:00Z",
    dueDate: "2024-12-18",
    status: "pending"
  },
  {
    id: "2",
    settlementNumber: "JS2024121802",
    type: "profit_sharing",
    logisticsProviderName: "圆通速递股份有限公司",
    contractNumber: "RZ2024010002",
    amount: 38900.75,
    createdAt: "2024-12-18T10:15:00Z",
    status: "pending"
  },
  {
    id: "3",
    settlementNumber: "JS2024121803",
    type: "refund",
    logisticsProviderName: "中通快递股份有限公司",
    contractNumber: "RZ2024010003",
    amount: 56780.5,
    createdAt: "2024-12-18T11:00:00Z",
    status: "pending"
  }
];

function PendingSettlementsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [settlements, setSettlements] = useState<SettlementOrder[]>(mockSettlements);
  const [loading, setLoading] = useState(false);
  const [viewingSettlement, setViewingSettlement] = useState<SettlementOrder | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // 计算统计数据
  const stats = useMemo(() => {
    const pendingAmount = settlements
      .filter(s => s.status === "pending")
      .reduce((sum, s) => sum + s.amount, 0);
    
    const pendingCount = settlements.filter(s => s.status === "pending").length;
    
    const today = dayjs().format("YYYY-MM-DD");
    const dueTodayCount = settlements.filter(s => 
      s.status === "pending" && s.dueDate === today
    ).length;

    return {
      pendingAmount,
      pendingCount,
      dueTodayCount
    };
  }, [settlements]);

  // 格式化金额
  const formatAmount = (amount: number): string => {
    if (amount >= 1000000) {
      return `¥${(amount / 1000000).toFixed(1)}M`;
    }
    return `¥${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // 获取类型标签和颜色
  const getTypeConfig = (type: string) => {
    const configs: Record<string, { label: string; color: string }> = {
      repayment: {
        label: t("settlements.type_repayment", "还款结算"),
        color: "blue"
      },
      profit_sharing: {
        label: t("settlements.type_profit_sharing", "分润结算"),
        color: "purple"
      },
      refund: {
        label: t("settlements.type_refund", "退款结算"),
        color: "green"
      }
    };
    return configs[type] || { label: type, color: "default" };
  };

  // 处理审核通过
  const handleApprove = async (settlement: SettlementOrder) => {
    Modal.confirm({
      title: t("settlements.approve_confirm", "确认审核通过"),
      content: t("settlements.approve_content", "确定要通过结算单 {number} 吗？").replace("{number}", settlement.settlementNumber),
      okText: t("common.confirm", "确认"),
      cancelText: t("common.cancel", "取消"),
      onOk: async () => {
        // TODO: 调用API
        setSettlements(prev =>
          prev.map(s => (s.id === settlement.id ? { ...s, status: "approved" as const } : s))
        );
        message.success(t("settlements.approved", "已通过"));
      }
    });
  };

  // 处理驳回
  const handleReject = async (settlement: SettlementOrder) => {
    Modal.confirm({
      title: t("settlements.reject_confirm", "确认驳回"),
      content: t("settlements.reject_content", "确定要驳回结算单 {number} 吗？").replace("{number}", settlement.settlementNumber),
      okText: t("common.confirm", "确认"),
      cancelText: t("common.cancel", "取消"),
      okButtonProps: { danger: true },
      onOk: async () => {
        // TODO: 调用API
        setSettlements(prev =>
          prev.map(s => (s.id === settlement.id ? { ...s, status: "rejected" as const } : s))
        );
        message.success(t("settlements.rejected", "已驳回"));
      }
    });
  };

  // 处理查看详情
  const handleView = (settlement: SettlementOrder) => {
    setViewingSettlement(settlement);
    setDetailModalOpen(true);
  };

  // 处理查看合同
  const handleViewContract = (contractNumber: string) => {
    // TODO: 导航到合同详情页面
    message.info(t("settlements.view_contract_feature", "查看合同功能开发中"));
  };

  // 只显示待处理的结算单
  const pendingSettlements = useMemo(() => {
    return settlements.filter(s => s.status === "pending");
  }, [settlements]);

  const columns = [
    {
      title: t("settlements.settlement_number", "结算单号"),
      key: "settlementNumber",
      width: 180,
      render: (_: any, record: SettlementOrder) => (
        <Space>
          <FileTextOutlined />
          <Text>{record.settlementNumber}</Text>
        </Space>
      )
    },
    {
      title: t("settlements.type_tag", "类型标签"),
      key: "type",
      width: 120,
      render: (_: any, record: SettlementOrder) => {
        const config = getTypeConfig(record.type);
        return <Tag color={config.color}>{config.label}</Tag>;
      }
    },
    {
      title: t("settlements.logistics_provider_name", "物流商名称"),
      key: "logisticsProviderName",
      width: 200,
      render: (_: any, record: SettlementOrder) => (
        <Text>{record.logisticsProviderName}</Text>
      )
    },
    {
      title: t("settlements.associated_contract", "关联合同"),
      key: "contractNumber",
      width: 180,
      render: (_: any, record: SettlementOrder) => (
        <Button
          type="link"
          onClick={() => handleViewContract(record.contractNumber)}
          style={{ padding: 0 }}
        >
          {record.contractNumber}
        </Button>
      )
    },
    {
      title: t("settlements.settlement_amount", "结算金额"),
      key: "amount",
      width: 150,
      render: (_: any, record: SettlementOrder) => (
        <Text strong style={{ fontSize: 16 }}>
          {formatAmount(record.amount)}
        </Text>
      )
    },
    {
      title: t("settlements.generation_time", "生成时间"),
      key: "createdAt",
      width: 180,
      render: (_: any, record: SettlementOrder) => (
        <Text>{dayjs(record.createdAt).format("YYYY-MM-DD HH:mm")}</Text>
      )
    },
    {
      title: t("settlements.operations", "操作"),
      key: "actions",
      width: 220,
      fixed: "right" as const,
      render: (_: any, record: SettlementOrder) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<CheckCircleOutlined />}
            onClick={() => handleApprove(record)}
          >
            {t("settlements.approve", "审核通过")}
          </Button>
          <Button
            danger
            size="small"
            icon={<CloseCircleOutlined />}
            onClick={() => handleReject(record)}
          >
            {t("settlements.reject", "驳回")}
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleView(record)}
          >
            {t("settlements.view_details", "查看详情")}
          </Button>
        </Space>
      )
    }
  ];

  if (!user?.permissions?.includes("manage_settlements")) {
    return (
      <Result
        status="403"
        title={t("common.no_permission", "无权限")}
        subTitle={t("settlements.no_access", "需要 manage_settlements 权限")}
      />
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={2} style={{ margin: 0 }}>
            {t("settlements.pending_title", "待处理结算单")}
          </Title>
          <Text type="secondary" style={{ display: "block", marginTop: 4 }}>
            {t("settlements.pending_subtitle", "结算单审核与批量处理")}
          </Text>
        </Col>
      </Row>

      {/* Statistics Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>
                  {t("settlements.pending_amount", "待审核总额")}
                </div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4, color: "#1890ff" }}>
                  {formatAmount(stats.pendingAmount)}
                </div>
              </div>
              <WalletOutlined style={{ fontSize: 32, color: "#1890ff", opacity: 0.3 }} />
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>
                  {t("settlements.pending_count", "待处理笔数")}
                </div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4, color: "#722ed1" }}>
                  {stats.pendingCount}
                </div>
              </div>
              <FileTextOutlined style={{ fontSize: 32, color: "#722ed1", opacity: 0.3 }} />
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>
                  {t("settlements.due_today", "今日截止")}
                </div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4, color: "#faad14" }}>
                  {stats.dueTodayCount}
                </div>
              </div>
              <ClockCircleOutlined style={{ fontSize: 32, color: "#faad14", opacity: 0.3 }} />
            </div>
          </Card>
        </Col>
      </Row>

      {/* Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={pendingSettlements}
          loading={loading}
          rowKey="id"
          scroll={{ x: 1200 }}
          pagination={{
            showSizeChanger: false,
            showTotal: (total) =>
              t("settlements.total_records", "显示 1 到 {count} 条, 共 {total} 条")
                .replace("{count}", String(total))
                .replace("{total}", String(total))
          }}
        />
      </Card>

      {/* Detail Modal */}
      <Modal
        title={t("settlements.settlement_detail", "结算单详情")}
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalOpen(false)}>
            {t("common.close", "关闭")}
          </Button>
        ]}
        width={800}
      >
        {viewingSettlement && (
          <div>
            <Row gutter={16}>
              <Col span={12}>
                <Text strong>{t("settlements.settlement_number", "结算单号")}:</Text>
                <div>{viewingSettlement.settlementNumber}</div>
              </Col>
              <Col span={12}>
                <Text strong>{t("settlements.logistics_provider_name", "物流商名称")}:</Text>
                <div>{viewingSettlement.logisticsProviderName}</div>
              </Col>
            </Row>
            {/* Add more detail fields as needed */}
          </div>
        )}
      </Modal>
    </div>
  );
}

export default PendingSettlementsPage;

