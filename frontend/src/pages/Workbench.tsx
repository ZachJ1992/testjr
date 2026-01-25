import { useEffect, useState } from "react";
import { Card, Col, Row, Tag, Typography, Space, Alert } from "antd";
import { useI18n } from "../i18n";
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  FileTextOutlined,
  DollarOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  WarningOutlined
} from "@ant-design/icons";

const { Title, Text } = Typography;

interface RiskItem {
  id: string;
  level: "high" | "medium" | "low";
  company: string;
  message: string;
  time: string;
}

interface TodoItem {
  type: "settlement" | "disbursement" | "repayment" | "contract";
  count: number;
  label: string;
  icon: React.ReactNode;
}

// Mock数据
const mockKPI = {
  totalAssetsOnLoan: 42500000,
  assetsOnLoanTrend: 5.2,
  capitalTurnoverEfficiency: 18.5,
  efficiencyTrend: -2.1,
  overdueRate: 0.82,
  expectedProfit: 684200,
  profitTrend: 12
};

const mockChartData = [
  { date: "01/01", disbursement: 4200, repayment: 3800 },
  { date: "01/02", disbursement: 4500, repayment: 4000 },
  { date: "01/03", disbursement: 4300, repayment: 3900 },
  { date: "01/04", disbursement: 4800, repayment: 4200 },
  { date: "01/05", disbursement: 5200, repayment: 4600 },
  { date: "01/06", disbursement: 5100, repayment: 4700 },
  { date: "01/07", disbursement: 4900, repayment: 4500 },
  { date: "01/08", disbursement: 5000, repayment: 4600 },
  { date: "01/09", disbursement: 5500, repayment: 5000 },
  { date: "01/10", disbursement: 5400, repayment: 4900 },
  { date: "01/11", disbursement: 5300, repayment: 4800 },
  { date: "01/12", disbursement: 5600, repayment: 5100 },
  { date: "01/13", disbursement: 5800, repayment: 5300 },
  { date: "01/14", disbursement: 5700, repayment: 5200 },
  { date: "01/15", disbursement: 5900, repayment: 5400 },
  { date: "01/16", disbursement: 6000, repayment: 5500 },
  { date: "01/17", disbursement: 6200, repayment: 5700 },
  { date: "01/18", disbursement: 6100, repayment: 5600 },
  { date: "01/19", disbursement: 6300, repayment: 5800 },
  { date: "01/20", disbursement: 6400, repayment: 5900 },
  { date: "01/21", disbursement: 6500, repayment: 6000 },
  { date: "01/22", disbursement: 6400, repayment: 5900 },
  { date: "01/23", disbursement: 6600, repayment: 6100 },
  { date: "01/24", disbursement: 6700, repayment: 6200 },
  { date: "01/25", disbursement: 6800, repayment: 6300 },
  { date: "01/26", disbursement: 6700, repayment: 6200 },
  { date: "01/27", disbursement: 6500, repayment: 6000 }
];

const mockRisks: RiskItem[] = [
  {
    id: "1",
    level: "high",
    company: "中通快递浙江分公司",
    message: "超额使用授信额度",
    time: "3小时前"
  },
  {
    id: "2",
    level: "medium",
    company: "德邦物流上海总部",
    message: "资金占用率达85%",
    time: "5小时前"
  },
  {
    id: "3",
    level: "medium",
    company: "韵达速递江苏分公司",
    message: "合同将在7天后到期",
    time: "1天前"
  }
];

// 待办事项数据将在组件内部根据t函数生成

// 简单的折线图组件
function LineChart({ data }: { data: typeof mockChartData }) {
  const width = 800;
  const height = 300;
  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // 计算最大值
  const maxValue = Math.max(
    ...data.map(d => Math.max(d.disbursement, d.repayment))
  );
  const maxY = Math.ceil(maxValue / 1000) * 1000;

  // 计算坐标
  const xScale = (index: number) =>
    (index / (data.length - 1)) * chartWidth;
  const yScale = (value: number) =>
    chartHeight - (value / maxY) * chartHeight;

  // 生成折线路径
  const createPath = (key: "disbursement" | "repayment", color: string) => {
    const points = data
      .map((d, i) => {
        const x = xScale(i);
        const y = yScale(d[key]);
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");

    return (
      <g key={key}>
        <path
          d={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {data.map((d, i) => {
          const x = xScale(i);
          const y = yScale(d[key]);
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="4"
              fill={color}
              stroke="#fff"
              strokeWidth="2"
            />
          );
        })}
      </g>
    );
  };

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg width={width} height={height} style={{ display: "block" }}>
        <defs>
          <clipPath id="chart-clip">
            <rect width={chartWidth} height={chartHeight} />
          </clipPath>
        </defs>
        <g transform={`translate(${padding.left}, ${padding.top})`}>
          {/* Y轴刻度线和标签 */}
          {[0, 2000, 4000, 6000, 8000].map((value) => {
            const y = yScale(value);
            return (
              <g key={value}>
                <line
                  x1={0}
                  y1={y}
                  x2={chartWidth}
                  y2={y}
                  stroke="#f0f0f0"
                  strokeWidth="1"
                />
                <text
                  x={-10}
                  y={y + 5}
                  textAnchor="end"
                  fontSize="12"
                  fill="#666"
                >
                  ¥{value / 1000}K
                </text>
              </g>
            );
          })}

          {/* X轴刻度标签 */}
          {data
            .filter((_, i) => i % 3 === 0)
            .map((d, i) => {
              const originalIndex = data.findIndex(item => item.date === d.date);
              const x = xScale(originalIndex);
              return (
                <g key={d.date}>
                  <text
                    x={x}
                    y={chartHeight + 20}
                    textAnchor="middle"
                    fontSize="12"
                    fill="#666"
                  >
                    {d.date}
                  </text>
                </g>
              );
            })}

          {/* 折线 */}
          <g clipPath="url(#chart-clip)">
            {createPath("disbursement", "#1890ff")}
            {createPath("repayment", "#52c41a")}
          </g>
        </g>
      </svg>
    </div>
  );
}

function WorkbenchPage() {
  const { t } = useI18n();

  const mockTodos: TodoItem[] = [
    {
      type: "settlement",
      count: 12,
      label: t("workbench.todo_settlement", "待处理结算单"),
      icon: <FileTextOutlined style={{ fontSize: 24 }} />
    },
    {
      type: "disbursement",
      count: 5,
      label: t("workbench.todo_disbursement", "待办代付审核"),
      icon: <DollarOutlined style={{ fontSize: 24 }} />
    },
    {
      type: "repayment",
      count: 3,
      label: t("workbench.todo_repayment", "待核销还款"),
      icon: <ExclamationCircleOutlined style={{ fontSize: 24 }} />
    },
    {
      type: "contract",
      count: 2,
      label: t("workbench.todo_contract", "待确认合同"),
      icon: <CheckCircleOutlined style={{ fontSize: 24 }} />
    }
  ];

  // 格式化金额
  const formatAmount = (amount: number): string => {
    return `¥${amount.toLocaleString("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };

  // 获取风险级别颜色和图标
  const getRiskLevelConfig = (level: string) => {
    switch (level) {
      case "high":
        return {
          color: "#ff4d4f",
          icon: <WarningOutlined style={{ color: "#ff4d4f" }} />,
          label: t("workbench.risk_high", "高风险")
        };
      case "medium":
        return {
          color: "#faad14",
          icon: <ExclamationCircleOutlined style={{ color: "#faad14" }} />,
          label: t("workbench.risk_medium", "中风险")
        };
      default:
        return {
          color: "#52c41a",
          icon: <CheckCircleOutlined style={{ color: "#52c41a" }} />,
          label: t("workbench.risk_low", "低风险")
        };
    }
  };

  const highRiskCount = mockRisks.filter(r => r.level === "high").length;

  return (
    <div style={{ padding: 24 }}>
      {/* 顶部KPI卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <div>
              <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>
                {t("workbench.total_assets_on_loan", "在贷资产总额")}
              </div>
              <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4 }}>
                {formatAmount(mockKPI.totalAssetsOnLoan)}
              </div>
              <div style={{ fontSize: 12, color: "#52c41a" }}>
                <ArrowUpOutlined />{" "}
                {t("workbench.compared_last_week", "较上周")}
                ↑{mockKPI.assetsOnLoanTrend}%
              </div>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <div>
              <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>
                {t("workbench.capital_turnover_efficiency", "资金周转效率")}
              </div>
              <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4 }}>
                {mockKPI.capitalTurnoverEfficiency}
                {t("workbench.days", "天")}
              </div>
              <div style={{ fontSize: 12, color: "#ff4d4f" }}>
                <ArrowDownOutlined />{" "}
                {t("workbench.compared_last_week", "较上周")}
                ↓{Math.abs(mockKPI.efficiencyTrend)}
                {t("workbench.days", "天")}
              </div>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <div>
              <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>
                {t("workbench.asset_overdue_rate", "资产逾期率")}
              </div>
              <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4 }}>
                {mockKPI.overdueRate}%
              </div>
              <div style={{ fontSize: 12, color: "#52c41a" }}>
                {t("workbench.status_safe", "安全")}
              </div>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <div>
              <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>
                {t("workbench.expected_profit_this_month", "本月预期分润")}
              </div>
              <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4 }}>
                {formatAmount(mockKPI.expectedProfit)}
              </div>
              <div style={{ fontSize: 12, color: "#52c41a" }}>
                <ArrowUpOutlined />{" "}
                {t("workbench.compared_last_week", "较上周")}
                ↑{mockKPI.profitTrend}%
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 中间区域 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        {/* 左侧：趋势图 */}
        <Col span={16}>
          <Card
            title={
              <div>
                <Title level={5} style={{ margin: 0 }}>
                  {t("workbench.loan_repayment_trend", "放款与还款趋势图")}
                </Title>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t("workbench.trend_subtitle", "实时追踪资金流动情况")}
                </Text>
              </div>
            }
          >
            <div style={{ display: "flex", justifyContent: "center" }}>
              <LineChart data={mockChartData} />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 24,
                marginTop: 16
              }}
            >
              <Space>
                <div
                  style={{
                    width: 12,
                    height: 12,
                    backgroundColor: "#1890ff",
                    borderRadius: "50%"
                  }}
                />
                <Text>{t("workbench.disbursement_amount", "代付额")}</Text>
              </Space>
              <Space>
                <div
                  style={{
                    width: 12,
                    height: 12,
                    backgroundColor: "#52c41a",
                    borderRadius: "50%"
                  }}
                />
                <Text>{t("workbench.repayment_amount", "还款额")}</Text>
              </Space>
            </div>
          </Card>
        </Col>

        {/* 右侧：风险监控 */}
        <Col span={8}>
          <Card
            title={
              <div>
                <Title level={5} style={{ margin: 0 }}>
                  {t("workbench.real_time_risk_monitoring", "实时风险监控")}
                </Title>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t(
                    "workbench.risk_subtitle",
                    "需要重点关注的风险事项"
                  )}
                </Text>
              </div>
            }
          >
            <div style={{ marginBottom: 16 }}>
              <Space>
                <WarningOutlined style={{ fontSize: 24, color: "#ff4d4f" }} />
                <Text strong style={{ fontSize: 18 }}>
                  {highRiskCount}
                </Text>
                <Text>{t("workbench.risk_high", "高风险")}</Text>
              </Space>
            </div>
            <Space direction="vertical" style={{ width: "100%" }} size="middle">
              {mockRisks.map((risk) => {
                const config = getRiskLevelConfig(risk.level);
                return (
                  <Alert
                    key={risk.id}
                    message={
                      <div>
                        <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                          <Tag color={config.color} icon={config.icon}>
                            {config.label}
                          </Tag>
                          <Text strong style={{ marginLeft: 8 }}>
                            {risk.company}
                          </Text>
                        </div>
                        <Text>{risk.message}</Text>
                        <div
                          style={{
                            fontSize: 12,
                            color: "#8c8c8c",
                            marginTop: 4
                          }}
                        >
                          {risk.time}
                        </div>
                      </div>
                    }
                    type={risk.level === "high" ? "error" : "warning"}
                    showIcon={false}
                    style={{ marginBottom: 0 }}
                  />
                );
              })}
            </Space>
            <div style={{ marginTop: 16, textAlign: "right" }}>
              <Text
                type="secondary"
                style={{ cursor: "pointer" }}
                onClick={() => {
                  // 跳转到风险事项页面
                }}
              >
                {t("workbench.view_all_risks", "查看所有风险事项")} →
              </Text>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 底部：待办事项 */}
      <Card
        title={
          <div>
            <Title level={5} style={{ margin: 0 }}>
              {t("workbench.todos", "待办事项")}
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t("workbench.todos_subtitle", "需要您处理的任务和审批")}
            </Text>
          </div>
        }
      >
        <Row gutter={16}>
          {mockTodos.map((todo) => (
            <Col span={6} key={todo.type}>
              <Card
                hoverable
                style={{ textAlign: "center", cursor: "pointer" }}
                onClick={() => {
                  // 跳转到对应的待办事项页面
                }}
              >
                <div style={{ marginBottom: 16, color: "#1890ff" }}>
                  {todo.icon}
                </div>
                <div style={{ fontSize: 32, fontWeight: "bold", marginBottom: 8 }}>
                  {todo.count}
                </div>
                <div style={{ fontSize: 14, color: "#8c8c8c" }}>
                  {todo.label}
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>
    </div>
  );
}

export default WorkbenchPage;
