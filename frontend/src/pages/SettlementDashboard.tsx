import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import {
  Button,
  Card,
  Col,
  Result,
  Row,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
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
  RiseOutlined
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
  type Settlement,
  type SettlementStats,
  type DirectedPaySettlement,
  type DirectedPaySettlementStats
} from "../api";

const { Title, Text } = Typography;

// 状态映射
const statusMap: Record<string, { color: string; text: string }> = {
  pending: { color: "orange", text: "待处理" },
  confirmed: { color: "blue", text: "已确认" },
  partial_paid: { color: "cyan", text: "部分还款" },
  settled: { color: "green", text: "已结算" },
  paid: { color: "green", text: "已结清" },
  overdue: { color: "red", text: "逾期" }
};

// 结算类型映射
const typeMap: Record<string, { label: string; color: string }> = {
  financing_repayment: { label: "融资还款", color: "#1890ff" },
  commission: { label: "抽成结算", color: "#52c41a" },
  profit_sharing: { label: "分润结算", color: "#722ed1" },
  directed_pay: { label: "定向支付", color: "#13c2c2" }
};

function SettlementDashboardPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  
  // 通用结算统计
  const [generalStats, setGeneralStats] = useState<SettlementStats | null>(null);
  const [generalSettlements, setGeneralSettlements] = useState<Settlement[]>([]);
  
  // 定向支付结算统计
  const [dpStats, setDpStats] = useState<DirectedPaySettlementStats | null>(null);
  const [dpSettlements, setDpSettlements] = useState<DirectedPaySettlement[]>([]);
  
  // 权限检查
  const canManageSettlements = user?.permissions?.includes("*") || user?.permissions?.includes("manage_settlements");
  const canViewDirectedPaySettlements = user?.permissions?.includes("*") || 
    user?.permissions?.includes("manage_directed_pay_settlements") || 
    user?.permissions?.includes("view_directed_pay_settlements");

  // 加载数据
  const loadData = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    
    setLoading(true);
    try {
      // 根据权限决定调用哪些 API
      const promises: Promise<any>[] = [];
      const promiseLabels: string[] = [];

      if (canManageSettlements) {
        promises.push(fetchSettlementStats(token));
        promiseLabels.push("generalStats");
        promises.push(fetchSettlements(token, { status: "pending" }));
        promiseLabels.push("generalSettlements");
      }

      if (canViewDirectedPaySettlements) {
        promises.push(fetchDirectedPaySettlementStats(token));
        promiseLabels.push("dpStats");
        promises.push(fetchDirectedPaySettlements(token, { status: "pending" }));
        promiseLabels.push("dpSettlements");
      }

      const results = await Promise.all(promises);
      
      // 根据返回结果设置状态
      promiseLabels.forEach((label, index) => {
        if (label === "generalStats") {
          setGeneralStats(results[index]);
        } else if (label === "generalSettlements") {
          setGeneralSettlements(results[index].settlements);
        } else if (label === "dpStats") {
          setDpStats(results[index]);
        } else if (label === "dpSettlements") {
          setDpSettlements(results[index].settlements);
        }
      });
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [canManageSettlements, canViewDirectedPaySettlements]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 汇总统计
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
      overdueCount: (generalStats?.overdueCount || 0) + (dpStats?.totalOverdue || 0)
    };
  }, [generalStats, dpStats]);

  // 通用结算表格列
  const generalColumns = [
    {
      title: "结算单号",
      dataIndex: "settlementNumber",
      key: "settlementNumber",
      width: 150
    },
    {
      title: "类型",
      dataIndex: "type",
      key: "type",
      width: 100,
      render: (type: string) => {
        const config = typeMap[type] || { label: type, color: "#999" };
        return <Tag color={config.color}>{config.label}</Tag>;
      }
    },
    {
      title: "客户",
      dataIndex: "customerName",
      key: "customerName",
      width: 150,
      ellipsis: true
    },
    {
      title: "结算周期",
      key: "period",
      width: 180,
      render: (_: any, record: Settlement) => (
        <span style={{ fontSize: 12 }}>
          {dayjs(record.periodStart).format("MM-DD")} ~ {dayjs(record.periodEnd).format("MM-DD")}
        </span>
      )
    },
    {
      title: "应还金额",
      key: "amount",
      width: 120,
      align: "right" as const,
      render: (_: any, record: Settlement) => (
        <Text strong>
          ¥{(record.totalDue || record.totalAmount || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
        </Text>
      )
    },
    {
      title: "应还日期",
      dataIndex: "dueDate",
      key: "dueDate",
      width: 100,
      render: (date: string) => {
        const isOverdue = dayjs(date).isBefore(dayjs(), "day");
        return (
          <Text type={isOverdue ? "danger" : undefined}>
            {dayjs(date).format("MM-DD")}
          </Text>
        );
      }
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 80,
      render: (status: string) => {
        const config = statusMap[status] || { color: "default", text: status };
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    }
  ];

  // 定向支付结算表格列
  const dpColumns = [
    {
      title: "结算单号",
      dataIndex: "settlementNumber",
      key: "settlementNumber",
      width: 150
    },
    {
      title: "合同号",
      dataIndex: "contractNumber",
      key: "contractNumber",
      width: 130
    },
    {
      title: "融资方",
      dataIndex: "financierName",
      key: "financierName",
      width: 150,
      ellipsis: true
    },
    {
      title: "本金",
      dataIndex: "principalAmount",
      key: "principalAmount",
      width: 100,
      align: "right" as const,
      render: (val: number) => `¥${val.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`
    },
    {
      title: "利息",
      dataIndex: "interestAmount",
      key: "interestAmount",
      width: 80,
      align: "right" as const,
      render: (val: number) => (
        <Text type="warning">¥{val.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</Text>
      )
    },
    {
      title: "应还总额",
      dataIndex: "totalAmount",
      key: "totalAmount",
      width: 110,
      align: "right" as const,
      render: (val: number) => (
        <Text strong>¥{val.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</Text>
      )
    },
    {
      title: "应还日期",
      dataIndex: "dueDate",
      key: "dueDate",
      width: 100,
      render: (date: string) => {
        const isOverdue = dayjs(date).isBefore(dayjs(), "day");
        return (
          <Text type={isOverdue ? "danger" : undefined}>
            {dayjs(date).format("MM-DD")}
          </Text>
        );
      }
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 80,
      render: (status: string) => {
        const config = statusMap[status] || { color: "default", text: status };
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    }
  ];

  // 权限检查 - 使用已定义的权限变量
  if (!canManageSettlements && !canViewDirectedPaySettlements) {
    return (
      <Result
        status="403"
        title="无访问权限"
        subTitle="您没有权限访问结算中心仪表板"
      />
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* 标题区域 */}
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Title level={4} style={{ margin: 0 }}>
          <AccountBookOutlined style={{ marginRight: 8 }} />
          结算中心仪表板
        </Title>
        <Button
          icon={<ReloadOutlined />}
          onClick={loadData}
          loading={loading}
        >
          刷新数据
        </Button>
      </div>

      {/* 汇总统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title={
                <Space>
                  <ClockCircleOutlined style={{ color: "#fa8c16" }} />
                  待处理金额
                </Space>
              }
              value={totalStats.totalPending}
              precision={2}
              prefix="¥"
              valueStyle={{ color: "#fa8c16" }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">{totalStats.pendingCount} 笔待处理</Text>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={
                <Space>
                  <ExclamationCircleOutlined style={{ color: "#ff4d4f" }} />
                  逾期金额
                </Space>
              }
              value={totalStats.totalOverdue}
              precision={2}
              prefix="¥"
              valueStyle={{ color: "#ff4d4f" }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">{totalStats.overdueCount} 笔逾期</Text>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title={
                <Space>
                  <CheckCircleOutlined style={{ color: "#52c41a" }} />
                  已结算金额
                </Space>
              }
              value={totalStats.totalSettled}
              precision={2}
              prefix="¥"
              valueStyle={{ color: "#52c41a" }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">累计结算</Text>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <div style={{ marginBottom: 8 }}>
              <Text type="secondary">结算完成率</Text>
            </div>
            <Progress
              percent={
                totalStats.totalPending + totalStats.totalSettled > 0
                  ? Math.round((totalStats.totalSettled / (totalStats.totalPending + totalStats.totalSettled)) * 100)
                  : 0
              }
              strokeColor={{
                "0%": "#108ee9",
                "100%": "#87d068"
              }}
              format={(percent) => `${percent}%`}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">已结算 / 总金额</Text>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 分类统计卡片 - 根据权限显示 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        {canManageSettlements && (
          <Col span={canViewDirectedPaySettlements ? 8 : 12}>
            <Card 
              title={
                <Space>
                  <BankOutlined style={{ color: "#1890ff" }} />
                  融资还款结算
                </Space>
              }
              size="small"
            >
              <Row gutter={16}>
                <Col span={12}>
                  <Statistic
                    title="待处理"
                    value={generalStats?.pendingAmount || 0}
                    precision={2}
                    prefix="¥"
                    valueStyle={{ fontSize: 16 }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="已结算"
                    value={generalStats?.settledAmount || 0}
                    precision={2}
                    prefix="¥"
                    valueStyle={{ fontSize: 16, color: "#52c41a" }}
                  />
                </Col>
              </Row>
            </Card>
          </Col>
        )}
        {canViewDirectedPaySettlements && (
          <Col span={canManageSettlements ? 8 : 12}>
            <Card 
              title={
                <Space>
                  <DollarOutlined style={{ color: "#13c2c2" }} />
                  定向支付结算
                </Space>
              }
              size="small"
            >
              <Row gutter={16}>
                <Col span={12}>
                  <Statistic
                    title="待处理"
                    value={dpStats?.pendingAmount || 0}
                    precision={2}
                    prefix="¥"
                    valueStyle={{ fontSize: 16 }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="已结清"
                    value={dpStats?.totalPaidAmount || 0}
                    precision={2}
                    prefix="¥"
                    valueStyle={{ fontSize: 16, color: "#52c41a" }}
                  />
                </Col>
              </Row>
            </Card>
          </Col>
        )}
        {canManageSettlements && (
          <Col span={canViewDirectedPaySettlements ? 8 : 12}>
            <Card 
              title={
                <Space>
                  <RiseOutlined style={{ color: "#722ed1" }} />
                  抽成/分润结算
                </Space>
              }
              size="small"
            >
              <Row gutter={16}>
                <Col span={12}>
                  <Statistic
                    title="待处理笔数"
                    value={generalSettlements.filter(s => s.type === "commission" || s.type === "profit_sharing").length}
                    suffix="笔"
                    valueStyle={{ fontSize: 16 }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="待处理金额"
                    value={generalSettlements
                      .filter(s => s.type === "commission" || s.type === "profit_sharing")
                      .reduce((sum, s) => sum + (s.totalAmount || 0), 0)}
                    precision={2}
                    prefix="¥"
                    valueStyle={{ fontSize: 16 }}
                  />
                </Col>
              </Row>
            </Card>
          </Col>
        )}
      </Row>

      {/* 待处理结算单列表 - 根据权限显示 */}
      <Card title="待处理结算单">
        <Tabs
          defaultActiveKey={canManageSettlements ? "general" : "directed_pay"}
          items={[
            ...(canManageSettlements ? [{
              key: "general",
              label: (
                <Space>
                  <FileTextOutlined />
                  融资/抽成/分润
                  {generalSettlements.length > 0 && (
                    <Tag color="orange">{generalSettlements.length}</Tag>
                  )}
                </Space>
              ),
              children: (
                <Table
                  columns={generalColumns}
                  dataSource={generalSettlements}
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 5 }}
                  size="small"
                  locale={{ emptyText: "暂无待处理结算单" }}
                />
              )
            }] : []),
            ...(canViewDirectedPaySettlements ? [{
              key: "directed_pay",
              label: (
                <Space>
                  <DollarOutlined />
                  定向支付
                  {dpSettlements.length > 0 && (
                    <Tag color="orange">{dpSettlements.length}</Tag>
                  )}
                </Space>
              ),
              children: (
                <Table
                  columns={dpColumns}
                  dataSource={dpSettlements}
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 5 }}
                  size="small"
                  locale={{ emptyText: "暂无待处理结算单" }}
                />
              )
            }] : [])
          ]}
        />
      </Card>
    </div>
  );
}

export default SettlementDashboardPage;
