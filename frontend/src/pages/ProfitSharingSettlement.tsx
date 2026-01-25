import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import {
  Button,
  Card,
  Checkbox,
  Col,
  Result,
  Row,
  Space,
  Table,
  Tag,
  Typography,
  message,
  Modal
} from "antd";
import {
  DownloadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileTextOutlined
} from "@ant-design/icons";
import { useMemo, useState } from "react";

const { Title, Text } = Typography;

interface ProfitSharingSettlement {
  id: string;
  settlementNumber: string;
  logisticsProviderName: string;
  associatedBusinessVolume: number;
  totalPeriodProfit: number;
  deductedFinancingInterest: number;
  platformShareAmount: number;
  status: "pending" | "accounted";
}

// Mock数据
const mockSettlements: ProfitSharingSettlement[] = [
  {
    id: "1",
    settlementNumber: "PS-2024-12-001",
    logisticsProviderName: "顺丰速运华东区",
    associatedBusinessVolume: 45,
    totalPeriodProfit: 156000,
    deductedFinancingInterest: -45000,
    platformShareAmount: 55500,
    status: "pending"
  },
  {
    id: "2",
    settlementNumber: "PS-2024-12-002",
    logisticsProviderName: "德邦物流上海总部",
    associatedBusinessVolume: 38,
    totalPeriodProfit: 132000,
    deductedFinancingInterest: -38000,
    platformShareAmount: 47000,
    status: "pending"
  },
  {
    id: "3",
    settlementNumber: "PS-2024-12-003",
    logisticsProviderName: "中通快递浙江分公司",
    associatedBusinessVolume: 52,
    totalPeriodProfit: 180000,
    deductedFinancingInterest: -52000,
    platformShareAmount: 64000,
    status: "pending"
  },
  {
    id: "4",
    settlementNumber: "PS-2024-11-015",
    logisticsProviderName: "韵达速递江苏分公司",
    associatedBusinessVolume: 35,
    totalPeriodProfit: 120000,
    deductedFinancingInterest: -35000,
    platformShareAmount: 42500,
    status: "accounted"
  },
  {
    id: "5",
    settlementNumber: "PS-2024-11-014",
    logisticsProviderName: "顺丰速运华东区",
    associatedBusinessVolume: 42,
    totalPeriodProfit: 145000,
    deductedFinancingInterest: -42000,
    platformShareAmount: 51500,
    status: "accounted"
  },
  {
    id: "6",
    settlementNumber: "PS-2024-11-013",
    logisticsProviderName: "德邦物流上海总部",
    associatedBusinessVolume: 48,
    totalPeriodProfit: 168000,
    deductedFinancingInterest: -48000,
    platformShareAmount: 60000,
    status: "accounted"
  }
];

function ProfitSharingSettlementPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [settlements, setSettlements] = useState<ProfitSharingSettlement[]>(mockSettlements);
  const [loading, setLoading] = useState(false);
  const [includeAll, setIncludeAll] = useState(true);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // 计算统计数据
  const stats = useMemo(() => {
    const totalEstimated = settlements.reduce((sum, s) => sum + s.platformShareAmount, 0);
    
    const accountedAmount = settlements
      .filter(s => s.status === "accounted")
      .reduce((sum, s) => sum + s.platformShareAmount, 0);
    
    const pendingAmount = settlements
      .filter(s => s.status === "pending")
      .reduce((sum, s) => sum + s.platformShareAmount, 0);

    return {
      totalEstimated: includeAll ? totalEstimated : pendingAmount + accountedAmount,
      accountedAmount,
      pendingAmount
    };
  }, [settlements, includeAll]);

  // 格式化金额
  const formatAmount = (amount: number): string => {
    return `¥${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // 获取状态标签
  const getStatusTag = (status: string) => {
    const configs: Record<string, { label: string; color: string }> = {
      pending: {
        label: t("profit_sharing.status_pending", "待入账"),
        color: "orange"
      },
      accounted: {
        label: t("profit_sharing.status_accounted", "已入账"),
        color: "green"
      }
    };
    return configs[status] || { label: status, color: "default" };
  };

  // 处理导出
  const handleExport = () => {
    // TODO: 调用导出API
    message.success(t("profit_sharing.export_success", "导出成功"));
  };

  // 处理批量入账确认
  const handleBatchConfirm = () => {
    if (selectedRowKeys.length === 0) {
      message.warning(t("profit_sharing.no_selection", "请先选择要确认的记录"));
      return;
    }

    const pendingSelected = settlements.filter(
      s => selectedRowKeys.includes(s.id) && s.status === "pending"
    );

    if (pendingSelected.length === 0) {
      message.warning(t("profit_sharing.no_pending_selection", "请选择待入账的记录"));
      return;
    }

    Modal.confirm({
      title: t("profit_sharing.batch_confirm_title", "确认批量入账"),
      content: t("profit_sharing.batch_confirm_content", "确定要批量确认入账选中的 {count} 条记录吗？").replace("{count}", String(pendingSelected.length)),
      okText: t("common.confirm", "确认"),
      cancelText: t("common.cancel", "取消"),
      onOk: async () => {
        // TODO: 调用API
        setSettlements(prev =>
          prev.map(s => (pendingSelected.some(ps => ps.id === s.id)
            ? { ...s, status: "accounted" as const }
            : s))
        );
        setSelectedRowKeys([]);
        message.success(t("profit_sharing.batch_confirm_success", "批量入账确认成功"));
      }
    });
  };

  // 行选择配置
  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => {
      setSelectedRowKeys(keys);
    },
    getCheckboxProps: (record: ProfitSharingSettlement) => ({
      disabled: record.status === "accounted" // 已入账的不允许选择
    })
  };

  const columns = [
    {
      title: t("profit_sharing.settlement_number", "结算单号"),
      key: "settlementNumber",
      width: 180,
      render: (_: any, record: ProfitSharingSettlement) => (
        <Space>
          <FileTextOutlined />
          <Text>{record.settlementNumber}</Text>
        </Space>
      )
    },
    {
      title: t("profit_sharing.logistics_provider_name", "物流商名称"),
      key: "logisticsProviderName",
      width: 200,
      render: (_: any, record: ProfitSharingSettlement) => (
        <Text>{record.logisticsProviderName}</Text>
      )
    },
    {
      title: t("profit_sharing.associated_business_volume", "关联业务量"),
      key: "associatedBusinessVolume",
      width: 150,
      render: (_: any, record: ProfitSharingSettlement) => (
        <Text>{record.associatedBusinessVolume}{t("profit_sharing.orders", "单")}</Text>
      )
    },
    {
      title: t("profit_sharing.total_period_profit", "周期总利润"),
      key: "totalPeriodProfit",
      width: 150,
      align: "right" as const,
      render: (_: any, record: ProfitSharingSettlement) => (
        <Text>{formatAmount(record.totalPeriodProfit)}</Text>
      )
    },
    {
      title: t("profit_sharing.deducted_financing_interest", "扣除融资利息"),
      key: "deductedFinancingInterest",
      width: 150,
      align: "right" as const,
      render: (_: any, record: ProfitSharingSettlement) => (
        <Text style={{ color: "#ff4d4f" }}>{formatAmount(record.deductedFinancingInterest)}</Text>
      )
    },
    {
      title: t("profit_sharing.platform_share_amount", "平台分成金额"),
      key: "platformShareAmount",
      width: 150,
      align: "right" as const,
      render: (_: any, record: ProfitSharingSettlement) => (
        <Text strong style={{ fontSize: 16, color: "#52c41a" }}>
          {formatAmount(record.platformShareAmount)}
        </Text>
      )
    },
    {
      title: t("profit_sharing.status", "状态"),
      key: "status",
      width: 120,
      render: (_: any, record: ProfitSharingSettlement) => {
        const config = getStatusTag(record.status);
        return <Tag color={config.color}>{config.label}</Tag>;
      }
    }
  ];

  if (!user?.permissions?.includes("manage_settlements")) {
    return (
      <Result
        status="403"
        title={t("common.no_permission", "无权限")}
        subTitle={t("profit_sharing.no_access", "需要 manage_settlements 权限")}
      />
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={2} style={{ margin: 0 }}>
            {t("profit_sharing.title", "业务分润结算")}
          </Title>
          <Text type="secondary" style={{ display: "block", marginTop: 4 }}>
            {t("profit_sharing.subtitle", "平台业务分成与利润分配管理")}
          </Text>
        </Col>
        <Col>
          <Space>
            <Button icon={<DownloadOutlined />} onClick={handleExport}>
              {t("profit_sharing.export_details", "导出分润明细")}
            </Button>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={handleBatchConfirm}
              disabled={selectedRowKeys.length === 0}
            >
              {t("profit_sharing.batch_account_confirm", "批量入账确认")}
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Statistics Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>
                  {t("profit_sharing.total_estimated_this_month", "本月预估分润总额")}
                </div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 8, color: "#1890ff" }}>
                  {formatAmount(stats.totalEstimated)}
                </div>
                <Checkbox
                  checked={includeAll}
                  onChange={(e) => setIncludeAll(e.target.checked)}
                >
                  {t("profit_sharing.include_all", "含待入账与已入账")}
                </Checkbox>
              </div>
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>
                  {t("profit_sharing.accounted_profit", "已入账分润")}
                </div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 8, color: "#52c41a" }}>
                  {formatAmount(stats.accountedAmount)}
                </div>
                <div style={{ fontSize: 12, color: "#8c8c8c", display: "flex", alignItems: "center" }}>
                  <CheckCircleOutlined style={{ color: "#52c41a", marginRight: 4 }} />
                  {t("profit_sharing.settlement_completed", "已完成结算确认")}
                </div>
              </div>
              <CheckCircleOutlined style={{ fontSize: 32, color: "#52c41a", opacity: 0.3 }} />
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card style={{ background: "#1890ff", color: "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.8)", marginBottom: 8 }}>
                  {t("profit_sharing.pending_account_profit", "待入账分润")}
                </div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 8, color: "#fff" }}>
                  {formatAmount(stats.pendingAmount)}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", display: "flex", alignItems: "center" }}>
                  <ClockCircleOutlined style={{ marginRight: 4 }} />
                  {t("profit_sharing.awaiting_financial_confirm", "待财务确认入账")}
                </div>
              </div>
              <ClockCircleOutlined style={{ fontSize: 32, color: "rgba(255,255,255,0.3)" }} />
            </div>
          </Card>
        </Col>
      </Row>

      {/* Table */}
      <Card>
        <Table
          rowSelection={rowSelection}
          columns={columns}
          dataSource={settlements}
          loading={loading}
          rowKey="id"
          scroll={{ x: 1200 }}
          pagination={{
            showSizeChanger: false,
            showTotal: (total) =>
              t("profit_sharing.total_records", "共 {total} 条记录").replace("{total}", String(total))
          }}
        />
      </Card>
    </div>
  );
}

export default ProfitSharingSettlementPage;

