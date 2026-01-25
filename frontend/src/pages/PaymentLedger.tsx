import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import {
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Input,
  Result,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography
} from "antd";
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  WarningOutlined,
  SearchOutlined,
  DownloadOutlined
} from "@ant-design/icons";
import { useMemo, useState } from "react";
import dayjs, { Dayjs } from "dayjs";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface PaymentTransaction {
  id: string;
  transactionNumber: string;
  occurredAt: string;
  businessType: "freight_payment" | "balance_repayment" | "interest_settlement";
  amount: number;
  relatedDocument: string;
  fundAccount: string;
  channel: string;
  status: "success" | "processing" | "failed";
  isAbnormal?: boolean;
}

// Mock数据
const mockTransactions: PaymentTransaction[] = [
  {
    id: "1",
    transactionNumber: "TXN-20241219-001234",
    occurredAt: "2024-12-19T15:23:45Z",
    businessType: "freight_payment",
    amount: -125000,
    relatedDocument: "FIN-2024-001",
    fundAccount: "中国工商银行资金池",
    channel: "ICBC",
    status: "success"
  },
  {
    id: "2",
    transactionNumber: "TXN-20241219-001235",
    occurredAt: "2024-12-19T14:58:12Z",
    businessType: "balance_repayment",
    amount: 450000,
    relatedDocument: "REP-2024-089",
    fundAccount: "招商银行资金池",
    channel: "CMB",
    status: "success"
  },
  {
    id: "3",
    transactionNumber: "TXN-20241219-001236",
    occurredAt: "2024-12-19T14:35:20Z",
    businessType: "freight_payment",
    amount: -88000,
    relatedDocument: "FIN-2024-045",
    fundAccount: "华润深国投信托",
    channel: "CRSC",
    status: "success"
  },
  {
    id: "4",
    transactionNumber: "TXN-20241219-001237",
    occurredAt: "2024-12-19T13:42:08Z",
    businessType: "interest_settlement",
    amount: -75000,
    relatedDocument: "FR-2025-02-001",
    fundAccount: "中国工商银行资金池",
    channel: "ICBC",
    status: "processing",
    isAbnormal: true
  },
  {
    id: "5",
    transactionNumber: "TXN-20241219-001238",
    occurredAt: "2024-12-19T13:15:33Z",
    businessType: "freight_payment",
    amount: -156000,
    relatedDocument: "FIN-2024-078",
    fundAccount: "招商银行资金池",
    channel: "CMB",
    status: "success"
  },
  {
    id: "6",
    transactionNumber: "TXN-20241219-001239",
    occurredAt: "2024-12-19T12:28:45Z",
    businessType: "balance_repayment",
    amount: 220000,
    relatedDocument: "REP-2024-095",
    fundAccount: "中国工商银行资金池",
    channel: "ICBC",
    status: "success"
  },
  {
    id: "7",
    transactionNumber: "TXN-20241219-001240",
    occurredAt: "2024-12-19T11:50:19Z",
    businessType: "freight_payment",
    amount: -98000,
    relatedDocument: "FIN-2024-089",
    fundAccount: "登途自营资金池",
    channel: "DT",
    status: "success"
  },
  {
    id: "8",
    transactionNumber: "TXN-20241219-001241",
    occurredAt: "2024-12-19T11:20:56Z",
    businessType: "balance_repayment",
    amount: 180000,
    relatedDocument: "REP-2024-102",
    fundAccount: "华润深国投信托",
    channel: "CRSC",
    status: "success"
  },
  {
    id: "9",
    transactionNumber: "TXN-20241219-001242",
    occurredAt: "2024-12-19T10:45:32Z",
    businessType: "freight_payment",
    amount: -132000,
    relatedDocument: "FIN-2024-112",
    fundAccount: "招商银行资金池",
    channel: "CMB",
    status: "success"
  },
  {
    id: "10",
    transactionNumber: "TXN-20241219-001243",
    occurredAt: "2024-12-19T10:12:44Z",
    businessType: "interest_settlement",
    amount: -68000,
    relatedDocument: "FR-2025-02-002",
    fundAccount: "招商银行资金池",
    channel: "CMB",
    status: "success"
  },
  {
    id: "11",
    transactionNumber: "TXN-20241219-001244",
    occurredAt: "2024-12-19T09:38:17Z",
    businessType: "freight_payment",
    amount: -245000,
    relatedDocument: "FIN-2024-125",
    fundAccount: "中国工商银行资金池",
    channel: "ICBC",
    status: "success",
    isAbnormal: true
  },
  {
    id: "12",
    transactionNumber: "TXN-20241219-001245",
    occurredAt: "2024-12-19T09:05:23Z",
    businessType: "balance_repayment",
    amount: 320000,
    relatedDocument: "REP-2024-115",
    fundAccount: "华润深国投信托",
    channel: "CRSC",
    status: "success"
  }
];

function PaymentLedgerPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [transactions, setTransactions] = useState<PaymentTransaction[]>(mockTransactions);
  const [loading, setLoading] = useState(false);
  
  // 筛选条件
  const [dateFilter, setDateFilter] = useState<string>("today");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [searchKeyword, setSearchKeyword] = useState<string>("");
  const [showAbnormalOnly, setShowAbnormalOnly] = useState(false);

  // 计算统计数据（今日数据）
  const stats = useMemo(() => {
    const todayTransactions = transactions.filter(t => {
      const txDate = dayjs(t.occurredAt);
      return txDate.isSame(dayjs(), "day");
    });
    
    const expenditure = todayTransactions
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    const income = todayTransactions
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);
    
    const netFlow = income - expenditure;
    
    const abnormalCount = transactions.filter(t => t.isAbnormal).length;

    return {
      expenditure,
      income,
      netFlow,
      abnormalCount
    };
  }, [transactions]);

  // 格式化金额
  const formatAmount = (amount: number): string => {
    const absAmount = Math.abs(amount);
    const sign = amount < 0 ? "-" : "+";
    return `${sign}¥${absAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // 获取业务类型标签
  const getBusinessTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      freight_payment: t("payment_ledger.business_type_freight", "运费代付"),
      balance_repayment: t("payment_ledger.business_type_repayment", "余额还款"),
      interest_settlement: t("payment_ledger.business_type_interest", "平台利息结算")
    };
    return labels[type] || type;
  };

  // 获取状态标签和颜色
  const getStatusConfig = (status: string) => {
    const configs: Record<string, { label: string; color: string }> = {
      success: { label: t("payment_ledger.status_success", "成功"), color: "green" },
      processing: { label: t("payment_ledger.status_processing", "处理中"), color: "blue" },
      failed: { label: t("payment_ledger.status_failed", "失败"), color: "red" }
    };
    return configs[status] || { label: status, color: "default" };
  };

  // 过滤后的数据
  const filteredTransactions = useMemo(() => {
    let filtered = transactions;

    // 日期筛选
    if (dateFilter === "today") {
      filtered = filtered.filter(t => {
        const txDate = dayjs(t.occurredAt);
        return txDate.isSame(dayjs(), "day");
      });
    }

    // 类型筛选
    if (typeFilter !== "all") {
      filtered = filtered.filter(t => t.businessType === typeFilter);
    }

    // 渠道筛选
    if (channelFilter !== "all") {
      filtered = filtered.filter(t => t.channel === channelFilter);
    }

    // 异常筛选
    if (showAbnormalOnly) {
      filtered = filtered.filter(t => t.isAbnormal);
    }

    // 搜索
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase();
      filtered = filtered.filter(t =>
        t.transactionNumber.toLowerCase().includes(keyword) ||
        t.relatedDocument.toLowerCase().includes(keyword)
      );
    }

    return filtered;
  }, [transactions, dateFilter, typeFilter, channelFilter, showAbnormalOnly, searchKeyword]);

  // 计算汇总
  const summary = useMemo(() => {
    const expenditure = filteredTransactions
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    const income = filteredTransactions
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);
    
    const netAmount = income - expenditure;

    return { expenditure, income, netAmount };
  }, [filteredTransactions]);

  const columns = [
    {
      title: t("payment_ledger.transaction_number", "交易流水号"),
      key: "transactionNumber",
      width: 200,
      render: (_: any, record: PaymentTransaction) => (
        <Text>{record.transactionNumber}</Text>
      )
    },
    {
      title: t("payment_ledger.occurred_at", "发生时间"),
      key: "occurredAt",
      width: 180,
      render: (_: any, record: PaymentTransaction) => (
        <Text>{dayjs(record.occurredAt).format("YYYY-MM-DD HH:mm:ss")}</Text>
      )
    },
    {
      title: t("payment_ledger.business_type", "业务类型"),
      key: "businessType",
      width: 150,
      render: (_: any, record: PaymentTransaction) => (
        <Text>{getBusinessTypeLabel(record.businessType)}</Text>
      )
    },
    {
      title: t("payment_ledger.transaction_amount", "交易金额"),
      key: "amount",
      width: 150,
      render: (_: any, record: PaymentTransaction) => (
        <Text
          strong
          style={{
            color: record.amount < 0 ? "#ff4d4f" : "#52c41a",
            fontSize: 14
          }}
        >
          {formatAmount(record.amount)}
        </Text>
      )
    },
    {
      title: t("payment_ledger.related_document", "关联单据"),
      key: "relatedDocument",
      width: 180,
      render: (_: any, record: PaymentTransaction) => (
        <Text>{record.relatedDocument}</Text>
      )
    },
    {
      title: t("payment_ledger.fund_account_channel", "资金账号/渠道"),
      key: "fundAccount",
      width: 200,
      render: (_: any, record: PaymentTransaction) => (
        <div>
          <div>{record.fundAccount}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.channel}
          </Text>
        </div>
      )
    },
    {
      title: t("payment_ledger.status", "状态"),
      key: "status",
      width: 100,
      render: (_: any, record: PaymentTransaction) => {
        const config = getStatusConfig(record.status);
        return (
          <Space>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: config.color,
                display: "inline-block"
              }}
            />
            <Text>{config.label}</Text>
          </Space>
        );
      }
    }
  ];

  if (!user?.permissions?.includes("view_payment_ledger")) {
    return (
      <Result
        status="403"
        title={t("common.no_permission", "无权限")}
        subTitle={t("payment_ledger.no_access", "需要 view_payment_ledger 权限")}
      />
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={2} style={{ margin: 0 }}>
            {t("payment_ledger.title", "支付流水台账")}
          </Title>
          <Text type="secondary" style={{ display: "block", marginTop: 4 }}>
            {t("payment_ledger.subtitle", "资金收支流水明细记录")}
          </Text>
        </Col>
      </Row>

      {/* Statistics Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>
                  {t("payment_ledger.today_expenditure", "今日累计支出")}
                </div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4, color: "#ff4d4f" }}>
                  {formatAmount(-stats.expenditure)}
                </div>
                <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                  {t("payment_ledger.expenditure_desc", "支付流出金额")}
                </div>
              </div>
              <ArrowDownOutlined style={{ fontSize: 32, color: "#ff4d4f", opacity: 0.3 }} />
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>
                  {t("payment_ledger.today_income", "今日累计收入")}
                </div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4, color: "#52c41a" }}>
                  {formatAmount(stats.income)}
                </div>
                <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                  {t("payment_ledger.income_desc", "还款回笼金额")}
                </div>
              </div>
              <ArrowUpOutlined style={{ fontSize: 32, color: "#52c41a", opacity: 0.3 }} />
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>
                  {t("payment_ledger.net_flow_trend", "净现金流趋势")}
                </div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: "bold",
                    marginBottom: 4,
                    color: stats.netFlow < 0 ? "#ff4d4f" : "#52c41a"
                  }}
                >
                  {formatAmount(stats.netFlow)}
                </div>
                <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                  {t("payment_ledger.net_flow_desc", "收入减支出")}
                </div>
              </div>
              <ArrowUpOutlined
                style={{
                  fontSize: 32,
                  color: stats.netFlow < 0 ? "#ff4d4f" : "#52c41a",
                  opacity: 0.3
                }}
              />
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ borderColor: stats.abnormalCount > 0 ? "#ff4d4f" : undefined }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>
                  {t("payment_ledger.abnormal_alert", "异常流水告警")}
                </div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4, color: "#ff4d4f" }}>
                  {stats.abnormalCount}{t("payment_ledger.entry_unit", "笔")}
                </div>
                <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                  {t("payment_ledger.requires_review", "需人工复核")}
                </div>
              </div>
              <WarningOutlined style={{ fontSize: 32, color: "#ff4d4f", opacity: 0.3 }} />
            </div>
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={16} align="middle">
          <Col>
            <Checkbox
              checked={showAbnormalOnly}
              onChange={(e) => setShowAbnormalOnly(e.target.checked)}
            >
              {t("payment_ledger.show_abnormal_only", "仅显示异常")}
            </Checkbox>
          </Col>
          <Col span={4}>
            <Select
              style={{ width: "100%" }}
              value={dateFilter}
              onChange={setDateFilter}
              options={[
                { value: "today", label: t("payment_ledger.today", "今日") },
                { value: "week", label: t("payment_ledger.this_week", "本周") },
                { value: "month", label: t("payment_ledger.this_month", "本月") },
                { value: "all", label: t("payment_ledger.all_time", "全部") }
              ]}
            />
          </Col>
          <Col span={4}>
            <Select
              style={{ width: "100%" }}
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { value: "all", label: t("payment_ledger.all_types", "全部类型") },
                {
                  value: "freight_payment",
                  label: t("payment_ledger.business_type_freight", "运费代付")
                },
                {
                  value: "balance_repayment",
                  label: t("payment_ledger.business_type_repayment", "余额还款")
                },
                {
                  value: "interest_settlement",
                  label: t("payment_ledger.business_type_interest", "平台利息结算")
                }
              ]}
            />
          </Col>
          <Col span={6}>
            <Input
              placeholder={t("payment_ledger.search_placeholder", "搜索流水号/关联单号...")}
              prefix={<SearchOutlined />}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
          </Col>
          <Col span={4}>
            <Select
              style={{ width: "100%" }}
              value={channelFilter}
              onChange={setChannelFilter}
              options={[
                { value: "all", label: t("payment_ledger.all_channels", "全部渠道") },
                { value: "ICBC", label: "ICBC" },
                { value: "CMB", label: "CMB" },
                { value: "CRSC", label: "CRSC" },
                { value: "DT", label: "DT" }
              ]}
            />
          </Col>
          <Col>
            <Button icon={<DownloadOutlined />}>
              {t("payment_ledger.export", "导出")}
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={filteredTransactions}
          loading={loading}
          rowKey="id"
          pagination={{
            showSizeChanger: false,
            showTotal: (total) =>
              t("payment_ledger.total_transactions", "共{count}笔交易").replace("{count}", String(total))
          }}
          footer={() => (
            <div style={{ textAlign: "right", padding: "16px 0" }}>
              <Text>
                {t("payment_ledger.summary_expenditure", "支出")}:{formatAmount(-summary.expenditure)}{" "}
                {t("payment_ledger.summary_income", "收入")}:{formatAmount(summary.income)}{" "}
                {t("payment_ledger.summary_net", "净额")}:{formatAmount(summary.netAmount)}
              </Text>
            </div>
          )}
        />
      </Card>
    </div>
  );
}

export default PaymentLedgerPage;

