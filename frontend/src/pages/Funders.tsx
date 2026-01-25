import {
  createFunderApi,
  deleteFunderApi,
  fetchFunders,
  fetchContracts,
  getErrorMessage,
  updateFunderApi,
  uploadFileApi
} from "../api";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import { Funder, FunderStatus, FunderType, Contract } from "../types";
import {
  Alert,
  Button,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Result,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
  message,
  Row,
  Col,
  Image
} from "antd";
import { UploadOutlined, DownloadOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";
import DataTable from "../components/DataTable";

type FunderFormValues = {
  institutionName: string;
  institutionType: FunderType;
  unifiedSocialCreditCode: string;
  businessLicenseUrl?: string;
  businessLicenseName?: string;
  financialLicenseUrl?: string;
  financialLicenseName?: string;
  accountOpeningPermitUrl?: string;
  accountOpeningPermitName?: string;
  contactPerson?: string;
  contactPhone?: string;
  bankName?: string;
  bankAccount?: string;
  accountName?: string;
  cumulativeCreditLimit?: number;
  status?: FunderStatus;
};

// 区块样式
const sectionStyle: React.CSSProperties = {
  background: '#fafafa',
  borderRadius: 8,
  padding: '16px 20px',
  marginBottom: 16,
  border: '1px solid #f0f0f0'
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: '#1890ff',
  marginBottom: 16,
  paddingBottom: 8,
  borderBottom: '1px solid #e8e8e8',
  display: 'flex',
  alignItems: 'center',
  gap: 8
};

function FundersPage() {
  const { token, user } = useAuth();
  const { t } = useI18n();
  
  // 获取完整的文件URL
  const getFullFileUrl = (url: string | undefined): string => {
    if (!url) return '';
    // 如果已经是完整URL，直接返回
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    // 否则添加API基础URL
    const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001/api";
    return `${API_BASE}${url.startsWith('/') ? url : `/${url}`}`;
  };
  const [funders, setFunders] = useState<Funder[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Funder | null>(null);
  const [form] = Form.useForm<FunderFormValues>();
  const [unifiedSocialCreditCodeLength, setUnifiedSocialCreditCodeLength] = useState(0);
  const [uploading, setUploading] = useState<{ [key: string]: boolean }>({});
  const [fileList, setFileList] = useState<{ [key: string]: any[] }>({
    businessLicenseUrl: [],
    financialLicenseUrl: [],
    accountOpeningPermitUrl: []
  });
  // 关联合同
  const [relatedContracts, setRelatedContracts] = useState<Contract[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(false);
  const [activeTab, setActiveTab] = useState("info");
  // 查看模式（只读）
  const [viewMode, setViewMode] = useState(false);

  const refresh = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetchFunders(token);
      setFunders(res.funders);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  const openCreate = () => {
    setEditing(null);
    setViewMode(false);
    setActiveTab("info");
    setRelatedContracts([]);
    form.resetFields();
    form.setFieldsValue({ status: "active" });
    setFileList({
      businessLicenseUrl: [],
      financialLicenseUrl: [],
      accountOpeningPermitUrl: []
    });
    setModalOpen(true);
  };

  // 打开查看模式
  const openView = async (record: Funder) => {
    setEditing(record);
    setViewMode(true);
    setActiveTab("info");
    form.setFieldsValue({
      institutionName: record.institutionName,
      institutionType: record.institutionType,
      unifiedSocialCreditCode: record.unifiedSocialCreditCode,
      businessLicenseUrl: record.businessLicenseUrl,
      financialLicenseUrl: record.financialLicenseUrl,
      accountOpeningPermitUrl: record.accountOpeningPermitUrl,
      contactPerson: record.contactPerson,
      contactPhone: record.contactPhone,
      bankName: record.bankName,
      bankAccount: record.bankAccount,
      accountName: record.accountName,
      cumulativeCreditLimit: record.cumulativeCreditLimit,
      status: record.status
    });
    // 设置文件列表
    const getFilename = (url: string | undefined, name: string | undefined) => {
      return name || (url ? url.split('/').pop() || '已上传文件' : '已上传文件');
    };
    setFileList({
      businessLicenseUrl: record.businessLicenseUrl ? [{
        uid: record.id + '-business',
        name: getFilename(record.businessLicenseUrl, record.businessLicenseName),
        status: 'done' as const,
        url: record.businessLicenseUrl
      }] : [],
      financialLicenseUrl: record.financialLicenseUrl ? [{
        uid: record.id + '-financial',
        name: getFilename(record.financialLicenseUrl, record.financialLicenseName),
        status: 'done' as const,
        url: record.financialLicenseUrl
      }] : [],
      accountOpeningPermitUrl: record.accountOpeningPermitUrl ? [{
        uid: record.id + '-account',
        name: getFilename(record.accountOpeningPermitUrl, record.accountOpeningPermitName),
        status: 'done' as const,
        url: record.accountOpeningPermitUrl
      }] : []
    });
    // 加载关联合同
    if (token) {
      setLoadingContracts(true);
      try {
        const res = await fetchContracts(token, { funderId: record.id });
        setRelatedContracts(res.contracts);
      } catch (err) {
        console.error("Failed to load related contracts:", err);
        setRelatedContracts([]);
      } finally {
        setLoadingContracts(false);
      }
    }
    setModalOpen(true);
  };

  const openEdit = async (record: Funder) => {
    setEditing(record);
    setViewMode(false);
    setActiveTab("info");
    form.setFieldsValue({
      institutionName: record.institutionName,
      institutionType: record.institutionType,
      unifiedSocialCreditCode: record.unifiedSocialCreditCode,
      businessLicenseUrl: record.businessLicenseUrl,
      financialLicenseUrl: record.financialLicenseUrl,
      accountOpeningPermitUrl: record.accountOpeningPermitUrl,
      contactPerson: record.contactPerson,
      contactPhone: record.contactPhone,
      bankName: record.bankName,
      bankAccount: record.bankAccount,
      accountName: record.accountName,
      cumulativeCreditLimit: record.cumulativeCreditLimit,
      status: record.status
    });
    // 使用数据库中的文件名，如果没有则从URL提取
    const getFilename = (url: string | undefined, name: string | undefined) => {
      return name || (url ? url.split('/').pop() || '已上传文件' : '已上传文件');
    };
    // 设置文件列表
    setFileList({
      businessLicenseUrl: record.businessLicenseUrl ? [{
        uid: record.id + '-business',
        name: getFilename(record.businessLicenseUrl, record.businessLicenseName),
        status: 'done' as const,
        url: record.businessLicenseUrl
      }] : [],
      financialLicenseUrl: record.financialLicenseUrl ? [{
        uid: record.id + '-financial',
        name: getFilename(record.financialLicenseUrl, record.financialLicenseName),
        status: 'done' as const,
        url: record.financialLicenseUrl
      }] : [],
      accountOpeningPermitUrl: record.accountOpeningPermitUrl ? [{
        uid: record.id + '-account',
        name: getFilename(record.accountOpeningPermitUrl, record.accountOpeningPermitName),
        status: 'done' as const,
        url: record.accountOpeningPermitUrl
      }] : []
    });
    // 加载关联合同
    if (token) {
      setLoadingContracts(true);
      try {
        const res = await fetchContracts(token, { funderId: record.id });
        setRelatedContracts(res.contracts);
      } catch (err) {
        console.error("Failed to load related contracts:", err);
        setRelatedContracts([]);
      } finally {
        setLoadingContracts(false);
      }
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!token) return;
    const values = await form.validateFields();
    try {
      if (editing) {
        await updateFunderApi(token, editing.id, {
          institutionName: values.institutionName,
          institutionType: values.institutionType,
          unifiedSocialCreditCode: values.unifiedSocialCreditCode,
          businessLicenseUrl: values.businessLicenseUrl,
          businessLicenseName: values.businessLicenseName,
          financialLicenseUrl: values.financialLicenseUrl,
          financialLicenseName: values.financialLicenseName,
          accountOpeningPermitUrl: values.accountOpeningPermitUrl,
          accountOpeningPermitName: values.accountOpeningPermitName,
          contactPerson: values.contactPerson,
          contactPhone: values.contactPhone,
          bankName: values.bankName,
          bankAccount: values.bankAccount,
          accountName: values.accountName,
          cumulativeCreditLimit: values.cumulativeCreditLimit,
          status: values.status
        });
      } else {
        await createFunderApi(token, {
          institutionName: values.institutionName,
          institutionType: values.institutionType,
          unifiedSocialCreditCode: values.unifiedSocialCreditCode,
          businessLicenseUrl: values.businessLicenseUrl,
          businessLicenseName: values.businessLicenseName,
          financialLicenseUrl: values.financialLicenseUrl,
          financialLicenseName: values.financialLicenseName,
          accountOpeningPermitUrl: values.accountOpeningPermitUrl,
          accountOpeningPermitName: values.accountOpeningPermitName,
          contactPerson: values.contactPerson,
          contactPhone: values.contactPhone,
          bankName: values.bankName,
          bankAccount: values.bankAccount,
          accountName: values.accountName,
          cumulativeCreditLimit: values.cumulativeCreditLimit
        });
      }
      message.success(t("common.saved", "已保存"));
      setModalOpen(false);
      await refresh();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const handleDelete = (record: Funder) => {
    if (!token) return;
    const content = t(
      "funders.delete_confirm_content",
      `确定要删除资金方 "{name}" 吗？此操作不可恢复。`
    ).replace("{name}", record.institutionName);
    Modal.confirm({
      title: t("common.confirm_delete", "确认删除？"),
      content: content,
      okButtonProps: { danger: true },
      okText: t("common.confirm", "确认"),
      cancelText: t("common.cancel", "取消"),
      onOk: async () => {
        try {
          await deleteFunderApi(token, record.id);
          message.success(t("common.deleted", "已删除"));
          await refresh();
        } catch (err) {
          message.error(getErrorMessage(err));
        }
      }
    });
  };

  // 启用/停用资金方
  const handleToggleStatus = async (record: Funder) => {
    if (!token) return;
    const newStatus: FunderStatus = record.status === "active" ? "disabled" : "active";
    const actionText = newStatus === "active" 
      ? t("funders.enable", "启用") 
      : t("funders.disable", "停用");
    
    Modal.confirm({
      title: `${actionText}资金方`,
      content: `确定要${actionText}资金方 "${record.institutionName}" 吗？`,
      okText: t("common.confirm", "确认"),
      cancelText: t("common.cancel", "取消"),
      okButtonProps: newStatus === "disabled" ? { danger: true } : {},
      onOk: async () => {
        try {
          await updateFunderApi(token, record.id, { status: newStatus });
          message.success(`已${actionText}`);
          await refresh();
          // 如果当前正在查看/编辑该资金方，更新状态
          if (editing?.id === record.id) {
            setEditing({ ...editing, status: newStatus });
            form.setFieldsValue({ status: newStatus });
          }
        } catch (err) {
          message.error(getErrorMessage(err));
        }
      }
    });
  };

  if (!user?.permissions?.includes("manage_funders")) {
    return (
      <Result
        status="403"
        title={t("common.no_permission", "无权限")}
        subTitle={t("funders.no_access", "需要 manage_funders 权限")}
      />
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" onClick={openCreate}>
          {t("funders.add", "新增资金方")}
        </Button>
      </Space>
      <DataTable<Funder>
        rowKey="id"
        loading={loading}
        data={funders}
        pagination={{ pageSize: 10 }}
        columns={[
          {
            title: t("funders.institution_name", "机构全称"),
            dataIndex: "institutionName",
            sorter: (a, b) => a.institutionName.localeCompare(b.institutionName),
            filterConfig: {
              type: "input",
              placeholder: t("funders.institution_name", "机构全称")
            }
          },
          {
            title: t("funders.institution_type", "机构类型"),
            dataIndex: "institutionType",
            render: (type: FunderType) => {
              const typeMap: Record<FunderType, string> = {
                bank: t("funders.type_bank", "银行"),
                factoring: t("funders.type_factoring", "保理公司"),
                platform: t("funders.type_platform", "平台机构"),
                other: t("funders.type_other", "其他")
              };
              return typeMap[type] || type;
            },
            filterConfig: {
              type: "select",
              placeholder: t("funders.institution_type", "机构类型"),
              options: [
                { label: t("funders.type_bank", "银行"), value: "bank" },
                { label: t("funders.type_factoring", "保理公司"), value: "factoring" },
                { label: t("funders.type_platform", "平台机构"), value: "platform" },
                { label: t("funders.type_other", "其他"), value: "other" }
              ]
            }
          },
          {
            title: t("funders.unified_social_credit_code", "统一社会信用代码"),
            dataIndex: "unifiedSocialCreditCode",
            filterConfig: {
              type: "input",
              placeholder: t("funders.unified_social_credit_code", "统一社会信用代码")
            }
          },
          {
            title: t("funders.contact_person", "联系人"),
            dataIndex: "contactPerson",
            render: (v: string | undefined) => v || "-",
            filterConfig: {
              type: "input",
              placeholder: t("funders.contact_person", "联系人")
            }
          },
          {
            title: t("funders.contact_phone", "联系电话"),
            dataIndex: "contactPhone",
            render: (v: string | undefined) => v || "-",
            filterConfig: {
              type: "input",
              placeholder: t("funders.contact_phone", "联系电话")
            }
          },
          {
            title: t("funders.credit_limit", "可授信额度"),
            dataIndex: "cumulativeCreditLimit",
            render: (v: number) => `¥${v.toLocaleString()}`,
            sorter: (a, b) => a.cumulativeCreditLimit - b.cumulativeCreditLimit
          },
          {
            title: t("funders.current_loan_balance", "当前在贷余额"),
            dataIndex: "currentLoanBalance",
            render: (v: number) => `${v.toLocaleString()} ${t("common.unit_yuan", "元")}`,
            sorter: (a, b) => a.currentLoanBalance - b.currentLoanBalance
          },
          {
            title: t("funders.status", "状态"),
            dataIndex: "status",
            render: (status: FunderStatus) => (
              <Tag color={status === "active" ? "green" : "red"}>
                {status === "active"
                  ? t("funders.status_active", "合作中")
                  : t("funders.status_disabled", "已停用")}
              </Tag>
            ),
            filterConfig: {
              type: "select",
              placeholder: t("funders.status", "状态"),
              options: [
                { label: t("funders.status_active", "合作中"), value: "active" },
                { label: t("funders.status_disabled", "已停用"), value: "disabled" }
              ]
            },
            width: 100
          },
          {
            title: t("common.actions", "操作"),
            width: 280,
            render: (_, record) => (
              <Space size={0} split={<span style={{ color: '#d9d9d9', margin: '0 4px' }}>|</span>}>
                <Button type="link" size="small" style={{ padding: '0 4px' }} onClick={() => openView(record)}>
                  {t("common.view", "查看")}
                </Button>
                <Button type="link" size="small" style={{ padding: '0 4px' }} onClick={() => openEdit(record)}>
                  {t("common.edit", "编辑")}
                </Button>
                <Button 
                  type="link" 
                  size="small" 
                  style={{ padding: '0 4px' }}
                  danger={record.status === "active"}
                  onClick={() => handleToggleStatus(record)}
                >
                  {record.status === "active" ? t("funders.disable", "停用") : t("funders.enable", "启用")}
                </Button>
                <Button danger type="link" size="small" style={{ padding: '0 4px' }} onClick={() => handleDelete(record)}>
                  {t("common.delete", "删除")}
                </Button>
              </Space>
            )
          }
        ]}
      />

      <Modal
        open={modalOpen}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Typography.Title level={4} style={{ margin: 0, color: "#1890ff" }}>
              {viewMode 
                ? t("funders.view", "查看资金方") 
                : (editing ? t("funders.edit", "编辑资金方") : t("funders.add", "新增资金方"))}
            </Typography.Title>
            {editing && (
              <Tag color={editing.status === "active" ? "green" : "default"}>
                {editing.status === "active" ? t("funders.status_active", "合作中") : t("funders.status_disabled", "已停用")}
              </Tag>
            )}
          </div>
        }
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
          setFileList({
            businessLicenseUrl: [],
            financialLicenseUrl: [],
            accountOpeningPermitUrl: []
          });
        }}
        footer={
          viewMode ? (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                {editing && (
                  <Button 
                    danger={editing.status === "active"}
                    onClick={() => {
                      if (editing) handleToggleStatus(editing);
                    }}
                  >
                    {editing.status === "active" ? t("funders.disable", "停用") : t("funders.enable", "启用")}
                  </Button>
                )}
              </div>
              <Space>
                <Button onClick={() => setModalOpen(false)}>
                  {t("common.close", "关闭")}
                </Button>
                <Button type="primary" onClick={() => setViewMode(false)}>
                  {t("common.edit", "编辑")}
                </Button>
              </Space>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                {editing && (
                  <Button 
                    danger={editing.status === "active"}
                    onClick={() => {
                      if (editing) handleToggleStatus(editing);
                    }}
                  >
                    {editing.status === "active" ? t("funders.disable", "停用") : t("funders.enable", "启用")}
                  </Button>
                )}
              </div>
              <Space>
                <Button onClick={() => setModalOpen(false)}>
                  {t("common.cancel", "取消")}
                </Button>
                <Button 
                  type="primary" 
                  onClick={async () => {
                    try {
                      await handleSave();
                    } catch (err) {
                      // 验证失败或保存失败，错误信息已在 handleSave 中处理
                    }
                  }}
                >
                  {editing
                    ? t("common.save", "保存")
                    : t("funders.save_and_submit", "保存并提交审核")}
                </Button>
              </Space>
            </div>
          )
        }
        destroyOnClose
        width={960}
        centered
        styles={{
          body: { 
            padding: "0 24px 24px",
            maxHeight: "calc(100vh - 200px)",
            overflowY: "auto"
          }
        }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: "info",
              label: t("funders.tab_info", "基础信息"),
              children: (
        <Form
          layout="vertical"
          form={form}
          size="middle"
          disabled={viewMode}
        >
          {/* 基础身份信息 */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>
              <span style={{ width: 4, height: 16, background: '#1890ff', borderRadius: 2 }} />
              {t("funders.basic_info", "基础身份信息")}
            </div>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="institutionName"
                  label={t("funders.institution_name", "机构全称")}
                  rules={[
                    { required: true, message: t("funders.institution_name_required", "请输入机构全称") }
                  ]}
                >
                  <Input placeholder={t("funders.institution_name_placeholder", "请输入与营业执照一致的全称")} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="institutionType"
                  label={t("funders.institution_type", "机构类型")}
                  rules={[{ required: true, message: t("funders.institution_type_required", "请选择机构类型") }]}
                >
                  <Select placeholder={t("funders.institution_type_placeholder", "请选择机构类型")}>
                    <Select.Option value="bank">{t("funders.type_bank", "银行")}</Select.Option>
                    <Select.Option value="factoring">{t("funders.type_factoring", "保理公司")}</Select.Option>
                    <Select.Option value="platform">{t("funders.type_platform", "平台机构")}</Select.Option>
                    <Select.Option value="other">{t("funders.type_other", "其他")}</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="unifiedSocialCreditCode"
                  label={t("funders.unified_social_credit_code", "统一社会信用代码")}
                  rules={[
                    { required: true, message: t("funders.unified_social_credit_code_required", "请输入统一社会信用代码") },
                    { len: 18, message: t("funders.unified_social_credit_code_length", "统一社会信用代码必须为18位") }
                  ]}
                >
                  <Input
                    placeholder={t("funders.unified_social_credit_code_placeholder", "18位统一社会信用代码")}
                    maxLength={18}
                    suffix={<Typography.Text type="secondary" style={{ fontSize: 12 }}>{unifiedSocialCreditCodeLength}/18</Typography.Text>}
                    onChange={(e) => setUnifiedSocialCreditCodeLength(e.target.value.length)}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="cumulativeCreditLimit"
                  label={t("funders.credit_limit", "可授信额度")}
                  rules={[{ required: true, message: t("funders.credit_limit_required", "请输入可授信额度") }]}
                >
                  <InputNumber
                    placeholder={t("funders.credit_limit_placeholder", "请输入该资金方可提供的授信额度")}
                    formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={(value) => value!.replace(/,/g, '')}
                    addonAfter="元"
                    min={0}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Col>
            </Row>
          </div>

          {/* 证照影像上传 */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>
              <span style={{ width: 4, height: 16, background: '#52c41a', borderRadius: 2 }} />
              {t("funders.license_upload", "证照影像上传")}
            </div>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item
                  name="businessLicenseUrl"
                  label={t("funders.business_license", "营业执照")}
                  rules={[{ required: true, message: t("funders.business_license_required", "请上传营业执照") }]}
                >
                <Upload
                  accept=".pdf,.jpg,.jpeg,.png"
                  maxCount={1}
                  fileList={fileList.businessLicenseUrl}
                  customRequest={async ({ file, onSuccess, onError }) => {
                    if (!token) return;
                    try {
                      setUploading(prev => ({ ...prev, businessLicenseUrl: true }));
                      const result = await uploadFileApi(token, file as File);
                      form.setFieldsValue({ 
                        businessLicenseUrl: result.url,
                        businessLicenseName: result.originalName
                      });
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
                  itemRender={(originNode, file) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', overflow: 'hidden' }}>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            cursor: 'pointer',
                            color: '#1890ff',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '100%'
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (file.url) {
                              window.open(getFullFileUrl(file.url), '_blank');
                            }
                          }}
                          title={file.name}
                        >
                          {file.name}
                        </span>
                      </div>
                      {file.status === 'done' && file.url && (
                        <Button
                          type="link"
                          size="small"
                          icon={<DownloadOutlined />}
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const fullUrl = getFullFileUrl(file.url);
                              const response = await fetch(fullUrl, {
                                headers: token ? { Authorization: `Bearer ${token}` } : {}
                              });
                              const blob = await response.blob();
                              const blobUrl = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = blobUrl;
                              a.download = file.name;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(blobUrl);
                            } catch (err) {
                              message.error(getErrorMessage(err));
                            }
                          }}
                        >
                          下载
                        </Button>
                      )}
                    </div>
                  )}
                >
                  <Button 
                    icon={<UploadOutlined />} 
                    block 
                    loading={uploading.businessLicenseUrl}
                  >
                    {t("funders.upload_pdf_jpg_png", "上传 PDF/JPG/PNG")}
                  </Button>
                </Upload>
              </Form.Item>
              </Col>
              <Col span={8}>
              <Form.Item
                name="financialLicenseUrl"
                label={t("funders.financial_license", "金融许可证")}
                rules={[{ required: true, message: t("funders.financial_license_required", "请上传金融许可证") }]}
              >
                <Upload
                  accept=".pdf,.jpg,.jpeg,.png"
                  maxCount={1}
                  fileList={fileList.financialLicenseUrl}
                  customRequest={async ({ file, onSuccess, onError }) => {
                    if (!token) return;
                    try {
                      setUploading(prev => ({ ...prev, financialLicenseUrl: true }));
                      const result = await uploadFileApi(token, file as File);
                      form.setFieldsValue({ 
                        financialLicenseUrl: result.url,
                        financialLicenseName: result.originalName
                      });
                      setFileList(prev => ({
                        ...prev,
                        financialLicenseUrl: [{
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
                      setUploading(prev => ({ ...prev, financialLicenseUrl: false }));
                    }
                  }}
                  onRemove={() => {
                    form.setFieldsValue({ 
                      financialLicenseUrl: undefined,
                      financialLicenseName: undefined
                    });
                    setFileList(prev => ({ ...prev, financialLicenseUrl: [] }));
                  }}
                  itemRender={(originNode, file) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', overflow: 'hidden' }}>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            cursor: 'pointer',
                            color: '#1890ff',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '100%'
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (file.url) {
                              window.open(getFullFileUrl(file.url), '_blank');
                            }
                          }}
                          title={file.name}
                        >
                          {file.name}
                        </span>
                      </div>
                      {file.status === 'done' && file.url && (
                        <Button
                          type="link"
                          size="small"
                          icon={<DownloadOutlined />}
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const fullUrl = getFullFileUrl(file.url);
                              const response = await fetch(fullUrl, {
                                headers: token ? { Authorization: `Bearer ${token}` } : {}
                              });
                              const blob = await response.blob();
                              const blobUrl = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = blobUrl;
                              a.download = file.name;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(blobUrl);
                            } catch (err) {
                              message.error(getErrorMessage(err));
                            }
                          }}
                        >
                          下载
                        </Button>
                      )}
                    </div>
                  )}
                >
                  <Button 
                    icon={<UploadOutlined />} 
                    block 
                    loading={uploading.financialLicenseUrl}
                  >
                    {t("funders.upload_pdf_jpg_png", "上传 PDF/JPG/PNG")}
                  </Button>
                </Upload>
              </Form.Item>
              </Col>
              <Col span={8}>
              <Form.Item
                name="accountOpeningPermitUrl"
                label={t("funders.account_opening_permit", "开户许可证")}
                rules={[{ required: true, message: t("funders.account_opening_permit_required", "请上传开户许可证") }]}
              >
                <Upload
                  accept=".pdf,.jpg,.jpeg,.png"
                  maxCount={1}
                  fileList={fileList.accountOpeningPermitUrl}
                  customRequest={async ({ file, onSuccess, onError }) => {
                    if (!token) return;
                    try {
                      setUploading(prev => ({ ...prev, accountOpeningPermitUrl: true }));
                      const result = await uploadFileApi(token, file as File);
                      form.setFieldsValue({ 
                        accountOpeningPermitUrl: result.url,
                        accountOpeningPermitName: result.originalName
                      });
                      setFileList(prev => ({
                        ...prev,
                        accountOpeningPermitUrl: [{
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
                      setUploading(prev => ({ ...prev, accountOpeningPermitUrl: false }));
                    }
                  }}
                  onRemove={() => {
                    form.setFieldsValue({ 
                      accountOpeningPermitUrl: undefined,
                      accountOpeningPermitName: undefined
                    });
                    setFileList(prev => ({ ...prev, accountOpeningPermitUrl: [] }));
                  }}
                  itemRender={(originNode, file) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', overflow: 'hidden' }}>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            cursor: 'pointer',
                            color: '#1890ff',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '100%'
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (file.url) {
                              window.open(getFullFileUrl(file.url), '_blank');
                            }
                          }}
                          title={file.name}
                        >
                          {file.name}
                        </span>
                      </div>
                      {file.status === 'done' && file.url && (
                        <Button
                          type="link"
                          size="small"
                          icon={<DownloadOutlined />}
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const fullUrl = getFullFileUrl(file.url);
                              const response = await fetch(fullUrl, {
                                headers: token ? { Authorization: `Bearer ${token}` } : {}
                              });
                              const blob = await response.blob();
                              const blobUrl = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = blobUrl;
                              a.download = file.name;
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(blobUrl);
                            } catch (err) {
                              message.error(getErrorMessage(err));
                            }
                          }}
                        >
                          下载
                        </Button>
                      )}
                    </div>
                  )}
                >
                  <Button 
                    icon={<UploadOutlined />} 
                    block 
                    loading={uploading.accountOpeningPermitUrl}
                  >
                    {t("funders.upload_pdf_jpg_png", "上传 PDF/JPG/PNG")}
                  </Button>
                </Upload>
              </Form.Item>
              </Col>
            </Row>
          </div>

          {/* 联系信息 */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>
              <span style={{ width: 4, height: 16, background: '#faad14', borderRadius: 2 }} />
              {t("funders.contact_info", "联系信息")}
            </div>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="contactPerson"
                  label={t("funders.contact_person", "联系人")}
                  rules={[
                    { required: true, message: t("funders.contact_person_required", "请输入联系人") }
                  ]}
                >
                  <Input placeholder={t("funders.contact_person_placeholder", "请输入联系人姓名")} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="contactPhone"
                  label={t("funders.contact_phone", "联系电话")}
                  rules={[
                    { required: true, message: t("funders.contact_phone_required", "请输入联系电话") },
                    { pattern: /^1[3-9]\d{9}$/, message: t("funders.contact_phone_invalid", "请输入正确的手机号") }
                  ]}
                >
                  <Input placeholder={t("funders.contact_phone_placeholder", "请输入联系电话")} />
                </Form.Item>
              </Col>
            </Row>
          </div>

          {/* 结算账户配置 */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>
              <span style={{ width: 4, height: 16, background: '#722ed1', borderRadius: 2 }} />
              {t("funders.settlement_account", "结算账户配置")}
            </div>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item
                  name="bankName"
                  label={t("funders.bank_name", "开户银行")}
                  rules={[
                    { required: true, message: t("funders.bank_name_required", "请输入开户银行") }
                  ]}
                >
                  <Input placeholder={t("funders.bank_name_placeholder", "请输入开户银行名称")} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  name="bankAccount"
                  label={t("funders.bank_account", "银行账号")}
                  rules={[
                    { required: true, message: t("funders.bank_account_required", "请输入银行账号") }
                  ]}
                >
                  <Input placeholder={t("funders.bank_account_placeholder", "请输入银行账号")} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  name="accountName"
                  label={t("funders.account_name", "账户名称")}
                  rules={[
                    { required: true, message: t("funders.account_name_required", "请输入账户名称") }
                  ]}
                >
                  <Input placeholder={t("funders.account_name_placeholder", "请输入账户名称")} />
                </Form.Item>
              </Col>
            </Row>
          </div>

          {/* 状态 - 仅编辑时显示 */}
          {editing && (
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>
                <span style={{ width: 4, height: 16, background: '#eb2f96', borderRadius: 2 }} />
                {t("funders.status_setting", "状态设置")}
              </div>
              <Form.Item
                name="status"
                label={t("funders.status", "合作状态")}
                style={{ marginBottom: 0 }}
              >
                <Select style={{ width: 200 }}>
                  <Select.Option value="active">{t("funders.status_active", "合作中")}</Select.Option>
                  <Select.Option value="disabled">{t("funders.status_disabled", "已停用")}</Select.Option>
                </Select>
              </Form.Item>
            </div>
          )}

          {/* 提示信息 */}
          <Alert
            message={
              <div>
                <div style={{ marginBottom: 4 }}>
                  {t("funders.review_notice_1", "提交后需风控岗二次复核生效")}
                </div>
                <div>
                  {t("funders.review_notice_2", "请确保所填信息与上传证照保持一致,资金方新增后需经过风控审核才能正式启用。")}
                </div>
              </div>
            }
            type="info"
            showIcon
          />
        </Form>
              )
            },
            {
              key: "contracts",
              label: (
                <span>
                  {t("funders.tab_contracts", "关联合同")}
                  {editing && relatedContracts.length > 0 && (
                    <Tag color="blue" style={{ marginLeft: 8 }}>{relatedContracts.length}</Tag>
                  )}
                </span>
              ),
              disabled: !editing,
              children: (
                <div style={{ padding: "16px 0" }}>
                  {!editing ? (
                    <Alert
                      message={t("funders.contracts_after_save", "保存后可查看关联合同")}
                      type="info"
                      showIcon
                    />
                  ) : (
                    <>
                      <div style={{ marginBottom: 16 }}>
                        <Typography.Text type="secondary">
                          {t("funders.contracts_desc", "以下合同使用了该资金方作为资金提供方")}
                        </Typography.Text>
                      </div>
                      <Table
                        size="small"
                        loading={loadingContracts}
                        dataSource={relatedContracts}
                        rowKey="id"
                        pagination={false}
                        columns={[
                          {
                            title: t("contracts.logistics_provider", "融资方"),
                            dataIndex: "logisticsProviderName",
                            width: 180,
                            ellipsis: true,
                          },
                          {
                            title: t("contracts.credit_limit", "授信额度"),
                            dataIndex: "creditLimit",
                            width: 120,
                            align: "right",
                            render: (v: number) => `¥${v?.toLocaleString() || 0}`,
                          },
                          {
                            title: t("contracts.period", "合同期限"),
                            width: 180,
                            render: (_: unknown, record: Contract) => (
                              <span>{record.startDate} ~ {record.endDate}</span>
                            ),
                          },
                          {
                            title: t("contracts.interest_rate", "年化利率"),
                            dataIndex: "annualInterestRate",
                            width: 90,
                            align: "right",
                            render: (v: number) => v ? `${v}%` : "-",
                          },
                          {
                            title: t("contracts.status", "状态"),
                            dataIndex: "status",
                            width: 80,
                            render: (status: string) => {
                              const colorMap: Record<string, string> = {
                                active: "green",
                                disabled: "default",
                                expiring_soon: "orange",
                                expired: "red",
                              };
                              const textMap: Record<string, string> = {
                                active: t("contracts.status_active", "生效中"),
                                disabled: t("contracts.status_disabled", "已停用"),
                                expiring_soon: t("contracts.status_expiring", "即将到期"),
                                expired: t("contracts.status_expired", "已到期"),
                              };
                              return <Tag color={colorMap[status] || "default"}>{textMap[status] || status}</Tag>;
                            },
                          },
                        ]}
                        locale={{
                          emptyText: (
                            <div style={{ padding: 32 }}>
                              <Typography.Text type="secondary">
                                {t("funders.no_contracts", "暂无关联合同")}
                              </Typography.Text>
                            </div>
                          ),
                        }}
                      />
                    </>
                  )}
                </div>
              )
            }
          ]}
        />
      </Modal>
    </div>
  );
}

export default FundersPage;

