import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
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
  SearchOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  PlusOutlined,
  ReloadOutlined
} from "@ant-design/icons";
import { useMemo, useState, useEffect, useCallback } from "react";
import dayjs from "dayjs";
import { 
  fetchFinanciers, 
  fetchContracts, 
  getToken,
  fetchSettlements,
  fetchSettlementStats,
  createSettlementApi,
  settleSettlementApi,
  getErrorMessage,
  type Settlement,
  type SettlementStats
} from "../api";
import type { Financier, Contract } from "../types";

const { Title, Text } = Typography;

function FinancingRepaymentSettlementPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [stats, setStats] = useState<SettlementStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");

  // 权限检查 - 新增功能需要 manage_contracts 权限来加载融资方和合同
  const canAddSettlement = user?.permissions?.includes("*") || 
    user?.permissions?.includes("manage_contracts");
  
  // 新增弹窗相关状态
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm] = Form.useForm();
  const [financiers, setFinanciers] = useState<Financier[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selectedFinancierId, setSelectedFinancierId] = useState<string | undefined>();
  const [loadingFinanciers, setLoadingFinanciers] = useState(false);
  const [loadingContracts, setLoadingContracts] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 加载结算单数据
  const loadSettlements = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    
    setLoading(true);
    try {
      const [{ settlements: data }, statsData] = await Promise.all([
        fetchSettlements(token, { type: "financing_repayment" }),
        fetchSettlementStats(token, { type: "financing_repayment" })
      ]);
      setSettlements(data);
      setStats(statsData);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    loadSettlements();
  }, [loadSettlements]);

  // 加载融资方列表
  useEffect(() => {
    const loadFinanciers = async () => {
      const token = getToken();
      if (!token) return;
      
      setLoadingFinanciers(true);
      try {
        const { financiers: data } = await fetchFinanciers(token);
        setFinanciers(data);
      } catch (err) {
        console.error("加载融资方失败:", err);
      } finally {
        setLoadingFinanciers(false);
      }
    };
    
    if (addModalOpen) {
      loadFinanciers();
    }
  }, [addModalOpen]);

  // 当选择客户时，加载对应的合同
  useEffect(() => {
    const loadContracts = async () => {
      if (!selectedFinancierId) {
        setContracts([]);
        return;
      }
      
      const token = getToken();
      if (!token) return;
      
      setLoadingContracts(true);
      try {
        const { contracts: data } = await fetchContracts(token, {
          logisticsProviderId: selectedFinancierId
        });
        // 只显示融资类型合同
        setContracts(data.filter(c => c.type === "financing"));
      } catch (err) {
        console.error("加载合同失败:", err);
      } finally {
        setLoadingContracts(false);
      }
    };
    
    loadContracts();
  }, [selectedFinancierId]);

  // 计算本地统计数据（用于显示本金/利息分解）
  const localStats = useMemo(() => {
    const pendingPrincipal = settlements
      .filter(s => s.status === "pending" || s.status === "overdue")
      .reduce((sum, s) => sum + (s.principal || 0), 0);
    
    const pendingInterest = settlements
      .filter(s => s.status === "pending" || s.status === "overdue")
      .reduce((sum, s) => sum + (s.interest || 0), 0);

    return {
      pendingPrincipal,
      pendingInterest,
      pendingTotal: pendingPrincipal + pendingInterest
    };
  }, [settlements]);

  // 格式化金额
  const formatAmount = (amount: number): string => {
    if (amount >= 1000000) {
      return `¥${(amount / 1000000).toFixed(1)}M`;
    }
    if (amount >= 1000) {
      return `¥${(amount / 1000).toFixed(1)}k`;
    }
    return `¥${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // 格式化金额（带千分位）
  const formatAmountWithCommas = (amount: number): string => {
    return `¥${amount.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  // 获取状态标签
  const getStatusTag = (status: string) => {
    const configs: Record<string, { label: string; color: string }> = {
      pending: {
        label: t("financing_repayment.status_pending", "待核销"),
        color: "blue"
      },
      confirmed: {
        label: t("financing_repayment.status_confirmed", "已确认"),
        color: "cyan"
      },
      overdue: {
        label: t("financing_repayment.status_overdue", "逾期"),
        color: "red"
      },
      settled: {
        label: t("financing_repayment.status_settled", "已结清"),
        color: "green"
      }
    };
    return configs[status] || { label: status, color: "default" };
  };

  // 获取还款类型标签
  const getRepaymentTypeTag = (type: string) => {
    const configs: Record<string, { label: string; color: string }> = {
      principal: {
        label: t("financing_repayment.type_principal", "本金"),
        color: "cyan"
      },
      interest: {
        label: t("financing_repayment.type_interest", "利息"),
        color: "purple"
      }
    };
    return configs[type] || { label: type, color: "default" };
  };

  // 处理去核销（结算）
  const handleVerify = async (settlement: Settlement) => {
    const token = getToken();
    if (!token) return;

    Modal.confirm({
      title: t("financing_repayment.confirm_settle", "确认核销"),
      content: t("financing_repayment.confirm_settle_content", "确定要核销结算单 {number} 吗？").replace("{number}", settlement.settlementNumber),
      okText: t("common.confirm", "确认"),
      cancelText: t("common.cancel", "取消"),
      onOk: async () => {
        try {
          await settleSettlementApi(token, settlement.id);
          message.success(t("financing_repayment.settle_success", "核销成功"));
          loadSettlements();
        } catch (err) {
          message.error(getErrorMessage(err));
        }
      }
    });
  };

  // 处理打开新增弹窗
  const handleOpenAddModal = () => {
    addForm.resetFields();
    setSelectedFinancierId(undefined);
    setContracts([]);
    setAddModalOpen(true);
  };

  // 处理客户选择变化
  const handleFinancierChange = (financierId: string) => {
    setSelectedFinancierId(financierId);
    addForm.setFieldValue("contractId", undefined);
  };

  // 处理新增提交
  const handleAddSubmit = async () => {
    try {
      const values = await addForm.validateFields();
      setSubmitting(true);

      const token = getToken();
      if (!token) {
        message.error(t("common.not_logged_in", "请先登录"));
        return;
      }

      // 获取选中的客户和合同信息
      const selectedFinancier = financiers.find(f => f.id === values.financierId);
      const selectedContract = contracts.find(c => c.id === values.contractId);

      if (!selectedFinancier || !selectedContract) {
        message.error(t("financing_repayment.invalid_selection", "请选择有效的客户和合同"));
        return;
      }

      // 计算结算周期（默认当月）
      const now = dayjs();
      const periodStart = now.startOf("month").format("YYYY-MM-DD");
      const periodEnd = now.endOf("month").format("YYYY-MM-DD");
      const dueDate = now.add(15, "day").format("YYYY-MM-DD");

      // 调用API创建结算单
      await createSettlementApi(token, {
        type: "financing_repayment",
        contractId: selectedContract.id,
        contractType: selectedContract.type,
        customerId: selectedFinancier.id,
        customerName: selectedFinancier.enterpriseName,
        periodStart,
        periodEnd,
        repaymentType: values.repaymentType,
        principal: values.repaymentType === "principal" ? values.amount : 0,
        interest: values.repaymentType === "interest" ? values.amount : 0,
        totalDue: values.amount,
        dueDate
      });

      message.success(t("financing_repayment.add_success", "新增成功"));
      setAddModalOpen(false);
      loadSettlements();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  // 过滤数据
  const filteredSettlements = useMemo(() => {
    if (!searchText.trim()) {
      return settlements;
    }
    const lowerSearch = searchText.toLowerCase();
    return settlements.filter(s =>
      s.settlementNumber.toLowerCase().includes(lowerSearch) ||
      s.customerName.toLowerCase().includes(lowerSearch) ||
      s.contractId.toLowerCase().includes(lowerSearch)
    );
  }, [settlements, searchText]);

  const columns = [
    {
      title: t("financing_repayment.settlement_number", "结算单号"),
      key: "settlementNumber",
      width: 180,
      render: (_: any, record: Settlement) => (
        <Text strong>{record.settlementNumber}</Text>
      )
    },
    {
      title: t("financing_repayment.logistics_provider", "客户"),
      key: "customerName",
      width: 220,
      render: (_: any, record: Settlement) => (
        <div>
          <div>{record.customerName}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {dayjs(record.periodStart).format("YYYY-MM-DD")} 至 {dayjs(record.periodEnd).format("YYYY-MM-DD")}
          </Text>
        </div>
      )
    },
    {
      title: t("financing_repayment.repayment_type", "还款类型"),
      key: "repaymentType",
      width: 100,
      render: (_: any, record: Settlement) => {
        const config = getRepaymentTypeTag(record.repaymentType || "principal");
        return <Tag color={config.color}>{config.label}</Tag>;
      }
    },
    {
      title: t("financing_repayment.principal_due", "应还本金"),
      key: "principal",
      width: 150,
      align: "right" as const,
      render: (_: any, record: Settlement) => (
        <Text>{formatAmountWithCommas(record.principal || 0)}</Text>
      )
    },
    {
      title: t("financing_repayment.accumulated_interest", "累计利息"),
      key: "interest",
      width: 150,
      align: "right" as const,
      render: (_: any, record: Settlement) => (
        <Text>{formatAmountWithCommas(record.interest || 0)}</Text>
      )
    },
    {
      title: t("financing_repayment.total_due", "应还合计"),
      key: "totalDue",
      width: 150,
      align: "right" as const,
      render: (_: any, record: Settlement) => (
        <Text strong style={{ fontSize: 16, color: "#1890ff" }}>
          {formatAmountWithCommas(record.totalDue || 0)}
        </Text>
      )
    },
    {
      title: t("financing_repayment.last_repayment_date", "应结日期"),
      key: "dueDate",
      width: 150,
      render: (_: any, record: Settlement) => (
        <Text>{record.dueDate}</Text>
      )
    },
    {
      title: t("financing_repayment.status", "状态"),
      key: "status",
      width: 120,
      render: (_: any, record: Settlement) => {
        const config = getStatusTag(record.status);
        return <Tag color={config.color}>{config.label}</Tag>;
      }
    },
    {
      title: t("financing_repayment.operations", "操作"),
      key: "actions",
      width: 150,
      fixed: "right" as const,
      render: (_: any, record: Settlement) => {
        if (record.status === "settled") {
          return (
            <Button disabled>
              {t("financing_repayment.completed", "已完成")}
            </Button>
          );
        }
        return (
          <Button type="primary" onClick={() => handleVerify(record)}>
            {t("financing_repayment.go_verify", "去核销")}
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
        subTitle={t("financing_repayment.no_access", "需要 manage_settlements 权限")}
      />
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={2} style={{ margin: 0 }}>
            {t("financing_repayment.title", "融资还款结算")}
          </Title>
          <Text type="secondary" style={{ display: "block", marginTop: 4 }}>
            {t("financing_repayment.subtitle", "融资业务核销与结算管理")}
          </Text>
        </Col>
        <Col>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadSettlements} loading={loading}>
              {t("common.refresh", "刷新")}
            </Button>
            {canAddSettlement && (
              <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenAddModal}>
                {t("financing_repayment.add", "新增")}
              </Button>
            )}
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
                  {t("financing_repayment.pending_recovery", "待回收本息")}
                </div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 8, color: "#1890ff" }}>
                  {formatAmount(stats?.pendingAmount || localStats.pendingTotal)}
                </div>
                <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                  {t("financing_repayment.principal_breakdown", "本金 {principal} + 利息 {interest}")
                    .replace("{principal}", formatAmount(localStats.pendingPrincipal))
                    .replace("{interest}", formatAmount(localStats.pendingInterest))}
                </div>
              </div>
              <ClockCircleOutlined style={{ fontSize: 32, color: "#1890ff", opacity: 0.3 }} />
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>
                  {t("financing_repayment.verified_amount", "已核销金额")}
                </div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 8, color: "#52c41a" }}>
                  {formatAmount(stats?.settledAmount || 0)}
                </div>
                <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                  {t("financing_repayment.verified_count", "累计完成结算 {count} 笔").replace("{count}", String(stats?.settledCount || 0))}
                </div>
              </div>
              <CheckCircleOutlined style={{ fontSize: 32, color: "#52c41a", opacity: 0.3 }} />
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>
                  {t("financing_repayment.overdue_warning", "逾期预警")}
                </div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 8, color: "#ff4d4f" }}>
                  {stats?.overdueCount || 0}{t("financing_repayment.items", "笔")} / {formatAmount(stats?.overdueAmount || 0)}
                </div>
                <div style={{ fontSize: 12, color: "#ff4d4f" }}>
                  {t("financing_repayment.need_followup", "需要立即跟进处理")}
                </div>
              </div>
              <ExclamationCircleOutlined style={{ fontSize: 32, color: "#ff4d4f", opacity: 0.3 }} />
            </div>
          </Card>
        </Col>
      </Row>

      {/* Search */}
      <Card style={{ marginBottom: 24 }}>
        <Input
          placeholder={t("financing_repayment.search_placeholder", "搜索物流商名称或结算单号...")}
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ maxWidth: 400 }}
        />
      </Card>

      {/* Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={filteredSettlements}
          loading={loading}
          rowKey="id"
          scroll={{ x: 1300 }}
          pagination={{
            showSizeChanger: false,
            showTotal: (total) =>
              t("financing_repayment.total_records", "共 {total} 条记录").replace("{total}", String(total))
          }}
        />
      </Card>

      {/* 新增弹窗 */}
      <Modal
        title={t("financing_repayment.add_title", "新增还款结算")}
        open={addModalOpen}
        onCancel={() => {
          setAddModalOpen(false);
          addForm.resetFields();
          setSelectedFinancierId(undefined);
          setContracts([]);
        }}
        onOk={handleAddSubmit}
        confirmLoading={submitting}
        okText={t("common.confirm", "确认")}
        cancelText={t("common.cancel", "取消")}
        width={500}
        destroyOnClose
      >
        <Form
          form={addForm}
          layout="vertical"
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="financierId"
            label={t("financing_repayment.customer", "客户")}
            rules={[{ required: true, message: t("financing_repayment.customer_required", "请选择客户") }]}
          >
            <Select
              placeholder={t("financing_repayment.select_customer", "请选择客户")}
              loading={loadingFinanciers}
              showSearch
              optionFilterProp="children"
              onChange={handleFinancierChange}
              filterOption={(input, option) =>
                (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
              }
            >
              {financiers.map(f => (
                <Select.Option key={f.id} value={f.id}>
                  {f.enterpriseName}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="contractId"
            label={t("financing_repayment.contract", "对应合同")}
            rules={[{ required: true, message: t("financing_repayment.contract_required", "请选择合同") }]}
          >
            <Select
              placeholder={t("financing_repayment.select_contract", "请选择合同")}
              loading={loadingContracts}
              disabled={!selectedFinancierId}
              showSearch
              optionFilterProp="children"
              filterOption={(input, option) =>
                (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
              }
            >
              {contracts.map(c => (
                <Select.Option key={c.id} value={c.id}>
                  {c.logisticsProviderName} - {dayjs(c.startDate).format("YYYY-MM-DD")} 至 {dayjs(c.endDate).format("YYYY-MM-DD")}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="repaymentType"
            label={t("financing_repayment.repayment_type", "还款类型")}
            rules={[{ required: true, message: t("financing_repayment.repayment_type_required", "请选择还款类型") }]}
          >
            <Select placeholder={t("financing_repayment.select_repayment_type", "请选择还款类型")}>
              <Select.Option value="principal">
                {t("financing_repayment.type_principal", "本金")}
              </Select.Option>
              <Select.Option value="interest">
                {t("financing_repayment.type_interest", "利息")}
              </Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="amount"
            label={t("financing_repayment.repayment_amount", "还款金额")}
            rules={[
              { required: true, message: t("financing_repayment.amount_required", "请输入还款金额") },
              { type: "number", min: 0.01, message: t("financing_repayment.amount_positive", "还款金额必须大于0") }
            ]}
          >
            <InputNumber
              style={{ width: "100%" }}
              placeholder={t("financing_repayment.enter_amount", "请输入还款金额")}
              precision={2}
              min={0.01}
              formatter={value => `¥ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
              parser={value => value!.replace(/¥\s?|(,*)/g, "") as unknown as number}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default FinancingRepaymentSettlementPage;

