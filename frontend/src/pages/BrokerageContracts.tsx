import {
  fetchContracts,
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
  Divider,
  Radio
} from "antd";
import {
  EyeOutlined,
  PlusOutlined,
  CheckCircleOutlined,
  RiseOutlined,
  PercentageOutlined,
  EditOutlined,
  DeleteOutlined,
  DollarOutlined
} from "@ant-design/icons";

// 撮合业务抽成字段定义
const COMMISSION_FIELDS = [
  { key: "freight", label: "运费" },
  { key: "oilCard", label: "油卡" },
  { key: "etc", label: "ETC" },
  { key: "cash", label: "现金" },
  { key: "waybillFee", label: "面单费" },
  { key: "trunkLineFee", label: "干线费" },
  { key: "pickupFee", label: "提货费" },
  { key: "deliveryFee", label: "送货费" },
  { key: "receiptFee", label: "回单费" },
  { key: "handlingFee", label: "装卸费" }
] as const;

// 抽成配置项类型
interface CommissionConfigItem {
  id: string;
  fieldKey: string;
  mode: "percentage" | "fixed";
  value: number;
}
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const { Title, Text } = Typography;

// Mock撮合业务合同数据
const mockBrokerageContracts: Contract[] = [
  {
    id: "ch2024010001",
    type: "brokerage",
    logisticsProviderId: "yto-001",
    logisticsProviderName: "圆通速递股份有限公司",
    creditLimit: 10000000,
    startDate: "2024-01-01",
    endDate: "2025-01-01",
    profitSharingRatio: 10,
    settlementCycle: "monthly",
    settlementTriggerDay: 10,
    autoSettlement: true,
    status: "active",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z"
  },
  {
    id: "ch2024010002",
    type: "brokerage",
    logisticsProviderId: "zto-001",
    logisticsProviderName: "中通快递股份有限公司",
    creditLimit: 8000000,
    startDate: "2024-01-15",
    endDate: "2025-01-15",
    profitSharingRatio: 8.5,
    settlementCycle: "monthly",
    settlementTriggerDay: 15,
    autoSettlement: true,
    status: "active",
    createdAt: "2024-01-15T00:00:00Z",
    updatedAt: "2024-01-15T00:00:00Z"
  },
  {
    id: "ch2024020001",
    type: "brokerage",
    logisticsProviderId: "sto-001",
    logisticsProviderName: "申通快递有限公司",
    creditLimit: 12000000,
    startDate: "2024-02-01",
    endDate: "2025-02-01",
    profitSharingRatio: 12,
    settlementCycle: "monthly",
    settlementTriggerDay: 10,
    autoSettlement: true,
    status: "active",
    createdAt: "2024-02-01T00:00:00Z",
    updatedAt: "2024-02-01T00:00:00Z"
  },
  {
    id: "ch2024020002",
    type: "brokerage",
    logisticsProviderId: "yd-001",
    logisticsProviderName: "韵达快递有限公司",
    creditLimit: 9000000,
    startDate: "2024-02-10",
    endDate: "2025-02-10",
    profitSharingRatio: 9,
    settlementCycle: "monthly",
    settlementTriggerDay: 20,
    autoSettlement: true,
    status: "active",
    createdAt: "2024-02-10T00:00:00Z",
    updatedAt: "2024-02-10T00:00:00Z"
  },
  {
    id: "ch2024030001",
    type: "brokerage",
    logisticsProviderId: "sf-001",
    logisticsProviderName: "顺丰物流有限公司",
    creditLimit: 15000000,
    startDate: "2024-03-01",
    endDate: "2025-03-01",
    profitSharingRatio: 11.5,
    settlementCycle: "monthly",
    settlementTriggerDay: 10,
    autoSettlement: true,
    status: "active",
    createdAt: "2024-03-01T00:00:00Z",
    updatedAt: "2024-03-01T00:00:00Z"
  },
  {
    id: "ch2024030002",
    type: "brokerage",
    logisticsProviderId: "jt-001",
    logisticsProviderName: "极兔速递有限公司",
    creditLimit: 7000000,
    startDate: "2024-03-15",
    endDate: "2025-03-15",
    profitSharingRatio: 7.5,
    settlementCycle: "monthly",
    settlementTriggerDay: 15,
    autoSettlement: true,
    status: "active",
    createdAt: "2024-03-15T00:00:00Z",
    updatedAt: "2024-03-15T00:00:00Z"
  }
];

// Mock货主名称（根据物流商匹配）
const shipperMap: Record<string, string> = {
  "yto-001": "京东商城",
  "zto-001": "天猫超市",
  "sto-001": "苏宁易购",
  "yd-001": "拼多多",
  "sf-001": "唯品会",
  "jt-001": "小米商城"
};

// Mock累计贡献抽成（平台收益）
const commissionMap: Record<string, number> = {
  "ch2024010001": 580000,
  "ch2024010002": 420000,
  "ch2024020001": 680000,
  "ch2024020002": 350000,
  "ch2024030001": 920000,
  "ch2024030002": 280000
};

function BrokerageContractsPage() {
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
  
  // 抽成配置状态（用于编辑弹窗）
  const [commissionItems, setCommissionItems] = useState<CommissionConfigItem[]>([]);

  // 生成唯一ID
  const generateId = () => `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // 获取未选择的字段选项
  const getAvailableFields = (currentItemId?: string) => {
    const selectedKeys = new Set(
      commissionItems
        .filter(item => item.id !== currentItemId && item.fieldKey)
        .map(item => item.fieldKey)
    );
    return COMMISSION_FIELDS.filter(field => !selectedKeys.has(field.key));
  };

  // 添加抽成配置项
  const handleAddCommissionItem = () => {
    setCommissionItems(prev => [
      ...prev,
      { id: generateId(), fieldKey: "", mode: "percentage", value: 0 }
    ]);
  };

  // 删除抽成配置项
  const handleRemoveCommissionItem = (id: string) => {
    setCommissionItems(prev => prev.filter(item => item.id !== id));
  };

  // 更新抽成配置项
  const handleUpdateCommissionItem = (id: string, updates: Partial<CommissionConfigItem>) => {
    setCommissionItems(prev => prev.map(item =>
      item.id === id ? { ...item, ...updates } : item
    ));
  };

  const refresh = async () => {
    if (!token) return;
    setLoading(true);
    try {
      // 从后端获取真实数据
      const res = await fetchContracts(token, "brokerage");
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

  const handleEdit = (contract: Contract) => {
    setEditingContract(contract);
    editForm.setFieldsValue({
      logisticsProviderName: contract.logisticsProviderName,
      creditLimit: contract.creditLimit,
      startDate: contract.startDate ? dayjs(contract.startDate) : null,
      endDate: contract.endDate ? dayjs(contract.endDate) : null,
      settlementCycle: contract.settlementCycle,
      settlementTriggerDay: contract.settlementTriggerDay,
      autoSettlement: contract.autoSettlement
    });
    // 加载已有的抽成配置
    if (contract.commissionConfig && contract.commissionConfig.length > 0) {
      setCommissionItems(contract.commissionConfig.map(cfg => ({
        id: generateId(),
        fieldKey: cfg.fieldKey,
        mode: cfg.mode,
        value: cfg.value
      })));
    } else {
      setCommissionItems([{ id: generateId(), fieldKey: "", mode: "percentage", value: 0 }]);
    }
    setEditModalOpen(true);
  };

  const handleEditSubmit = async () => {
    if (!token || !editingContract) return;
    
    // 验证抽成配置
    const validItems = commissionItems.filter(item => item.fieldKey);
    if (validItems.length === 0) {
      message.warning("请至少配置一个抽成项");
      return;
    }
    const emptyValueItems = validItems.filter(item => item.value <= 0);
    if (emptyValueItems.length > 0) {
      const fieldLabels = emptyValueItems.map(item => {
        const field = COMMISSION_FIELDS.find(f => f.key === item.fieldKey);
        return field?.label || item.fieldKey;
      }).join("、");
      message.warning(`请填写 ${fieldLabels} 的抽成值`);
      return;
    }
    
    try {
      const values = await editForm.validateFields();
      setSubmitting(true);
      
      // 构建抽成配置
      const commissionConfig = validItems.map(item => ({
        fieldKey: item.fieldKey,
        fieldLabel: COMMISSION_FIELDS.find(f => f.key === item.fieldKey)?.label || "",
        mode: item.mode,
        value: item.value
      }));
      
      await updateContractApi(token, editingContract.id, {
        logisticsProviderName: values.logisticsProviderName,
        creditLimit: values.creditLimit,
        startDate: values.startDate?.format("YYYY-MM-DD"),
        endDate: values.endDate?.format("YYYY-MM-DD"),
        commissionConfig,
        settlementCycle: values.settlementCycle,
        settlementTriggerDay: values.settlementTriggerDay,
        autoSettlement: values.autoSettlement
      } as any);
      message.success("合同更新成功");
      setEditModalOpen(false);
      refresh();
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
      refresh();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  // 生成合同编号
  const generateContractNumber = (contract: Contract): string => {
    const date = new Date(contract.createdAt);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const idShort = contract.id.substring(2, 6).toUpperCase();
    return `CH${year}${month}${idShort}`;
  };

  // 生成合同名称
  const generateContractName = (contract: Contract): string => {
    return `${contract.logisticsProviderName || ""}撮合业务合作协议`;
  };

  // 计算撮合业务合同统计数据
  const stats = useMemo(() => {
    const validCount = contracts.filter(c => c.status === "active").length;
    
    // Mock本月预计撮合利润
    const monthlyProfit = 1077000;
    // Mock累计利润
    const totalProfit = 3230000;
    
    // 计算平均抽成比例
    const avgRatio = contracts.length > 0
      ? contracts.reduce((sum, c) => sum + (c.profitSharingRatio || 0), 0) / contracts.length
      : 0;
    
    const minRatio = contracts.length > 0
      ? Math.min(...contracts.map(c => c.profitSharingRatio || 0))
      : 0;
    const maxRatio = contracts.length > 0
      ? Math.max(...contracts.map(c => c.profitSharingRatio || 0))
      : 0;

    return {
      validCount,
      monthlyProfit,
      totalProfit,
      avgRatio,
      minRatio,
      maxRatio
    };
  }, [contracts]);

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
      refresh();
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

  // 撮合业务合同表格列
  const columns = [
    {
      title: t("contracts.contract_number_name", "合同编号/名称"),
      key: "nameNumber",
      width: 300,
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
      title: t("contracts.shipper_logistics", "货主/物流商"),
      key: "shipperLogistics",
      width: 250,
      render: (_: any, record: Contract) => {
        const shipper = shipperMap[record.logisticsProviderId] || "平台";
        return (
          <div>
            <div style={{ marginBottom: 4 }}>{shipper}</div>
            <div style={{ fontSize: 12, color: "#8c8c8c" }}>
              → {record.logisticsProviderName || "-"}
            </div>
          </div>
        );
      }
    },
    {
      title: t("contracts.commission_config", "抽成配置"),
      key: "commissionConfig",
      width: 200,
      render: (_: any, record: Contract) => {
        // 优先显示commissionConfig，否则显示旧的profitSharingRatio
        if (record.commissionConfig && record.commissionConfig.length > 0) {
          return (
            <Space size={[4, 4]} wrap>
              {record.commissionConfig.slice(0, 3).map((cfg, index) => (
                <Tag key={index} color="purple">
                  {cfg.fieldLabel}: {cfg.mode === "percentage" ? `${cfg.value}%` : `¥${cfg.value}`}
                </Tag>
              ))}
              {record.commissionConfig.length > 3 && (
                <Tag>+{record.commissionConfig.length - 3}</Tag>
              )}
            </Space>
          );
        }
        return record.profitSharingRatio ? `${record.profitSharingRatio.toFixed(1)}%` : "-";
      }
    },
    {
      title: t("contracts.settlement_period", "结算周期"),
      key: "settlementPeriod",
      width: 150,
      render: (_: any, record: Contract) => {
        if (record.settlementCycle === "monthly" && record.settlementTriggerDay) {
          return (
            <div>
              <div>{t("contracts.settlement_monthly", "每月自动结算")}</div>
              <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                {t("contracts.monthly_day", "每月{day}日").replace("{day}", String(record.settlementTriggerDay))}
              </div>
            </div>
          );
        }
        return t("contracts.settlement_monthly", "每月自动结算");
      }
    },
    {
      title: t("contracts.accumulated_commission", "累计贡献抽成"),
      key: "accumulatedCommission",
      width: 180,
      render: (_: any, record: Contract) => {
        const commission = commissionMap[record.id] || 0;
        return (
          <div>
            <div style={{ fontWeight: 500 }}>{formatAmount(commission)}</div>
            <div style={{ fontSize: 12, color: "#8c8c8c" }}>
              {t("contracts.platform_revenue", "平台收益")}
            </div>
          </div>
        );
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
      width: 200,
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
            {t("contracts.brokerage_title", "撮合业务合同管理")}
          </Title>
          <Text type="secondary" style={{ display: "block", marginTop: 4 }}>
            {t("contracts.brokerage_subtitle", "货主与物流商业务对接协议管理")}
          </Text>
        </Col>
        <Col>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate("/contracts/create-brokerage")}
            style={{ backgroundColor: "#722ed1", borderColor: "#722ed1" }}
          >
            {t("contracts.create_brokerage", "录入撮合合同")}
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
                  {t("contracts.valid_contracts_count", "有效合同数")}
                </div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4 }}>
                  {stats.validCount}
                </div>
                <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                  {t("contracts.all_effective", "全部已生效")}
                </div>
              </div>
              <CheckCircleOutlined style={{ fontSize: 32, color: "#52c41a", opacity: 0.3 }} />
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>
                  {t("contracts.monthly_profit_estimate", "本月预计撮合利润")}
                </div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4, color: "#52c41a" }}>
                  {formatAmountWan(stats.monthlyProfit)}
                </div>
                <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                  {t("contracts.accumulated", "累计")} {formatAmountWan(stats.totalProfit)}
                </div>
              </div>
              <RiseOutlined style={{ fontSize: 32, color: "#52c41a", opacity: 0.3 }} />
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>
                  {t("contracts.avg_commission_ratio", "平均抽成比例")}
                </div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4, color: "#722ed1" }}>
                  {stats.avgRatio.toFixed(1)}%
                </div>
                <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                  {t("contracts.range", "范围")} {stats.minRatio.toFixed(1)}% - {stats.maxRatio.toFixed(1)}%
                </div>
              </div>
              <PercentageOutlined style={{ fontSize: 32, color: "#722ed1", opacity: 0.3 }} />
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

      {/* Detail Modal */}
      <Modal
        title={t("contracts.contract_detail", "合同详情")}
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={[
          <Button key="edit" type="primary" onClick={() => {
            setDetailModalOpen(false);
            if (viewingContract) handleEdit(viewingContract);
          }}>
            编辑
          </Button>,
          <Button key="close" onClick={() => setDetailModalOpen(false)}>
            {t("common.close", "关闭")}
          </Button>
        ]}
        width={800}
      >
        {viewingContract && (
          <div>
            <Divider orientation="left">基本信息</Divider>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Text type="secondary">合同编号：</Text>
                <div style={{ fontWeight: 500 }}>{generateContractNumber(viewingContract)}</div>
              </Col>
              <Col span={12}>
                <Text type="secondary">合同名称：</Text>
                <div style={{ fontWeight: 500 }}>{generateContractName(viewingContract)}</div>
              </Col>
              <Col span={12}>
                <Text type="secondary">合同类型：</Text>
                <div>{t("contracts.brokerage_contracts", "撮合业务合同")}</div>
              </Col>
              <Col span={12}>
                <Text type="secondary">合同状态：</Text>
                <div>
                  <Tag color={statusMap[viewingContract.status].color}>
                    {statusMap[viewingContract.status].label}
                  </Tag>
                  <Switch
                    checked={viewingContract.status !== "disabled"}
                    onChange={() => {
                      handleToggleStatus(viewingContract);
                      setDetailModalOpen(false);
                    }}
                    size="small"
                    style={{ marginLeft: 8 }}
                  />
                </div>
              </Col>
            </Row>

            <Divider orientation="left">签约方信息</Divider>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Text type="secondary">货主：</Text>
                <div style={{ fontWeight: 500 }}>{shipperMap[viewingContract.logisticsProviderId] || "平台"}</div>
              </Col>
              <Col span={12}>
                <Text type="secondary">物流商：</Text>
                <div style={{ fontWeight: 500 }}>{viewingContract.logisticsProviderName || "-"}</div>
              </Col>
            </Row>

            <Divider orientation="left">抽成配置</Divider>
            {viewingContract.commissionConfig && viewingContract.commissionConfig.length > 0 ? (
              <div style={{ background: "#f6f0ff", padding: 16, borderRadius: 8, marginBottom: 16 }}>
                <Row gutter={[16, 12]}>
                  {viewingContract.commissionConfig.map((cfg, index) => (
                    <Col span={8} key={index}>
                      <div style={{ 
                        background: "#fff", 
                        border: "1px solid #722ed1", 
                        borderRadius: 6, 
                        padding: "8px 12px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}>
                        <Text>{cfg.fieldLabel}</Text>
                        <Text strong style={{ color: "#722ed1" }}>
                          {cfg.mode === "percentage" ? `${cfg.value}%` : `¥${cfg.value}/单`}
                        </Text>
                      </div>
                    </Col>
                  ))}
                </Row>
              </div>
            ) : (
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <Text type="secondary">分成方式：</Text>
                  <div style={{ fontWeight: 500 }}>
                    {viewingContract.sharingMode === "fixed" ? "固定金额分成" : "按比例分成"}
                  </div>
                </Col>
                <Col span={12}>
                  <Text type="secondary">
                    {viewingContract.sharingMode === "fixed" ? "每单分成金额：" : "分成比例："}
                  </Text>
                  <div style={{ fontWeight: 500, color: "#722ed1" }}>
                    {viewingContract.sharingMode === "fixed" 
                      ? `¥${viewingContract.fixedSharingAmount || 0}` 
                      : `${viewingContract.profitSharingRatio || 0}%`}
                  </div>
                </Col>
              </Row>
            )}
            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
              <Col span={12}>
                <Text type="secondary">授信额度：</Text>
                <div style={{ fontWeight: 500 }}>{formatAmount(viewingContract.creditLimit)}</div>
              </Col>
              <Col span={12}>
                <Text type="secondary">累计贡献抽成：</Text>
                <div style={{ fontWeight: 500, color: "#52c41a" }}>{formatAmount(commissionMap[viewingContract.id] || 0)}</div>
              </Col>
            </Row>

            <Divider orientation="left">合同期限</Divider>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Text type="secondary">合同开始日期：</Text>
                <div>{viewingContract.startDate}</div>
              </Col>
              <Col span={12}>
                <Text type="secondary">合同结束日期：</Text>
                <div>{viewingContract.endDate}</div>
              </Col>
            </Row>

            <Divider orientation="left">结算配置</Divider>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Text type="secondary">结算周期：</Text>
                <div>{viewingContract.settlementCycle === "monthly" ? "每月结算" : viewingContract.settlementCycle === "quarterly" ? "每季度结算" : "每两周结算"}</div>
              </Col>
              <Col span={12}>
                <Text type="secondary">结算触发日：</Text>
                <div>{viewingContract.settlementTriggerDay ? `每月${viewingContract.settlementTriggerDay}日` : "-"}</div>
              </Col>
              <Col span={12}>
                <Text type="secondary">自动结算：</Text>
                <div>{viewingContract.autoSettlement ? <Tag color="green">已开启</Tag> : <Tag>已关闭</Tag>}</div>
              </Col>
            </Row>

            <Divider orientation="left">时间信息</Divider>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <Text type="secondary">创建时间：</Text>
                <div>{new Date(viewingContract.createdAt).toLocaleString()}</div>
              </Col>
              <Col span={12}>
                <Text type="secondary">更新时间：</Text>
                <div>{new Date(viewingContract.updatedAt).toLocaleString()}</div>
              </Col>
            </Row>
          </div>
        )}
      </Modal>

      {/* Edit Modal */}
      <Modal
        title="编辑撮合业务合同"
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          editForm.resetFields();
          setCommissionItems([]);
        }}
        onOk={handleEditSubmit}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
        width={700}
      >
        <Form form={editForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="logisticsProviderName" label="物流商" rules={[{ required: true, message: "请输入物流商" }]}>
                <Input placeholder="请输入物流商名称" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="creditLimit" label="授信额度">
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
              <Form.Item name="startDate" label="合同开始日期" rules={[{ required: true, message: "请选择开始日期" }]}>
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="endDate" label="合同结束日期" rules={[{ required: true, message: "请选择结束日期" }]}>
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          
          {/* 抽成配置区域 */}
          <div style={{ 
            background: "#f6f0ff", 
            padding: "16px", 
            borderRadius: 8,
            marginBottom: 16
          }}>
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              marginBottom: 12 
            }}>
              <Text strong style={{ color: "#722ed1" }}>抽成配置</Text>
              <Button
                type="dashed"
                size="small"
                icon={<PlusOutlined />}
                onClick={handleAddCommissionItem}
                disabled={getAvailableFields().length === 0}
                style={{ color: "#722ed1", borderColor: "#722ed1" }}
              >
                添加
              </Button>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {commissionItems.map((item, index) => (
                <div 
                  key={item.id}
                  style={{
                    background: "#fff",
                    border: item.fieldKey ? "1px solid #722ed1" : "1px solid #d9d9d9",
                    borderRadius: 6,
                    padding: "8px 12px"
                  }}
                >
                  <Row gutter={8} align="middle">
                    <Col flex="24px">
                      <span style={{
                        display: "inline-block",
                        width: 20,
                        height: 20,
                        lineHeight: "20px",
                        textAlign: "center",
                        background: item.fieldKey ? "#722ed1" : "#d9d9d9",
                        color: "#fff",
                        borderRadius: 4,
                        fontSize: 11
                      }}>
                        {index + 1}
                      </span>
                    </Col>
                    <Col flex="120px">
                      <Select
                        value={item.fieldKey || undefined}
                        onChange={(val) => handleUpdateCommissionItem(item.id, { fieldKey: val })}
                        placeholder="选择对象"
                        style={{ width: "100%" }}
                        size="small"
                        options={getAvailableFields(item.id).map(field => ({
                          value: field.key,
                          label: field.label
                        }))}
                      />
                    </Col>
                    <Col flex="130px">
                      <Radio.Group
                        value={item.mode}
                        onChange={(e) => handleUpdateCommissionItem(item.id, { mode: e.target.value, value: 0 })}
                        size="small"
                        disabled={!item.fieldKey}
                      >
                        <Radio.Button value="percentage" style={{ fontSize: 12 }}>
                          <PercentageOutlined /> 比例
                        </Radio.Button>
                        <Radio.Button value="fixed" style={{ fontSize: 12 }}>
                          <DollarOutlined /> 固定
                        </Radio.Button>
                      </Radio.Group>
                    </Col>
                    <Col flex="auto">
                      <InputNumber
                        value={item.value}
                        onChange={(val) => handleUpdateCommissionItem(item.id, { value: val || 0 })}
                        min={0}
                        max={item.mode === "percentage" ? 100 : undefined}
                        precision={2}
                        style={{ width: "100%" }}
                        size="small"
                        placeholder={item.mode === "percentage" ? "比例" : "金额"}
                        addonAfter={item.mode === "percentage" ? "%" : "元/单"}
                        disabled={!item.fieldKey}
                      />
                    </Col>
                    <Col flex="40px" style={{ textAlign: "right" }}>
                      <Button 
                        type="text" 
                        danger 
                        size="small"
                        onClick={() => handleRemoveCommissionItem(item.id)}
                        disabled={commissionItems.length === 1}
                      >
                        删除
                      </Button>
                    </Col>
                  </Row>
                </div>
              ))}
            </div>
          </div>
          
          <Row gutter={16}>
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
        </Form>
      </Modal>
    </div>
  );
}

export default BrokerageContractsPage;

