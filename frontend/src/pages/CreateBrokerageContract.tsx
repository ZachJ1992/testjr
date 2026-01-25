import { useNavigate, useLocation } from "react-router-dom";
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Steps,
  Typography,
  message,
  Switch,
  Upload,
  AutoComplete,
  Radio
} from "antd";
import { ArrowLeftOutlined, UploadOutlined, PercentageOutlined, DollarOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import { createBrokerageContractApi, getErrorMessage, fetchFinanciers } from "../api";
import { DatePicker } from "antd";
import dayjs from "dayjs";
import type { UploadFile } from "antd/es/upload/interface";
import { Financier } from "../types";

const { Title, Text } = Typography;

// 撮合业务抽成字段定义（暂时只显示利润和运费）
const COMMISSION_FIELDS = [
  { key: "profit", label: "利润" },
  { key: "freight", label: "运费" }
] as const;

// 抽成模式类型
type CommissionMode = "percentage" | "fixed";

// 单个字段的抽成配置项
interface CommissionConfigItem {
  id: string;
  fieldKey: string;
  mode: CommissionMode;
  value: number;
}

interface BrokerageFormValues {
  upstreamShipper: string;
  logisticsProviderName: string;
  creditLimit?: number;
  startDate: dayjs.Dayjs;
  endDate: dayjs.Dayjs;
  settlementCycle: "monthly" | "quarterly" | "biweekly";
  settlementTriggerDay?: number;
  settlementTriggerQuarterEnd?: boolean;
  settlementTriggerBiweekly?: boolean;
  autoSettlement: boolean;
  contractFiles?: UploadFile[];
}

function CreateBrokerageContractPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuth();
  const { t } = useI18n();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm<BrokerageFormValues>();
  
  // 融资方数据（用于物流商自动匹配）
  const [financiers, setFinanciers] = useState<Financier[]>([]);
  const [loadingFinanciers, setLoadingFinanciers] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  
  // 抽成配置列表（动态添加/删除）
  const [commissionItems, setCommissionItems] = useState<CommissionConfigItem[]>([
    { id: `item_${Date.now()}`, fieldKey: "", mode: "percentage", value: 0 }
  ]);

  // 生成唯一ID
  const generateId = () => `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // 重置表单状态的函数
  const resetFormState = useCallback(() => {
    setCurrentStep(0);
    form.resetFields();
    setSearchValue("");
    setFileList([]);
    setCommissionItems([
      { id: generateId(), fieldKey: "", mode: "percentage", value: 0 }
    ]);
  }, [form]);

  // 每次进入页面时重置状态
  useEffect(() => {
    resetFormState();
  }, [location.pathname, resetFormState]);

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
      { id: generateId(), fieldKey: "", mode: "percentage", value: 0 }
    ]);
  };

  // 删除卡片
  const handleRemoveCard = (id: string) => {
    setCommissionItems(prev => prev.filter(item => item.id !== id));
  };

  // 更新卡片配置
  const handleUpdateCard = (id: string, updates: Partial<CommissionConfigItem>) => {
    setCommissionItems(prev => prev.map(item =>
      item.id === id ? { ...item, ...updates } : item
    ));
  };

  // 刷新触发器
  const [refreshKey, setRefreshKey] = useState(0);

  // 加载融资方数据
  useEffect(() => {
    if (!token) return;
    setLoadingFinanciers(true);
    fetchFinanciers(token)
      .then(data => setFinanciers(data.financiers || []))
      .catch(err => message.error(getErrorMessage(err)))
      .finally(() => setLoadingFinanciers(false));
  }, [token, refreshKey]);
  
  // 刷新数据
  const handleRefreshData = () => {
    setRefreshKey(prev => prev + 1);
    message.success("数据已刷新");
  };

  // 根据输入过滤融资方选项
  const filteredOptions = useMemo(() => {
    if (!searchValue) {
      return financiers.map(f => ({
        value: f.enterpriseName,
        label: f.enterpriseName,
        id: f.id
      }));
    }
    return financiers
      .filter(f => 
        f.enterpriseName.toLowerCase().includes(searchValue.toLowerCase()) ||
        (f.unifiedSocialCreditCode && f.unifiedSocialCreditCode.includes(searchValue))
      )
      .map(f => ({
        value: f.enterpriseName,
        label: f.enterpriseName,
        id: f.id
      }));
  }, [financiers, searchValue]);

  const handleNext = async () => {
    try {
      if (currentStep === 0) {
        await form.validateFields([
          "upstreamShipper",
          "logisticsProviderName",
          "startDate",
          "endDate"
        ]);
        setCurrentStep(1);
      } else if (currentStep === 1) {
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
        setCurrentStep(2);
      }
    } catch (err) {
      // Validation failed
    }
  };

  const handlePrev = () => {
    setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async () => {
    if (!token) return;
    try {
      const values = await form.validateFields();
      // 查找选中的融资方ID
      const selectedFinancier = financiers.find(f => f.enterpriseName === values.logisticsProviderName);
      
      // 构建抽成配置
      const validItems = commissionItems.filter(item => item.fieldKey && item.value > 0);
      const commissionConfig = validItems.map(item => ({
        fieldKey: item.fieldKey,
        fieldLabel: COMMISSION_FIELDS.find(f => f.key === item.fieldKey)?.label || "",
        mode: item.mode,
        value: item.value
      }));
      
      setLoading(true);
      await createBrokerageContractApi(token, {
        logisticsProviderId: selectedFinancier?.id || values.logisticsProviderName || "",
        logisticsProviderName: values.logisticsProviderName || "",
        upstreamShipper: values.upstreamShipper || "",
        creditLimit: values.creditLimit || 0,
        startDate: values.startDate?.format("YYYY-MM-DD") || "",
        endDate: values.endDate?.format("YYYY-MM-DD") || "",
        commissionConfig,
        settlementCycle: values.settlementCycle || "monthly",
        settlementTriggerDay: values.settlementTriggerDay,
        settlementTriggerQuarterEnd: values.settlementTriggerQuarterEnd,
        settlementTriggerBiweekly: values.settlementTriggerBiweekly,
        autoSettlement: values.autoSettlement || false,
        contractFiles: fileList.map(f => f.response?.url || f.name)
      });
      message.success(t("contracts.created", "创建成功"));
      navigate("/brokerage-contracts", { state: { refresh: true } });
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        {/* Header */}
        <Space>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate("/contracts")}
          >
            {t("common.back", "返回")}
          </Button>
          <Title level={2} style={{ margin: 0 }}>
            {t("contracts.create_brokerage", "录入撮合合同")}
          </Title>
        </Space>
        <Text type="secondary">
          {t("contracts.create_brokerage_subtitle", "配置撮合业务规则与利润分成机制")}
        </Text>

        {/* Steps */}
        <Card>
          <Steps
            current={currentStep}
            style={{ marginBottom: 32 }}
            items={[
              { title: t("contracts.step1_basic", "基础信息与主体") },
              { title: t("contracts.step2_config", "配置") },
              { title: t("contracts.step3_automation", "结算自动化") }
            ]}
          />

          <Form
            form={form}
            layout="vertical"
            initialValues={{
              settlementCycle: "monthly",
              autoSettlement: true,
              sharingMode: "percentage"
            }}
          >
            {/* Step 1: Basic Information */}
            <div style={{ display: currentStep === 0 ? "block" : "none", minWidth: 600 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div>
                    <Title level={4} style={{ marginBottom: 0 }}>{t("contracts.step1_basic", "基础信息与主体")}</Title>
                    <Text type="secondary">
                      {t("contracts.step1_desc", "选择合同参与方和基础配置信息")}
                    </Text>
                  </div>
                  <Button 
                    icon={<ReloadOutlined />} 
                    onClick={handleRefreshData}
                    loading={loadingFinanciers}
                  >
                    刷新数据
                  </Button>
                </div>

                <Form.Item
                  name="upstreamShipper"
                  label={t("contracts.upstream_shipper", "上游货主")}
                  rules={[{ required: true, message: t("contracts.upstream_shipper_required", "请输入上游货主") }]}
                >
                  <Input placeholder={t("contracts.enter_upstream_shipper", "请输入上游货主名称")} />
                </Form.Item>

                <Form.Item
                  name="logisticsProviderName"
                  label={t("contracts.logistics_provider_name", "物流商名称")}
                  rules={[{ required: true, message: t("contracts.logistics_name_required", "请选择或输入物流商名称") }]}
                >
                  <AutoComplete
                    options={filteredOptions}
                    onSearch={setSearchValue}
                    placeholder={t("contracts.enter_logistics_name", "请输入物流商名称（支持自动匹配）")}
                    notFoundContent={loadingFinanciers ? "加载中..." : "无匹配结果，可直接输入"}
                    allowClear
                  />
                </Form.Item>

                <Form.Item
                  name="creditLimit"
                  label={t("contracts.credit_limit", "授信总额度")}
                >
                  <InputNumber
                    prefix="¥"
                    style={{ width: "100%" }}
                    placeholder={t("contracts.enter_credit_limit", "请输入授信额度（选填）")}
                    formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={(value) => value!.replace(/\$\s?|(,*)/g, '')}
                  />
                </Form.Item>

                <Form.Item
                  name="startDate"
                  label={t("contracts.start_date", "合同开始日期")}
                  rules={[{ required: true, message: t("contracts.start_date_required", "请选择合同开始日期") }]}
                >
                  <DatePicker style={{ width: "100%" }} />
                </Form.Item>

                <Form.Item
                  name="endDate"
                  label={t("contracts.end_date", "合同结束日期")}
                  rules={[{ required: true, message: t("contracts.end_date_required", "请选择合同结束日期") }]}
                >
                  <DatePicker style={{ width: "100%" }} />
                </Form.Item>

                <Form.Item
                  label={t("contracts.contract_files", "合同文件")}
                >
                  <Upload
                    fileList={fileList}
                    onChange={({ fileList: newFileList }) => setFileList(newFileList)}
                    beforeUpload={() => false}
                    multiple
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  >
                    <Button icon={<UploadOutlined />}>
                      {t("contracts.upload_contract", "上传合同文件")}
                    </Button>
                  </Upload>
                  <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 4 }}>
                    {t("contracts.upload_hint", "支持 PDF、Word、图片格式，可上传多个文件")}
                  </Text>
                </Form.Item>
              </div>

            {/* Step 2: Configuration */}
            <div style={{ display: currentStep === 1 ? "block" : "none", minWidth: 600 }}>
                <Title level={4}>{t("contracts.step2_config_title", "配置")}</Title>
                <Text type="secondary" style={{ display: "block", marginBottom: 24 }}>
                  设置抽成对象与结算周期
                </Text>

                {/* 抽成配置区域 */}
                <div style={{ 
                  background: "#f6f0ff", 
                  padding: "16px 20px", 
                  borderRadius: 8,
                  marginBottom: 24
                }}>
                  <div style={{ 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center",
                    marginBottom: 16 
                  }}>
                    <Title level={5} style={{ margin: 0, color: "#722ed1" }}>
                      抽成配置
                    </Title>
                    <Button
                      type="dashed"
                      icon={<PlusOutlined />}
                      onClick={handleAddCard}
                      disabled={getAvailableFields().length === 0}
                      style={{ color: "#722ed1", borderColor: "#722ed1" }}
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
                          border: item.fieldKey ? "1px solid #722ed1" : "1px solid #d9d9d9",
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
                              background: item.fieldKey ? "#722ed1" : "#d9d9d9",
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
                              placeholder="选择抽成对象"
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
                                <PercentageOutlined style={{ marginRight: 2 }} />
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
                        border: "1px dashed #722ed1",
                        borderRadius: 8,
                        padding: "8px 16px",
                        textAlign: "center",
                        color: "#722ed1",
                        cursor: "pointer",
                        transition: "all 0.2s",
                        marginTop: 8
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#f6f0ff";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "#fff";
                      }}
                    >
                      <PlusOutlined style={{ marginRight: 8 }} />
                      添加抽成项
                    </div>
                  )}
                </div>

                <Form.Item
                  name="settlementCycle"
                  label={t("contracts.settlement_cycle", "结算周期")}
                >
                  <Select>
                    <Select.Option value="monthly">{t("contracts.settlement_monthly", "每月自动结算")}</Select.Option>
                    <Select.Option value="quarterly">{t("contracts.settlement_quarterly", "每季度自动结算")}</Select.Option>
                    <Select.Option value="biweekly">{t("contracts.settlement_biweekly", "每两周自动结算")}</Select.Option>
                  </Select>
                </Form.Item>

                <Form.Item
                  noStyle
                  shouldUpdate={(prevValues, currentValues) => prevValues.settlementCycle !== currentValues.settlementCycle}
                >
                  {({ getFieldValue }) => {
                    const cycle = getFieldValue("settlementCycle");
                    if (cycle === "monthly") {
                      return (
                        <Form.Item
                          name="settlementTriggerDay"
                          label={t("contracts.settlement_trigger_day", "结算触发日")}
                          extra={<Text type="secondary" style={{ fontSize: 12 }}>{t("contracts.trigger_day_desc", "系统将在每月指定日期自动触发结算流程")}</Text>}
                        >
                          <Select placeholder={t("contracts.select_trigger_day", "请选择结算触发日")}>
                            {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                              <Select.Option key={day} value={day}>
                                {t("contracts.monthly_day", "每月{day}日").replace("{day}", String(day))}
                              </Select.Option>
                            ))}
                          </Select>
                        </Form.Item>
                      );
                    }
                    return null;
                  }}
                </Form.Item>

                {/* 抽成配置预览 */}
                {commissionItems.filter(item => item.fieldKey && item.value > 0).length > 0 && (
                  <Card style={{ marginTop: 24, backgroundColor: "#fafafa" }}>
                    <Title level={5}>抽成配置预览</Title>
                    <Space direction="vertical" size="small" style={{ width: "100%" }}>
                      {commissionItems.filter(item => item.fieldKey && item.value > 0).map(item => {
                        const field = COMMISSION_FIELDS.find(f => f.key === item.fieldKey);
                        return (
                          <div key={item.id} style={{ display: "flex", justifyContent: "space-between" }}>
                            <Text>{field?.label || item.fieldKey}</Text>
                            <Text strong style={{ color: "#722ed1" }}>
                              {item.mode === "percentage" ? `${item.value}%` : `¥${item.value}/单`}
                            </Text>
                          </div>
                        );
                      })}
                    </Space>
                  </Card>
                )}
              </div>

            {/* Step 3: Automation */}
            <div style={{ display: currentStep === 2 ? "block" : "none", minWidth: 600 }}>
                <Title level={4}>{t("contracts.step3_automation_title", "结算自动化配置")}</Title>
                <Text type="secondary" style={{ display: "block", marginBottom: 24 }}>
                  {t("contracts.step3_automation_desc", "配置自动结算规则")}
                </Text>

                <Form.Item
                  name="autoSettlement"
                  label={t("contracts.auto_settlement", "自动结算")}
                  valuePropName="checked"
                  style={{ width: "100%" }}
                >
                  <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                </Form.Item>
                
                {/* 开关与提示词联动 */}
                <Form.Item noStyle shouldUpdate={(prev, curr) => prev.autoSettlement !== curr.autoSettlement}>
                  {({ getFieldValue }) => {
                    const enabled = getFieldValue("autoSettlement");
                    const triggerDay = form.getFieldValue("settlementTriggerDay");
                    const cycle = form.getFieldValue("settlementCycle");
                    
                    if (enabled) {
                      // 开启状态
                      return (
                        <div style={{ marginBottom: 16, padding: 12, backgroundColor: "#f6ffed", border: "1px solid #b7eb8f", borderRadius: 4, width: "100%" }}>
                          <Space>
                            <span style={{ color: "#52c41a" }}>✓</span>
                            <Text style={{ color: "#52c41a" }}>
                              {triggerDay 
                                ? `已启用自动结算，系统将在每月${triggerDay}日自动生成结算单并推送至结算中心`
                                : cycle === "quarterly" 
                                  ? "已启用自动结算，系统将在每季度末自动生成结算单并推送至结算中心"
                                  : cycle === "biweekly"
                                    ? "已启用自动结算，系统将每两周自动生成结算单并推送至结算中心"
                                    : "已启用自动结算，到达结算日自动生成结算单并推送至结算中心"
                              }
                            </Text>
                          </Space>
                        </div>
                      );
                    } else {
                      // 关闭状态
                      return (
                        <div style={{ marginBottom: 16, padding: 12, backgroundColor: "#fff7e6", border: "1px solid #ffd591", borderRadius: 4, width: "100%" }}>
                          <Space>
                            <span style={{ color: "#fa8c16" }}>⚠</span>
                            <Text style={{ color: "#fa8c16" }}>
                              自动结算已关闭，到达结算日后需手动创建结算单
                            </Text>
                          </Space>
                        </div>
                      );
                    }
                  }}
                </Form.Item>
              </div>

            {/* Buttons */}
            <Form.Item style={{ marginTop: 32, marginBottom: 0, textAlign: "right" }}>
              <Space>
                <Button onClick={() => navigate("/contracts")}>
                  {t("common.cancel", "取消")}
                </Button>
                {currentStep > 0 && (
                  <Button onClick={handlePrev}>
                    {t("contracts.prev_step", "上一步")}
                  </Button>
                )}
                {currentStep < 2 ? (
                  <Button type="primary" onClick={handleNext}>
                    {t("contracts.next_step", "下一步")}
                  </Button>
                ) : (
                  <Button type="primary" loading={loading} onClick={handleSubmit}>
                    {t("contracts.save_activate", "保存并生效")}
                  </Button>
                )}
              </Space>
            </Form.Item>
          </Form>
        </Card>
      </Space>
    </div>
  );
}

export default CreateBrokerageContractPage;

