import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  Slider,
  Space,
  Typography,
  message,
  Alert,
  Row,
  Col,
  Tooltip
} from "antd";
import { ReloadOutlined, SaveOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import {
  fetchSystemParameters,
  updateSystemParametersApi,
  resetSystemParametersApi,
  getErrorMessage
} from "../api";
import { SystemParameters } from "../types";

const { Title, Text } = Typography;

function SystemParametersPage() {
  const { token, user } = useAuth();
  const { t } = useI18n();
  const [form] = Form.useForm<SystemParameters>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentValues, setCurrentValues] = useState<SystemParameters | null>(null);

  const loadParameters = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetchSystemParameters(token);
      setCurrentValues(res.parameters);
      form.setFieldsValue(res.parameters);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadParameters();
  }, [token]);

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (!token) return;
      setSaving(true);
      await updateSystemParametersApi(token, values);
      message.success(t("system_parameters.save_success", "保存成功"));
      await loadParameters();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!token) return;
    try {
      await resetSystemParametersApi(token);
      message.success(t("system_parameters.reset_success", "已恢复默认值"));
      await loadParameters();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: "CNY",
      minimumFractionDigits: 0
    }).format(value);
  };

  if (!user?.permissions?.includes("manage_system_parameters")) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <Title level={4}>{t("common.no_permission", "无权限")}</Title>
        <Text>{t("system_parameters.no_access", "需要 manage_system_parameters 权限")}</Text>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={2} style={{ margin: 0 }}>
            {t("system_parameters.title", "全局参数配置")}
          </Title>
          <Text type="secondary">
            {t("system_parameters.subtitle", "系统业务规则与风控阈值管理")}
          </Text>
        </Col>
      </Row>

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          annualInterestCalculationDays: 360,
          dailyInterestRoundingRule: "round_half_up",
          defaultProfitSharingRatio: 50,
          singlePaymentLimit: 500000,
          enterpriseDailyPaymentLimit: 5000000,
          fundPoolWarningLevel: 15,
          repaymentGracePeriod: 3,
          penaltyInterestRatio: 1.5
        }}
      >
        {/* 清结算基础参数 */}
        <Card
          title={t("system_parameters.settlement_basic_params", "清结算基础参数")}
          style={{ marginBottom: 24 }}
        >
          <Row gutter={24}>
            <Col span={12}>
              <Form.Item
                label={
                  <Space>
                    <span>{t("system_parameters.annual_interest_days", "年计息基础天数")}</span>
                    <Tooltip title={t("system_parameters.annual_interest_days_tip", "用于计算年化利率的基础天数")}>
                      <QuestionCircleOutlined style={{ color: "#999" }} />
                    </Tooltip>
                  </Space>
                }
                name="annualInterestCalculationDays"
              >
                <Radio.Group>
                  <Radio value={360}>
                    {t("system_parameters.days_360", "360天 (银行标准)")}
                  </Radio>
                  <Radio value={365}>
                    {t("system_parameters.days_365", "365天 (自然年)")}
                  </Radio>
                </Radio.Group>
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                label={
                  <Space>
                    <span>{t("system_parameters.daily_interest_rounding", "日计息取整规则")}</span>
                    <Tooltip title={t("system_parameters.daily_interest_rounding_tip", "日计息金额的取整方式")}>
                      <QuestionCircleOutlined style={{ color: "#999" }} />
                    </Tooltip>
                  </Space>
                }
                name="dailyInterestRoundingRule"
              >
                <Select>
                  <Select.Option value="round_up">
                    {t("system_parameters.round_up", "向上取整 (对资金方有利)")}
                  </Select.Option>
                  <Select.Option value="round_half_up">
                    {t("system_parameters.round_half_up", "四舍五入 (标准规则)")}
                  </Select.Option>
                  <Select.Option value="round_down">
                    {t("system_parameters.round_down", "向下取整 (对融资方有利)")}
                  </Select.Option>
                </Select>
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                label={t("system_parameters.default_profit_ratio", "默认分润比例")}
                name="defaultProfitSharingRatio"
                rules={[
                  { required: true, message: t("system_parameters.profit_ratio_required", "请输入默认分润比例") },
                  { type: "number", min: 0, max: 100, message: t("system_parameters.profit_ratio_range", "分润比例应在0-100之间") }
                ]}
              >
                <InputNumber
                  min={0}
                  max={100}
                  precision={2}
                  formatter={(value) => `${value}%`}
                  parser={(value) => {
                    const num = parseFloat(value!.replace("%", ""));
                    return (isNaN(num) ? 0 : num) as any;
                  }}
                  style={{ width: "100%" }}
                />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* 支付风控阈值 */}
        <Card
          title={t("system_parameters.payment_risk_thresholds", "支付风控阈值")}
          style={{ marginBottom: 24 }}
        >
          <Row gutter={24}>
            <Col span={12}>
              <Form.Item
                label={t("system_parameters.single_payment_limit", "单笔代付上限")}
                name="singlePaymentLimit"
                rules={[
                  { required: true, message: t("system_parameters.payment_limit_required", "请输入单笔代付上限") },
                  { type: "number", min: 0, message: t("system_parameters.payment_limit_positive", "金额必须大于0") }
                ]}
              >
                <InputNumber
                  min={0}
                  precision={2}
                  formatter={(value) => `¥ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                  parser={(value) => {
                    const num = parseFloat(value!.replace(/¥\s?|(,*)/g, ""));
                    return (isNaN(num) ? 0 : num) as any;
                  }}
                  style={{ width: "100%" }}
                />
              </Form.Item>
              {currentValues && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t("system_parameters.current", "当前")}: {formatCurrency(currentValues.singlePaymentLimit)}
                </Text>
              )}
            </Col>

            <Col span={12}>
              <Form.Item
                label={t("system_parameters.daily_payment_limit", "企业日累计支出上限")}
                name="enterpriseDailyPaymentLimit"
                rules={[
                  { required: true, message: t("system_parameters.daily_limit_required", "请输入企业日累计支出上限") },
                  { type: "number", min: 0, message: t("system_parameters.daily_limit_positive", "金额必须大于0") }
                ]}
              >
                <InputNumber
                  min={0}
                  precision={2}
                  formatter={(value) => `¥ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                  parser={(value) => {
                    const num = parseFloat(value!.replace(/¥\s?|(,*)/g, ""));
                    return (isNaN(num) ? 0 : num) as any;
                  }}
                  style={{ width: "100%" }}
                />
              </Form.Item>
              {currentValues && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t("system_parameters.current", "当前")}: {formatCurrency(currentValues.enterpriseDailyPaymentLimit)}
                </Text>
              )}
            </Col>

            <Col span={24}>
              <Form.Item
                label={t("system_parameters.fund_pool_warning", "资金池水位预警线")}
                name="fundPoolWarningLevel"
                rules={[
                  { required: true, message: t("system_parameters.warning_level_required", "请设置资金池水位预警线") },
                  { type: "number", min: 0, max: 100, message: t("system_parameters.warning_level_range", "预警线应在0-100之间") }
                ]}
              >
                <Space direction="vertical" style={{ width: "100%" }}>
                  <InputNumber
                    min={0}
                    max={100}
                    precision={2}
                    formatter={(value) => `${value}%`}
                    parser={(value) => {
                      const num = parseFloat(value!.replace("%", ""));
                      return (isNaN(num) ? 0 : num) as any;
                    }}
                    style={{ width: 200 }}
                    onChange={(value) => {
                      form.setFieldsValue({ fundPoolWarningLevel: value || 0 });
                    }}
                  />
                  <div style={{ paddingRight: 24 }}>
                    <Form.Item noStyle name="fundPoolWarningLevel">
                      <Slider
                        min={0}
                        max={100}
                        marks={{
                          10: t("system_parameters.low", "10%(低)"),
                          20: t("system_parameters.medium", "20%(中)"),
                          30: t("system_parameters.high", "30%(高)")
                        }}
                        tooltip={{ formatter: (value) => `${value}%` }}
                        onChange={(value) => {
                          form.setFieldsValue({ fundPoolWarningLevel: value });
                        }}
                      />
                    </Form.Item>
                  </div>
                </Space>
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* 逾期与罚息规则 */}
        <Card
          title={t("system_parameters.overdue_penalty_rules", "逾期与罚息规则")}
          style={{ marginBottom: 24 }}
        >
          <Row gutter={24}>
            <Col span={12}>
              <Form.Item
                label={t("system_parameters.grace_period", "还款宽限期")}
                name="repaymentGracePeriod"
                rules={[
                  { required: true, message: t("system_parameters.grace_period_required", "请输入还款宽限期") },
                  { type: "number", min: 0, max: 30, message: t("system_parameters.grace_period_range", "宽限期应在0-30天之间") }
                ]}
              >
                <InputNumber
                  min={0}
                  max={30}
                  precision={0}
                  addonAfter={t("system_parameters.days", "天")}
                  style={{ width: "100%" }}
                />
              </Form.Item>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t("system_parameters.grace_period_tip", "建议设置为1-7天,过长可能影响资金回笼效率")}
              </Text>
            </Col>

            <Col span={12}>
              <Form.Item
                label={t("system_parameters.penalty_ratio", "罚息加收比例")}
                name="penaltyInterestRatio"
                rules={[
                  { required: true, message: t("system_parameters.penalty_ratio_required", "请输入罚息加收比例") },
                  { type: "number", min: 0, message: t("system_parameters.penalty_ratio_positive", "比例必须大于0") }
                ]}
              >
                <InputNumber
                  min={0}
                  precision={2}
                  formatter={(value) => `${value}%`}
                  parser={(value) => {
                    const num = parseFloat(value!.replace("%", ""));
                    return (isNaN(num) ? 0 : num) as any;
                  }}
                  style={{ width: "100%" }}
                />
              </Form.Item>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t("system_parameters.penalty_formula", "罚息= 逾期金额×(原利率+罚息比例)×逾期天数/360")}
              </Text>
            </Col>
          </Row>
        </Card>

        {/* 操作按钮 */}
        <div style={{ marginTop: 24 }}>
          <Alert
            message={t("system_parameters.warning", "注意: 参数修改将影响后续所有业务计算,请谨慎操作")}
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Space>
            <Button
              icon={<ReloadOutlined />}
              onClick={handleReset}
              loading={loading}
            >
              {t("system_parameters.reset_default", "恢复默认")}
            </Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={saving}
            >
              {t("system_parameters.save", "保存全局配置")}
            </Button>
          </Space>
        </div>
      </Form>
    </div>
  );
}

export default SystemParametersPage;

