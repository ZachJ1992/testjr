import {
  createFinancierApi,
  deleteFinancierApi,
  fetchFinanciers,
  fetchFinancierById,
  getErrorMessage,
  updateFinancierApi,
  uploadFileApi,
  fetchExternalSystems,
  createExternalSystemApi,
  updateExternalSystemApi,
  deleteExternalSystemApi,
  fetchCrawlerConfigs,
  createCrawlerConfigApi,
  updateCrawlerConfigApi,
  deleteCrawlerConfigApi,
  testCrawlerConnectionApi,
  triggerCrawlerSyncApi,
  fetchCrawlerLogsApi,
  fetchCrawlerTemplates,
  triggerExternalSystemSync,
  testExternalSystemConnection,
} from "../api";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import { 
  Financier, 
  FinancierScale, 
  FinancierStatus, 
  ExternalSystemConfig,
  CrawlerConfig,
  CrawlerSyncLog,
  SYNC_INTERVAL_OPTIONS,
  CRAWLER_SYNC_STATUS_CONFIG,
  CrawlerSyncStatus,
  CrawlerTemplateMeta,
  IntegrationType,
} from "../types";
import {
  Button,
  Input,
  InputNumber,
  Modal,
  Drawer,
  Result,
  Space,
  Tag,
  Typography,
  message,
  Form,
  Upload,
  Radio,
  Tabs,
  Empty,
  Row,
  Col,
  Image,
  Table,
  Switch,
  Select,
  Popconfirm,
  Tooltip,
  Card,
  Spin,
  Timeline,
  Divider
} from "antd";
import { 
  FileTextOutlined, 
  EyeOutlined, 
  EditOutlined, 
  PlusOutlined, 
  SearchOutlined,
  InboxOutlined,
  SaveOutlined,
  ApiOutlined,
  DeleteOutlined,
  SyncOutlined,
  CloudSyncOutlined,
  LinkOutlined,
  HistoryOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  ClockCircleOutlined,
  PlayCircleOutlined
} from "@ant-design/icons";
import { useEffect, useState } from "react";
import DataTable from "../components/DataTable";

type FinancierFormValues = {
  enterpriseName: string;
  unifiedSocialCreditCode: string;
  legalRepresentative: string;
  businessAddress: string;
  operatingScale?: FinancierScale;
  initialCreditAmount?: number;
  businessLicenseUrl?: string;
  roadTransportLicenseUrl?: string;
  legalPersonIdCardUrl?: string;
};

function FinanciersPage() {
  const { token, user } = useAuth();
  const { t } = useI18n();
  
  const [financiers, setFinanciers] = useState<Financier[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Financier | null>(null);
  const [form] = Form.useForm<FinancierFormValues>();
  const [activeTab, setActiveTab] = useState("basic");
  const [uploading, setUploading] = useState<{ [key: string]: boolean }>({});
  const [fileList, setFileList] = useState<{ [key: string]: any[] }>({
    businessLicenseUrl: [],
    roadTransportLicenseUrl: [],
    legalPersonIdCardUrl: []
  });
  const [unifiedSocialCreditCodeLength, setUnifiedSocialCreditCodeLength] = useState(0);
  // 查看模式标记（复用编辑页面但字段只读，后续可配置可编辑字段范围）
  const [viewMode, setViewMode] = useState(false);
  
  // 外部系统配置相关状态
  const [externalSystemDrawerOpen, setExternalSystemDrawerOpen] = useState(false);
  const [currentFinancierForExternal, setCurrentFinancierForExternal] = useState<Financier | null>(null);
  const [externalSystems, setExternalSystems] = useState<ExternalSystemConfig[]>([]);
  const [externalSystemLoading, setExternalSystemLoading] = useState(false);
  const [externalSystemModalOpen, setExternalSystemModalOpen] = useState(false);
  const [editingExternalSystem, setEditingExternalSystem] = useState<ExternalSystemConfig | null>(null);
  const [externalSystemForm] = Form.useForm();
  
  // 预设的外部系统选项
  const presetSystems = [
    { value: "TMS运输管理系统", label: "TMS运输管理系统" },
    { value: "WMS仓储管理系统", label: "WMS仓储管理系统" },
    { value: "ERP企业资源系统", label: "ERP企业资源系统" },
    { value: "custom", label: "自定义" }
  ];
  const [selectedSystemType, setSelectedSystemType] = useState<string>("TMS运输管理系统");
  
  // 爬虫模板相关状态
  const [crawlerTemplates, setCrawlerTemplates] = useState<CrawlerTemplateMeta[]>([]);
  const [selectedIntegrationType, setSelectedIntegrationType] = useState<IntegrationType>("manual");
  const [selectedCrawlerTemplate, setSelectedCrawlerTemplate] = useState<string>("");
  const [testingExternalConnection, setTestingExternalConnection] = useState(false);
  const [syncingExternalId, setSyncingExternalId] = useState<string | null>(null);
  
  // 爬虫数据源配置相关状态
  const [crawlerDrawerOpen, setCrawlerDrawerOpen] = useState(false);
  const [currentFinancierForCrawler, setCurrentFinancierForCrawler] = useState<Financier | null>(null);
  const [crawlerConfigs, setCrawlerConfigs] = useState<CrawlerConfig[]>([]);
  const [crawlerLoading, setCrawlerLoading] = useState(false);
  const [crawlerModalOpen, setCrawlerModalOpen] = useState(false);
  const [editingCrawler, setEditingCrawler] = useState<CrawlerConfig | null>(null);
  const [crawlerForm] = Form.useForm();
  const [testingConnection, setTestingConnection] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  
  // 同步日志抽屉状态
  const [logDrawerOpen, setLogDrawerOpen] = useState(false);
  const [currentCrawlerForLog, setCurrentCrawlerForLog] = useState<CrawlerConfig | null>(null);
  const [crawlerLogs, setCrawlerLogs] = useState<CrawlerSyncLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  
  // 定义可编辑字段配置（后续可扩展为从配置中读取）
  const editableFields = {
    // 在查看模式下，所有字段都不可编辑
    // 在编辑模式下，根据此配置决定哪些字段可编辑
    enterpriseName: !viewMode,
    unifiedSocialCreditCode: !viewMode,
    legalRepresentative: !viewMode,
    businessAddress: !viewMode,
    operatingScale: !viewMode,
    initialCreditAmount: !viewMode,
    businessLicenseUrl: !viewMode,
    roadTransportLicenseUrl: !viewMode,
    legalPersonIdCardUrl: !viewMode,
  };

  const refresh = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetchFinanciers(token);
      // 前端过滤搜索（搜索企业名称或法人）
      let filteredData = res.financiers;
      if (searchText) {
        filteredData = res.financiers.filter(
          (f) =>
            f.enterpriseName.includes(searchText) ||
            f.legalRepresentative.includes(searchText)
        );
      }
      setFinanciers(filteredData);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, searchText]);
  
  // 加载爬虫模板列表
  useEffect(() => {
    const loadTemplates = async () => {
      if (!token) return;
      try {
        const templates = await fetchCrawlerTemplates(token);
        setCrawlerTemplates(templates);
      } catch (err) {
        console.error("加载爬虫模板失败:", err);
      }
    };
    void loadTemplates();
  }, [token]);

  // 外部系统配置相关函数
  const loadExternalSystems = async (financierId: string) => {
    if (!token) return;
    setExternalSystemLoading(true);
    try {
      const res = await fetchExternalSystems(token, financierId);
      setExternalSystems(res.systems);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setExternalSystemLoading(false);
    }
  };

  const openExternalSystemDrawer = async (financier: Financier) => {
    setCurrentFinancierForExternal(financier);
    setExternalSystemDrawerOpen(true);
    await loadExternalSystems(financier.id);
  };

  const closeExternalSystemDrawer = () => {
    setExternalSystemDrawerOpen(false);
    setCurrentFinancierForExternal(null);
    setExternalSystems([]);
  };

  const openExternalSystemModal = (system?: ExternalSystemConfig) => {
    setEditingExternalSystem(system || null);
    if (system) {
      const isPreset = presetSystems.some(p => p.value === system.systemName && p.value !== "custom");
      setSelectedSystemType(isPreset ? system.systemName : "custom");
      setSelectedIntegrationType(system.integrationType || "manual");
      setSelectedCrawlerTemplate(system.crawlerType || "");
      
      externalSystemForm.setFieldsValue({
        systemName: system.systemName,
        customSystemName: isPreset ? "" : system.systemName,
        systemId: system.systemId,
        apiEndpoint: system.apiEndpoint,
        apiKey: system.apiKey,
        syncEnabled: system.syncEnabled,
        integrationType: system.integrationType || "manual",
        crawlerType: system.crawlerType,
        syncIntervalMinutes: system.syncIntervalMinutes || 360,
        // 爬虫配置参数
        ...(system.crawlerConfig || {}),
      });
    } else {
      setSelectedSystemType("TMS运输管理系统");
      setSelectedIntegrationType("manual");
      setSelectedCrawlerTemplate("");
      externalSystemForm.resetFields();
      externalSystemForm.setFieldsValue({
        systemName: "TMS运输管理系统",
        syncEnabled: false,
        integrationType: "manual",
        syncIntervalMinutes: 360,
      });
    }
    setExternalSystemModalOpen(true);
  };

  const handleExternalSystemSave = async () => {
    if (!token || !currentFinancierForExternal) return;
    try {
      const values = await externalSystemForm.validateFields();
      const systemName = selectedSystemType === "custom" ? values.customSystemName : selectedSystemType;
      
      // 构建爬虫配置参数
      let crawlerConfig: Record<string, any> | undefined = undefined;
      if (selectedIntegrationType === "crawler" && selectedCrawlerTemplate) {
        const template = crawlerTemplates.find(t => t.id === selectedCrawlerTemplate);
        if (template) {
          crawlerConfig = {};
          for (const field of template.requiredFields) {
            if (values[field.key] !== undefined) {
              crawlerConfig[field.key] = values[field.key];
            }
          }
        }
      }
      
      const payload = {
        systemName,
        systemId: values.systemId,
        apiEndpoint: values.apiEndpoint,
        apiKey: values.apiKey,
        syncEnabled: values.syncEnabled,
        integrationType: selectedIntegrationType,
        crawlerType: selectedIntegrationType === "crawler" ? selectedCrawlerTemplate : undefined,
        crawlerConfig,
        syncIntervalMinutes: values.syncIntervalMinutes || 360,
      };
      
      if (editingExternalSystem) {
        await updateExternalSystemApi(token, currentFinancierForExternal.id, editingExternalSystem.id, payload);
        message.success(t("external_systems.update_success", "外部系统配置更新成功"));
      } else {
        await createExternalSystemApi(token, currentFinancierForExternal.id, payload);
        message.success(t("external_systems.create_success", "外部系统配置添加成功"));
      }
      
      setExternalSystemModalOpen(false);
      await loadExternalSystems(currentFinancierForExternal.id);
    } catch (err) {
      // 处理表单验证错误
      if (err && typeof err === 'object' && 'errorFields' in err) {
        return; // 表单验证失败，错误已显示在字段旁
      }
      message.error(getErrorMessage(err));
    }
  };
  
  // 触发外部系统同步
  const handleTriggerExternalSync = async (system: ExternalSystemConfig) => {
    if (!token) return;
    setSyncingExternalId(system.id);
    try {
      const result = await triggerExternalSystemSync(token, system.id);
      if (result.success) {
        message.success(result.message || "同步任务已启动");
      } else {
        message.error(result.message || "同步失败");
      }
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setSyncingExternalId(null);
    }
  };
  
  // 测试外部系统连接
  const handleTestExternalConnection = async (system: ExternalSystemConfig) => {
    if (!token) return;
    setTestingExternalConnection(true);
    try {
      const result = await testExternalSystemConnection(token, system.id);
      if (result.success) {
        message.success(result.message || "连接测试成功");
      } else {
        message.error(result.message || "连接测试失败");
      }
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setTestingExternalConnection(false);
    }
  };

  const handleExternalSystemDelete = async (systemId: string) => {
    if (!token || !currentFinancierForExternal) return;
    try {
      await deleteExternalSystemApi(token, currentFinancierForExternal.id, systemId);
      message.success(t("external_systems.delete_success", "外部系统配置删除成功"));
      await loadExternalSystems(currentFinancierForExternal.id);
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  // ========== 爬虫数据源配置相关函数 ==========
  
  // 加载爬虫配置列表
  const loadCrawlerConfigs = async (financierId: string) => {
    if (!token) return;
    setCrawlerLoading(true);
    try {
      const res = await fetchCrawlerConfigs(token, financierId);
      setCrawlerConfigs(res.configs || []);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setCrawlerLoading(false);
    }
  };

  // 打开爬虫配置抽屉
  const openCrawlerDrawer = async (financier: Financier) => {
    setCurrentFinancierForCrawler(financier);
    setCrawlerDrawerOpen(true);
    await loadCrawlerConfigs(financier.id);
  };

  // 关闭爬虫配置抽屉
  const closeCrawlerDrawer = () => {
    setCrawlerDrawerOpen(false);
    setCurrentFinancierForCrawler(null);
    setCrawlerConfigs([]);
  };

  // 打开爬虫配置编辑模态框
  const openCrawlerModal = (config?: CrawlerConfig) => {
    setEditingCrawler(config || null);
    if (config) {
      crawlerForm.setFieldsValue({
        name: config.name,
        systemUrl: config.systemUrl,
        apiEndpoint: config.apiEndpoint,
        cookies: config.cookies,
        companyId: config.companyId,
        userId: config.userId,
        groupId: config.groupId,
        syncIntervalMinutes: config.syncIntervalMinutes,
        syncEnabled: config.syncEnabled
      });
    } else {
      crawlerForm.resetFields();
      crawlerForm.setFieldsValue({
        apiEndpoint: "/api/Table/Search/batchList",
        syncIntervalMinutes: 60,
        syncEnabled: true
      });
    }
    setCrawlerModalOpen(true);
  };

  // 保存爬虫配置
  const handleCrawlerSave = async () => {
    if (!token || !currentFinancierForCrawler) return;
    try {
      const values = await crawlerForm.validateFields();
      
      if (editingCrawler) {
        await updateCrawlerConfigApi(token, editingCrawler.id, values);
        message.success(t("crawler.update_success", "数据源配置更新成功"));
      } else {
        await createCrawlerConfigApi(token, {
          financierId: currentFinancierForCrawler.id,
          ...values
        });
        message.success(t("crawler.create_success", "数据源配置创建成功"));
      }
      
      setCrawlerModalOpen(false);
      await loadCrawlerConfigs(currentFinancierForCrawler.id);
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) {
        return;
      }
      message.error(getErrorMessage(err));
    }
  };

  // 删除爬虫配置
  const handleCrawlerDelete = async (configId: string) => {
    if (!token || !currentFinancierForCrawler) return;
    try {
      await deleteCrawlerConfigApi(token, configId);
      message.success(t("crawler.delete_success", "数据源配置删除成功"));
      await loadCrawlerConfigs(currentFinancierForCrawler.id);
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  // 测试连接
  const handleTestConnection = async () => {
    if (!token) return;
    setTestingConnection(true);
    try {
      const values = await crawlerForm.validateFields(['systemUrl', 'apiEndpoint', 'cookies']);
      const result = await testCrawlerConnectionApi(token, {
        systemUrl: values.systemUrl,
        apiEndpoint: values.apiEndpoint,
        cookies: values.cookies,
        companyId: values.companyId,
        userId: values.userId,
        groupId: values.groupId
      });
      
      if (result.success) {
        message.success(t("crawler.test_success", "连接测试成功") + (result.sampleCount ? `，获取到 ${result.sampleCount} 条样例数据` : ""));
      } else {
        message.error(t("crawler.test_failed", "连接测试失败") + `: ${result.message}`);
      }
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) {
        message.warning(t("crawler.fill_required_fields", "请先填写系统地址、API路径和Cookie"));
        return;
      }
      message.error(getErrorMessage(err));
    } finally {
      setTestingConnection(false);
    }
  };

  // 手动触发同步
  const handleTriggerSync = async (configId: string) => {
    if (!token || !currentFinancierForCrawler) return;
    setSyncingId(configId);
    try {
      const result = await triggerCrawlerSyncApi(token, configId);
      if (result.success) {
        message.success(t("crawler.sync_success", "同步完成") + `：获取 ${result.totalFetched} 条，新增 ${result.newCount} 条`);
      } else {
        message.error(t("crawler.sync_failed", "同步失败") + (result.errors?.length ? `: ${result.errors[0]}` : ""));
      }
      await loadCrawlerConfigs(currentFinancierForCrawler.id);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setSyncingId(null);
    }
  };

  // 打开同步日志抽屉
  const openLogDrawer = async (config: CrawlerConfig) => {
    setCurrentCrawlerForLog(config);
    setLogDrawerOpen(true);
    setLogsLoading(true);
    try {
      if (!token) return;
      const res = await fetchCrawlerLogsApi(token, config.id, 50);
      setCrawlerLogs(res.logs || []);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setLogsLoading(false);
    }
  };

  // 关闭同步日志抽屉
  const closeLogDrawer = () => {
    setLogDrawerOpen(false);
    setCurrentCrawlerForLog(null);
    setCrawlerLogs([]);
  };

  // 获取同步状态图标
  const getSyncStatusIcon = (status: CrawlerSyncStatus | undefined) => {
    if (!status || status === 'never') return <ClockCircleOutlined style={{ color: '#8c8c8c' }} />;
    if (status === 'success') return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
    if (status === 'running') return <LoadingOutlined style={{ color: '#1890ff' }} spin />;
    if (status === 'failed') return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
    return <ClockCircleOutlined style={{ color: '#8c8c8c' }} />;
  };

  // 格式化同步间隔显示
  const formatSyncInterval = (minutes: number) => {
    const option = SYNC_INTERVAL_OPTIONS.find(o => o.value === minutes);
    return option?.label || `每${minutes}分钟`;
  };

  // 计算使用率
  const calculateUsageRate = (total: number, remaining: number): number => {
    if (total === 0) return 0;
    return ((total - remaining) / total) * 100;
  };

  // 格式化金额（万元）
  const formatAmount = (amount: number): string => {
    return `¥${(amount / 10000).toLocaleString()}万`;
  };

  // 获取完整的文件URL
  const getFullFileUrl = (url: string | undefined): string => {
    if (!url) return '';
    // 如果已经是完整URL，直接返回
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    // 否则添加API基础URL（自动检测主机名）
    const hostname = window.location.hostname;
    const API_BASE = import.meta.env.VITE_API_BASE || `http://${hostname}:3001/api`;
    return `${API_BASE}${url.startsWith('/') ? url : `/${url}`}`;
  };

  const openCreate = () => {
    setEditing(null);
    setViewMode(false);
    form.resetFields();
    setActiveTab("basic");
    setFileList({
      businessLicenseUrl: [],
      roadTransportLicenseUrl: [],
      legalPersonIdCardUrl: []
    });
    setUnifiedSocialCreditCodeLength(0);
    setModalOpen(true);
  };

  // 打开编辑/查看面板的通用函数
  const openFinancierPanel = async (record: Financier, isViewMode: boolean) => {
    if (!token) return;
    try {
      // 重新获取最新数据
      const res = await fetchFinancierById(token, record.id);
      const financier = res.financier;
      setEditing(financier);
      setViewMode(isViewMode);
      form.setFieldsValue({
        enterpriseName: financier.enterpriseName,
        unifiedSocialCreditCode: financier.unifiedSocialCreditCode,
        legalRepresentative: financier.legalRepresentative,
        businessAddress: financier.businessAddress,
        operatingScale: financier.operatingScale,
        initialCreditAmount: financier.totalCreditLimit,
        businessLicenseUrl: financier.businessLicenseUrl,
        roadTransportLicenseUrl: financier.roadTransportLicenseUrl,
        legalPersonIdCardUrl: financier.legalPersonIdCardUrl
      });
      setUnifiedSocialCreditCodeLength(financier.unifiedSocialCreditCode.length);
      // 设置文件列表
      const getFilename = (url: string | undefined) => {
        return url ? url.split('/').pop() || '已上传文件' : '已上传文件';
      };
      setFileList({
        businessLicenseUrl: financier.businessLicenseUrl ? [{
          uid: financier.id + '-business',
          name: getFilename(financier.businessLicenseUrl),
          status: 'done' as const,
          url: financier.businessLicenseUrl
        }] : [],
        roadTransportLicenseUrl: financier.roadTransportLicenseUrl ? [{
          uid: financier.id + '-road',
          name: getFilename(financier.roadTransportLicenseUrl),
          status: 'done' as const,
          url: financier.roadTransportLicenseUrl
        }] : [],
        legalPersonIdCardUrl: financier.legalPersonIdCardUrl ? [{
          uid: financier.id + '-id',
          name: getFilename(financier.legalPersonIdCardUrl),
          status: 'done' as const,
          url: financier.legalPersonIdCardUrl
        }] : []
      });
      setActiveTab("basic");
      setModalOpen(true);
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const openEdit = async (record: Financier) => {
    await openFinancierPanel(record, false);
  };

  const openView = async (record: Financier) => {
    await openFinancierPanel(record, true);
  };

  const handleSave = async (isDraft: boolean = false) => {
    if (!token) return;
    try {
      // 如果是草稿，不验证必填项
      const values = isDraft 
        ? await form.validateFields().catch(() => form.getFieldsValue())
        : await form.validateFields();
      
      // 如果不是草稿，必须填写所有必填项
      if (!isDraft) {
        if (!values.enterpriseName || !values.unifiedSocialCreditCode || 
            !values.legalRepresentative || !values.businessAddress ||
            !values.operatingScale || values.initialCreditAmount === undefined ||
            !values.businessLicenseUrl || !values.roadTransportLicenseUrl ||
            !values.legalPersonIdCardUrl) {
          message.warning(t("financiers.fill_required_fields", "请填写所有必填项"));
          return;
        }
      }

      if (editing) {
        // 编辑模式
        await updateFinancierApi(token, editing.id, {
          enterpriseName: values.enterpriseName,
          unifiedSocialCreditCode: values.unifiedSocialCreditCode,
          legalRepresentative: values.legalRepresentative,
          businessAddress: values.businessAddress,
          operatingScale: values.operatingScale,
          businessLicenseUrl: values.businessLicenseUrl,
          roadTransportLicenseUrl: values.roadTransportLicenseUrl,
          legalPersonIdCardUrl: values.legalPersonIdCardUrl,
          totalCreditLimit: values.initialCreditAmount
        });
        message.success(t("common.saved", "已保存"));
      } else {
        // 新增模式
        await createFinancierApi(token, {
          enterpriseName: values.enterpriseName || "",
          unifiedSocialCreditCode: values.unifiedSocialCreditCode || "",
          legalRepresentative: values.legalRepresentative || "",
          businessAddress: values.businessAddress || "",
          operatingScale: values.operatingScale || "medium",
          initialCreditAmount: values.initialCreditAmount || 0,
          businessLicenseUrl: values.businessLicenseUrl,
          roadTransportLicenseUrl: values.roadTransportLicenseUrl,
          legalPersonIdCardUrl: values.legalPersonIdCardUrl
        });
        message.success(t("financiers.created", "已创建"));
      }
      
      setModalOpen(false);
      await refresh();
    } catch (err) {
      // 忽略表单验证错误（antd 已在字段下方显示）
      if (err && typeof err === 'object' && 'errorFields' in err) {
        return;
      }
      if (!isDraft) {
        message.error(getErrorMessage(err));
      }
    }
  };

  const handleDelete = (record: Financier) => {
    if (!token) return;
    const content = t(
      "financiers.delete_confirm_content",
      `确定要删除融资方 "{name}" 吗？此操作不可恢复。`
    ).replace("{name}", record.enterpriseName);
    Modal.confirm({
      title: t("common.confirm_delete", "确认删除？"),
      content: content,
      okButtonProps: { danger: true },
      okText: t("common.confirm", "确认"),
      cancelText: t("common.cancel", "取消"),
      onOk: async () => {
        try {
          await deleteFinancierApi(token, record.id);
          message.success(t("common.deleted", "已删除"));
          await refresh();
        } catch (err) {
          message.error(getErrorMessage(err));
        }
      }
    });
  };

  if (!user?.permissions?.includes("manage_financiers")) {
    return (
      <Result
        status="403"
        title={t("common.no_permission", "无权限")}
        subTitle={t("financiers.no_access", "需要 manage_financiers 权限")}
      />
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* 标题和副标题 */}
      <div style={{ marginBottom: 24 }}>
        <Typography.Title level={2} style={{ margin: 0, marginBottom: 8 }}>
          {t("financiers.title", "融资方档案")}
        </Typography.Title>
        <Typography.Text type="secondary">
          {t("financiers.subtitle", "管理物流企业基础信息与授信情况")}
        </Typography.Text>
      </div>

      {/* 搜索栏和新增按钮 */}
      <Space style={{ marginBottom: 16, width: "100%", justifyContent: "space-between" }}>
        <Input
          placeholder={t("financiers.search_placeholder", "搜索企业名称或法人...")}
          prefix={<SearchOutlined />}
          style={{ width: 400 }}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onPressEnter={refresh}
          allowClear
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          {t("financiers.add", "新增融资方")}
        </Button>
      </Space>

      {/* 数据表格 */}
      <DataTable<Financier>
        rowKey="id"
        loading={loading}
        data={financiers}
        pagination={{ pageSize: 10 }}
        columns={[
          {
            title: t("financiers.enterprise_name", "企业名称"),
            dataIndex: "enterpriseName",
            render: (name: string, record: Financier) => {
              const usageRate = calculateUsageRate(
                record.totalCreditLimit,
                record.remainingCreditLimit
              );
              return (
                <div>
                  <Space>
                    <FileTextOutlined style={{ color: "#1890ff" }} />
                    <span>{name}</span>
                  </Space>
                  <div style={{ fontSize: 12, color: "#8c8c8c", marginTop: 4 }}>
                    {t("financiers.usage_rate", "使用率")}: {usageRate.toFixed(1)}%
                  </div>
                </div>
              );
            },
            sorter: (a, b) => a.enterpriseName.localeCompare(b.enterpriseName),
            filterConfig: {
              type: "input",
              placeholder: t("financiers.enterprise_name", "企业名称")
            }
          },
          {
            title: t("financiers.legal_representative", "法人"),
            dataIndex: "legalRepresentative",
            sorter: (a, b) => a.legalRepresentative.localeCompare(b.legalRepresentative),
            filterConfig: {
              type: "input",
              placeholder: t("financiers.legal_representative", "法人")
            }
          },
          {
            title: t("financiers.operating_scale", "经营规模"),
            dataIndex: "operatingScale",
            render: (scale: FinancierScale) => {
              const scaleMap: Record<FinancierScale, string> = {
                large: t("financiers.scale_large", "大型"),
                medium: t("financiers.scale_medium", "中型"),
                small: t("financiers.scale_small", "小型")
              };
              return scaleMap[scale] || scale;
            },
            filterConfig: {
              type: "select",
              placeholder: t("financiers.operating_scale", "经营规模"),
              options: [
                { label: t("financiers.scale_large", "大型"), value: "large" },
                { label: t("financiers.scale_medium", "中型"), value: "medium" },
                { label: t("financiers.scale_small", "小型"), value: "small" }
              ]
            }
          },
          {
            title: t("financiers.total_credit_limit", "总授信额度"),
            dataIndex: "totalCreditLimit",
            render: (v: number) => formatAmount(v),
            sorter: (a, b) => a.totalCreditLimit - b.totalCreditLimit
          },
          {
            title: t("financiers.remaining_credit_limit", "剩余可用额度"),
            dataIndex: "remainingCreditLimit",
            render: (v: number) => (
              <span style={{ color: v === 0 ? "#ff4d4f" : "inherit" }}>
                {formatAmount(v)}
              </span>
            ),
            sorter: (a, b) => a.remainingCreditLimit - b.remainingCreditLimit
          },
          {
            title: t("financiers.status", "状态"),
            dataIndex: "status",
            render: (status: FinancierStatus) => {
              const statusConfig: Record<FinancierStatus, { color: string; text: string }> = {
                active: {
                  color: "green",
                  text: t("financiers.status_active", "正常")
                },
                warning: {
                  color: "orange",
                  text: t("financiers.status_warning", "预警")
                },
                suspended: {
                  color: "red",
                  text: t("financiers.status_suspended", "暂停")
                }
              };
              const config = statusConfig[status];
              return <Tag color={config.color}>{config.text}</Tag>;
            },
            filterConfig: {
              type: "select",
              placeholder: t("financiers.status", "状态"),
              options: [
                { label: t("financiers.status_active", "正常"), value: "active" },
                { label: t("financiers.status_warning", "预警"), value: "warning" },
                { label: t("financiers.status_suspended", "暂停"), value: "suspended" }
              ]
            },
            width: 100
          },
          {
            title: t("common.actions", "操作"),
            width: 300,
            render: (_, record) => (
              <Space size="small">
                <Tooltip title={t("common.view", "查看")}>
                  <Button
                    type="link"
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => openView(record)}
                  />
                </Tooltip>
                <Tooltip title={t("common.edit", "编辑")}>
                  <Button
                    type="link"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => openEdit(record)}
                  />
                </Tooltip>
                <Tooltip title={t("external_systems.title", "外部系统")}>
                  <Button
                    type="link"
                    size="small"
                    icon={<ApiOutlined />}
                    onClick={() => openExternalSystemDrawer(record)}
                  />
                </Tooltip>
                <Tooltip title={t("crawler.data_source", "数据源")}>
                  <Button
                    type="link"
                    size="small"
                    icon={<CloudSyncOutlined />}
                    onClick={() => openCrawlerDrawer(record)}
                  />
                </Tooltip>
                <Tooltip title={t("common.delete", "删除")}>
                  <Button
                    type="link"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleDelete(record)}
                  />
                </Tooltip>
              </Space>
            )
          }
        ]}
      />

      {/* 新增/编辑/查看融资方Drawer */}
      <Drawer
        open={modalOpen}
        title={
          <div>
            <Typography.Title level={4} style={{ margin: 0, color: "#1890ff" }}>
              {viewMode 
                ? t("financiers.view_title", "查看融资方") 
                : (editing ? t("financiers.edit_title", "编辑融资方") : t("financiers.add_title", "新增融资方"))}
            </Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {viewMode 
                ? t("financiers.view_subtitle", "查看企业信息与业务预设")
                : t("financiers.add_subtitle", "填写企业信息与业务预设")}
            </Typography.Text>
          </div>
        }
        onClose={() => {
          setModalOpen(false);
          form.resetFields();
          setFileList({
            businessLicenseUrl: [],
            roadTransportLicenseUrl: [],
            legalPersonIdCardUrl: []
          });
        }}
        width={720}
        extra={
          viewMode ? (
            <Space>
              <Button 
                type="primary" 
                icon={<EditOutlined />}
                onClick={() => {
                  setViewMode(false);
                }}
              >
                {t("common.edit", "编辑")}
              </Button>
            </Space>
          ) : (
            <Space>
              <Button icon={<SaveOutlined />} onClick={() => handleSave(true)}>
                {t("financiers.save_draft", "存为草稿")}
              </Button>
              <Button type="primary" onClick={() => handleSave(false)}>
                {editing ? t("common.save", "保存") : t("financiers.confirm_add", "确认新增")}
              </Button>
            </Space>
          )
        }
        closable
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: "basic",
              label: t("financiers.tab_basic", "基础与证照"),
              children: (
                <Form form={form} layout="vertical" style={{ marginTop: 16 }} disabled={viewMode}>
                  <Typography.Title level={5} style={{ marginBottom: 16 }}>
                    {t("financiers.basic_info", "企业基本资料")}
                  </Typography.Title>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item
                        name="enterpriseName"
                        label={t("financiers.enterprise_name", "企业名称")}
                        required={!viewMode}
                        rules={viewMode ? [] : [
                          { required: true, message: t("financiers.enterprise_name_required", "请输入企业名称") }
                        ]}
                      >
                        <Input 
                          placeholder={t("financiers.enterprise_name_placeholder", "请输入企业全称")} 
                          disabled={!editableFields.enterpriseName}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name="unifiedSocialCreditCode"
                        label={t("financiers.unified_social_credit_code", "统一社会信用代码")}
                        required={!viewMode}
                        rules={viewMode ? [] : [
                          { required: true, message: t("financiers.unified_social_credit_code_required", "请输入统一社会信用代码") },
                          { len: 18, message: t("financiers.unified_social_credit_code_length", "统一社会信用代码必须为18位") }
                        ]}
                      >
                        <Input
                          placeholder={t("financiers.unified_social_credit_code_placeholder", "18位统一社会信用代码")}
                          maxLength={18}
                          disabled={!editableFields.unifiedSocialCreditCode}
                          suffix={
                            !viewMode && (
                              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                {unifiedSocialCreditCodeLength}/18{t("common.chars", "位")}
                              </Typography.Text>
                            )
                          }
                          onChange={(e) => {
                            setUnifiedSocialCreditCodeLength(e.target.value.length);
                          }}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item
                        name="legalRepresentative"
                        label={t("financiers.legal_representative", "法定代表人")}
                        required={!viewMode}
                        rules={viewMode ? [] : [
                          { required: true, message: t("financiers.legal_representative_required", "请输入法定代表人") }
                        ]}
                      >
                        <Input 
                          placeholder={t("financiers.legal_representative_placeholder", "请输入法定代表人姓名")} 
                          disabled={!editableFields.legalRepresentative}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name="businessAddress"
                        label={t("financiers.business_address", "经营地址")}
                        required={!viewMode}
                        rules={viewMode ? [] : [
                          { required: true, message: t("financiers.business_address_required", "请输入经营地址") }
                        ]}
                      >
                        <Input 
                          placeholder={t("financiers.business_address_placeholder", "请输入详细经营地址")} 
                          disabled={!editableFields.businessAddress}
                        />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Typography.Title level={5} style={{ marginTop: 24, marginBottom: 16 }}>
                    {t("financiers.license_upload", "证照上传")}
                  </Typography.Title>
                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item
                        name="businessLicenseUrl"
                        label={t("financiers.business_license", "营业执照")}
                        required={!viewMode}
                        rules={viewMode ? [] : [
                          { required: true, message: t("financiers.business_license_required", "请上传营业执照") }
                        ]}
                      >
                        {viewMode ? (
                          fileList.businessLicenseUrl.length > 0 ? (
                            <Image
                              width="100%"
                              src={getFullFileUrl(fileList.businessLicenseUrl[0]?.url)}
                              style={{ borderRadius: 8 }}
                            />
                          ) : (
                            <div style={{ color: '#999', textAlign: 'center', padding: 20 }}>暂无</div>
                          )
                        ) : (
                          <Upload.Dragger
                            accept=".pdf,.jpg,.jpeg,.png"
                            maxCount={1}
                            fileList={fileList.businessLicenseUrl}
                            disabled={!editableFields.businessLicenseUrl}
                            customRequest={async ({ file, onSuccess, onError }) => {
                              if (!token) return;
                              try {
                                setUploading(prev => ({ ...prev, businessLicenseUrl: true }));
                                const result = await uploadFileApi(token, file as File);
                                form.setFieldsValue({ businessLicenseUrl: result.url });
                                setFileList(prev => ({
                                  ...prev,
                                  businessLicenseUrl: [{
                                    uid: result.filename,
                                    name: result.originalName,
                                    status: 'done' as const,
                                    url: result.url
                                  }]
                                }));
                                onSuccess?.(result);
                              } catch (err) {
                                message.error(getErrorMessage(err));
                                onError?.(err as Error);
                              } finally {
                                setUploading(prev => ({ ...prev, businessLicenseUrl: false }));
                              }
                            }}
                            onRemove={() => {
                              form.setFieldsValue({ businessLicenseUrl: undefined });
                              setFileList(prev => ({ ...prev, businessLicenseUrl: [] }));
                            }}
                          >
                            <p className="ant-upload-drag-icon">
                              <InboxOutlined />
                            </p>
                            <p className="ant-upload-text">{t("financiers.upload_hint", "点击或拖拽上传")}</p>
                          </Upload.Dragger>
                        )}
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item
                        name="roadTransportLicenseUrl"
                        label={t("financiers.road_transport_license", "道路运输许可证")}
                        required={!viewMode}
                        rules={viewMode ? [] : [
                          { required: true, message: t("financiers.road_transport_license_required", "请上传道路运输经营许可证") }
                        ]}
                      >
                        {viewMode ? (
                          fileList.roadTransportLicenseUrl.length > 0 ? (
                            <Image
                              width="100%"
                              src={getFullFileUrl(fileList.roadTransportLicenseUrl[0]?.url)}
                              style={{ borderRadius: 8 }}
                            />
                          ) : (
                            <div style={{ color: '#999', textAlign: 'center', padding: 20 }}>暂无</div>
                          )
                        ) : (
                          <Upload.Dragger
                            accept=".pdf,.jpg,.jpeg,.png"
                            maxCount={1}
                            fileList={fileList.roadTransportLicenseUrl}
                            disabled={!editableFields.roadTransportLicenseUrl}
                            customRequest={async ({ file, onSuccess, onError }) => {
                              if (!token) return;
                              try {
                                setUploading(prev => ({ ...prev, roadTransportLicenseUrl: true }));
                                const result = await uploadFileApi(token, file as File);
                                form.setFieldsValue({ roadTransportLicenseUrl: result.url });
                                setFileList(prev => ({
                                  ...prev,
                                  roadTransportLicenseUrl: [{
                                    uid: result.filename,
                                    name: result.originalName,
                                    status: 'done' as const,
                                    url: result.url
                                  }]
                                }));
                                onSuccess?.(result);
                              } catch (err) {
                                message.error(getErrorMessage(err));
                                onError?.(err as Error);
                              } finally {
                                setUploading(prev => ({ ...prev, roadTransportLicenseUrl: false }));
                              }
                            }}
                            onRemove={() => {
                              form.setFieldsValue({ roadTransportLicenseUrl: undefined });
                              setFileList(prev => ({ ...prev, roadTransportLicenseUrl: [] }));
                            }}
                          >
                            <p className="ant-upload-drag-icon">
                              <InboxOutlined />
                            </p>
                            <p className="ant-upload-text">{t("financiers.upload_hint", "点击或拖拽上传")}</p>
                          </Upload.Dragger>
                        )}
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item
                        name="legalPersonIdCardUrl"
                        label={t("financiers.legal_person_id_card", "法人身份证")}
                        required={!viewMode}
                        rules={viewMode ? [] : [
                          { required: true, message: t("financiers.legal_person_id_card_required", "请上传法人身份证") }
                        ]}
                      >
                        {viewMode ? (
                          fileList.legalPersonIdCardUrl.length > 0 ? (
                            <Image
                              width="100%"
                              src={getFullFileUrl(fileList.legalPersonIdCardUrl[0]?.url)}
                              style={{ borderRadius: 8 }}
                            />
                          ) : (
                            <div style={{ color: '#999', textAlign: 'center', padding: 20 }}>暂无</div>
                          )
                        ) : (
                          <Upload.Dragger
                            accept=".pdf,.jpg,.jpeg,.png"
                            maxCount={1}
                            fileList={fileList.legalPersonIdCardUrl}
                            disabled={!editableFields.legalPersonIdCardUrl}
                            customRequest={async ({ file, onSuccess, onError }) => {
                              if (!token) return;
                              try {
                                setUploading(prev => ({ ...prev, legalPersonIdCardUrl: true }));
                                const result = await uploadFileApi(token, file as File);
                                form.setFieldsValue({ legalPersonIdCardUrl: result.url });
                                setFileList(prev => ({
                                  ...prev,
                                  legalPersonIdCardUrl: [{
                                    uid: result.filename,
                                    name: result.originalName,
                                    status: 'done' as const,
                                    url: result.url
                                  }]
                                }));
                                onSuccess?.(result);
                              } catch (err) {
                                message.error(getErrorMessage(err));
                                onError?.(err as Error);
                              } finally {
                                setUploading(prev => ({ ...prev, legalPersonIdCardUrl: false }));
                              }
                            }}
                            onRemove={() => {
                              form.setFieldsValue({ legalPersonIdCardUrl: undefined });
                              setFileList(prev => ({ ...prev, legalPersonIdCardUrl: [] }));
                            }}
                          >
                            <p className="ant-upload-drag-icon">
                              <InboxOutlined />
                            </p>
                            <p className="ant-upload-text">{t("financiers.upload_hint", "点击或拖拽上传")}</p>
                          </Upload.Dragger>
                        )}
                      </Form.Item>
                    </Col>
                  </Row>
                </Form>
              )
            },
            {
              key: "business",
              label: t("financiers.tab_business", "业务预设"),
              children: (
                <Form form={form} layout="vertical" style={{ marginTop: 16 }} disabled={viewMode}>
                  <Form.Item
                    name="operatingScale"
                    label={t("financiers.operating_scale", "经营规模")}
                    required={!viewMode}
                    rules={viewMode ? [] : [
                      { required: true, message: t("financiers.operating_scale_required", "请选择经营规模") }
                    ]}
                  >
                    <Radio.Group disabled={!editableFields.operatingScale}>
                      <Space direction="vertical" size="middle">
                        <Radio value="large">
                          <div>
                            <div>{t("financiers.scale_large", "大型")}</div>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              {t("financiers.scale_large_desc", "车队规模 100+台, 年营收 1000万+元")}
                            </Typography.Text>
                          </div>
                        </Radio>
                        <Radio value="medium">
                          <div>
                            <div>{t("financiers.scale_medium", "中型")}</div>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              {t("financiers.scale_medium_desc", "车队规模 30-100台, 年营收 300-1000万元")}
                            </Typography.Text>
                          </div>
                        </Radio>
                        <Radio value="small">
                          <div>
                            <div>{t("financiers.scale_small", "小型")}</div>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              {t("financiers.scale_small_desc", "车队规模 30台以下, 年营收 300万以下元")}
                            </Typography.Text>
                          </div>
                        </Radio>
                      </Space>
                    </Radio.Group>
                  </Form.Item>
                  <Form.Item
                    name="initialCreditAmount"
                    label={editing ? t("financiers.total_credit_limit", "总授信额度") : t("financiers.initial_credit_amount", "初始授信申请")}
                    required={!viewMode}
                    rules={viewMode ? [] : [
                      { required: true, message: t("financiers.initial_credit_amount_required", "请输入授信金额") }
                    ]}
                    extra={
                      !viewMode && (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {t("financiers.credit_recommendation", "根据经营规模建议: 大型 300-500万 / 中型 100-300万 / 小型 50-100万")}
                        </Typography.Text>
                      )
                    }
                  >
                    <InputNumber
                      prefix="¥"
                      placeholder={t("financiers.initial_credit_amount_placeholder", "请输入授信金额")}
                      style={{ width: "100%" }}
                      min={0}
                      addonAfter="元"
                      disabled={!editableFields.initialCreditAmount}
                      formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      parser={(value) => Number(value!.replace(/,/g, '')) as unknown as 0}
                    />
                  </Form.Item>
                </Form>
              )
            },
            {
              key: "extension",
              label: t("financiers.tab_extension", "扩展模块"),
              children: (
                <Empty
                  style={{ margin: "60px 0" }}
                  image={<InboxOutlined style={{ fontSize: 64, color: "#d9d9d9" }} />}
                  description={
                    <div>
                      <Typography.Title level={4} style={{ marginBottom: 8 }}>
                        {t("financiers.extension_title", "更多信息待扩展")}
                      </Typography.Title>
                      <Typography.Text type="secondary">
                        {t("financiers.extension_desc", "此模块预留给未来扩展功能,如企业征信报告、股东信息、历史合作记录等。")}
                      </Typography.Text>
                      <br />
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {t("financiers.extension_concept", "体现模块化可插拔设计理念")}
                      </Typography.Text>
                    </div>
                  }
                />
              )
            }
          ]}
        />
      </Drawer>

      {/* 外部系统配置抽屉 */}
      <Drawer
        title={
          <div>
            <Typography.Title level={4} style={{ margin: 0, color: "#1890ff" }}>
              <ApiOutlined style={{ marginRight: 8 }} />
              {t("external_systems.drawer_title", "外部系统配置")}
            </Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {currentFinancierForExternal?.enterpriseName} - {t("external_systems.drawer_subtitle", "管理外部系统绑定关系")}
            </Typography.Text>
          </div>
        }
        open={externalSystemDrawerOpen}
        onClose={closeExternalSystemDrawer}
        width={680}
        extra={
          <Button 
            type="primary" 
            icon={<PlusOutlined />}
            onClick={() => openExternalSystemModal()}
          >
            {t("external_systems.add", "添加配置")}
          </Button>
        }
      >
        <Table
          dataSource={externalSystems}
          loading={externalSystemLoading}
          rowKey="id"
          pagination={false}
          size="middle"
          locale={{ emptyText: t("external_systems.no_data", "暂无外部系统配置") }}
          columns={[
            {
              title: t("external_systems.system_name", "系统名称"),
              dataIndex: "systemName",
              width: 120,
              render: (name: string) => (
                <Tag color="blue">{name}</Tag>
              )
            },
            {
              title: t("external_systems.system_id", "系统ID"),
              dataIndex: "systemId",
              width: 120,
              ellipsis: true,
              render: (id: string) => (
                <Typography.Text copyable={{ text: id }}>
                  {id}
                </Typography.Text>
              )
            },
            {
              title: t("external_systems.integration_type", "集成方式"),
              dataIndex: "integrationType",
              width: 100,
              render: (type: string, record: ExternalSystemConfig) => {
                const typeConfig: Record<string, { label: string; color: string }> = {
                  manual: { label: "手动", color: "default" },
                  crawler: { label: "爬虫", color: "purple" },
                  api: { label: "API", color: "cyan" },
                };
                const config = typeConfig[type] || typeConfig.manual;
                return (
                  <Space size={4}>
                    <Tag color={config.color}>{config.label}</Tag>
                    {type === "crawler" && record.crawlerType && (
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                        {record.crawlerType}
                      </Typography.Text>
                    )}
                  </Space>
                );
              }
            },
            {
              title: t("external_systems.sync_status", "同步状态"),
              width: 100,
              render: (_, record: ExternalSystemConfig) => {
                if (record.integrationType !== "crawler") {
                  return <Typography.Text type="secondary">-</Typography.Text>;
                }
                const statusConfig: Record<string, { color: string; text: string }> = {
                  success: { color: "green", text: "成功" },
                  failed: { color: "red", text: "失败" },
                  running: { color: "blue", text: "运行中" },
                };
                const config = statusConfig[record.lastSyncStatus || ""] || { color: "default", text: "未同步" };
                return (
                  <Tooltip title={record.lastSyncError || undefined}>
                    <Tag color={config.color}>{config.text}</Tag>
                  </Tooltip>
                );
              }
            },
            {
              title: t("external_systems.last_sync", "上次同步"),
              dataIndex: "lastSyncTime",
              width: 140,
              render: (time: string) => time 
                ? new Date(time).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
                : <Typography.Text type="secondary">-</Typography.Text>
            },
            {
              title: t("common.actions", "操作"),
              width: 140,
              render: (_, record: ExternalSystemConfig) => (
                <Space size="small">
                  {record.integrationType === "crawler" && record.crawlerType && (
                    <>
                      <Tooltip title={t("external_systems.sync_now", "立即同步")}>
                        <Button
                          type="link"
                          size="small"
                          icon={<SyncOutlined spin={syncingExternalId === record.id} />}
                          onClick={() => handleTriggerExternalSync(record)}
                          disabled={syncingExternalId === record.id}
                        />
                      </Tooltip>
                      <Tooltip title={t("external_systems.test_connection", "测试连接")}>
                        <Button
                          type="link"
                          size="small"
                          icon={<LinkOutlined />}
                          onClick={() => handleTestExternalConnection(record)}
                          disabled={testingExternalConnection}
                        />
                      </Tooltip>
                    </>
                  )}
                  <Tooltip title={t("common.edit", "编辑")}>
                    <Button
                      type="link"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => openExternalSystemModal(record)}
                    />
                  </Tooltip>
                  <Popconfirm
                    title={t("external_systems.delete_confirm", "确定删除此配置？")}
                    onConfirm={() => handleExternalSystemDelete(record.id)}
                    okText={t("common.confirm", "确定")}
                    cancelText={t("common.cancel", "取消")}
                  >
                    <Tooltip title={t("common.delete", "删除")}>
                      <Button
                        type="link"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                      />
                    </Tooltip>
                  </Popconfirm>
                </Space>
              )
            }
          ]}
        />
        
        {externalSystems.length > 0 && (
          <div style={{ marginTop: 16, padding: 12, backgroundColor: "#f6f8fa", borderRadius: 6 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              <SyncOutlined style={{ marginRight: 4 }} />
              {t("external_systems.usage_hint", "提示：系统ID用于匹配运单数据中的发货方/收货方字段，实现数据自动关联。")}
            </Typography.Text>
          </div>
        )}
      </Drawer>

      {/* 外部系统配置编辑模态框 */}
      <Modal
        title={editingExternalSystem 
          ? t("external_systems.edit_title", "编辑外部系统配置") 
          : t("external_systems.add_title", "添加外部系统配置")}
        open={externalSystemModalOpen}
        onCancel={() => setExternalSystemModalOpen(false)}
        onOk={handleExternalSystemSave}
        okText={t("common.save", "保存")}
        cancelText={t("common.cancel", "取消")}
        width={600}
        destroyOnClose
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        <Form
          form={externalSystemForm}
          layout="vertical"
          style={{ marginTop: 16 }}
        >
          {/* 基础信息 */}
          <Form.Item
            name="systemName"
            label={t("external_systems.system_type", "系统类型")}
            required
          >
            <Select
              options={presetSystems}
              value={selectedSystemType}
              onChange={(value) => {
                setSelectedSystemType(value);
                if (value !== "custom") {
                  externalSystemForm.setFieldsValue({ customSystemName: "" });
                }
              }}
              placeholder={t("external_systems.select_system_type", "请选择系统类型")}
            />
          </Form.Item>
          
          {selectedSystemType === "custom" && (
            <Form.Item
              name="customSystemName"
              label={t("external_systems.custom_system_name", "自定义系统名称")}
              rules={[{ required: true, message: t("external_systems.custom_name_required", "请输入系统名称") }]}
            >
              <Input placeholder={t("external_systems.enter_custom_name", "请输入自定义系统名称")} />
            </Form.Item>
          )}
          
          <Form.Item
            name="systemId"
            label={t("external_systems.system_id", "在外部系统中的ID")}
            extra={
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {t("external_systems.system_id_hint", "可选，用于在运单数据中匹配识别该融资方")}
              </Typography.Text>
            }
          >
            <Input placeholder={t("external_systems.enter_system_id", "请输入在外部系统中的唯一标识")} />
          </Form.Item>
          
          <Divider orientation="left">集成方式</Divider>
          
          {/* 集成方式选择 - 放在显眼位置 */}
          <Form.Item
            name="integrationType"
            required
          >
            <Radio.Group
              value={selectedIntegrationType}
              onChange={(e) => {
                setSelectedIntegrationType(e.target.value);
                externalSystemForm.setFieldsValue({ integrationType: e.target.value });
                if (e.target.value !== "crawler") {
                  setSelectedCrawlerTemplate("");
                }
              }}
            >
              <Radio.Button value="manual">手动录入</Radio.Button>
              <Radio.Button value="crawler">爬虫同步</Radio.Button>
              <Radio.Button value="api">API对接</Radio.Button>
            </Radio.Group>
          </Form.Item>
          
          {/* 爬虫同步配置 */}
          {selectedIntegrationType === "crawler" && (
            <>
              <Form.Item
                name="crawlerType"
                label="选择爬虫模板"
                required
                rules={[{ required: true, message: "请选择爬虫模板" }]}
              >
                <Select
                  value={selectedCrawlerTemplate}
                  onChange={(value) => setSelectedCrawlerTemplate(value)}
                  placeholder="请选择要使用的爬虫模板"
                  options={crawlerTemplates.map(tmpl => ({
                    value: tmpl.id,
                    label: tmpl.name,
                  }))}
                />
              </Form.Item>
              
              {selectedCrawlerTemplate && (() => {
                const template = crawlerTemplates.find(tmpl => tmpl.id === selectedCrawlerTemplate);
                if (!template) return null;
                
                return (
                  <>
                    <Typography.Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
                      {template.description}
                    </Typography.Text>
                    
                    {template.requiredFields.map(field => (
                      <Form.Item
                        key={field.key}
                        name={field.key}
                        label={field.label}
                        rules={field.required ? [{ required: true, message: `请输入${field.label}` }] : undefined}
                        initialValue={field.defaultValue}
                      >
                        {field.type === "password" ? (
                          <Input.Password placeholder={field.placeholder} />
                        ) : field.type === "number" ? (
                          <InputNumber style={{ width: "100%" }} placeholder={field.placeholder} />
                        ) : field.type === "select" ? (
                          <Select 
                            placeholder={field.placeholder}
                            options={field.options}
                          />
                        ) : (
                          <Input placeholder={field.placeholder} />
                        )}
                      </Form.Item>
                    ))}
                  </>
                );
              })()}
              
              <Form.Item
                name="syncIntervalMinutes"
                label="同步间隔"
              >
                <Select
                  options={SYNC_INTERVAL_OPTIONS as any}
                  placeholder="选择自动同步间隔"
                />
              </Form.Item>
            </>
          )}
          
          {/* API对接配置 */}
          {selectedIntegrationType === "api" && (
            <>
              <Form.Item
                name="apiEndpoint"
                label="API接口地址"
                rules={[{ required: true, message: "请输入API接口地址" }]}
              >
                <Input placeholder="https://api.example.com/sync" />
              </Form.Item>
              
              <Form.Item
                name="apiKey"
                label="API密钥"
              >
                <Input.Password placeholder="请输入API密钥（如有）" />
              </Form.Item>
            </>
          )}
          
          {/* 手动录入说明 */}
          {selectedIntegrationType === "manual" && (
            <Typography.Text type="secondary" style={{ display: "block", marginBottom: 16 }}>
              手动录入模式下，仅记录外部系统信息，不进行自动数据同步。
            </Typography.Text>
          )}
          
          <Divider />
          
          <Form.Item
            name="syncEnabled"
            label="启用同步"
            valuePropName="checked"
          >
            <Switch 
              checkedChildren="启用" 
              unCheckedChildren="停用" 
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 爬虫数据源配置抽屉 */}
      <Drawer
        title={
          <div>
            <Typography.Title level={4} style={{ margin: 0, color: "#1890ff" }}>
              <CloudSyncOutlined style={{ marginRight: 8 }} />
              {t("crawler.drawer_title", "数据源配置")}
            </Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {currentFinancierForCrawler?.enterpriseName} - {t("crawler.drawer_subtitle", "管理运单数据同步配置")}
            </Typography.Text>
          </div>
        }
        open={crawlerDrawerOpen}
        onClose={closeCrawlerDrawer}
        width={720}
        extra={
          <Button 
            type="primary" 
            icon={<PlusOutlined />}
            onClick={() => openCrawlerModal()}
          >
            {t("crawler.add_config", "新建配置")}
          </Button>
        }
      >
        <Spin spinning={crawlerLoading}>
          {crawlerConfigs.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t("crawler.no_config", "暂无数据源配置")}
            >
              <Button type="primary" onClick={() => openCrawlerModal()}>
                {t("crawler.add_first_config", "添加第一个配置")}
              </Button>
            </Empty>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {crawlerConfigs.map(config => (
                <Card
                  key={config.id}
                  size="small"
                  style={{ borderRadius: 8 }}
                  title={
                    <Space>
                      <LinkOutlined style={{ color: '#1890ff' }} />
                      <Typography.Text strong>{config.name}</Typography.Text>
                      <Tag color={config.syncEnabled ? 'green' : 'default'}>
                        {config.syncEnabled ? t("crawler.enabled", "启用") : t("crawler.disabled", "禁用")}
                      </Tag>
                    </Space>
                  }
                  extra={getSyncStatusIcon(config.lastSyncStatus as CrawlerSyncStatus | undefined)}
                >
                  <Row gutter={[16, 8]}>
                    <Col span={24}>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {t("crawler.system_url", "系统地址")}:
                      </Typography.Text>
                      <Typography.Text style={{ marginLeft: 8 }} copyable={{ text: config.systemUrl }}>
                        {config.systemUrl}
                      </Typography.Text>
                    </Col>
                    <Col span={12}>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {t("crawler.sync_interval", "同步间隔")}:
                      </Typography.Text>
                      <Typography.Text style={{ marginLeft: 8 }}>
                        {formatSyncInterval(config.syncIntervalMinutes)}
                      </Typography.Text>
                    </Col>
                    <Col span={12}>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {t("crawler.last_sync", "最后同步")}:
                      </Typography.Text>
                      <Typography.Text style={{ marginLeft: 8 }}>
                        {config.lastSyncTime 
                          ? new Date(config.lastSyncTime).toLocaleString('zh-CN')
                          : t("crawler.never_synced", "从未同步")}
                        {config.lastSyncCount !== undefined && config.lastSyncCount > 0 && (
                          <Tag color="blue" style={{ marginLeft: 8 }}>
                            {t("crawler.new_count", "新增")}: {config.lastSyncCount} {t("crawler.records", "条")}
                          </Tag>
                        )}
                      </Typography.Text>
                    </Col>
                    {config.lastSyncStatus === 'failed' && config.lastSyncError && (
                      <Col span={24}>
                        <Typography.Text type="danger" style={{ fontSize: 12 }}>
                          {t("crawler.error", "错误")}: {config.lastSyncError}
                        </Typography.Text>
                      </Col>
                    )}
                  </Row>
                  <div style={{ marginTop: 12, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
                    <Space>
                      <Tooltip title={t("common.edit", "编辑")}>
                        <Button
                          type="text"
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => openCrawlerModal(config)}
                        >
                          {t("common.edit", "编辑")}
                        </Button>
                      </Tooltip>
                      <Tooltip title={t("crawler.sync_now", "立即同步")}>
                        <Button
                          type="text"
                          size="small"
                          icon={syncingId === config.id ? <LoadingOutlined spin /> : <PlayCircleOutlined />}
                          loading={syncingId === config.id}
                          onClick={() => handleTriggerSync(config.id)}
                        >
                          {t("crawler.sync_now", "立即同步")}
                        </Button>
                      </Tooltip>
                      <Tooltip title={t("crawler.view_logs", "查看日志")}>
                        <Button
                          type="text"
                          size="small"
                          icon={<HistoryOutlined />}
                          onClick={() => openLogDrawer(config)}
                        >
                          {t("crawler.view_logs", "查看日志")}
                        </Button>
                      </Tooltip>
                      <Popconfirm
                        title={t("crawler.delete_confirm", "确定删除此配置？")}
                        onConfirm={() => handleCrawlerDelete(config.id)}
                        okText={t("common.confirm", "确定")}
                        cancelText={t("common.cancel", "取消")}
                      >
                        <Tooltip title={t("common.delete", "删除")}>
                          <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                          >
                            {t("common.delete", "删除")}
                          </Button>
                        </Tooltip>
                      </Popconfirm>
                    </Space>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Spin>
        
        {crawlerConfigs.length > 0 && (
          <div style={{ marginTop: 16, padding: 12, backgroundColor: "#f6f8fa", borderRadius: 6 }}>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              <SyncOutlined style={{ marginRight: 4 }} />
              {t("crawler.usage_hint", "提示：配置数据源后，系统会按设定的间隔自动同步运单数据。")}
            </Typography.Text>
          </div>
        )}
      </Drawer>

      {/* 爬虫配置编辑模态框 */}
      <Modal
        title={editingCrawler 
          ? t("crawler.edit_title", "编辑数据源配置") 
          : t("crawler.add_title", "新建数据源配置")}
        open={crawlerModalOpen}
        onCancel={() => setCrawlerModalOpen(false)}
        footer={[
          <Button key="test" onClick={handleTestConnection} loading={testingConnection}>
            {t("crawler.test_connection", "测试连接")}
          </Button>,
          <Button key="cancel" onClick={() => setCrawlerModalOpen(false)}>
            {t("common.cancel", "取消")}
          </Button>,
          <Button key="save" type="primary" onClick={handleCrawlerSave}>
            {t("common.save", "保存")}
          </Button>
        ]}
        width={600}
        destroyOnClose
      >
        <Form
          form={crawlerForm}
          layout="vertical"
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="name"
            label={t("crawler.config_name", "配置名称")}
            rules={[{ required: true, message: t("crawler.config_name_required", "请输入配置名称") }]}
          >
            <Input placeholder={t("crawler.config_name_placeholder", "如 zo-cloud 金罗运力")} />
          </Form.Item>
          
          <Form.Item
            name="systemUrl"
            label={t("crawler.system_url", "系统地址")}
            rules={[{ required: true, message: t("crawler.system_url_required", "请输入系统地址") }]}
          >
            <Input placeholder={t("crawler.system_url_placeholder", "如 https://tms25.zo-cloud.cn")} />
          </Form.Item>
          
          <Form.Item
            name="apiEndpoint"
            label={t("crawler.api_endpoint", "API路径")}
            rules={[{ required: true, message: t("crawler.api_endpoint_required", "请输入API路径") }]}
          >
            <Input placeholder={t("crawler.api_endpoint_placeholder", "默认 /api/Table/Search/batchList")} />
          </Form.Item>
          
          <Form.Item
            name="cookies"
            label={t("crawler.cookies", "Cookie")}
            rules={[{ required: true, message: t("crawler.cookies_required", "请输入Cookie") }]}
            extra={
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {t("crawler.cookies_hint", "从浏览器开发者工具中复制完整的Cookie字符串")}
              </Typography.Text>
            }
          >
            <Input.TextArea 
              rows={3} 
              placeholder={t("crawler.cookies_placeholder", "PHPSESSID=xxx; other_cookie=xxx")}
            />
          </Form.Item>
          
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="companyId"
                label={t("crawler.company_id", "Company ID")}
              >
                <Input placeholder={t("crawler.optional", "可选")} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="userId"
                label={t("crawler.user_id", "User ID")}
              >
                <Input placeholder={t("crawler.optional", "可选")} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="groupId"
                label={t("crawler.group_id", "Group ID")}
              >
                <Input placeholder={t("crawler.optional", "可选")} />
              </Form.Item>
            </Col>
          </Row>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="syncIntervalMinutes"
                label={t("crawler.sync_interval", "同步间隔")}
                rules={[{ required: true, message: t("crawler.sync_interval_required", "请选择同步间隔") }]}
              >
                <Select
                  options={SYNC_INTERVAL_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
                  placeholder={t("crawler.select_interval", "请选择")}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="syncEnabled"
                label={t("crawler.enable_sync", "启用同步")}
                valuePropName="checked"
              >
                <Switch 
                  checkedChildren={t("common.enabled", "开")} 
                  unCheckedChildren={t("common.disabled", "关")} 
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* 同步日志抽屉 */}
      <Drawer
        title={
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              <HistoryOutlined style={{ marginRight: 8 }} />
              {t("crawler.logs_title", "同步日志")}
            </Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {currentCrawlerForLog?.name}
            </Typography.Text>
          </div>
        }
        open={logDrawerOpen}
        onClose={closeLogDrawer}
        width={600}
      >
        <Spin spinning={logsLoading}>
          {crawlerLogs.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t("crawler.no_logs", "暂无同步日志")}
            />
          ) : (
            <Table
              dataSource={crawlerLogs}
              rowKey="id"
              size="small"
              pagination={{ pageSize: 10 }}
              columns={[
                {
                  title: t("crawler.log_time", "时间"),
                  dataIndex: "startTime",
                  width: 160,
                  render: (time: string) => new Date(time).toLocaleString('zh-CN')
                },
                {
                  title: t("crawler.log_status", "状态"),
                  dataIndex: "status",
                  width: 80,
                  render: (status: string) => {
                    if (status === 'success') return <Tag color="success">{t("crawler.status_success", "成功")}</Tag>;
                    if (status === 'running') return <Tag color="processing">{t("crawler.status_running", "进行中")}</Tag>;
                    if (status === 'failed') return <Tag color="error">{t("crawler.status_failed", "失败")}</Tag>;
                    return <Tag>{status}</Tag>;
                  }
                },
                {
                  title: t("crawler.log_fetched", "获取"),
                  dataIndex: "totalFetched",
                  width: 60,
                  align: 'center'
                },
                {
                  title: t("crawler.log_new", "新增"),
                  dataIndex: "newCount",
                  width: 60,
                  align: 'center',
                  render: (count: number) => (
                    <span style={{ color: count > 0 ? '#52c41a' : 'inherit' }}>{count}</span>
                  )
                },
                {
                  title: t("crawler.log_skipped", "跳过"),
                  dataIndex: "skippedCount",
                  width: 60,
                  align: 'center'
                },
                {
                  title: t("crawler.log_error", "错误"),
                  dataIndex: "errorCount",
                  width: 60,
                  align: 'center',
                  render: (count: number) => (
                    <span style={{ color: count > 0 ? '#ff4d4f' : 'inherit' }}>{count}</span>
                  )
                }
              ]}
              expandable={{
                expandedRowRender: (record: CrawlerSyncLog) => record.errorMessage ? (
                  <Typography.Text type="danger" style={{ fontSize: 12 }}>
                    {t("crawler.error_detail", "错误详情")}: {record.errorMessage}
                  </Typography.Text>
                ) : null,
                rowExpandable: (record: CrawlerSyncLog) => !!record.errorMessage
              }}
            />
          )}
        </Spin>
      </Drawer>

    </div>
  );
}

export default FinanciersPage;

