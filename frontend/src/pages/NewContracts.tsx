import { 
  getErrorMessage, 
  fetchFinanciers,
  fetchCommissionContracts,
  createCommissionContractApi,
  updateCommissionContractApi,
  deleteCommissionContractApi,
  fetchLocalPartners,
  fetchAreas,
  createAreaApi,
  updateAreaApi,
  deleteAreaApi,
  createLocalPartnerApi,
  deleteLocalPartnerApi,
  updateLocalPartnerApi,
  fetchRoutes,
  createRouteApi,
  deleteRouteApi,
  updateRouteApi,
  type CommissionContract,
  type CommissionContractStatus,
  type CommissionConfigItem,
  type LocalPartner,
  type Area,
  type RouteItem
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
  Switch,
  Divider,
  Tabs,
  Tree
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
  DeleteOutlined,
  ApartmentOutlined,
  EnvironmentOutlined
} from "@ant-design/icons";
import { useEffect, useMemo, useState, useCallback } from "react";
import dayjs from "dayjs";

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;
const { TextArea } = Input;

const COMMISSION_FIELDS = [
  { key: "receivableTotal", label: "撮合运费" },
  { key: "payableTotal", label: "应付合计" },
  { key: "priceDiff", label: "承运价差" },
  { key: "receivableTransport", label: "运输费" },
  { key: "freight", label: "运费" },
  { key: "pickupFee", label: "提货费" },
  { key: "deliveryFee", label: "送货费" },
  { key: "receiptFee", label: "回单费" },
  { key: "packagingFee", label: "包装费" },
  { key: "insuranceFee", label: "保价费" },
  { key: "premiumFee", label: "保险费" },
  { key: "handlingFee", label: "装卸费" }
] as const;

interface CommissionContractForm {
  contractName: string;
  customerName: string;
  financierId: string;
  customerSystemId: string;
  contractDateRange: [dayjs.Dayjs, dayjs.Dayjs] | null;
  settlementDay: number;
  settlementCycle: "monthly" | "biweekly" | "weekly";
  remark: string;
  isEnabled: boolean;
  routeIds: string[];
}

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
  
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm<CommissionContractForm>();
  const [submitting, setSubmitting] = useState(false);
  const [editingContract, setEditingContract] = useState<CommissionContract | null>(null);
  
  const [commissionItems, setCommissionItems] = useState<FormCommissionConfigItem[]>([]);
  
  const [financiers, setFinanciers] = useState<Financier[]>([]);
  const [financiersLoading, setFinanciersLoading] = useState(false);

  // v2: 落地合作方 & 线路
  const [localPartners, setLocalPartners] = useState<LocalPartner[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [selectedFinancierId, setSelectedFinancierId] = useState<string>("");
  const [lpModalOpen, setLpModalOpen] = useState(false);
  const [lpForm] = Form.useForm();
  const [areaModalOpen, setAreaModalOpen] = useState(false);
  const [areaForm] = Form.useForm();
  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [routeForm] = Form.useForm();

  const [checkedRouteIds, setCheckedRouteIds] = useState<string[]>([]);
  // 管理落地合作方/线路标签页
  const [manageModalOpen, setManageModalOpen] = useState(false);

  const loadFinanciers = useCallback(async () => {
    if (!token) return;
    setFinanciersLoading(true);
    try {
      const res = await fetchFinanciers(token);
      setFinanciers(res.financiers);
    } catch (err) {
      console.error("Failed to load financiers:", err);
    } finally {
      setFinanciersLoading(false);
    }
  }, [token]);

  const loadLocalPartners = useCallback(async (financierId?: string) => {
    if (!token) return;
    try {
      const res = await fetchLocalPartners(token, { financierId });
      setLocalPartners(res.localPartners);
    } catch (err) {
      console.error("Failed to load local partners:", err);
    }
  }, [token]);

  const loadAreas = useCallback(async (financierId?: string) => {
    if (!token) return;
    try {
      const res = await fetchAreas(token, { financierId, status: "active" });
      setAreas(res.areas);
    } catch (err) {
      console.error("Failed to load areas:", err);
    }
  }, [token]);

  const loadRoutes = useCallback(async (financierId?: string) => {
    if (!token) return;
    try {
      const res = await fetchRoutes(token, { financierId });
      setRoutes(res.routes);
    } catch (err) {
      console.error("Failed to load routes:", err);
    }
  }, [token]);

  useEffect(() => {
    void loadFinanciers();
    void loadAreas();
    void loadLocalPartners();
    void loadRoutes();
  }, [loadFinanciers, loadAreas, loadLocalPartners, loadRoutes]);

  const generateId = () => `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const getAvailableFields = (currentItemId?: string) => {
    const selectedKeys = new Set(
      commissionItems
        .filter(item => item.id !== currentItemId && item.fieldKey)
        .map(item => item.fieldKey)
    );
    return COMMISSION_FIELDS.filter(field => !selectedKeys.has(field.key));
  };
  
  const handleAddCard = () => {
    setCommissionItems(prev => [
      ...prev,
      { id: generateId(), fieldKey: "", fieldLabel: "", mode: "percentage", value: 0 }
    ]);
  };
  
  const handleRemoveCard = (id: string) => {
    setCommissionItems(prev => prev.filter(item => item.id !== id));
  };
  
  const handleUpdateCard = (id: string, updates: Partial<FormCommissionConfigItem>) => {
    setCommissionItems(prev => prev.map(item => 
      item.id === id ? { ...item, ...updates } : item
    ));
  };

  // 合作方选择变化时加载下属的落地合作方和线路
  const handleFinancierChange = async (financierId: string) => {
    setSelectedFinancierId(financierId);
    const financier = financiers.find(f => f.id === financierId);
    if (financier) {
      createForm.setFieldValue("customerName", financier.enterpriseName);
      createForm.setFieldValue("customerSystemId", financier.unifiedSocialCreditCode);
    }
    createForm.setFieldValue("routeIds", []);
    void loadAreas(financierId);
    await loadLocalPartners(financierId);
    await loadRoutes(financierId);
  };

  const handleOpenCreateModal = () => {
    setEditingContract(null);
    createForm.resetFields();
    createForm.setFieldsValue({
      settlementDay: 10,
      settlementCycle: "monthly",
      isEnabled: true,
      routeIds: []
    });
    setCommissionItems([{
      id: generateId(),
      fieldKey: "",
      fieldLabel: "",
      mode: "percentage",
      value: 0
    }]);
    setSelectedFinancierId("");
    setCheckedRouteIds([]);
    setCreateModalOpen(true);
  };
  
  const handleOpenEditModal = async (contract: CommissionContract) => {
    setEditingContract(contract);
    const fId = contract.financierId || "";
    setSelectedFinancierId(fId);
    
    createForm.setFieldsValue({
      contractName: contract.contractName || "",
      financierId: fId,
      customerName: contract.customerName,
      customerSystemId: contract.customerSystemId || "",
      contractDateRange: [dayjs(contract.startDate), dayjs(contract.endDate)],
      settlementDay: contract.settlementDay ?? 10,
      settlementCycle: contract.settlementCycle || "monthly",
      remark: contract.remark || "",
      isEnabled: contract.status !== "disabled",
      routeIds: contract.routes?.map(r => r.routeId) || []
    });
    setCheckedRouteIds(contract.routes?.map(r => r.routeId) || []);

    setCommissionItems(contract.commissionConfig.map(cfg => ({
      id: generateId(),
      fieldKey: cfg.fieldKey,
      fieldLabel: cfg.fieldLabel || "",
      mode: cfg.mode,
      value: cfg.value
    })));

    if (fId) {
      await loadLocalPartners(fId);
      await loadRoutes(fId);
    }
    setCreateModalOpen(true);
  };
  
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
  
  const handleCreateSubmit = async () => {
    if (!token) return;
    
    try {
      const values = await createForm.validateFields();
      const validItems = commissionItems.filter(item => item.fieldKey);
      
      if (validItems.length === 0) {
        message.warning("请至少配置一个抽成字段");
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
      
      setSubmitting(true);
      
      const commissionConfig: CommissionConfigItem[] = validItems.map(item => ({
        fieldKey: item.fieldKey,
        fieldLabel: COMMISSION_FIELDS.find(f => f.key === item.fieldKey)?.label || "",
        mode: item.mode,
        value: item.value
      }));
      
      const payload = {
        contractName: values.contractName || undefined,
        customerName: values.customerName,
        financierId: values.financierId || undefined,
        customerSystemId: values.customerSystemId || undefined,
        startDate: values.contractDateRange?.[0]?.format("YYYY-MM-DD") || "",
        endDate: values.contractDateRange?.[1]?.format("YYYY-MM-DD") || "",
        settlementCycle: values.settlementCycle || undefined,
        settlementDay: values.settlementDay || undefined,
        remark: values.remark,
        commissionConfig,
        status: (values.isEnabled ? "active" : "disabled") as CommissionContractStatus,
        routeIds: checkedRouteIds
      };
      
      if (editingContract) {
        await updateCommissionContractApi(token, editingContract.id, payload);
        message.success("抽成合同更新成功");
      } else {
        await createCommissionContractApi(token, payload);
        message.success("抽成合同创建成功");
      }
      
      setCreateModalOpen(false);
      setEditingContract(null);
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

  const handleCreateArea = async () => {
    if (!token) return;
    try {
      const values = await areaForm.validateFields();
      await createAreaApi(token, values);
      message.success("区域创建成功");
      setAreaModalOpen(false);
      areaForm.resetFields();
      if (manageModalOpen) {
        await loadAreas();
        await loadLocalPartners();
      } else {
        await loadAreas(selectedFinancierId || undefined);
        await loadLocalPartners(selectedFinancierId || undefined);
      }
    } catch (err) {
      if (err instanceof Error) message.error(getErrorMessage(err));
    }
  };

  // 创建落地合作方
  const handleCreateLP = async () => {
    if (!token) return;
    try {
      const values = await lpForm.validateFields();
      await createLocalPartnerApi(token, values);
      message.success("落地合作方创建成功");
      setLpModalOpen(false);
      lpForm.resetFields();
      if (manageModalOpen) {
        await loadAreas();
        await loadLocalPartners();
        await loadRoutes();
      } else {
        await loadAreas(selectedFinancierId || undefined);
        await loadLocalPartners(selectedFinancierId || undefined);
        await loadRoutes(selectedFinancierId || undefined);
      }
    } catch (err) {
      if (err instanceof Error) message.error(getErrorMessage(err));
    }
  };

  // 创建线路
  const handleCreateRoute = async () => {
    if (!token) return;
    try {
      const values = await routeForm.validateFields();
      await createRouteApi(token, values);
      message.success("线路创建成功");
      setRouteModalOpen(false);
      routeForm.resetFields();
      if (manageModalOpen) {
        await loadRoutes();
      } else {
        await loadRoutes(selectedFinancierId || undefined);
      }
    } catch (err) {
      if (err instanceof Error) message.error(getErrorMessage(err));
    }
  };

  const stats = useMemo(() => {
    const validCount = contracts.filter(c => c.status === "active").length;
    const totalCount = contracts.length;
    const totalConfigCount = contracts.reduce((sum, c) => sum + c.commissionConfig.length, 0);
    const percentageConfigs = contracts.flatMap(c => 
      c.commissionConfig.filter(cfg => cfg.mode === "percentage")
    );
    const avgRatio = percentageConfigs.length > 0
      ? percentageConfigs.reduce((sum, cfg) => sum + cfg.value, 0) / percentageConfigs.length
      : 0;
    return { validCount, totalCount, totalConfigCount, avgRatio };
  }, [contracts]);

  const statusMap: Record<string, { label: string; color: string }> = useMemo(() => ({
    active: { label: "执行中", color: "green" },
    expiring_soon: { label: "即将到期", color: "orange" },
    expired: { label: "已过期", color: "default" },
    disabled: { label: "已停用", color: "red" }
  }), []);

  const settlementCycleMap: Record<string, string> = {
    monthly: "按月结算",
    biweekly: "半月结算",
    weekly: "按周结算"
  };

  // 按区域/落地合作方分组线路
  const filteredLocalPartners = useMemo(() => {
    if (!selectedFinancierId) return localPartners;
    return localPartners.filter(lp => lp.financierId === selectedFinancierId);
  }, [localPartners, selectedFinancierId]);

  const filteredRoutes = useMemo(() => {
    if (!selectedFinancierId) return routes;
    const lpIds = new Set(filteredLocalPartners.map(lp => lp.id));
    return routes.filter(r => lpIds.has(r.localPartnerId));
  }, [routes, selectedFinancierId, filteredLocalPartners]);

  const filteredAreas = useMemo(() => {
    if (!selectedFinancierId) return areas;
    return areas.filter((a) => a.financierId === selectedFinancierId);
  }, [areas, selectedFinancierId]);

  const handleDeleteRouteInTree = async (routeId: string, routeName: string) => {
    if (!token) return;
    Modal.confirm({
      title: "删除线路",
      content: `确定删除线路「${routeName}」吗？`,
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteRouteApi(token, routeId);
        message.success("已删除");
        setCheckedRouteIds(prev => prev.filter(id => id !== routeId));
        await loadRoutes(selectedFinancierId || undefined);
      },
    });
  };

  const handleDeleteLpInTree = async (lpId: string, lpName: string) => {
    if (!token) return;
    Modal.confirm({
      title: "删除落地合作方",
      content: `确定删除「${lpName}」及其所有线路吗？`,
      okButtonProps: { danger: true },
      onOk: async () => {
        await deleteLocalPartnerApi(token, lpId);
        message.success("已删除");
        const deletedRouteIds = filteredRoutes.filter(r => r.localPartnerId === lpId).map(r => r.id);
        setCheckedRouteIds(prev => prev.filter(id => !deletedRouteIds.includes(id)));
        await loadLocalPartners(selectedFinancierId || undefined);
        await loadRoutes(selectedFinancierId || undefined);
      },
    });
  };

  // 构建线路 Tree 数据（按落地合作方分组）
  const routeTreeData = useMemo(() => {
    const areaGroups = new Map<string, { id: string; name: string; partners: LocalPartner[] }>();
    filteredLocalPartners.forEach((lp) => {
      const key = lp.areaId || "__NO_AREA__";
      const name = lp.areaName || "无区域";
      if (!areaGroups.has(key)) {
        areaGroups.set(key, { id: key, name, partners: [] });
      }
      areaGroups.get(key)!.partners.push(lp);
    });

    return Array.from(areaGroups.values()).map((area) => {
      const areaChildren = area.partners.map(lp => {
      const lpRoutes = filteredRoutes.filter(r => r.localPartnerId === lp.id);
      const children = lpRoutes.length > 0
        ? lpRoutes.map(r => ({
            title: (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <EnvironmentOutlined style={{ color: "#52c41a" }} />{r.name}
                <DeleteOutlined
                  style={{ color: "#ff4d4f", fontSize: 12, cursor: "pointer", marginLeft: 8, opacity: 0.6 }}
                  onClick={(e) => { e.stopPropagation(); handleDeleteRouteInTree(r.id, r.name); }}
                />
              </span>
            ),
            key: r.id,
          }))
        : [{
            title: <span style={{ color: "#bfbfbf", fontStyle: "italic" }}>暂无线路，请点击"新建线路"添加</span>,
            key: `empty_${lp.id}`,
            checkable: false,
            disableCheckbox: true,
          }];
      return {
        title: (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <ApartmentOutlined style={{ color: "#13c2c2" }} /><strong>{lp.name}</strong>
            <span style={{ color: "#8c8c8c", fontSize: 12 }}>（落地合作方）</span>
            <DeleteOutlined
              style={{ color: "#ff4d4f", fontSize: 12, cursor: "pointer", marginLeft: 8, opacity: 0.6 }}
              onClick={(e) => { e.stopPropagation(); handleDeleteLpInTree(lp.id, lp.name); }}
            />
          </span>
        ),
        key: `lp_${lp.id}`,
        selectable: false,
        checkable: false,
        children,
      };
      });

      return {
        title: (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <EnvironmentOutlined style={{ color: "#1677ff" }} />
            <strong>{area.name}</strong>
            <span style={{ color: "#8c8c8c", fontSize: 12 }}>（区域）</span>
          </span>
        ),
        key: `area_${area.id}`,
        selectable: false,
        checkable: false,
        children: areaChildren,
      };
    });
  }, [filteredLocalPartners, filteredRoutes]);

  const columns = [
    {
      title: "合同名称",
      dataIndex: "contractName",
      key: "contractName",
      width: 200,
      render: (v: string) => v || <Text type="secondary">-</Text>,
    },
    {
      title: "合作方",
      key: "customer",
      width: 140,
      render: (_: any, record: CommissionContract) => (
        <div>
          <div style={{ fontWeight: 500 }}>
            {record.customerName}
          </div>
        </div>
      )
    },
    {
      title: "落地合作方",
      key: "localPartners",
      width: 160,
      render: (_: any, record: CommissionContract) => {
        let lpNames = [...new Set((record.routes || []).map(r => r.localPartnerName).filter(Boolean))];
        if (lpNames.length === 0 && record.financierId) {
          lpNames = localPartners.filter(lp => lp.financierId === record.financierId).map(lp => lp.name);
        }
        if (lpNames.length === 0) {
          return <Text type="secondary">未配置</Text>;
        }
        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {lpNames.slice(0, 2).map((name, i) => (
              <Tag key={i} color="cyan" style={{ margin: 0 }}>{name}</Tag>
            ))}
            {lpNames.length > 2 && <Tag style={{ margin: 0 }}>+{lpNames.length - 2}</Tag>}
          </div>
        );
      }
    },
    {
      title: "关联线路",
      key: "routes",
      width: 180,
      render: (_: any, record: CommissionContract) => {
        if (!record.routes || record.routes.length === 0) {
          return <Text type="secondary">未关联</Text>;
        }
        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {record.routes.slice(0, 3).map(r => (
              <Tag key={r.id} color="green" style={{ margin: 0 }}>
                {r.routeName}
              </Tag>
            ))}
            {record.routes.length > 3 && (
              <Tag style={{ margin: 0 }}>+{record.routes.length - 3}</Tag>
            )}
          </div>
        );
      }
    },
    {
      title: "合同时间",
      key: "contractDate",
      width: 180,
      render: (_: any, record: CommissionContract) => (
        <div>
          <div>{dayjs(record.startDate).format("YYYY-MM-DD")}</div>
          <div style={{ fontSize: 12, color: "#8c8c8c" }}>
            至 {dayjs(record.endDate).format("YYYY-MM-DD")}
          </div>
        </div>
      )
    },
    {
      title: "区域",
      key: "areas",
      width: 140,
      render: (_: any, record: CommissionContract) => {
        let areaNames = [...new Set((record.routes || []).map(r => r.areaName).filter(Boolean))] as string[];
        if (areaNames.length === 0 && record.financierId) {
          areaNames = localPartners
            .filter(lp => lp.financierId === record.financierId)
            .map(lp => lp.areaName || "无区域");
        }
        areaNames = [...new Set(areaNames)];
        if (areaNames.length === 0) return <Text type="secondary">无区域</Text>;
        return (
          <Space size={[4, 4]} wrap>
            {areaNames.map((a, idx) => <Tag key={`${a}_${idx}`}>{a}</Tag>)}
          </Space>
        );
      },
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
      title: "合同状态",
      key: "status",
      width: 100,
      render: (_: any, record: CommissionContract) => {
        const status = statusMap[record.status];
        return <Tag color={status?.color}>{status?.label}</Tag>;
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
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleView(record)}>
            查看
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleOpenEditModal(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除"
            description="确定要删除这个抽成合同吗？"
            onConfirm={() => handleDeleteContract(record)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
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
            业务抽成合同
          </Title>
        </Col>
        <Col>
          <Space>
            <Button
              icon={<ApartmentOutlined />}
              onClick={() => {
                loadLocalPartners();
                loadRoutes();
                setManageModalOpen(true);
              }}
            >
              管理落地合作方/线路
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenCreateModal}
              style={{ backgroundColor: "#13c2c2", borderColor: "#13c2c2" }}
            >
              录入抽成合同
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Statistics Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>有效合同数</div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4 }}>{stats.validCount}</div>
                <div style={{ fontSize: 12, color: "#8c8c8c" }}>共 {stats.totalCount} 份合同</div>
              </div>
              <CheckCircleOutlined style={{ fontSize: 32, color: "#52c41a", opacity: 0.3 }} />
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>抽成配置项</div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4, color: "#52c41a" }}>{stats.totalConfigCount}</div>
                <div style={{ fontSize: 12, color: "#8c8c8c" }}>覆盖多种费用类型</div>
              </div>
              <RiseOutlined style={{ fontSize: 32, color: "#52c41a", opacity: 0.3 }} />
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 14, color: "#8c8c8c", marginBottom: 8 }}>平均抽成比例</div>
                <div style={{ fontSize: 24, fontWeight: "bold", marginBottom: 4, color: "#13c2c2" }}>{stats.avgRatio.toFixed(1)}%</div>
                <div style={{ fontSize: 12, color: "#8c8c8c" }}>按比例计算的平均值</div>
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
          <Button key="close" onClick={() => setDetailModalOpen(false)}>关闭</Button>
        ]}
        width={700}
      >
        {viewingContract && (
          <div>
            <div style={{ background: "#fafafa", padding: 16, borderRadius: 8, marginBottom: 16 }}>
              <Title level={5} style={{ marginTop: 0, marginBottom: 12, color: "#13c2c2" }}>基本信息</Title>
              <Row gutter={[16, 12]}>
                <Col span={12}>
                  <Text type="secondary">合作方：</Text>
                  <Text strong>{viewingContract.customerName}</Text>
                </Col>
                {viewingContract.customerSystemId && (
                  <Col span={12}>
                    <Text type="secondary">系统ID：</Text>
                    <Text>{viewingContract.customerSystemId}</Text>
                  </Col>
                )}
                <Col span={12}>
                  <Text type="secondary">合同时间：</Text>
                  <Text>{viewingContract.startDate} 至 {viewingContract.endDate}</Text>
                </Col>
                <Col span={12}>
                  <Text type="secondary">合同状态：</Text>
                  <Tag color={statusMap[viewingContract.status]?.color}>
                    {statusMap[viewingContract.status]?.label}
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
                {viewingContract.settlementCycle && (
                  <Col span={12}>
                    <Text type="secondary">结算周期：</Text>
                    <Text>{settlementCycleMap[viewingContract.settlementCycle]}</Text>
                  </Col>
                )}
                {viewingContract.settlementDay != null && (
                  <Col span={12}>
                    <Text type="secondary">结算日：</Text>
                    <Text>每月{viewingContract.settlementDay}日</Text>
                  </Col>
                )}
                {viewingContract.remark && (
                  <Col span={24}>
                    <Text type="secondary">备注：</Text>
                    <Text>{viewingContract.remark}</Text>
                  </Col>
                )}
              </Row>
            </div>

            {/* 关联线路 */}
            {viewingContract.routes && viewingContract.routes.length > 0 && (
              <div style={{ background: "#f6ffed", padding: 16, borderRadius: 8, marginBottom: 16 }}>
                <Title level={5} style={{ marginTop: 0, marginBottom: 12, color: "#52c41a" }}>关联线路</Title>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {viewingContract.routes.map(r => (
                    <Tag key={r.id} color="green">
                      {r.localPartnerName && <span style={{ color: "#8c8c8c", marginRight: 4 }}>{r.localPartnerName} /</span>}
                      {r.routeName}
                    </Tag>
                  ))}
                </div>
              </div>
            )}
            
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
                      }}>{idx + 1}</span>
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

      {/* 创建/编辑合同弹窗 */}
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
        width={960}
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
        <Form form={createForm} layout="vertical" initialValues={{ settlementDay: 10, settlementCycle: "monthly" }}>
          {/* 基本信息区域 */}
          <div style={{ background: "#fafafa", padding: "16px 20px", borderRadius: 8, marginBottom: 24 }}>
            <Title level={5} style={{ marginTop: 0, marginBottom: 16, color: "#13c2c2" }}>基本信息</Title>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="financierId"
                  label="合作方"
                  rules={[{ required: true, message: "请选择合作方" }]}
                >
                  <Select
                    placeholder="请选择合作方"
                    showSearch
                    optionFilterProp="label"
                    loading={financiersLoading}
                    options={financiers.map(f => ({
                      value: f.id,
                      label: f.enterpriseName
                    }))}
                    onChange={handleFinancierChange}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="contractName" label="合同名称">
                  <Input placeholder="如：金罗抽成合作合同" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="customerSystemId" label="客户系统ID（选填）">
                  <Input placeholder="选择合作方后自动填充" />
                </Form.Item>
              </Col>
              <Form.Item name="customerName" hidden><Input /></Form.Item>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="contractDateRange"
                  label="合同时间"
                  rules={[{ required: true, message: "请选择合同时间范围" }]}
                >
                  <RangePicker style={{ width: "100%" }} placeholder={["开始日期", "结束日期"]} format="YYYY-MM-DD" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="settlementCycle" label="结算周期（选填）">
                  <Select
                    allowClear
                    options={[
                      { value: "monthly", label: "按月结算" },
                      { value: "biweekly", label: "半月结算" },
                      { value: "weekly", label: "按周结算" }
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="settlementDay" label="结算日（选填）">
                  <InputNumber min={1} max={28} style={{ width: "100%" }} placeholder="1-28日" addonAfter="日" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={18}>
                <Form.Item name="remark" label="备注">
                  <TextArea rows={2} placeholder="可选，填写合同相关备注信息" maxLength={500} showCount />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="isEnabled" label="合同状态" valuePropName="checked" initialValue={true}>
                  <Switch checkedChildren="启用" unCheckedChildren="停用" />
                </Form.Item>
              </Col>
            </Row>
          </div>

          {/* 关联线路区域 */}
          <div style={{ background: "#f6ffed", padding: "16px 20px", borderRadius: 8, marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <Title level={5} style={{ margin: 0, color: "#52c41a" }}>落地合作方 / 线路</Title>
              <Space>
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    lpForm.setFieldValue("financierId", selectedFinancierId);
                    setLpModalOpen(true);
                  }}
                  disabled={!selectedFinancierId}
                  title={!selectedFinancierId ? "请先选择合作方" : undefined}
                >
                  新建落地合作方
                </Button>
                <Button
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => setRouteModalOpen(true)}
                  disabled={filteredLocalPartners.length === 0}
                  title={filteredLocalPartners.length === 0 ? "请先新建落地合作方" : undefined}
                >
                  新建线路
                </Button>
              </Space>
            </div>

            <Form.Item name="routeIds">
              {routeTreeData.length > 0 ? (
                <Tree
                  checkable
                  checkedKeys={checkedRouteIds}
                  onCheck={(checked) => {
                    const checkedArr = Array.isArray(checked) ? checked : checked.checked;
                    const routeOnlyIds = (checkedArr as string[]).filter(k => !k.startsWith("lp_") && !k.startsWith("empty_"));
                    setCheckedRouteIds(routeOnlyIds);
                    createForm.setFieldValue("routeIds", routeOnlyIds);
                  }}
                  treeData={routeTreeData}
                  defaultExpandAll
                  style={{ background: "#fff", padding: 8, borderRadius: 6, border: "1px solid #d9f7be" }}
                />
              ) : (
                <div style={{
                  background: "#fff",
                  border: "1px dashed #d9d9d9",
                  borderRadius: 8,
                  padding: "24px 16px",
                  textAlign: "center",
                  color: "#8c8c8c"
                }}>
                  {selectedFinancierId
                    ? "该合作方下暂无落地合作方，请先点击「新建落地合作方」，再添加线路"
                    : "请先选择合作方，再配置落地合作方和线路"}
                </div>
              )}
            </Form.Item>
          </div>

          {/* 抽成配置区域 */}
          <div style={{ background: "#f0f9f9", padding: "16px 20px", borderRadius: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <Title level={5} style={{ margin: 0, color: "#13c2c2" }}>抽成配置</Title>
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
                    <Col flex="32px">
                      <span style={{
                        display: "inline-block",
                        width: 24, height: 24, lineHeight: "24px",
                        textAlign: "center",
                        background: item.fieldKey ? "#13c2c2" : "#d9d9d9",
                        color: "#fff", borderRadius: 4, fontSize: 12
                      }}>{index + 1}</span>
                    </Col>
                    <Col flex="140px">
                      <Select
                        value={item.fieldKey || undefined}
                        onChange={(val) => handleUpdateCard(item.id, { fieldKey: val })}
                        placeholder="选择费用类型"
                        style={{ width: "100%" }}
                        size="middle"
                        options={getAvailableFields(item.id).map(field => ({ value: field.key, label: field.label }))}
                      />
                    </Col>
                    <Col flex="160px">
                      <Radio.Group
                        value={item.mode}
                        onChange={(e) => handleUpdateCard(item.id, { mode: e.target.value, value: 0 })}
                        size="small"
                        style={{ width: "100%" }}
                        disabled={!item.fieldKey}
                      >
                        <Radio.Button value="percentage" style={{ width: "50%", textAlign: "center" }}>
                          <PercentIcon style={{ marginRight: 2 }} />比例
                        </Radio.Button>
                        <Radio.Button value="fixed" style={{ width: "50%", textAlign: "center" }}>
                          <DollarOutlined style={{ marginRight: 2 }} />固定
                        </Radio.Button>
                      </Radio.Group>
                    </Col>
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
                    <Col flex="60px" style={{ textAlign: "right" }}>
                      <Button 
                        type="text" danger size="small"
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
                onMouseEnter={(e) => { e.currentTarget.style.background = "#f0f9f9"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
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
                <Button type="link" onClick={handleAddCard} style={{ color: "#13c2c2" }}>
                  + 点击添加抽成配置
                </Button>
              </div>
            )}
            
            {getAvailableFields().length > 0 && commissionItems.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#8c8c8c" }}>
                可选字段：{getAvailableFields().map(f => f.label).join("、")}
              </div>
            )}
          </div>
        </Form>
      </Modal>

      {/* 新建落地合作方弹窗 */}
      <Modal
        title="新建落地合作方"
        open={lpModalOpen}
        onCancel={() => { setLpModalOpen(false); lpForm.resetFields(); }}
        onOk={handleCreateLP}
        okText="创建"
        cancelText="取消"
        zIndex={1100}
      >
        <Form form={lpForm} layout="vertical">
          <Form.Item name="financierId" label="所属合作方" rules={[{ required: true, message: "请选择合作方" }]}>
            <Select
              options={financiers.map(f => ({ value: f.id, label: f.enterpriseName }))}
              placeholder="请选择合作方"
            />
          </Form.Item>
          <Form.Item name="name" label="落地合作方名称" rules={[{ required: true, message: "请输入名称" }]}>
            <Input placeholder="如：重庆XX物流" />
          </Form.Item>
          <Form.Item name="areaId" label="所属区域">
            <Select
              allowClear
              options={areas
                .filter(a => {
                  const fid = lpForm.getFieldValue("financierId");
                  return !fid || a.financierId === fid;
                })
                .map(a => ({ value: a.id, label: a.name }))}
              placeholder="可不选，默认无区域"
            />
          </Form.Item>
          <Form.Item name="contactPerson" label="联系人">
            <Input placeholder="选填" />
          </Form.Item>
          <Form.Item name="contactPhone" label="联系电话">
            <Input placeholder="选填" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <TextArea rows={2} placeholder="选填" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 新建区域弹窗 */}
      <Modal
        title="新建区域"
        open={areaModalOpen}
        onCancel={() => { setAreaModalOpen(false); areaForm.resetFields(); }}
        onOk={handleCreateArea}
        okText="创建"
        cancelText="取消"
        zIndex={1100}
      >
        <Form form={areaForm} layout="vertical">
          <Form.Item name="financierId" label="所属合作方" rules={[{ required: true, message: "请选择合作方" }]}>
            <Select
              options={financiers.map(f => ({ value: f.id, label: f.enterpriseName }))}
              placeholder="请选择合作方"
            />
          </Form.Item>
          <Form.Item name="name" label="区域名称" rules={[{ required: true, message: "请输入区域名称" }]}>
            <Input placeholder="如：西南大区" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <TextArea rows={2} placeholder="选填" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 新建线路弹窗 */}
      <Modal
        title="新建线路"
        open={routeModalOpen}
        onCancel={() => { setRouteModalOpen(false); routeForm.resetFields(); }}
        onOk={handleCreateRoute}
        okText="创建"
        cancelText="取消"
        zIndex={1100}
      >
        <Form form={routeForm} layout="vertical">
          <Form.Item name="localPartnerId" label="所属落地合作方" rules={[{ required: true, message: "请选择落地合作方" }]}>
            <Select
              options={(manageModalOpen ? localPartners : filteredLocalPartners).map(lp => ({ value: lp.id, label: lp.name }))}
              placeholder="选择落地合作方"
            />
          </Form.Item>
          <Form.Item name="name" label="线路名称" rules={[{ required: true, message: "请输入线路名称" }]}>
            <Input placeholder="如：重庆-山东A线" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <TextArea rows={2} placeholder="选填" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 管理落地合作方/线路弹窗 */}
      <Modal
        title="管理落地合作方与线路"
        open={manageModalOpen}
        onCancel={() => setManageModalOpen(false)}
        footer={[<Button key="close" onClick={() => setManageModalOpen(false)}>关闭</Button>]}
        width={800}
      >
        <Tabs
          items={[
            {
              key: "areas",
              label: "区域",
              children: (
                <div>
                  <div style={{ marginBottom: 16 }}>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      size="small"
                      onClick={() => {
                        areaForm.resetFields();
                        setAreaModalOpen(true);
                      }}
                    >
                      新建
                    </Button>
                  </div>
                  <Table
                    dataSource={areas}
                    rowKey="id"
                    size="small"
                    pagination={false}
                    columns={[
                      { title: "区域名称", dataIndex: "name", key: "name" },
                      { title: "所属合作方", dataIndex: "financierName", key: "financierName" },
                      {
                        title: "操作",
                        key: "actions",
                        width: 120,
                        render: (_: any, record: Area) => (
                          <Space size={0}>
                            <Button type="link" size="small" onClick={() => {
                              Modal.confirm({
                                title: "编辑区域",
                                content: <Input id="edit-area-name" defaultValue={record.name} style={{ marginTop: 8 }} />,
                                onOk: async () => {
                                  const input = document.getElementById("edit-area-name") as HTMLInputElement;
                                  const newName = input?.value?.trim();
                                  if (!newName || !token) return;
                                  await updateAreaApi(token, record.id, { name: newName });
                                  message.success("已修改");
                                  await loadAreas();
                                  await loadLocalPartners();
                                },
                              });
                            }}>编辑</Button>
                            <Popconfirm
                              title="确认删除区域？该区域下落地合作方将回到无区域"
                              onConfirm={async () => {
                                if (!token) return;
                                await deleteAreaApi(token, record.id);
                                message.success("已删除");
                                await loadAreas();
                                await loadLocalPartners();
                              }}
                            >
                              <Button type="link" size="small" danger>删除</Button>
                            </Popconfirm>
                          </Space>
                        ),
                      },
                    ]}
                  />
                </div>
              ),
            },
            {
              key: "local-partners",
              label: "落地合作方",
              children: (
                <div>
                  <div style={{ marginBottom: 16 }}>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      size="small"
                      onClick={() => {
                        lpForm.resetFields();
                        setLpModalOpen(true);
                      }}
                      style={{ backgroundColor: "#13c2c2", borderColor: "#13c2c2" }}
                    >
                      新建
                    </Button>
                  </div>
                  <Table
                    dataSource={localPartners}
                    rowKey="id"
                    size="small"
                    pagination={false}
                    columns={[
                      { title: "名称", dataIndex: "name", key: "name" },
                      { title: "区域", dataIndex: "areaName", key: "areaName", render: (v: string) => v || <Tag>无区域</Tag> },
                      { title: "所属合作方", dataIndex: "financierName", key: "financierName" },
                      { title: "联系人", dataIndex: "contactPerson", key: "contactPerson" },
                      { title: "电话", dataIndex: "contactPhone", key: "contactPhone" },
                      {
                        title: "操作",
                        key: "actions",
                        width: 120,
                        render: (_: any, record: LocalPartner) => (
                          <Space size={0}>
                            <Button type="link" size="small" onClick={() => {
                              Modal.confirm({
                                title: "编辑落地合作方",
                                content: (
                                  <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                                    <Input id="edit-lp-name" defaultValue={record.name} />
                                    <select
                                      id="edit-lp-area"
                                      defaultValue={record.areaId || ""}
                                      style={{ width: "100%", height: 32, border: "1px solid #d9d9d9", borderRadius: 6, padding: "0 8px" }}
                                    >
                                      <option value="">无区域</option>
                                      {areas
                                        .filter(a => a.financierId === record.financierId)
                                        .map(a => (
                                          <option key={a.id} value={a.id}>{a.name}</option>
                                        ))}
                                    </select>
                                  </div>
                                ),
                                onOk: async () => {
                                  const input = document.getElementById("edit-lp-name") as HTMLInputElement;
                                  const newName = input?.value?.trim();
                                  const areaSel = document.getElementById("edit-lp-area") as HTMLInputElement;
                                  if (!newName || !token) return;
                                  await updateLocalPartnerApi(token, record.id, {
                                    name: newName,
                                    areaId: (areaSel as any)?.value || null,
                                  });
                                  message.success("已修改");
                                  await loadLocalPartners();
                                  await loadRoutes();
                                },
                              });
                            }}>编辑</Button>
                            <Popconfirm
                              title="确认删除？相关线路也会一同删除"
                              onConfirm={async () => {
                                if (!token) return;
                                await deleteLocalPartnerApi(token, record.id);
                                message.success("已删除");
                                await loadLocalPartners();
                                await loadRoutes();
                              }}
                            >
                              <Button type="link" size="small" danger>删除</Button>
                            </Popconfirm>
                          </Space>
                        )
                      }
                    ]}
                  />
                </div>
              )
            },
            {
              key: "routes",
              label: "线路",
              children: (
                <div>
                  <div style={{ marginBottom: 16 }}>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      size="small"
                      onClick={() => {
                        routeForm.resetFields();
                        setRouteModalOpen(true);
                      }}
                      style={{ backgroundColor: "#52c41a", borderColor: "#52c41a" }}
                    >
                      新建
                    </Button>
                  </div>
                  <Table
                    dataSource={routes}
                    rowKey="id"
                    size="small"
                    pagination={false}
                    columns={[
                      { title: "线路名称", dataIndex: "name", key: "name" },
                      { title: "区域", dataIndex: "areaName", key: "areaName", render: (v: string) => v || <Tag>无区域</Tag> },
                      { title: "所属落地合作方", dataIndex: "localPartnerName", key: "localPartnerName" },
                      {
                        title: "操作",
                        key: "actions",
                        width: 120,
                        render: (_: any, record: RouteItem) => (
                          <Space size={0}>
                            <Button type="link" size="small" onClick={() => {
                              Modal.confirm({
                                title: "编辑线路",
                                content: (
                                  <Input id="edit-route-name" defaultValue={record.name} style={{ marginTop: 8 }} />
                                ),
                                onOk: async () => {
                                  const input = document.getElementById("edit-route-name") as HTMLInputElement;
                                  const newName = input?.value?.trim();
                                  if (!newName || !token) return;
                                  await updateRouteApi(token, record.id, { name: newName });
                                  message.success("已修改");
                                  await loadRoutes();
                                },
                              });
                            }}>编辑</Button>
                            <Popconfirm
                              title="确认删除？"
                              onConfirm={async () => {
                                if (!token) return;
                                await deleteRouteApi(token, record.id);
                              message.success("已删除");
                              await loadRoutes();
                            }}
                          >
                            <Button type="link" size="small" danger>删除</Button>
                          </Popconfirm>
                          </Space>
                        )
                      }
                    ]}
                  />
                </div>
              )
            }
          ]}
        />
      </Modal>
    </div>
  );
}

export default NewContractsPage;
