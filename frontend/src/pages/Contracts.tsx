import {
  fetchContracts,
  fetchContractById,
  getErrorMessage,
  updateContractStatusApi,
  updateContractApi,
  deleteContractApi
} from "../api";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import { Contract, ContractStatus } from "../types";
import {
  Button,
  Card,
  Col,
  Modal,
  Drawer,
  Progress,
  Result,
  Row,
  Table,
  Tag,
  Typography,
  message,
  Switch,
  Space,
  Popconfirm,
  Form,
  Input,
  InputNumber,
  Select,
  DatePicker,
  Divider
} from "antd";
import ContractLoanManager from "../components/ContractLoanManager";
import DisbursementModal from "../components/DisbursementModal";
import RepaymentModal from "../components/RepaymentModal";
import {
  EyeOutlined,
  PlusOutlined,
  WalletOutlined,
  LineChartOutlined,
  DollarOutlined,
  EditOutlined,
  DeleteOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const { Title, Text } = Typography;

function ContractsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token, user } = useAuth();
  const { t } = useI18n();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewingContract, setViewingContract] = useState<Contract | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [editForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [disbursementModalOpen, setDisbursementModalOpen] = useState(false);
  const [repaymentModalOpen, setRepaymentModalOpen] = useState(false);
  const [selectedContractForAction, setSelectedContractForAction] = useState<Contract | null>(null);

  const refresh = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetchContracts(token, { type: "financing" });
      // 按创建时间降序排列（最新的在前面）
      const sortedContracts = [...res.contracts].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setContracts(sortedContracts);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  // 检测从创建页面返回时的刷新信号
  useEffect(() => {
    if ((location.state as any)?.refresh) {
      void refresh();
      // 清除 state 避免重复刷新
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state]);

  const handleView = (contract: Contract) => {
    setViewingContract(contract);
    setDetailModalOpen(true);
  };

  const handleOpenDisbursement = (contract: Contract) => {
    setSelectedContractForAction(contract);
    setDisbursementModalOpen(true);
  };

  const handleOpenRepayment = (contract: Contract) => {
    setSelectedContractForAction(contract);
    setRepaymentModalOpen(true);
  };

  const handleEdit = (contract: Contract) => {
    setEditingContract(contract);
    editForm.setFieldsValue({
      funderName: contract.funderName,
      logisticsProviderName: contract.logisticsProviderName,
      creditLimit: contract.creditLimit,
      startDate: contract.startDate ? dayjs(contract.startDate) : null,
      endDate: contract.endDate ? dayjs(contract.endDate) : null,
      annualInterestRate: contract.annualInterestRate,
      interestCalculationMode: contract.interestCalculationMode || "daily_balance",
      settlementCycle: contract.settlementCycle,
      settlementTriggerDay: contract.settlementTriggerDay,
      autoSettlement: contract.autoSettlement,
      profitSharingEnabled: contract.sharingMode === "percentage",
      profitSharingRatio: contract.profitSharingRatio || 0
    });
    setEditModalOpen(true);
  };

  const handleEditSubmit = async () => {
    if (!token || !editingContract) return;
    try {
      const values = await editForm.validateFields();
      setSubmitting(true);
      await updateContractApi(token, editingContract.id, {
        funderName: values.funderName,
        logisticsProviderName: values.logisticsProviderName,
        creditLimit: values.creditLimit,
        startDate: values.startDate?.format("YYYY-MM-DD"),
        endDate: values.endDate?.format("YYYY-MM-DD"),
        annualInterestRate: values.annualInterestRate,
        interestCalculationMode: values.interestCalculationMode,
        settlementCycle: values.settlementCycle,
        settlementTriggerDay: values.settlementTriggerDay,
        autoSettlement: values.autoSettlement,
        sharingMode: values.profitSharingEnabled ? "percentage" : undefined,
        profitSharingRatio: values.profitSharingEnabled ? values.profitSharingRatio : undefined
      });
      message.success("合同更新成功");
      setEditModalOpen(false);
      await refresh();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (contract: Contract) => {
    if (!token) return;
    try {
      await deleteContractApi(token, contract.id);
      message.success("合同删除成功");
      await refresh();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  // 生成合同编号（基于ID和创建时间）
  const generateContractNumber = (contract: Contract): string => {
    const date = new Date(contract.createdAt);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const idShort = contract.id.substring(0, 4).toUpperCase();
    return `RZ${year}${month}${idShort}`;
  };

  // 生成合同名称
  const generateContractName = (contract: Contract): string => {
    return `${contract.logisticsProviderName || ""}三方融资服务合同`;
  };

  // 计算统计数据
  const stats = useMemo(() => {
    const totalCreditLimit = contracts.reduce((sum, c) => sum + c.creditLimit, 0);
    // 已占用额度 = 剩余本金（还款后会减少），而不是累计放款
    const usedAmount = contracts.reduce((sum, c) => sum + (c.outstandingPrincipal || 0), 0);
    const utilizationRate = totalCreditLimit > 0 ? (usedAmount / totalCreditLimit) * 100 : 0;
    // 待还款总额 = 剩余本金 + 待还利息
    const totalInterest = contracts.reduce((sum, c) => sum + (c.accruedInterest || 0), 0);
    const totalDue = usedAmount + totalInterest;
    const remainingLimit = totalCreditLimit - usedAmount;

    return {
      totalCreditLimit,
      usedAmount,
      utilizationRate,
      totalDue,
      remainingLimit,
      count: contracts.length
    };
  }, [contracts]);

  // 获取单个合同的已用额度（剩余本金，还款后会减少）
  const getContractUsedAmount = (contract: Contract): number => {
    return contract.outstandingPrincipal || 0;
  };

  const statusMap: Record<ContractStatus, { label: string; color: string }> = useMemo(() => ({
    active: { label: t("contracts.status_active", "执行中"), color: "green" },
    expiring_soon: { label: t("contracts.status_expiring_soon", "待签署"), color: "orange" },
    expired: { label: t("contracts.status_expired", "已过期"), color: "default" },
    disabled: { label: t("contracts.status_disabled", "已停用"), color: "red" }
  }), [t]);

  // 切换合同状态（启用/停用）
  const handleToggleStatus = async (contract: Contract) => {
    if (!token) return;
    try {
      const newStatus = contract.status === "disabled" ? "active" : "disabled";
      await updateContractStatusApi(token, contract.id, newStatus);
      message.success(newStatus === "disabled" ? "合同已停用" : "合同已启用");
      await refresh();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  // 格式化金额（万元）
  const formatAmountWan = (amount: number): string => {
    return `¥${(amount / 10000).toFixed(1)}万`;
  };

  // 格式化金额
  const formatAmount = (amount: number): string => {
    return `¥${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // 获取使用率颜色
  const getUsageRateColor = (rate: number): string => {
    if (rate >= 80) return "#ff4d4f";
    if (rate >= 60) return "#faad14";
    return "#52c41a";
  };

  const columns = [
    {
      title: t("contracts.contract_name_number", "合同名称/编号"),
      key: "nameNumber",
      width: 280,
      render: (_: any, record: Contract) => (
        <div>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>
            {generateContractName(record)}
          </div>
          <div style={{ fontSize: 12, color: "#8c8c8c" }}>
            {generateContractNumber(record)}
          </div>
        </div>
      )
    },
    {
      title: t("contracts.signing_party", "签约方"),
      key: "signingParty",
      width: 220,
      render: (_: any, record: Contract) => (
        <div>
          <div style={{ marginBottom: 4 }}>{record.funderName || "-"}</div>
          <div style={{ fontSize: 12, color: "#8c8c8c" }}>
            {record.logisticsProviderName || "-"}
          </div>
        </div>
      )
    },
    {
      title: t("contracts.credit_status", "授信状态"),
      key: "creditStatus",
      width: 220,
      render: (_: any, record: Contract) => {
        const used = getContractUsedAmount(record);
        const usageRate = record.creditLimit > 0 ? (used / record.creditLimit) * 100 : 0;
        return (
          <div>
            <div style={{ marginBottom: 8 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t("contracts.total_limit", "总额度")}: {formatAmountWan(record.creditLimit)}
              </Text>
              <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                {t("contracts.used", "已用")}: {formatAmountWan(used)}
              </Text>
            </div>
            <Progress
              percent={usageRate}
              strokeColor={getUsageRateColor(usageRate)}
              size="small"
              showInfo={false}
            />
          </div>
        );
      }
    },
    {
      title: t("contracts.interest_rate_config", "利率配置"),
      key: "interestRate",
      width: 150,
      render: (_: any, record: Contract) => {
        if (record.annualInterestRate) {
          return (
            <div>
              {record.annualInterestRate.toFixed(1)}%
              <span style={{ fontSize: 12, color: "#8c8c8c", marginLeft: 4 }}>
                ({t("contracts.daily_interest", "日终计息")})
              </span>
            </div>
          );
        }
        return <Text type="secondary">-</Text>;
      }
    },
    {
      title: t("contracts.profit_sharing_rule", "分润规则"),
      key: "profitSharing",
      width: 150,
      render: (_: any, record: Contract) => {
        // 根据 sharingMode 判断是否启用了分润
        if (record.sharingMode === "percentage" && record.profitSharingRatio != null) {
          return `${record.profitSharingRatio}%${t("contracts.net_profit_sharing", "净利润分成")}`;
        }
        if (record.sharingMode === "fixed" && record.fixedSharingAmount != null) {
          return `${t("contracts.fixed_amount", "固定")} ¥${record.fixedSharingAmount.toLocaleString()}`;
        }
        // 未配置分润
        return <Text type="secondary">{t("contracts.no_profit_sharing", "无分润")}</Text>;
      }
    },
    {
      title: t("contracts.status", "状态"),
      key: "status",
      width: 100,
      render: (_: any, record: Contract) => {
        const status = statusMap[record.status];
        return (
          <Tag color={status.color}>{status.label}</Tag>
        );
      }
    },
    {
      title: t("contracts.enabled", "启用"),
      key: "enabled",
      width: 80,
      render: (_: any, record: Contract) => (
        <Switch
          checked={record.status !== "disabled"}
          onChange={() => handleToggleStatus(record)}
          size="small"
        />
      )
    },
    {
      title: t("contracts.operations", "操作"),
      key: "actions",
      width: 280,
      render: (_: any, record: Contract) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleView(record)}
          >
            查看
          </Button>
          <Button 
            type="link" 
            size="small" 
            style={{ color: "#52c41a" }}
            onClick={() => handleOpenDisbursement(record)}
          >
            放款
          </Button>
          <Button 
            type="link" 
            size="small" 
            style={{ color: "#faad14" }}
            onClick={() => handleOpenRepayment(record)}
          >
            还款
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description="确定要删除这个合同吗？删除后无法恢复。"
            onConfirm={() => handleDelete(record)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  if (!user?.permissions?.includes("manage_contracts")) {
    return (
      <Result
        status="403"
        title={t("common.no_permission", "无权限")}
        subTitle={t("contracts.no_access", "需要 manage_contracts 权限")}
      />
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={2} style={{ margin: 0 }}>
            {t("contracts.financing_title", "三方融资合同管理")}
          </Title>
          <Text type="secondary" style={{ display: "block", marginTop: 4 }}>
            {t("contracts.financing_subtitle", "资金方与合作方合作协议管理")}
          </Text>
        </Col>
        <Col>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate("/contracts/create-financing")}
            style={{ backgroundColor: "#1890ff" }}
          >
            {t("contracts.create_financing_new", "新建三方融资合同")}
          </Button>
        </Col>
      </Row>

      {/* Statistics Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>
                  {t("contracts.total_credit_limit", "总授信额度")}
                </div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4 }}>
                  {formatAmountWan(stats.totalCreditLimit)}
                </div>
                <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                  {stats.count}{t("contracts.contracts_count", "份合同")}
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
                  {t("contracts.occupied_limit", "已占用额度")}
                </div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4, color: "#52c41a" }}>
                  {formatAmountWan(stats.usedAmount)}
                </div>
                <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                  {t("contracts.utilization_rate", "占用率")} {stats.utilizationRate.toFixed(1)}%
                </div>
              </div>
              <LineChartOutlined style={{ fontSize: 32, color: "#52c41a", opacity: 0.3 }} />
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>
                  {t("contracts.total_amount_due", "待还款总额")}
                </div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4, color: "#722ed1" }}>
                  {formatAmountWan(stats.totalDue)}
                </div>
                <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                  {t("contracts.remaining_limit", "剩余额度")} {formatAmountWan(stats.remainingLimit)}
                </div>
              </div>
              <DollarOutlined style={{ fontSize: 32, color: "#722ed1", opacity: 0.3 }} />
            </div>
          </Card>
        </Col>
      </Row>

      {/* Table */}
      <Card>
        <Table
          columns={columns}
          dataSource={contracts}
          loading={loading}
          rowKey="id"
          pagination={{
            showSizeChanger: false,
            showTotal: (total, range) => `显示第 ${range[0]}-${range[1]} 条，共 ${total} 条记录`
          }}
        />
      </Card>

      {/* Detail Drawer */}
      <Drawer
        title={t("contracts.contract_detail", "合同详情")}
        open={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        width={1000}
        extra={
          <Space>
            <Button type="primary" onClick={() => {
              setDetailModalOpen(false);
              if (viewingContract) handleEdit(viewingContract);
            }}>
              编辑
            </Button>
          </Space>
        }
      >
        {viewingContract && (
          <div>
            {/* 基本信息卡片 */}
            <Card size="small" style={{ marginBottom: 16 }}>
              <Row gutter={[16, 12]}>
                <Col span={8}>
                  <Text type="secondary">合同编号：</Text>
                  <div style={{ fontWeight: 500 }}>{generateContractNumber(viewingContract)}</div>
                </Col>
                <Col span={8}>
                  <Text type="secondary">合同名称：</Text>
                  <div style={{ fontWeight: 500 }}>{generateContractName(viewingContract)}</div>
                </Col>
                <Col span={8}>
                  <Text type="secondary">合同状态：</Text>
                  <div>
                    <Tag color={statusMap[viewingContract.status].color}>
                      {statusMap[viewingContract.status].label}
                    </Tag>
                    <Switch
                      checked={viewingContract.status !== "disabled"}
                      onChange={() => {
                        handleToggleStatus(viewingContract);
                      }}
                      size="small"
                      style={{ marginLeft: 8 }}
                    />
                  </div>
                </Col>
                <Col span={8}>
                  <Text type="secondary">资金方：</Text>
                  <div style={{ fontWeight: 500 }}>{viewingContract.funderName || "-"}</div>
                </Col>
                <Col span={8}>
                  <Text type="secondary">合作方/物流商：</Text>
                  <div style={{ fontWeight: 500 }}>{viewingContract.logisticsProviderName || "-"}</div>
                </Col>
                <Col span={8}>
                  <Text type="secondary">授信总额度：</Text>
                  <div style={{ fontWeight: 500, color: "#1890ff" }}>{formatAmount(viewingContract.creditLimit)}</div>
                </Col>
                <Col span={8}>
                  <Text type="secondary">合同有效期：</Text>
                  <div>{dayjs(viewingContract.startDate).format('YYYY-MM-DD')} ~ {dayjs(viewingContract.endDate).format('YYYY-MM-DD')}</div>
                </Col>
                <Col span={8}>
                  <Text type="secondary">年化利率：</Text>
                  <div style={{ fontWeight: 500 }}>{viewingContract.annualInterestRate ? `${viewingContract.annualInterestRate}%` : "-"}</div>
                </Col>
                <Col span={8}>
                  <Text type="secondary">结算周期：</Text>
                  <div>{viewingContract.settlementCycle === "monthly" ? "每月结算" : viewingContract.settlementCycle === "quarterly" ? "每季度结算" : "每两周结算"}</div>
                </Col>
                <Col span={8}>
                  <Text type="secondary">利润分配：</Text>
                  <div style={{ fontWeight: 500 }}>
                    {viewingContract.sharingMode === "percentage" && viewingContract.profitSharingRatio != null 
                      ? <Tag color="blue">{viewingContract.profitSharingRatio}% 净利润分成</Tag>
                      : <Tag>无分润</Tag>
                    }
                  </div>
                </Col>
                <Col span={8}>
                  <Text type="secondary">自动结算：</Text>
                  <div>{viewingContract.autoSettlement ? <Tag color="green">已开启</Tag> : <Tag>未开启</Tag>}</div>
                </Col>
              </Row>
            </Card>

            {/* 放款管理组件 */}
            <ContractLoanManager
              contractId={viewingContract.id}
              creditLimit={viewingContract.creditLimit}
              annualInterestRate={viewingContract.annualInterestRate || 0}
              contractEndDate={viewingContract.endDate}
              onUpdate={() => fetchData()}
            />
          </div>
        )}
      </Drawer>

      {/* Edit Modal */}
      <Modal
        title="编辑三方融资合同"
        open={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        onOk={handleEditSubmit}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
        width={700}
      >
        <Form form={editForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="funderName" label="资金方" rules={[{ required: true, message: "请输入资金方" }]}>
                <Input placeholder="请输入资金方名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="logisticsProviderName" label="合作方/物流商" rules={[{ required: true, message: "请输入合作方" }]}>
                <Input placeholder="请输入合作方名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="creditLimit" label="授信总额度" rules={[{ required: true, message: "请输入授信额度" }]}>
                <InputNumber
                  style={{ width: "100%" }}
                  min={0}
                  prefix="¥"
                  formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                  parser={value => value!.replace(/\$\s?|(,*)/g, "") as any}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="annualInterestRate" label="年化利率">
                <InputNumber
                  style={{ width: "100%" }}
                  min={0}
                  max={100}
                  precision={2}
                  addonAfter="%"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="startDate" label="合同开始日期" rules={[{ required: true, message: "请选择开始日期" }]}>
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="endDate" label="合同结束日期" rules={[{ required: true, message: "请选择结束日期" }]}>
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="interestCalculationMode" label="计息模式">
                <Select>
                  <Select.Option value="daily_balance">日终余额计息</Select.Option>
                  <Select.Option value="other">其他</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="settlementCycle" label="结算周期">
                <Select>
                  <Select.Option value="monthly">每月结算</Select.Option>
                  <Select.Option value="quarterly">每季度结算</Select.Option>
                  <Select.Option value="biweekly">每两周结算</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="settlementTriggerDay" label="结算触发日">
                <Select placeholder="请选择">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                    <Select.Option key={day} value={day}>每月{day}日</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="autoSettlement" label="自动结算" valuePropName="checked">
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>
            </Col>
          </Row>
          
          {/* 利润分配配置 */}
          <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16, marginTop: 8 }}>
            <Text strong style={{ display: "block", marginBottom: 12 }}>利润分配配置</Text>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="profitSharingEnabled" label="启用利润分配" valuePropName="checked">
                  <Switch checkedChildren="是" unCheckedChildren="否" />
                </Form.Item>
              </Col>
              <Form.Item
                noStyle
                shouldUpdate={(prevValues, currentValues) => 
                  prevValues.profitSharingEnabled !== currentValues.profitSharingEnabled
                }
              >
                {({ getFieldValue }) => {
                  const enabled = getFieldValue("profitSharingEnabled");
                  return enabled ? (
                    <Col span={12}>
                      <Form.Item 
                        name="profitSharingRatio" 
                        label="平台分成比例"
                        rules={[
                          { required: true, message: "请输入分成比例" },
                          { type: "number", min: 0, max: 100, message: "比例须在0-100之间" }
                        ]}
                      >
                        <InputNumber
                          min={0}
                          max={100}
                          precision={2}
                          addonAfter="%"
                          style={{ width: "100%" }}
                          placeholder="50"
                        />
                      </Form.Item>
                    </Col>
                  ) : null;
                }}
              </Form.Item>
            </Row>
          </div>
        </Form>
      </Modal>

      {/* Disbursement & Repayment Modals */}
      {selectedContractForAction && (
        <>
          <DisbursementModal
            open={disbursementModalOpen}
            contractId={selectedContractForAction.id}
            contractName={generateContractName(selectedContractForAction)}
            creditLimit={selectedContractForAction.creditLimit}
            availableCredit={selectedContractForAction.creditLimit - (selectedContractForAction.outstandingPrincipal || 0)}
            onClose={() => setDisbursementModalOpen(false)}
            onSuccess={() => refresh()}
          />
          <RepaymentModal
            open={repaymentModalOpen}
            contractId={selectedContractForAction.id}
            contractName={generateContractName(selectedContractForAction)}
            outstandingPrincipal={selectedContractForAction.outstandingPrincipal || 0}
            accruedInterest={selectedContractForAction.accruedInterest || 0}
            onClose={() => setRepaymentModalOpen(false)}
            onSuccess={() => refresh()}
          />
        </>
      )}
    </div>
  );
}

export default ContractsPage;
