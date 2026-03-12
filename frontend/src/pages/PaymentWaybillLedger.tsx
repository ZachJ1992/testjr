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
  Typography,
  message,
  Modal
} from "antd";
import {
  SearchOutlined
} from "@ant-design/icons";
import { useMemo, useState } from "react";
import dayjs, { Dayjs } from "dayjs";

const { Title, Text } = Typography;

interface WaybillRecord {
  id: string;
  waybillNumber: string;
  licensePlate: string;
  route: string;
  totalRevenue: number;
  commissionRatio: number;
  commissionAmount: number;
  settlementStatus: "settled" | "pending";
  completionTime: string;
}

// Mock数据
const mockWaybills: WaybillRecord[] = [
  {
    id: "1",
    waybillNumber: "WD2024010001",
    licensePlate: "京A12345",
    route: "北京→上海",
    totalRevenue: 28500,
    commissionRatio: 3.5,
    commissionAmount: 997.5,
    settlementStatus: "settled",
    completionTime: "2024-01-15T14:30:00Z"
  },
  {
    id: "2",
    waybillNumber: "WD2024010002",
    licensePlate: "沪B67890",
    route: "上海→广州",
    totalRevenue: 32000,
    commissionRatio: 4,
    commissionAmount: 1280,
    settlementStatus: "pending",
    completionTime: "2024-01-16T09:20:00Z"
  }
];

function PaymentWaybillLedgerPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [waybills, setWaybills] = useState<WaybillRecord[]>(mockWaybills);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  
  // 筛选条件
  const [waybillNumberFilter, setWaybillNumberFilter] = useState<string>("");
  const [settlementStatusFilter, setSettlementStatusFilter] = useState<string>("all");
  const [completionDateFilter, setCompletionDateFilter] = useState<Dayjs | null>(null);

  // 计算本页统计数据
  const pageStats = useMemo(() => {
    const totalRevenue = waybills.reduce((sum, w) => sum + w.totalRevenue, 0);
    const totalCommission = waybills.reduce((sum, w) => sum + w.commissionAmount, 0);
    return {
      totalRevenue,
      totalCommission
    };
  }, [waybills]);

  // 格式化金额
  const formatAmount = (amount: number): string => {
    return `¥${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // 处理批量确认结算
  const handleBatchSettle = () => {
    if (selectedRowKeys.length === 0) {
      message.warning(t("payment_waybill_ledger.no_selection", "请先选择要结算的记录"));
      return;
    }

    Modal.confirm({
      title: t("payment_waybill_ledger.batch_settle_confirm", "确认批量结算"),
      content: t("payment_waybill_ledger.batch_settle_content", "确定要批量确认结算选中的 {count} 条记录吗？").replace("{count}", String(selectedRowKeys.length)),
      okText: t("common.confirm", "确认"),
      cancelText: t("common.cancel", "取消"),
      onOk: async () => {
        // TODO: 调用API
        setWaybills(prev =>
          prev.map(w => (selectedRowKeys.includes(w.id) && w.settlementStatus === "pending"
            ? { ...w, settlementStatus: "settled" as const }
            : w))
        );
        setSelectedRowKeys([]);
        message.success(t("payment_waybill_ledger.batch_settle_success", "批量结算成功"));
      }
    });
  };

  // 过滤后的数据
  const filteredWaybills = useMemo(() => {
    return waybills.filter(w => {
      if (waybillNumberFilter && !w.waybillNumber.toLowerCase().includes(waybillNumberFilter.toLowerCase())) {
        return false;
      }
      if (settlementStatusFilter !== "all" && w.settlementStatus !== settlementStatusFilter) {
        return false;
      }
      if (completionDateFilter) {
        const waybillDate = dayjs(w.completionTime);
        if (!waybillDate.isSame(completionDateFilter, "day")) {
          return false;
        }
      }
      return true;
    });
  }, [waybills, waybillNumberFilter, settlementStatusFilter, completionDateFilter]);

  // 重新计算过滤后的统计数据
  const filteredStats = useMemo(() => {
    const totalRevenue = filteredWaybills.reduce((sum, w) => sum + w.totalRevenue, 0);
    const totalCommission = filteredWaybills.reduce((sum, w) => sum + w.commissionAmount, 0);
    return {
      totalRevenue,
      totalCommission
    };
  }, [filteredWaybills]);

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => {
      setSelectedRowKeys(keys);
    }
  };

  const columns = [
    {
      title: t("payment_waybill_ledger.waybill_number", "运单编号"),
      key: "waybillNumber",
      width: 180,
      render: (_: any, record: WaybillRecord) => (
        <Text>{record.waybillNumber}</Text>
      )
    },
    {
      title: t("payment_waybill_ledger.license_plate", "车牌号"),
      key: "licensePlate",
      width: 120,
      render: (_: any, record: WaybillRecord) => (
        <Text>{record.licensePlate}</Text>
      )
    },
    {
      title: t("payment_waybill_ledger.route", "运输路线"),
      key: "route",
      width: 150,
      render: (_: any, record: WaybillRecord) => (
        <Text>{record.route}</Text>
      )
    },
    {
      title: t("payment_waybill_ledger.total_revenue", "运输总收入"),
      key: "totalRevenue",
      width: 150,
      render: (_: any, record: WaybillRecord) => (
        <Text strong>{formatAmount(record.totalRevenue)}</Text>
      )
    },
    {
      title: t("payment_waybill_ledger.commission_ratio", "抽成比例"),
      key: "commissionRatio",
      width: 120,
      render: (_: any, record: WaybillRecord) => (
        <Text>{record.commissionRatio.toFixed(1)}%</Text>
      )
    },
    {
      title: t("payment_waybill_ledger.commission_amount", "抽成金额"),
      key: "commissionAmount",
      width: 150,
      render: (_: any, record: WaybillRecord) => (
        <Text strong style={{ color: "#1890ff" }}>
          {formatAmount(record.commissionAmount)}
        </Text>
      )
    },
    {
      title: t("payment_waybill_ledger.settlement_status", "结算状态"),
      key: "settlementStatus",
      width: 120,
      render: (_: any, record: WaybillRecord) => {
        const isSettled = record.settlementStatus === "settled";
        return (
          <Tag color={isSettled ? "green" : "orange"}>
            {isSettled
              ? t("payment_waybill_ledger.status_settled", "已结算")
              : t("payment_waybill_ledger.status_pending", "待结算")}
          </Tag>
        );
      }
    },
    {
      title: t("payment_waybill_ledger.completion_time", "完成时间"),
      key: "completionTime",
      width: 180,
      render: (_: any, record: WaybillRecord) => (
        <Text>{dayjs(record.completionTime).format("YYYY-MM-DD HH:mm")}</Text>
      )
    }
  ];

  if (!user?.permissions?.includes("view_payment_waybill_ledger")) {
    return (
      <Result
        status="403"
        title={t("common.no_permission", "无权限")}
        subTitle={t("payment_waybill_ledger.no_access", "需要 view_payment_waybill_ledger 权限")}
      />
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={2} style={{ margin: 0 }}>
            {t("payment_waybill_ledger.title", "单车运单台账")}
          </Title>
          <Text type="secondary" style={{ display: "block", marginTop: 4 }}>
            {t("payment_waybill_ledger.subtitle", "单车运单抽成明细记录")}
          </Text>
        </Col>
      </Row>

      {/* Filters */}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={16} align="middle">
          <Col span={6}>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              {t("payment_waybill_ledger.waybill_number", "运单号")}
            </Text>
            <Input
              placeholder={t("payment_waybill_ledger.waybill_number_placeholder", "请输入运单编号")}
              prefix={<SearchOutlined />}
              value={waybillNumberFilter}
              onChange={(e) => setWaybillNumberFilter(e.target.value)}
            />
          </Col>
          <Col span={4}>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              {t("payment_waybill_ledger.settlement_status", "结算状态")}
            </Text>
            <Select
              style={{ width: "100%" }}
              value={settlementStatusFilter}
              onChange={setSettlementStatusFilter}
              options={[
                { value: "all", label: t("payment_waybill_ledger.all_status", "全部") },
                {
                  value: "settled",
                  label: t("payment_waybill_ledger.status_settled", "已结算")
                },
                {
                  value: "pending",
                  label: t("payment_waybill_ledger.status_pending", "待结算")
                }
              ]}
            />
          </Col>
          <Col span={4}>
            <Text strong style={{ display: "block", marginBottom: 8 }}>
              {t("payment_waybill_ledger.completion_date", "完成日期")}
            </Text>
            <DatePicker
              style={{ width: "100%" }}
              value={completionDateFilter}
              onChange={setCompletionDateFilter}
              placeholder={t("payment_waybill_ledger.date_placeholder", "年/月/日")}
              format="YYYY/MM/DD"
            />
          </Col>
          <Col span={3}>
            <Button
              type="primary"
              style={{ marginTop: 30 }}
              onClick={() => {
                // 查询逻辑已经在filteredWaybills中实现
                message.info(t("payment_waybill_ledger.query_success", "查询完成"));
              }}
            >
              {t("payment_waybill_ledger.query", "查询")}
            </Button>
          </Col>
          <Col span={7}>
            <Button
              style={{ marginTop: 30 }}
              onClick={handleBatchSettle}
              disabled={selectedRowKeys.length === 0}
            >
              {t("payment_waybill_ledger.batch_settle", "批量确认结算")}
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Statistics Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <Card>
            <div>
              <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>
                {t("payment_waybill_ledger.page_total_revenue", "本页运输总收入")}
              </div>
              <div style={{ fontSize: 24, fontWeight: "bold", color: "#1890ff" }}>
                {formatAmount(filteredStats.totalRevenue)}
              </div>
            </div>
          </Card>
        </Col>
        <Col span={12}>
          <Card>
            <div>
              <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>
                {t("payment_waybill_ledger.page_total_commission", "本页抽成总金额")}
              </div>
              <div style={{ fontSize: 24, fontWeight: "bold", color: "#52c41a" }}>
                {formatAmount(filteredStats.totalCommission)}
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Table */}
      <Card>
        <Table
          rowSelection={rowSelection}
          columns={columns}
          dataSource={filteredWaybills}
          loading={loading}
          rowKey="id"
          pagination={{
            showSizeChanger: false,
            showTotal: (total) =>
              t("payment_waybill_ledger.total_records", "显示第1-{count}条, 共{total}条记录")
                .replace("{count}", String(Math.min(filteredWaybills.length, 8)))
                .replace("{total}", String(total))
          }}
        />
      </Card>
    </div>
  );
}

export default PaymentWaybillLedgerPage;

