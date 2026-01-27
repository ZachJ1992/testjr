import { 
  getErrorMessage, 
  fetchFinanciers,
  fetchCommissionContracts,
  createCommissionContractApi,
  updateCommissionContractApi,
  deleteCommissionContractApi,
  type CommissionContract,
  type CommissionContractStatus,
  type CommissionConfigItem
} from "../api";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import type { Financier } from "../types";
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
  Form,
  Input,
  Select,
  DatePicker,
  InputNumber,
  Space,
  Radio,
  Popconfirm,
  Switch
} from "antd";
import {
  EyeOutlined,
  PlusOutlined,
  CheckCircleOutlined,
  RiseOutlined,
  PercentageOutlined,
  PercentageOutlined as PercentIcon,
  DollarOutlined,
  EditOutlined,
  DeleteOutlined
} from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";

const { RangePicker } = DatePicker;

const { Title, Text } = Typography;
const { TextArea } = Input;

// 抽成字段定义
const COMMISSION_FIELDS = [
  { key: "freight", label: "运费" },
  { key: "waybillFee", label: "面单费" },
  { key: "trunkLineFee", label: "干线费" },
  { key: "pickupFee", label: "提货费" },
  { key: "deliveryFee", label: "送货费" },
  { key: "receiptFee", label: "回单费" },
  { key: "packagingFee", label: "包装费" },
  { key: "insuranceFee", label: "保价费" },
  { key: "premiumFee", label: "保险费" },
  { key: "handlingFee", label: "装卸费" }
] as const;

// 抽成合同表单数据
interface CommissionContractForm {
  customerName: string;
  customerSystemId: string;
  contractDateRange: [dayjs.Dayjs, dayjs.Dayjs] | null;
  settlementDay: number;
  settlementCycle: "monthly" | "biweekly" | "weekly";
  remark: string;
  isEnabled: boolean;
}

// 表单中的抽成配置项（带有 id 用于增删）
interface FormCommissionConfigItem extends CommissionConfigItem {
  id: string;
}

function NewContractsPage() {
  const { token, user } = useAuth();
  const { t } = useI18n();
  const [contracts, setContracts] = useState<CommissionContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewingContract, setViewingContract] = useState<CommissionContract | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  
  // 创建/编辑合同弹窗状态
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm<CommissionContractForm>();
  const [submitting, setSubmitting] = useState(false);
  const [editingContract, setEditingContract] = useState<CommissionContract | null>(null);
  
  // 抽成配置列表（动态添加/删除）
  const [commissionItems, setCommissionItems] = useState<FormCommissionConfigItem[]>([]);
  
  // 融资方档案数据（用于客户选择）
  const [financiers, setFinanciers] = useState<Financier[]>([]);
  const [financiersLoading, setFinanciersLoading] = useState(false);
  
  // 加载融资方数据
  useEffect(() => {
    if (!token) return;
    const loadFinanciers = async () => {
      setFinanciersLoading(true);
      try {
        const res = await fetchFinanciers(token);
        setFinanciers(res.financiers);
      } catch (err) {
        console.error("Failed to load financiers:", err);
      } finally {
        setFinanciersLoading(false);
      }
    };
    void loadFinanciers();
  }, [token]);
  
  // 生成唯一ID
  const generateId = () => `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // 获取未选择的字段选项（排除已被其他卡片选中的字段）
  const getAvailableFields = (currentItemId?: string) => {
    const selectedKeys = new Set(
      commissionItems
        .filter(item => item.id !== currentItemId && item.fieldKey)
        .map(item => item.fieldKey)
    );
    return COMMISSION_FIELDS.filter(field => !selectedKeys.has(field.key));
  };
  
  // 添加新卡片
  const handleAddCard = () => {
    setCommissionItems(prev => [
      ...prev,
      {
        id: generateId(),
        fieldKey: "",
        mode: "percentage",
        value: 0
      }
    ]);
  };
  
  // 删除卡片
  const handleRemoveCard = (id: string) => {
    setCommissionItems(prev => prev.filter(item => item.id !== id));
  };
  
  // 更新卡片配置
  const handleUpdateCard = (id: string, updates: Partial<FormCommissionConfigItem>) => {
    setCommissionItems(prev => prev.map(item => 
      item.id === id ? { ...item, ...updates } : item
    ));
  };
  
  // 打开创建弹窗
  const handleOpenCreateModal = () => {
    setEditingContract(null);
    createForm.resetFields();
    createForm.setFieldsValue({
      settlementDay: 10,
      settlementCycle: "monthly",
      isEnabled: true
    });
    // 默认添加一个空卡片
    setCommissionItems([{
      id: generateId(),
      fieldKey: "",
      mode: "percentage",
      value: 0
    }]);
    setCreateModalOpen(true);
  };
  
  // 打开编辑弹窗
  const handleOpenEditModal = (contract: CommissionContract) => {
    setEditingContract(contract);
    createForm.setFieldsValue({
      customerName: contract.customerName,
      customerSystemId: contract.customerSystemId,
      contractDateRange: [dayjs(contract.startDate), dayjs(contract.endDate)],
      settlementDay: contract.settlementDay,
      settlementCycle: contract.settlementCycle,
      remark: contract.remark || "",
      isEnabled: contract.status !== "disabled"
    });
    // 加载已有的抽成配置
    setCommissionItems(contract.commissionConfig.map(cfg => ({
      id: generateId(),
      fieldKey: cfg.fieldKey,
      mode: cfg.mode,
      value: cfg.value
    })));
    setCreateModalOpen(true);
  };
  
  // 删除合同
  const handleDeleteContract = async (contract: CommissionContract) => {
    if (!token) return;
    try {
      await deleteCommissionContractApi(token, contract.id);
      message.success("合同已删除");
      await refresh();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };
  
  // 切换合同状态（启用/停用）
  const handleToggleStatus = async (contract: CommissionContract) => {
    if (!token) return;
    try {
      const newStatus: CommissionContractStatus = contract.status === "disabled" ? "active" : "disabled";
      await updateCommissionContractApi(token, contract.id, { status: newStatus });
      message.success(newStatus === "disabled" ? "合同已停用" : "合同已启用");
      await refresh();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };
  
  // 提交创建/编辑表单
  const handleCreateSubmit = async () => {
    if (!token) return;
    
    try {
      const values = await createForm.validateFields();
      
      // 过滤掉未选择字段的卡片
      const validItems = commissionItems.filter(item => item.fieldKey);
      
      if (validItems.length === 0) {
        message.warning("请至少配置一个抽成字段");
        return;
      }
      
      // 检查是否有未填写值的字段
      const emptyValueItems = validItems.filter(item => item.value <= 0);
      if (emptyValueItems.length > 0) {
        const fieldLabels = emptyValueItems.map(item => {
          const field = COMMISSION_FIELDS.find(f => f.key === item.fieldKey);
          return field?.label || item.fieldKey;
        }).join("、");
        message.warning(`请填写 ${fieldLabels} 的抽成值`);
        return;
      }
      
      setSubmitting(true);
      
      // 组合完整数据
      const commissionConfig: CommissionConfigItem[] = validItems.map(item => ({
        fieldKey: item.fieldKey,
        fieldLabel: COMMISSION_FIELDS.find(f => f.key === item.fieldKey)?.label || "",
        mode: item.mode,
        value: item.value
      }));
      
      const payload = {
        customerName: values.customerName,
        customerSystemId: values.customerSystemId,
        startDate: values.contractDateRange?.[0]?.format("YYYY-MM-DD") || "",
        endDate: values.contractDateRange?.[1]?.format("YYYY-MM-DD") || "",
        settlementCycle: values.settlementCycle,
        settlementDay: values.settlementDay,
        remark: values.remark,
        commissionConfig,
        status: (values.isEnabled ? "active" : "disabled") as CommissionContractStatus
      };
      
      if (editingContract) {
        // 编辑模式
        await updateCommissionContractApi(token, editingContract.id, payload);
        message.success("抽成合同更新成功");
      } else {
        // 创建模式
        await createCommissionContractApi(token, payload);
        message.success("抽成合同创建成功");
      }
      
      setCreateModalOpen(false);
      setEditingContract(null);
      // 立即刷新列表
      await refresh();
    } catch (err) {
      if (err instanceof Error) {
        message.error(getErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const refresh = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await fetchCommissionContracts(token);
      setContracts(result.contracts);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  const handleView = (contract: CommissionContract) => {
    setViewingContract(contract);
    setDetailModalOpen(true);
  };

  // 生成合同编号
  const generateContractNumber = (contract: CommissionContract): string => {
    const date = new Date(contract.createdAt);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const seq = contract.id.replace("cc-", "").padStart(4, "0");
    return `CC${year}${month}${seq}`;
  };

  // 计算统计数据
  const stats = useMemo(() => {
    const validCount = contracts.filter(c => c.status === "active").length;
    const totalCount = contracts.length;
    
    // 计算总抽成项数
    const totalConfigCount = contracts.reduce((sum, c) => sum + c.commissionConfig.length, 0);
    
    // 计算平均抽成比例（仅计算比例模式的）
    const percentageConfigs = contracts.flatMap(c => 
      c.commissionConfig.filter(cfg => cfg.mode === "percentage")
    );
    const avgRatio = percentageConfigs.length > 0
      ? percentageConfigs.reduce((sum, cfg) => sum + cfg.value, 0) / percentageConfigs.length
      : 0;

    return {
      validCount,
      totalCount,
      totalConfigCount,
      avgRatio
    };
  }, [contracts]);

  const statusMap: Record<string, { label: string; color: string }> = useMemo(() => ({
    active: { label: "执行中", color: "green" },
    expiring_soon: { label: "即将到期", color: "orange" },
    expired: { label: "已过期", color: "default" },
    disabled: { label: "已停用", color: "red" }
  }), []);

  // 结算周期映射
  const settlementCycleMap: Record<string, string> = {
    monthly: "按月结算",
    biweekly: "半月结算",
    weekly: "按周结算"
  };

  // 抽成合同表格列
  const columns = [
    {
      title: "客户名称/系统ID",
      key: "customer",
      width: 200,
      render: (_: any, record: CommissionContract) => (
        <div>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>
            {record.customerName}
          </div>
          <div style={{ fontSize: 12, color: "#8c8c8c" }}>
            {record.customerSystemId}
          </div>
        </div>
      )
    },
    {
      title: "合同时间",
      key: "contractDate",
      width: 180,
      render: (_: any, record: CommissionContract) => (
        <div>
          <div>{record.startDate}</div>
          <div style={{ fontSize: 12, color: "#8c8c8c" }}>
            至 {record.endDate}
          </div>
        </div>
      )
    },
    {
      title: "抽成配置",
      key: "commissionConfig",
      width: 280,
      render: (_: any, record: CommissionContract) => (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {record.commissionConfig.slice(0, 3).map((cfg, idx) => (
            <Tag 
              key={idx} 
              color={cfg.mode === "percentage" ? "cyan" : "blue"}
              style={{ margin: 0 }}
            >
              {cfg.fieldLabel}: {cfg.mode === "percentage" ? `${cfg.value}%` : `${cfg.value}元`}
            </Tag>
          ))}
          {record.commissionConfig.length > 3 && (
            <Tag style={{ margin: 0 }}>+{record.commissionConfig.length - 3}</Tag>
          )}
        </div>
      )
    },
    {
      title: "结算周期",
      key: "settlement",
      width: 140,
      render: (_: any, record: CommissionContract) => (
        <div>
          <div>{settlementCycleMap[record.settlementCycle]}</div>
          <div style={{ fontSize: 12, color: "#8c8c8c" }}>
            每月{record.settlementDay}日
          </div>
        </div>
      )
    },
    {
      title: "合同状态",
      key: "status",
      width: 100,
      render: (_: any, record: CommissionContract) => {
        const status = statusMap[record.status];
        return <Tag color={status.color}>{status.label}</Tag>;
      }
    },
    {
      title: "启用",
      key: "enabled",
      width: 80,
      render: (_: any, record: CommissionContract) => (
        <Switch
          checked={record.status !== "disabled"}
          onChange={() => handleToggleStatus(record)}
          size="small"
        />
      )
    },
    {
      title: "操作",
      key: "actions",
      width: 150,
      render: (_: any, record: CommissionContract) => (
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
            onClick={() => handleOpenEditModal(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description="确定要删除这个抽成合同吗？"
            onConfirm={() => handleDeleteContract(record)}
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
            抽成合同管理
          </Title>
        </Col>
        <Col>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreateModal}
            style={{ backgroundColor: "#13c2c2", borderColor: "#13c2c2" }}
          >
            录入抽成合同
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
                  有效合同数
                </div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4 }}>
                  {stats.validCount}
                </div>
                <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                  共 {stats.totalCount} 份合同
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
                  抽成配置项
                </div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4, color: "#52c41a" }}>
                  {stats.totalConfigCount}
                </div>
                <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                  覆盖多种费用类型
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
                  平均抽成比例
                </div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4, color: "#13c2c2" }}>
                  {stats.avgRatio.toFixed(1)}%
                </div>
                <div style={{ fontSize: 12, color: "#8c8c8c" }}>
                  按比例计算的平均值
                </div>
              </div>
              <PercentageOutlined style={{ fontSize: 32, color: "#13c2c2", opacity: 0.3 }} />
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
        title="合同详情"
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalOpen(false)}>
            关闭
          </Button>
        ]}
        width={700}
      >
        {viewingContract && (
          <div>
            {/* 基本信息 */}
            <div style={{ background: "#fafafa", padding: 16, borderRadius: 8, marginBottom: 16 }}>
              <Title level={5} style={{ marginTop: 0, marginBottom: 12, color: "#13c2c2" }}>基本信息</Title>
              <Row gutter={[16, 12]}>
                <Col span={12}>
                  <Text type="secondary">客户名称：</Text>
                  <Text strong>{viewingContract.customerName}</Text>
                </Col>
                <Col span={12}>
                  <Text type="secondary">客户系统ID：</Text>
                  <Text>{viewingContract.customerSystemId}</Text>
                </Col>
                <Col span={12}>
                  <Text type="secondary">合同时间：</Text>
                  <Text>{viewingContract.startDate} 至 {viewingContract.endDate}</Text>
                </Col>
                <Col span={12}>
                  <Text type="secondary">合同状态：</Text>
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
                </Col>
                <Col span={12}>
                  <Text type="secondary">结算周期：</Text>
                  <Text>{settlementCycleMap[viewingContract.settlementCycle]}</Text>
                </Col>
                <Col span={12}>
                  <Text type="secondary">结算日：</Text>
                  <Text>每月{viewingContract.settlementDay}日</Text>
                </Col>
                {viewingContract.remark && (
                  <Col span={24}>
                    <Text type="secondary">备注：</Text>
                    <Text>{viewingContract.remark}</Text>
                  </Col>
                )}
              </Row>
            </div>
            
            {/* 抽成配置 */}
            <div style={{ background: "#f0f9f9", padding: 16, borderRadius: 8 }}>
              <Title level={5} style={{ marginTop: 0, marginBottom: 12, color: "#13c2c2" }}>抽成配置</Title>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {viewingContract.commissionConfig.map((cfg, idx) => (
                  <div 
                    key={idx}
                    style={{
                      background: "#fff",
                      border: "1px solid #e8e8e8",
                      borderRadius: 6,
                      padding: "8px 12px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}
                  >
                    <Space>
                      <span style={{
                        background: "#13c2c2",
                        color: "#fff",
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: 12
                      }}>
                        {idx + 1}
                      </span>
                      <Text strong>{cfg.fieldLabel}</Text>
                    </Space>
                    <Tag color={cfg.mode === "percentage" ? "cyan" : "blue"}>
                      {cfg.mode === "percentage" ? `${cfg.value}%` : `${cfg.value}元/单`}
                    </Tag>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 创建抽成合同弹窗 */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {editingContract ? <EditOutlined style={{ color: "#13c2c2" }} /> : <PlusOutlined style={{ color: "#13c2c2" }} />}
            <span>{editingContract ? "编辑抽成合同" : "录入抽成合同"}</span>
          </div>
        }
        open={createModalOpen}
        onCancel={() => { 
          setCreateModalOpen(false); 
          setEditingContract(null);
          createForm.resetFields();
          setCommissionItems([]);
        }}
        width={900}
        footer={[
          <Button key="cancel" onClick={() => { 
            setCreateModalOpen(false); 
            setEditingContract(null);
            createForm.resetFields();
            setCommissionItems([]);
          }}>
            取消
          </Button>,
          <Button 
            key="submit" 
            type="primary" 
            loading={submitting}
            onClick={handleCreateSubmit}
            style={{ backgroundColor: "#13c2c2", borderColor: "#13c2c2" }}
          >
            {editingContract ? "保存修改" : "确认创建"}
          </Button>
        ]}
        destroyOnClose
      >
        <Form
          form={createForm}
          layout="vertical"
          initialValues={{
            settlementDay: 10,
            settlementCycle: "monthly"
          }}
        >
          {/* 基本信息区域 */}
          <div style={{ 
            background: "#fafafa", 
            padding: "16px 20px", 
            borderRadius: 8, 
            marginBottom: 24 
          }}>
            <Title level={5} style={{ marginTop: 0, marginBottom: 16, color: "#13c2c2" }}>
              基本信息
            </Title>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="customerName"
                  label="客户名称"
                  rules={[{ required: true, message: "请选择客户" }]}
                >
                  <Select
                    placeholder="请选择客户"
                    showSearch
                    optionFilterProp="label"
                    loading={financiersLoading}
                    options={financiers.map(f => ({
                      value: f.enterpriseName,
                      label: f.enterpriseName
                    }))}
                    onChange={(value) => {
                      const financier = financiers.find(f => f.enterpriseName === value);
                      if (financier) {
                        createForm.setFieldValue("customerSystemId", financier.unifiedSocialCreditCode);
                      }
                    }}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="customerSystemId"
                  label="客户系统ID"
                  rules={[{ required: true, message: "请输入客户系统ID" }]}
                >
                  <Input placeholder="选择客户后自动填充（统一社会信用代码）" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="contractDateRange"
                  label="合同时间"
                  rules={[{ required: true, message: "请选择合同时间范围" }]}
                >
                  <RangePicker 
                    style={{ width: "100%" }} 
                    placeholder={["开始日期", "结束日期"]}
                    format="YYYY-MM-DD"
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item
                  name="settlementCycle"
                  label="结算周期"
                  rules={[{ required: true, message: "请选择结算周期" }]}
                >
                  <Select
                    options={[
                      { value: "monthly", label: "按月结算" },
                      { value: "biweekly", label: "半月结算" },
                      { value: "weekly", label: "按周结算" }
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item
                  name="settlementDay"
                  label="结算日（每月）"
                  rules={[{ required: true, message: "请输入结算日" }]}
                >
                  <InputNumber 
                    min={1} 
                    max={28} 
                    style={{ width: "100%" }}
                    placeholder="1-28日"
                    addonAfter="日"
                  />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={18}>
                <Form.Item
                  name="remark"
                  label="备注"
                >
                  <TextArea 
                    rows={2} 
                    placeholder="可选，填写合同相关备注信息"
                    maxLength={500}
                    showCount
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item
                  name="isEnabled"
                  label="合同状态"
                  valuePropName="checked"
                  initialValue={true}
                >
                  <Switch 
                    checkedChildren="启用" 
                    unCheckedChildren="停用"
                  />
                </Form.Item>
              </Col>
            </Row>
          </div>

          {/* 抽成配置区域 */}
          <div style={{ 
            background: "#f0f9f9", 
            padding: "16px 20px", 
            borderRadius: 8 
          }}>
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              marginBottom: 16 
            }}>
              <Title level={5} style={{ margin: 0, color: "#13c2c2" }}>
                抽成配置
              </Title>
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={handleAddCard}
                disabled={getAvailableFields().length === 0}
                style={{ color: "#13c2c2", borderColor: "#13c2c2" }}
              >
                添加抽成项
              </Button>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {commissionItems.map((item, index) => (
                <div 
                  key={item.id}
                  style={{
                    background: "#fff",
                    border: item.fieldKey ? "1px solid #13c2c2" : "1px solid #d9d9d9",
                    borderRadius: 8,
                    padding: "12px 16px",
                    transition: "all 0.2s"
                  }}
                >
                  <Row gutter={12} align="middle">
                    {/* 序号 */}
                    <Col flex="32px">
                      <span style={{
                        display: "inline-block",
                        width: 24,
                        height: 24,
                        lineHeight: "24px",
                        textAlign: "center",
                        background: item.fieldKey ? "#13c2c2" : "#d9d9d9",
                        color: "#fff",
                        borderRadius: 4,
                        fontSize: 12
                      }}>
                        {index + 1}
                      </span>
                    </Col>
                    
                    {/* 字段选择 */}
                    <Col flex="140px">
                      <Select
                        value={item.fieldKey || undefined}
                        onChange={(val) => handleUpdateCard(item.id, { fieldKey: val })}
                        placeholder="选择费用类型"
                        style={{ width: "100%" }}
                        size="middle"
                        options={getAvailableFields(item.id).map(field => ({
                          value: field.key,
                          label: field.label
                        }))}
                      />
                    </Col>
                    
                    {/* 抽成模式 */}
                    <Col flex="160px">
                      <Radio.Group
                        value={item.mode}
                        onChange={(e) => handleUpdateCard(item.id, { 
                          mode: e.target.value,
                          value: 0
                        })}
                        size="small"
                        style={{ width: "100%" }}
                        disabled={!item.fieldKey}
                      >
                        <Radio.Button value="percentage" style={{ width: "50%", textAlign: "center" }}>
                          <PercentIcon style={{ marginRight: 2 }} />
                          比例
                        </Radio.Button>
                        <Radio.Button value="fixed" style={{ width: "50%", textAlign: "center" }}>
                          <DollarOutlined style={{ marginRight: 2 }} />
                          固定
                        </Radio.Button>
                      </Radio.Group>
                    </Col>
                    
                    {/* 抽成值 */}
                    <Col flex="auto">
                      <InputNumber
                        value={item.value}
                        onChange={(val) => handleUpdateCard(item.id, { value: val || 0 })}
                        min={0}
                        max={item.mode === "percentage" ? 100 : undefined}
                        precision={2}
                        style={{ width: "100%" }}
                        placeholder={item.mode === "percentage" ? "抽成比例" : "固定金额"}
                        addonAfter={<span style={{ whiteSpace: "nowrap" }}>{item.mode === "percentage" ? "%" : "元/单"}</span>}
                        disabled={!item.fieldKey}
                      />
                    </Col>
                    
                    {/* 删除按钮 */}
                    <Col flex="60px" style={{ textAlign: "right" }}>
                      <Button 
                        type="text" 
                        danger 
                        size="small"
                        onClick={() => handleRemoveCard(item.id)}
                        disabled={commissionItems.length === 1}
                        style={{ opacity: commissionItems.length === 1 ? 0.3 : 1 }}
                      >
                        删除
                      </Button>
                    </Col>
                  </Row>
                </div>
              ))}
            </div>
            
            {/* 便捷添加按钮 */}
            {commissionItems.length > 0 && getAvailableFields().length > 0 && (
              <div 
                onClick={handleAddCard}
                style={{
                  background: "#fff",
                  border: "1px dashed #13c2c2",
                  borderRadius: 8,
                  padding: "8px 16px",
                  textAlign: "center",
                  color: "#13c2c2",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  marginTop: 8
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#f0f9f9";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#fff";
                }}
              >
                <PlusOutlined style={{ marginRight: 8 }} />
                添加抽成项
              </div>
            )}

            {commissionItems.length === 0 && (
              <div style={{
                background: "#fff",
                border: "1px dashed #d9d9d9",
                borderRadius: 8,
                padding: "32px 16px",
                textAlign: "center",
                color: "#8c8c8c"
              }}>
                <div style={{ marginBottom: 8 }}>暂未配置抽成字段</div>
                <Button 
                  type="link" 
                  onClick={handleAddCard}
                  style={{ color: "#13c2c2" }}
                >
                  + 点击添加抽成配置
                </Button>
              </div>
            )}
            
            {getAvailableFields().length > 0 && commissionItems.length > 0 && (
              <div style={{ 
                marginTop: 8, 
                fontSize: 12,
                color: "#8c8c8c"
              }}>
                可选字段：{getAvailableFields().map(f => f.label).join("、")}
              </div>
            )}
          </div>
        </Form>
      </Modal>
    </div>
  );
}

export default NewContractsPage;
