import { useNavigate, useLocation } from "react-router-dom";
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  Space,
  Steps,
  Typography,
  message,
  Switch
} from "antd";
import { ArrowLeftOutlined, ReloadOutlined } from "@ant-design/icons";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import { createFinancingContractApi, getErrorMessage, fetchFunders, fetchFinanciers } from "../api";
import { DatePicker } from "antd";
import dayjs from "dayjs";
import { Funder, Financier } from "../types";

const { Title, Text } = Typography;

interface FinancingFormValues {
  funderId: string;
  logisticsProviderId: string;
  creditLimit: string;
  startDate: dayjs.Dayjs;
  endDate: dayjs.Dayjs;
  annualInterestRate: number;
  interestCalculationMode: "daily_balance" | "other";
  settlementCycle: "monthly" | "quarterly" | "biweekly";
  settlementTriggerDay?: number;
  settlementTriggerQuarterEnd?: boolean;
  settlementTriggerBiweekly?: boolean;
  autoSettlement: boolean;
  profitSharingEnabled: boolean;
  profitSharingRatio: number;
}

function CreateFinancingContractPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuth();
  const { t } = useI18n();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm<FinancingFormValues>();
  const [funders, setFunders] = useState<Funder[]>([]);
  const [financiers, setFinanciers] = useState<Financier[]>([]);
  const [loadingFunders, setLoadingFunders] = useState(false);
  const [loadingFinanciers, setLoadingFinanciers] = useState(false);

  // 重置表单状态的函数
  const resetFormState = useCallback(() => {
    setCurrentStep(0);
    form.resetFields();
  }, [form]);

  // 每次进入页面时重置状态
  useEffect(() => {
    resetFormState();
  }, [location.pathname, resetFormState]);

  // 刷新触发器
  const [refreshKey, setRefreshKey] = useState(0);

  // 加载资金方列表
  useEffect(() => {
    if (!token) return;
    setLoadingFunders(true);
    fetchFunders(token, { status: "active" })
      .then(res => setFunders(res.funders))
      .catch(err => message.error(getErrorMessage(err)))
      .finally(() => setLoadingFunders(false));
  }, [token, refreshKey]);

  // 加载融资方列表
  useEffect(() => {
    if (!token) return;
    setLoadingFinanciers(true);
    fetchFinanciers(token, { status: "active" })
      .then(res => setFinanciers(res.financiers))
      .catch(err => message.error(getErrorMessage(err)))
      .finally(() => setLoadingFinanciers(false));
  }, [token, refreshKey]);
  
  // 刷新数据
  const handleRefreshData = () => {
    setRefreshKey(prev => prev + 1);
    message.success("数据已刷新");
  };

  const handleNext = async () => {
    try {
      if (currentStep === 0) {
        await form.validateFields([
          "funderId",
          "logisticsProviderId",
          "startDate",
          "endDate"
        ]);
        setCurrentStep(1);
      } else if (currentStep === 1) {
        // 跳过第二步验证
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
      // 根据选择的ID获取对应的名称（允许为空）
      const selectedFunder = funders.find(f => f.id === values.funderId);
      const selectedFinancier = financiers.find(f => f.id === values.logisticsProviderId);

      setLoading(true);
      await createFinancingContractApi(token, {
        funderId: values.funderId || "",
        funderName: selectedFunder?.institutionName || "",
        logisticsProviderId: values.logisticsProviderId || "",
        logisticsProviderName: selectedFinancier?.enterpriseName || "",
        creditLimit: parseFloat(values.creditLimit) || 0,
        startDate: values.startDate?.format("YYYY-MM-DD") || "",
        endDate: values.endDate?.format("YYYY-MM-DD") || "",
        annualInterestRate: values.annualInterestRate || 0,
        interestCalculationMode: values.interestCalculationMode || "daily_balance",
        settlementCycle: values.settlementCycle || "monthly",
        settlementTriggerDay: values.settlementTriggerDay,
        settlementTriggerQuarterEnd: values.settlementTriggerQuarterEnd,
        settlementTriggerBiweekly: values.settlementTriggerBiweekly,
        autoSettlement: values.autoSettlement || false,
        profitSharingEnabled: values.profitSharingEnabled || false,
        profitSharingRatio: values.profitSharingRatio || 0
      });
      message.success(t("contracts.created", "创建成功"));
      navigate("/contracts", { state: { refresh: true } });
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
            {t("contracts.create_financing", "创建三方融资合同")}
          </Title>
        </Space>
        <Text type="secondary">
          {t("contracts.create_financing_subtitle", "配置融资规则与利润分成机制")}
        </Text>

        {/* Steps */}
        <Card>
          <Steps
            current={currentStep}
            style={{ marginBottom: 32 }}
            items={[
              { title: t("contracts.step1_basic", "基础信息与主体") },
              { title: t("contracts.step2_interest", "资金计息配置") },
              { title: t("contracts.step3_settlement", "利润分成与自动化") }
            ]}
          />

          <Form
            form={form}
            layout="vertical"
            initialValues={{
              interestCalculationMode: "daily_balance",
              settlementCycle: "monthly",
              autoSettlement: true
            }}
          >
            {/* Step 1: Basic Information */}
            <div style={{ display: currentStep === 0 ? "block" : "none" }}>
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
                    loading={loadingFunders || loadingFinanciers}
                  >
                    刷新数据
                  </Button>
                </div>

                <Form.Item
                  name="funderId"
                  label={t("contracts.funder_id", "选择资金方")}
                  rules={[{ required: true, message: t("contracts.funder_required", "请选择资金方") }]}
                >
                  <Select
                    placeholder={t("contracts.select_funder", "请选择资金方")}
                    loading={loadingFunders}
                    showSearch
                    filterOption={(input, option) =>
                      (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    options={funders.map(funder => ({
                      value: funder.id,
                      label: funder.institutionName
                    }))}
                  />
                </Form.Item>

                <Form.Item
                  name="logisticsProviderId"
                  label={t("contracts.logistics_provider_id", "选择物流商")}
                  rules={[{ required: true, message: t("contracts.logistics_required", "请选择物流商") }]}
                >
                  <Select
                    placeholder={t("contracts.select_logistics", "请选择物流商")}
                    loading={loadingFinanciers}
                    showSearch
                    filterOption={(input, option) =>
                      (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    options={financiers.map(financier => ({
                      value: financier.id,
                      label: financier.enterpriseName
                    }))}
                  />
                </Form.Item>

                <Form.Item
                  name="creditLimit"
                  label={t("contracts.credit_limit", "授信总额度")}
                  extra={<Text type="secondary" style={{ fontSize: 12 }}>{t("contracts.credit_limit_example", "例如: 5000000(五百万元)")}</Text>}
                >
                  <Input
                    style={{ width: "100%" }}
                    placeholder={t("contracts.enter_credit_limit", "请输入授信额度，例如: 5000000")}
                    addonBefore="¥"
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
              </div>

            {/* Step 2: Interest Configuration */}
            <div style={{ display: currentStep === 1 ? "block" : "none" }}>
                <Title level={4}>{t("contracts.step2_interest_title", "资金成本规则配置")}</Title>
                <Text type="secondary" style={{ display: "block", marginBottom: 24 }}>
                  {t("contracts.step2_interest_desc", "设置融资资金的计息方式与利率水平")}
                </Text>

                <Card style={{ marginBottom: 24, backgroundColor: "#f0f7ff", border: "1px solid #1890ff" }}>
                  <Space direction="vertical" size="small">
                    <Space>
                      <span style={{ fontSize: 20 }}>📊</span>
                      <Text strong>{t("contracts.daily_interest_calc", "日利息计算")}</Text>
                    </Space>
                    <Text>
                      {t("contracts.interest_formula", "日利息 = 每日使用余额 × (利率 ÷ 360)")}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                      ℹ️ {t("contracts.interest_formula_note", "系统将在每日日终自动计算当日利息，累计至结算日统一扣除")}
                    </Text>
                  </Space>
                </Card>

                <Form.Item
                  name="annualInterestRate"
                  label={t("contracts.annual_rate", "年化利率")}
                  extra={<Text type="secondary" style={{ fontSize: 12 }}>{t("contracts.rate_example", "资金成本年化利率，例如: 5.00%表示年化5%")}</Text>}
                >
                  <InputNumber
                    style={{ width: "100%" }}
                    min={0}
                    max={100}
                    precision={2}
                    addonAfter="%"
                    placeholder="5.00"
                  />
                </Form.Item>

                <Form.Item
                  name="interestCalculationMode"
                  label={t("contracts.interest_mode", "计息模式")}
                >
                  <Radio.Group>
                    <Radio value="daily_balance">
                      {t("contracts.daily_balance", "日终余额计息")}
                      <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                        {t("contracts.daily_balance_desc", "每日日终时刻，根据当日剩余使用额度计算利息(推荐)")}
                      </div>
                    </Radio>
                  </Radio.Group>
                </Form.Item>

                <Card style={{ marginTop: 24, backgroundColor: "#fafafa" }}>
                  <Title level={5}>{t("contracts.calc_example", "计算示例")}</Title>
                  <Space direction="vertical" size="small">
                    <Text>{t("contracts.example_balance", "假设使用余额:")} ¥1,000,000</Text>
                    <Text>{t("contracts.example_rate", "年化利率:")} 5.00%</Text>
                    <Text strong>{t("contracts.example_daily", "日利息:")} ¥138.89</Text>
                  </Space>
                </Card>

                <Form.Item
                  name="settlementCycle"
                  label={t("contracts.settlement_cycle", "结算周期")}
                  style={{ marginTop: 24 }}
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
              </div>

            {/* Step 3: Profit Sharing and Automation */}
            <div style={{ display: currentStep === 2 ? "block" : "none" }}>
                <Title level={4}>{t("contracts.step3_settlement_title", "利润分配规则配置")}</Title>
                <Text type="secondary" style={{ display: "block", marginBottom: 24 }}>
                  {t("contracts.step3_settlement_desc", "设置平台分润比例与自动结算规则")}
                </Text>

                <Card style={{ marginBottom: 24, backgroundColor: "#f9f0ff", border: "1px solid #722ed1" }}>
                  <Space direction="vertical" size="small">
                    <Space>
                      <span style={{ fontSize: 20 }}>📈</span>
                      <Text strong>{t("contracts.settlement_profit_calc", "结算利润计算")}</Text>
                    </Space>
                    <Text>
                      {t("contracts.profit_formula", "结算利润 = 业务总利润 - 累计资金利息")}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                      ℹ️ {t("contracts.profit_formula_note", "扣除资金成本后的净利润,按设定比例分配给平台方")}
                    </Text>
                  </Space>
                </Card>

                {/* 利润分配配置 */}
                <Card style={{ marginBottom: 24 }}>
                  <Title level={5} style={{ marginBottom: 16 }}>
                    {t("contracts.profit_sharing_config", "利润分配设置")}
                  </Title>
                  
                  <Form.Item
                    name="profitSharingEnabled"
                    label={t("contracts.profit_sharing_enabled", "启用利润分配")}
                    valuePropName="checked"
                    initialValue={false}
                    extra={<Text type="secondary" style={{ fontSize: 12 }}>{t("contracts.profit_sharing_enabled_desc", "开启后，平台将按比例参与利润分成")}</Text>}
                  >
                    <Switch />
                  </Form.Item>

                  <Form.Item
                    noStyle
                    shouldUpdate={(prevValues, currentValues) => 
                      prevValues.profitSharingEnabled !== currentValues.profitSharingEnabled
                    }
                  >
                    {({ getFieldValue }) => {
                      const enabled = getFieldValue("profitSharingEnabled");
                      return enabled ? (
                        <Form.Item
                          name="profitSharingRatio"
                          label={t("contracts.profit_sharing_ratio", "平台分成比例")}
                          initialValue={50}
                          rules={[
                            { required: true, message: t("contracts.profit_sharing_ratio_required", "请输入分成比例") },
                            { type: "number", min: 0, max: 100, message: t("contracts.profit_sharing_ratio_range", "比例须在0-100之间") }
                          ]}
                          extra={<Text type="secondary" style={{ fontSize: 12 }}>{t("contracts.profit_sharing_ratio_desc", "平台从结算利润中获得的分成百分比")}</Text>}
                        >
                          <InputNumber
                            min={0}
                            max={100}
                            precision={2}
                            addonAfter="%"
                            style={{ width: 160 }}
                            placeholder="50"
                          />
                        </Form.Item>
                      ) : null;
                    }}
                  </Form.Item>
                </Card>

                <Form.Item
                  name="autoSettlement"
                  label={t("contracts.auto_settlement", "自动结算开关")}
                  valuePropName="checked"
                >
                  <Switch />
                  <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
                    {t("contracts.auto_settlement_desc", "到达结算日自动生成结算单并推送至结算中心")}
                  </div>
                </Form.Item>

                {/* 动态分润示例 */}
                <Form.Item
                  noStyle
                  shouldUpdate={(prevValues, currentValues) => 
                    prevValues.profitSharingEnabled !== currentValues.profitSharingEnabled ||
                    prevValues.profitSharingRatio !== currentValues.profitSharingRatio
                  }
                >
                  {({ getFieldValue }) => {
                    const enabled = getFieldValue("profitSharingEnabled");
                    const ratio = getFieldValue("profitSharingRatio") || 0;
                    
                    // 示例数据
                    const exampleTotalProfit = 100000;
                    const exampleInterest = 10000;
                    const exampleSettlementProfit = exampleTotalProfit - exampleInterest;
                    const examplePlatformShare = enabled ? exampleSettlementProfit * (ratio / 100) : 0;
                    const examplePartnerShare = exampleSettlementProfit - examplePlatformShare;

                    return (
                      <Card style={{ marginTop: 24, backgroundColor: "#fafafa" }}>
                        <Title level={5}>{t("contracts.profit_example", "分润示例")}</Title>
                        <Space direction="vertical" size="small" style={{ width: "100%" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                            <Text>{t("contracts.example_total_profit", "业务总利润")}</Text>
                            <Text>¥{exampleTotalProfit.toLocaleString()}</Text>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                            <Text>{t("contracts.example_interest", "累计资金利息")}</Text>
                            <Text style={{ color: "#ff4d4f" }}>- ¥{exampleInterest.toLocaleString()}</Text>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #e8e8e8" }}>
                            <Text strong>{t("contracts.example_settlement_profit", "结算利润")}</Text>
                            <Text strong>¥{exampleSettlementProfit.toLocaleString()}</Text>
                          </div>
                          {enabled ? (
                            <>
                              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", marginTop: 8 }}>
                                <Text type="secondary">{t("contracts.example_platform_share", "平台分成")} ({ratio}%)</Text>
                                <Text style={{ color: "#1890ff" }}>¥{examplePlatformShare.toLocaleString()}</Text>
                              </div>
                              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                                <Text type="secondary">{t("contracts.example_partner_share", "合作方分成")} ({100 - ratio}%)</Text>
                                <Text style={{ color: "#52c41a" }}>¥{examplePartnerShare.toLocaleString()}</Text>
                              </div>
                            </>
                          ) : (
                            <div style={{ padding: "8px 0", marginTop: 8 }}>
                              <Text type="secondary" style={{ fontStyle: "italic" }}>
                                {t("contracts.no_profit_sharing", "未启用利润分配，全部利润归合作方")}
                              </Text>
                            </div>
                          )}
                        </Space>
                      </Card>
                    );
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

export default CreateFinancingContractPage;

