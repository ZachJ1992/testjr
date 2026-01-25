import { useEffect, useState } from "react";
import { Card, Row, Col, Progress, Button, Table, Tag, Alert, Typography, Space, Result } from "antd";
import { fetchFundPoolMonitoring, getErrorMessage } from "../api";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import { FundPoolMonitoring as FundPoolMonitoringType, FundFlow } from "../types";
import { ArrowUpOutlined, ArrowDownOutlined, ReloadOutlined } from "@ant-design/icons";
import { message } from "antd";

function FundPoolMonitoringPage() {
  const { token, user } = useAuth();
  const { t } = useI18n();
  const [monitoring, setMonitoring] = useState<FundPoolMonitoringType | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetchFundPoolMonitoring(token);
      setMonitoring(res.monitoring);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  // 格式化金额
  const formatAmount = (amount: number): string => {
    return `¥${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // 格式化金额（万元）
  const formatAmountWan = (amount: number): string => {
    return `¥${(amount / 10000).toLocaleString("zh-CN")}万`;
  };

  // 获取使用率状态颜色
  const getUsageRateColor = (rate: number): string => {
    if (rate >= 90) return "#ff4d4f";
    if (rate >= 70) return "#faad14";
    return "#52c41a";
  };

  // 获取使用率状态文本
  const getUsageRateStatus = (rate: number): string => {
    if (rate >= 90) return t("fund_pool.status_high_risk", "风险极高");
    if (rate >= 80) return t("fund_pool.status_high_load", "负载偏高");
    if (rate >= 70) return t("fund_pool.status_normal", "正常");
    return t("fund_pool.status_low", "充足");
  };

  // 获取预警类型颜色
  const getWarningColor = (type: string) => {
    switch (type) {
      case "warning":
        return "error";
      case "tip":
        return "warning";
      case "notification":
        return "info";
      default:
        return "info";
    }
  };

  // 获取预警类型文本
  const getWarningIcon = (type: string) => {
    switch (type) {
      case "warning":
        return "▲ 预警";
      case "tip":
        return "▲ 提示";
      case "notification":
        return "▲ 通知";
      default:
        return "▲";
    }
  };

  // 获取操作类型显示
  const getOperationTypeDisplay = (type: string) => {
    if (type === "payment") {
      return (
        <Space>
          <ArrowUpOutlined style={{ color: "#ff4d4f", transform: "rotate(45deg)" }} />
          <span>{t("fund_pool.operation_payment", "代付支出")}</span>
        </Space>
      );
    }
    return (
      <Space>
        <ArrowDownOutlined style={{ color: "#52c41a", transform: "rotate(-45deg)" }} />
        <span>{t("fund_pool.operation_repayment", "还款回笼")}</span>
      </Space>
    );
  };

  if (!user?.permissions?.includes("view_fund_pool")) {
    return (
      <Result
        status="403"
        title={t("common.no_permission", "无权限")}
        subTitle={t("fund_pool.no_access", "需要 view_fund_pool 权限")}
      />
    );
  }

  const fundFlowColumns = [
    {
      title: t("fund_pool.time", "时间"),
      dataIndex: "time",
      key: "time",
      width: 180
    },
    {
      title: t("fund_pool.operation_type", "操作类型"),
      dataIndex: "operationType",
      key: "operationType",
      width: 150,
      render: (type: string) => getOperationTypeDisplay(type)
    },
    {
      title: t("fund_pool.associated_entity", "关联主体"),
      dataIndex: "associatedEntity",
      key: "associatedEntity"
    },
    {
      title: t("fund_pool.change_amount", "变动金额"),
      dataIndex: "changeAmount",
      key: "changeAmount",
      width: 200,
      render: (amount: number) => (
        <span style={{ color: amount < 0 ? "#ff4d4f" : "#52c41a", fontWeight: "bold" }}>
          {amount > 0 ? "+" : ""}{formatAmount(amount)}
        </span>
      )
    },
    {
      title: t("fund_pool.remaining_balance", "池剩余总额"),
      dataIndex: "remainingBalance",
      key: "remainingBalance",
      width: 200,
      render: (amount: number) => <span style={{ fontWeight: "bold" }}>{formatAmount(amount)}</span>
    }
  ];

  return (
    <div style={{ padding: 24 }}>
      <Space style={{ marginBottom: 24, width: "100%", justifyContent: "space-between" }}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          {t("fund_pool.title", "资金池监控")}
        </Typography.Title>
        <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading}>
          {t("common.refresh", "刷新")}
        </Button>
      </Space>

      {monitoring && (
        <>
          {/* 顶部概览 */}
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={6}>
              <Card>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>
                    {t("fund_pool.total_credit_line", "资金池总授信")}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4 }}>
                    {formatAmount(monitoring.totalCreditLine)}
                  </div>
                  <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                    {t("fund_pool.stable_credit_line", "稳定授信额度")}
                  </div>
                </div>
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>
                    {t("fund_pool.current_available_balance", "当前可用余额")}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4, color: "#1890ff" }}>
                    {formatAmount(monitoring.currentAvailableBalance)}
                  </div>
                  <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                    {t("fund_pool.real_time_callable", "$ 实时可调动资金")}
                  </div>
                </div>
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>
                    {t("fund_pool.total_outstanding_loans", "全平台在贷余额")}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4 }}>
                    {formatAmount(monitoring.totalOutstandingLoans)}
                  </div>
                  <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                    {t("fund_pool.disbursed_not_recovered", "已放款未回收")}
                  </div>
                </div>
              </Card>
            </Col>
            <Col span={6}>
              <Card>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>
                    {t("fund_pool.utilization_rate", "资金占用率")}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4, color: getUsageRateColor(monitoring.utilizationRate) }}>
                    {monitoring.utilizationRate.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                    {t("fund_pool.status", "状态")}: {getUsageRateStatus(monitoring.utilizationRate)}
                  </div>
                </div>
              </Card>
            </Col>
          </Row>

          {/* 中间区域 */}
          <Row gutter={16} style={{ marginBottom: 24 }}>
            {/* 左侧：资金方额度占比 */}
            <Col span={14}>
              <Card title={t("fund_pool.funder_shares", "资金方额度占比")}>
                <Space direction="vertical" style={{ width: "100%" }} size="large">
                  {monitoring.funderShares.map((share) => (
                    <div key={share.funderId}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <Typography.Text strong>{share.funderName}</Typography.Text>
                        <Space>
                          <Typography.Text type="secondary">
                            {t("fund_pool.total_credit_line_label", "总授信")}: {formatAmountWan(share.totalCreditLine)}
                          </Typography.Text>
                          <Button size="small" type="link">
                            {t("fund_pool.adjust_credit", "调剂额度")}
                          </Button>
                        </Space>
                      </div>
                      <Progress
                        percent={share.usageRate}
                        strokeColor={getUsageRateColor(share.usageRate)}
                        showInfo={false}
                        style={{ marginBottom: 4 }}
                      />
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#8c8c8c" }}>
                        <span>{t("fund_pool.available", "可用")}: {formatAmountWan(share.availableAmount)}</span>
                        <span>{share.usageRate.toFixed(1)}%</span>
                      </div>
                    </div>
                  ))}
                </Space>
              </Card>
            </Col>

            {/* 右侧：流动性预警 */}
            <Col span={10}>
              <Card title={t("fund_pool.liquidity_warnings", "流动性预警")}>
                <Space direction="vertical" style={{ width: "100%" }} size="middle">
                  {monitoring.liquidityWarnings.length === 0 ? (
                    <Typography.Text type="secondary">
                      {t("fund_pool.no_warnings", "暂无预警信息")}
                    </Typography.Text>
                  ) : (
                    monitoring.liquidityWarnings.map((warning) => (
                      <Alert
                        key={warning.id}
                        message={
                          <div>
                            <div style={{ fontWeight: "bold", marginBottom: 4 }}>
                              {getWarningIcon(warning.type)}
                            </div>
                            <div>{warning.message}</div>
                            <div style={{ fontSize: 12, color: "#8c8c8c", marginTop: 4 }}>
                              {new Date(warning.timestamp).toLocaleString("zh-CN")}
                            </div>
                          </div>
                        }
                        type={getWarningColor(warning.type) as any}
                        showIcon={false}
                        style={{ marginBottom: 0 }}
                      />
                    ))
                  )}
                </Space>
              </Card>
            </Col>
          </Row>

          {/* 底部：资金流水台账 */}
          <Card title={t("fund_pool.fund_flows", "资金流水台账")}>
            <Table<FundFlow>
              rowKey="id"
              loading={loading}
              dataSource={monitoring.fundFlows}
              columns={fundFlowColumns}
              pagination={{ pageSize: 10 }}
            />
          </Card>
        </>
      )}
    </div>
  );
}

export default FundPoolMonitoringPage;

