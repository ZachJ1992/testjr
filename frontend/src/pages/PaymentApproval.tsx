import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import {
  Button,
  Card,
  Col,
  DatePicker,
  Input,
  Modal,
  Result,
  Row,
  Select,
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
  CopyOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  SearchOutlined
} from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import dayjs, { Dayjs } from "dayjs";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface PaymentApplication {
  id: string;
  applicationNumber: string;
  logisticsEnterpriseId: string;
  logisticsEnterpriseName: string;
  paymentType: "freight" | "etc" | "fuel";
  recipientName: string;
  recipientAccount: string;
  amount: number;
  waybillNumber: string;
  riskStatus: "sufficient" | "warning" | "insufficient";
  riskMessage: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

// Mock数据
const mockApplications: PaymentApplication[] = [
  {
    id: "1",
    applicationNumber: "DF202412180001",
    logisticsEnterpriseId: "SF001",
    logisticsEnterpriseName: "顺丰物流有限公司",
    paymentType: "freight",
    recipientName: "王师傅",
    recipientAccount: "6222****8888",
    amount: 5800,
    waybillNumber: "YD20251218001",
    riskStatus: "sufficient",
    riskMessage: "授信额度充足",
    status: "pending",
    createdAt: "2024-12-18T10:00:00Z"
  }
];

function PaymentApprovalPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [applications, setApplications] = useState<PaymentApplication[]>(mockApplications);
  const [loading, setLoading] = useState(false);
  const [viewingApplication, setViewingApplication] = useState<PaymentApplication | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  
  // 筛选条件
  const [enterpriseFilter, setEnterpriseFilter] = useState<string>("all");
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [searchKeyword, setSearchKeyword] = useState<string>("");

  // 计算统计数据
  const stats = useMemo(() => {
    const pendingCount = applications.filter(a => a.status === "pending").length;
    const pendingAmount = applications
      .filter(a => a.status === "pending")
      .reduce((sum, a) => sum + a.amount, 0);
    
    // Mock数据
    const warningCount = 1; // 剩余可用额度不足10%的企业数
    const todayTotalAmount = 1280000; // 今日累计代付
    const todayApprovedCount = 85; // 今日已通过并开始计息的笔数

    return {
      pendingCount,
      pendingAmount,
      warningCount,
      todayTotalAmount,
      todayApprovedCount
    };
  }, [applications]);

  // 格式化金额
  const formatAmount = (amount: number): string => {
    return `¥${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // 复制文本
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success(t("payment_approval.copied", "已复制"));
  };

  // 处理通过
  const handleApprove = async (application: PaymentApplication) => {
    Modal.confirm({
      title: t("payment_approval.approve_confirm", "确认通过"),
      content: t("payment_approval.approve_content", "确定要通过申请 {number} 吗？").replace("{number}", application.applicationNumber),
      okText: t("common.confirm", "确认"),
      cancelText: t("common.cancel", "取消"),
      onOk: async () => {
        // TODO: 调用API
        setApplications(prev =>
          prev.map(a => (a.id === application.id ? { ...a, status: "approved" as const } : a))
        );
        message.success(t("payment_approval.approved", "已通过"));
      }
    });
  };

  // 处理拒绝
  const handleReject = async (application: PaymentApplication) => {
    Modal.confirm({
      title: t("payment_approval.reject_confirm", "确认拒绝"),
      content: t("payment_approval.reject_content", "确定要拒绝申请 {number} 吗？").replace("{number}", application.applicationNumber),
      okText: t("common.confirm", "确认"),
      cancelText: t("common.cancel", "取消"),
      okButtonProps: { danger: true },
      onOk: async () => {
        // TODO: 调用API
        setApplications(prev =>
          prev.map(a => (a.id === application.id ? { ...a, status: "rejected" as const } : a))
        );
        message.success(t("payment_approval.rejected", "已拒绝"));
      }
    });
  };

  // 处理查看详情
  const handleView = (application: PaymentApplication) => {
    setViewingApplication(application);
    setDetailModalOpen(true);
  };

  // 获取支付类型标签
  const getPaymentTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      freight: t("payment_approval.payment_type_freight", "运费"),
      etc: t("payment_approval.payment_type_etc", "ETC"),
      fuel: t("payment_approval.payment_type_fuel", "油费")
    };
    return labels[type] || type;
  };

  // 获取风控状态颜色
  const getRiskStatusColor = (status: string): string => {
    const colors: Record<string, string> = {
      sufficient: "green",
      warning: "orange",
      insufficient: "red"
    };
    return colors[status] || "default";
  };

  // 过滤后的数据
  const filteredApplications = useMemo(() => {
    return applications.filter(app => {
      if (enterpriseFilter !== "all" && app.logisticsEnterpriseId !== enterpriseFilter) {
        return false;
      }
      if (paymentTypeFilter !== "all" && app.paymentType !== paymentTypeFilter) {
        return false;
      }
      if (dateRange && dateRange[0] && dateRange[1]) {
        const appDate = dayjs(app.createdAt);
        if (appDate.isBefore(dateRange[0]) || appDate.isAfter(dateRange[1])) {
          return false;
        }
      }
      if (searchKeyword) {
        const keyword = searchKeyword.toLowerCase();
        return (
          app.applicationNumber.toLowerCase().includes(keyword) ||
          app.waybillNumber.toLowerCase().includes(keyword) ||
          app.logisticsEnterpriseName.toLowerCase().includes(keyword)
        );
      }
      return true;
    });
  }, [applications, enterpriseFilter, paymentTypeFilter, dateRange, searchKeyword]);

  // 获取所有物流企业选项（用于筛选）
  const enterpriseOptions = useMemo(() => {
    const enterprises = new Set(applications.map(a => a.logisticsEnterpriseId));
    return Array.from(enterprises).map(id => {
      const app = applications.find(a => a.logisticsEnterpriseId === id);
      return {
        value: id,
        label: app?.logisticsEnterpriseName || id
      };
    });
  }, [applications]);

  const columns = [
    {
      title: t("payment_approval.application_number", "申请编号"),
      key: "applicationNumber",
      width: 180,
      render: (_: any, record: PaymentApplication) => (
        <Space>
          <Text>{record.applicationNumber}</Text>
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            onClick={() => handleCopy(record.applicationNumber)}
          />
        </Space>
      )
    },
    {
      title: t("payment_approval.logistics_enterprise", "物流企业"),
      key: "logisticsEnterprise",
      width: 200,
      render: (_: any, record: PaymentApplication) => (
        <div>
          <div>{record.logisticsEnterpriseName}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            ({record.logisticsEnterpriseId})
          </Text>
        </div>
      )
    },
    {
      title: t("payment_approval.payment_details", "支付详情"),
      key: "paymentDetails",
      width: 250,
      render: (_: any, record: PaymentApplication) => (
        <div>
          <div>
            <Tag>{getPaymentTypeLabel(record.paymentType)}</Tag>
          </div>
          <div style={{ marginTop: 4 }}>
            <Text>{record.recipientName}</Text>
            <Text type="secondary" style={{ marginLeft: 8 }}>
              {record.recipientAccount}
            </Text>
          </div>
        </div>
      )
    },
    {
      title: t("payment_approval.payment_amount", "支付金额"),
      key: "amount",
      width: 150,
      render: (_: any, record: PaymentApplication) => (
        <Text strong style={{ fontSize: 16 }}>
          {formatAmount(record.amount)}
        </Text>
      )
    },
    {
      title: t("payment_approval.business_voucher", "业务凭证"),
      key: "waybillNumber",
      width: 180,
      render: (_: any, record: PaymentApplication) => (
        <Space>
          <Text>{record.waybillNumber}</Text>
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            onClick={() => handleCopy(record.waybillNumber)}
          />
        </Space>
      )
    },
    {
      title: t("payment_approval.risk_check", "风控校验"),
      key: "riskStatus",
      width: 180,
      render: (_: any, record: PaymentApplication) => (
        <Tag color={getRiskStatusColor(record.riskStatus)}>
          {record.riskMessage}
        </Tag>
      )
    },
    {
      title: t("payment_approval.operations", "操作"),
      key: "actions",
      width: 200,
      fixed: "right" as const,
      render: (_: any, record: PaymentApplication) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<CheckCircleOutlined />}
            onClick={() => handleApprove(record)}
            disabled={record.status !== "pending"}
          >
            {t("payment_approval.approve", "通过")}
          </Button>
          <Button
            danger
            size="small"
            icon={<CloseCircleOutlined />}
            onClick={() => handleReject(record)}
            disabled={record.status !== "pending"}
          >
            {t("payment_approval.reject", "拒绝")}
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleView(record)}
          >
            {t("payment_approval.view_details", "查看详情")}
          </Button>
        </Space>
      )
    }
  ];

  if (!user?.permissions?.includes("approve_payments")) {
    return (
      <Result
        status="403"
        title={t("common.no_permission", "无权限")}
        subTitle={t("payment_approval.no_access", "需要 approve_payments 权限")}
      />
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={2} style={{ margin: 0 }}>
            {t("payment_approval.title", "财务代付审核")}
          </Title>
          <Text type="secondary" style={{ display: "block", marginTop: 4 }}>
            {t("payment_approval.subtitle", "物流企业代付申请审核与风控管理")}
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
                  {t("payment_approval.pending_amount", "待审核总金额")}
                </div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4 }}>
                  {formatAmount(stats.pendingAmount)}
                </div>
                <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                  {t("payment_approval.pending_applications", "待处理申请{count}笔").replace("{count}", String(stats.pendingCount))}
                </div>
              </div>
              <ClockCircleOutlined style={{ fontSize: 32, color: "#1890ff", opacity: 0.3 }} />
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>
                  {t("payment_approval.credit_warning", "授信额度预警")}
                </div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4, color: "#faad14" }}>
                  {stats.warningCount}
                  {t("payment_approval.enterprise_unit", "家企业")}
                </div>
                <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                  {t("payment_approval.warning_desc", "剩余可用额度不足10%")}
                </div>
              </div>
              <WarningOutlined style={{ fontSize: 32, color: "#faad14", opacity: 0.3 }} />
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>
                  {t("payment_approval.today_total", "今日累计代付")}
                </div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4, color: "#52c41a" }}>
                  {formatAmount(stats.todayTotalAmount)}
                </div>
                <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                  {t("payment_approval.today_approved", "已通过并开始计息{count}笔").replace("{count}", String(stats.todayApprovedCount))}
                </div>
              </div>
              <CheckCircleOutlined style={{ fontSize: 32, color: "#52c41a", opacity: 0.3 }} />
            </div>
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              {t("payment_approval.logistics_enterprise", "物流企业")}
            </Text>
            <Select
              style={{ width: "100%" }}
              value={enterpriseFilter}
              onChange={setEnterpriseFilter}
              options={[
                { value: "all", label: t("payment_approval.all_enterprises", "全部企业") },
                ...enterpriseOptions
              ]}
            />
          </Col>
          <Col span={6}>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              {t("payment_approval.payment_type", "支付类型")}
            </Text>
            <Select
              style={{ width: "100%" }}
              value={paymentTypeFilter}
              onChange={setPaymentTypeFilter}
              options={[
                { value: "all", label: t("payment_approval.all_types", "全部类型") },
                { value: "freight", label: t("payment_approval.payment_type_freight", "运费") },
                { value: "etc", label: t("payment_approval.payment_type_etc", "ETC") },
                { value: "fuel", label: t("payment_approval.payment_type_fuel", "油费") }
              ]}
            />
          </Col>
          <Col span={6}>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              {t("payment_approval.application_date", "申请日期")}
            </Text>
            <RangePicker
              style={{ width: "100%" }}
              value={dateRange}
              onChange={setDateRange}
              placeholder={[
                t("payment_approval.select_date_range", "选择日期区间"),
                t("payment_approval.select_date_range", "选择日期区间")
              ]}
            />
          </Col>
          <Col span={6}>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              {t("payment_approval.quick_search", "快速搜索")}
            </Text>
            <Input
              placeholder={t("payment_approval.waybill_number", "运单号")}
              prefix={<SearchOutlined />}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
          </Col>
        </Row>
      </Card>

      {/* Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={filteredApplications.filter(a => a.status === "pending")}
          loading={loading}
          rowKey="id"
          scroll={{ x: 1400 }}
          pagination={{
            showSizeChanger: false,
            showTotal: (total) =>
              t("payment_approval.total_records", "显示1到{count}条,共{total}条")
                .replace("{count}", String(filteredApplications.length))
                .replace("{total}", String(total))
          }}
        />
      </Card>

      {/* Detail Modal */}
      <Modal
        title={t("payment_approval.application_detail", "申请详情")}
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalOpen(false)}>
            {t("common.close", "关闭")}
          </Button>
        ]}
        width={800}
      >
        {viewingApplication && (
          <div>
            <Row gutter={16}>
              <Col span={12}>
                <Text strong>{t("payment_approval.application_number", "申请编号")}:</Text>
                <div>{viewingApplication.applicationNumber}</div>
              </Col>
              <Col span={12}>
                <Text strong>{t("payment_approval.logistics_enterprise", "物流企业")}:</Text>
                <div>{viewingApplication.logisticsEnterpriseName}</div>
              </Col>
            </Row>
            {/* Add more detail fields as needed */}
          </div>
        )}
      </Modal>
    </div>
  );
}

export default PaymentApprovalPage;

