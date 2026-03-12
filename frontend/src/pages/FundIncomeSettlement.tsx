import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import {
  Button,
  Card,
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
  FileTextOutlined,
  CheckCircleOutlined,
  WalletOutlined
} from "@ant-design/icons";
import { useMemo, useState } from "react";

const { Title, Text } = Typography;

interface FundIncomeSettlement {
  id: string;
  settlementNumber: string;
  fundProvider: string;
  totalCreditAmount: number;
  occupiedFundDailyCount: number;
  payableIncome: number;
  settlementPeriod: string;
  status: "pending" | "paid";
}

// Mock数据
const mockSettlements: FundIncomeSettlement[] = [
  {
    id: "1",
    settlementNumber: "FR-2025-02-001",
    fundProvider: "中国工商银行",
    totalCreditAmount: 50000000,
    occupiedFundDailyCount: 1825000000,
    payableIncome: 75000,
    settlementPeriod: "2025-02",
    status: "pending"
  },
  {
    id: "3",
    settlementNumber: "FR-2025-01-005",
    fundProvider: "华润深国投信托",
    totalCreditAmount: 20000000,
    occupiedFundDailyCount: 570000000,
    payableIncome: 58000,
    settlementPeriod: "2025-01",
    status: "paid"
  }
];

function FundIncomeSettlementPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [settlements, setSettlements] = useState<FundIncomeSettlement[]>(mockSettlements);
  const [loading, setLoading] = useState(false);

  // 计算统计数据
  const stats = useMemo(() => {
    const totalPayable = settlements.reduce((sum, s) => sum + s.payableIncome, 0);
    
    const clearedAmount = settlements
      .filter(s => s.status === "paid")
      .reduce((sum, s) => sum + s.payableIncome, 0);
    
    const pendingAmount = settlements
      .filter(s => s.status === "pending")
      .reduce((sum, s) => sum + s.payableIncome, 0);

    return {
      totalPayable,
      clearedAmount,
      pendingAmount
    };
  }, [settlements]);

  // 格式化金额
  const formatAmount = (amount: number): string => {
    if (amount >= 100000000) {
      return `¥${(amount / 100000000).toFixed(0)}亿`;
    }
    if (amount >= 10000) {
      return `¥${(amount / 10000).toFixed(0)}万`;
    }
    return `¥${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // 格式化金额（带千分位和小数）
  const formatAmountWithCommas = (amount: number): string => {
    return `¥${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // 格式化大数字（占用资金日积数）
  const formatLargeNumber = (num: number): string => {
    return num.toLocaleString("zh-CN");
  };

  // 获取状态标签
  const getStatusTag = (status: string) => {
    const configs: Record<string, { label: string; color: string }> = {
      pending: {
        label: t("fund_income.status_pending", "待支付"),
        color: "orange"
      },
      paid: {
        label: t("fund_income.status_paid", "已付息"),
        color: "green"
      }
    };
    return configs[status] || { label: status, color: "default" };
  };

  // 处理生成对账单
  const handleGenerateStatement = () => {
    // TODO: 调用生成对账单API
    message.success(t("fund_income.generate_statement_success", "生成对账单成功"));
  };

  // 处理结息核销
  const handleSettlementWriteoff = () => {
    const pendingSettlements = settlements.filter(s => s.status === "pending");
    
    if (pendingSettlements.length === 0) {
      message.warning(t("fund_income.no_pending_settlements", "没有待支付的结算单"));
      return;
    }

    Modal.confirm({
      title: t("fund_income.settlement_writeoff_title", "确认结息核销"),
      content: t("fund_income.settlement_writeoff_content", "确定要对所有待支付的结算单进行结息核销吗？共 {count} 条记录。").replace("{count}", String(pendingSettlements.length)),
      okText: t("common.confirm", "确认"),
      cancelText: t("common.cancel", "取消"),
      onOk: async () => {
        // TODO: 调用API
        setSettlements(prev =>
          prev.map(s => (s.status === "pending" ? { ...s, status: "paid" as const } : s))
        );
        message.success(t("fund_income.settlement_writeoff_success", "结息核销成功"));
      }
    });
  };

  // 处理单条核销
  const handleWriteoff = (settlement: FundIncomeSettlement) => {
    if (settlement.status === "paid") {
      return;
    }

    Modal.confirm({
      title: t("fund_income.writeoff_title", "确认核销"),
      content: t("fund_income.writeoff_content", "确定要核销结算单 {number} 吗？").replace("{number}", settlement.settlementNumber),
      okText: t("common.confirm", "确认"),
      cancelText: t("common.cancel", "取消"),
      onOk: async () => {
        // TODO: 调用API
        setSettlements(prev =>
          prev.map(s => (s.id === settlement.id ? { ...s, status: "paid" as const } : s))
        );
        message.success(t("fund_income.writeoff_success", "核销成功"));
      }
    });
  };

  const columns = [
    {
      title: t("fund_income.settlement_number", "收益结算单号"),
      key: "settlementNumber",
      width: 180,
      render: (_: any, record: FundIncomeSettlement) => (
        <Text strong>{record.settlementNumber}</Text>
      )
    },
    {
      title: t("fund_income.fund_provider", "资金方"),
      key: "fundProvider",
      width: 180,
      render: (_: any, record: FundIncomeSettlement) => (
        <Text>{record.fundProvider}</Text>
      )
    },
    {
      title: t("fund_income.total_credit_amount", "授信总金额"),
      key: "totalCreditAmount",
      width: 150,
      align: "right" as const,
      render: (_: any, record: FundIncomeSettlement) => (
        <Text>{formatAmount(record.totalCreditAmount)}</Text>
      )
    },
    {
      title: t("fund_income.occupied_fund_daily_count", "占用资金日积数"),
      key: "occupiedFundDailyCount",
      width: 180,
      align: "right" as const,
      render: (_: any, record: FundIncomeSettlement) => (
        <Text>{formatLargeNumber(record.occupiedFundDailyCount)}</Text>
      )
    },
    {
      title: t("fund_income.payable_income", "应付收益"),
      key: "payableIncome",
      width: 150,
      align: "right" as const,
      render: (_: any, record: FundIncomeSettlement) => (
        <Text strong style={{ fontSize: 16, color: "#1890ff" }}>
          {formatAmountWithCommas(record.payableIncome)}
        </Text>
      )
    },
    {
      title: t("fund_income.settlement_period", "结算周期"),
      key: "settlementPeriod",
      width: 120,
      render: (_: any, record: FundIncomeSettlement) => (
        <Text>{record.settlementPeriod}</Text>
      )
    },
    {
      title: t("fund_income.status", "状态"),
      key: "status",
      width: 120,
      render: (_: any, record: FundIncomeSettlement) => {
        const config = getStatusTag(record.status);
        return <Tag color={config.color}>{config.label}</Tag>;
      }
    },
    {
      title: t("fund_income.operations", "操作"),
      key: "actions",
      width: 120,
      fixed: "right" as const,
      render: (_: any, record: FundIncomeSettlement) => {
        if (record.status === "paid") {
          return (
            <Text type="secondary">
              {t("fund_income.completed", "已完成")}
            </Text>
          );
        }
        return (
          <Button type="link" onClick={() => handleWriteoff(record)}>
            {t("fund_income.writeoff", "核销")}
          </Button>
        );
      }
    }
  ];

  if (!user?.permissions?.includes("manage_settlements")) {
    return (
      <Result
        status="403"
        title={t("common.no_permission", "无权限")}
        subTitle={t("fund_income.no_access", "需要 manage_settlements 权限")}
      />
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={2} style={{ margin: 0 }}>
            {t("fund_income.title", "资金收益结算")}
          </Title>
          <Text type="secondary" style={{ display: "block", marginTop: 4 }}>
            {t("fund_income.subtitle", "资金方利息收益结算与核销管理")}
          </Text>
        </Col>
        <Col>
          <Space>
            <Button icon={<FileTextOutlined />} onClick={handleGenerateStatement}>
              {t("fund_income.generate_statement", "生成对账单")}
            </Button>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={handleSettlementWriteoff}
            >
              {t("fund_income.settlement_writeoff", "结息核销")}
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
                  {t("fund_income.total_payable_interest", "本期应付利息总额")}
                </div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 8 }}>
                  {formatAmountWithCommas(stats.totalPayable)}
                </div>
                <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                  {t("fund_income.income_paid_to_funders", "向资金方支付的收益")}
                </div>
              </div>
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>
                  {t("fund_income.cleared_interest", "已结清利息")}
                </div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 8, color: "#52c41a" }}>
                  {formatAmountWithCommas(stats.clearedAmount)}
                </div>
                <div style={{ fontSize: 12, color: "#8c8c8c", display: "flex", alignItems: "center" }}>
                  <CheckCircleOutlined style={{ color: "#52c41a", marginRight: 4 }} />
                  {t("fund_income.writeoff_completed", "已完成付息核销")}
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
                  {t("fund_income.pending_interest_balance", "待结利息余额")}
                </div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 8, color: "#fff" }}>
                  {formatAmountWithCommas(stats.pendingAmount)}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)" }}>
                  {t("fund_income.amount_to_be_written_off", "待核销金额")}
                </div>
              </div>
              <WalletOutlined style={{ fontSize: 32, color: "rgba(255,255,255,0.3)" }} />
            </div>
          </Card>
        </Col>
      </Row>

      {/* Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={settlements}
          loading={loading}
          rowKey="id"
          scroll={{ x: 1200 }}
          pagination={{
            showSizeChanger: false,
            showTotal: (total) =>
              t("fund_income.total_records", "共 {total} 条记录").replace("{total}", String(total))
          }}
        />
      </Card>
    </div>
  );
}

export default FundIncomeSettlementPage;

