import {
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  message,
  Result,
  Row,
  Select,
  Space,
  Steps,
  Switch,
  Table,
  Tag,
  Typography,
  Divider,
  Alert,
  Checkbox
} from "antd";
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckOutlined,
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import {
  fetchFunders,
  fetchFinanciers,
  createDirectedPayContractApi,
  addPaymentCategoryApi,
  fetchPaymentCategoryTemplates,
  getErrorMessage
} from "../api";
import type { Funder, Financier, WaybillStatus } from "../types";
import { WAYBILL_STATUS_OPTIONS } from "../types";

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;
const { TextArea } = Input;

// 支付类别配置项类型
interface CategoryConfigItem {
  key: string;
  categoryCode: string;
  categoryName: string;
  paymentRatio: number;  // 支付比例 (0-100)，如80表示最多支付原始金额的80%
  minAmount?: number;
  maxAmount?: number;
  dailyLimit?: number;
  requirePlatformApproval: boolean;
  requireFunderApproval: boolean;
  platformApprovalThreshold?: number;
  funderApprovalThreshold?: number;
  autoPaymentEnabled: boolean;
  enabled: boolean;
  unlockStatus: WaybillStatus;  // 解锁状态：达到此状态后可申请该费用
}

function CreateDirectedPayContractPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token, user } = useAuth();
  const { t } = useI18n();
  const [form] = Form.useForm();

  // 步骤控制
  const [currentStep, setCurrentStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // 数据
  const [funders, setFunders] = useState<Funder[]>([]);
  const [financiers, setFinanciers] = useState<Financier[]>([]);
  const [categoryTemplates, setCategoryTemplates] = useState<{ code: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);

  // 支付类别配置
  const [categoryConfigs, setCategoryConfigs] = useState<CategoryConfigItem[]>([]);

  // 表单数据暂存
  const [formData, setFormData] = useState<any>({});
  
  // 刷新触发器
  const [refreshKey, setRefreshKey] = useState(0);

  // 重置表单状态的函数
  const resetFormState = useCallback(() => {
    setCurrentStep(0);
    form.resetFields();
    setCategoryConfigs([]);
    setFormData({});
  }, [form]);

  // 每次进入页面时重置状态
  useEffect(() => {
    resetFormState();
  }, [location.pathname, resetFormState]);

  // 加载基础数据
  const loadBaseData = () => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      fetchFunders(token),
      fetchFinanciers(token),
      fetchPaymentCategoryTemplates(token)
    ])
      .then(([fundersRes, financiersRes, templatesRes]) => {
        setFunders(fundersRes.funders || []);
        setFinanciers(financiersRes.financiers || []);
        setCategoryTemplates(templatesRes.templates || []);
      })
      .catch((err) => message.error(getErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadBaseData();
  }, [token, refreshKey]);
  
  // 刷新数据
  const handleRefreshData = () => {
    setRefreshKey(prev => prev + 1);
    message.success("数据已刷新");
  };

  // 下一步
  const handleNext = async () => {
    try {
      if (currentStep === 0) {
        // 验证基本信息
        const values = await form.validateFields([
          "funderId", "financierId", "creditLimit", "annualInterestRate", "contractPeriod"
        ]);
        setFormData({ ...formData, ...values });
      } else if (currentStep === 1) {
        // 验证支付类别配置
        const enabledCategories = categoryConfigs.filter(c => c.enabled);
        if (enabledCategories.length === 0) {
          message.warning("请至少选择一个支付类别");
          return;
        }
        setFormData({ ...formData, categoryConfigs });
      } else if (currentStep === 2) {
        // 验证结算配置
        const values = await form.validateFields([
          "settlementCycle", "settlementDay", "gracePeriodDays", "interestCalcBase"
        ]);
        setFormData({ ...formData, ...values });
      }
      setCurrentStep(currentStep + 1);
    } catch (err) {
      // 表单验证失败
    }
  };

  // 上一步
  const handlePrev = () => {
    setCurrentStep(currentStep - 1);
  };

  // 提交合同
  const handleSubmit = async () => {
    if (!token) return;
    setSubmitting(true);
    try {
      const { contractPeriod, ...rest } = formData;
      
      // 创建合同
      const contractRes = await createDirectedPayContractApi(token, {
        funderId: rest.funderId,
        financierId: rest.financierId,
        creditLimit: rest.creditLimit,
        annualInterestRate: rest.annualInterestRate / 100, // 转为小数
        interestCalcBase: rest.interestCalcBase,
        startDate: contractPeriod[0].format("YYYY-MM-DD"),
        endDate: contractPeriod[1].format("YYYY-MM-DD"),
        settlementCycle: rest.settlementCycle,
        settlementDay: rest.settlementDay,
        gracePeriodDays: rest.gracePeriodDays,
        remark: rest.remark
      });

      const contractId = contractRes.contract.id;

      // 添加支付类别配置
      const enabledCategories = categoryConfigs.filter(c => c.enabled);
      for (const cat of enabledCategories) {
        await addPaymentCategoryApi(token, contractId, {
          categoryCode: cat.categoryCode,
          categoryName: cat.categoryName,
          paymentRatio: cat.paymentRatio, // 支付比例(0-100)
          minAmount: cat.minAmount,
          maxAmount: cat.maxAmount,
          dailyLimit: cat.dailyLimit,
          requirePlatformApproval: cat.requirePlatformApproval,
          requireFunderApproval: cat.requireFunderApproval,
          platformApprovalThreshold: cat.platformApprovalThreshold,
          funderApprovalThreshold: cat.funderApprovalThreshold,
          autoPaymentEnabled: cat.autoPaymentEnabled,
          unlockStatus: cat.unlockStatus  // 解锁状态
        });
      }

      message.success("合同创建成功");
      navigate("/directed-pay-contracts", { state: { refresh: true } });
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  // 添加支付类别
  const handleAddCategory = (code: string) => {
    const template = categoryTemplates.find(t => t.code === code);
    if (!template) return;
    
    // 检查是否已存在
    if (categoryConfigs.some(c => c.categoryCode === code)) {
      message.warning("该类别已添加");
      return;
    }

    setCategoryConfigs([
      ...categoryConfigs,
      {
        key: code,
        categoryCode: code,
        categoryName: template.name,
        paymentRatio: 100, // 默认100%，即全额支付
        requirePlatformApproval: true,
        requireFunderApproval: true,
        autoPaymentEnabled: false,
        enabled: true,
        unlockStatus: "created"  // 默认"已创建"状态即可申请
      }
    ]);
  };

  // 删除支付类别
  const handleRemoveCategory = (key: string) => {
    setCategoryConfigs(categoryConfigs.filter(c => c.key !== key));
  };

  // 更新支付类别配置
  const handleUpdateCategory = (key: string, field: string, value: any) => {
    setCategoryConfigs(categoryConfigs.map(c => 
      c.key === key ? { ...c, [field]: value } : c
    ));
  };

  // 无权限提示
  if (!user?.permissions?.includes("manage_directed_pay_contracts")) {
    return (
      <Result
        status="403"
        title="无权限"
        subTitle="您没有创建定向支付合同的权限"
        extra={<Button type="primary" onClick={() => navigate("/")}>返回首页</Button>}
      />
    );
  }

  // 渲染步骤内容
  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return renderBasicInfo();
      case 1:
        return renderCategoryConfig();
      case 2:
        return renderSettlementConfig();
      case 3:
        return renderConfirm();
      default:
        return null;
    }
  };

  // 第一步：基本信息
  const renderBasicInfo = () => (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <Title level={4} style={{ marginBottom: 0 }}>基本信息</Title>
          <Paragraph type="secondary" style={{ marginBottom: 0 }}>设置合同签约方和授信额度</Paragraph>
        </div>
        <Button 
          icon={<ReloadOutlined />} 
          onClick={handleRefreshData}
          loading={loading}
        >
          刷新数据
        </Button>
      </div>
      
      <Form form={form} layout="vertical" initialValues={formData}>
        <Row gutter={24}>
          <Col span={12}>
            <Form.Item
              name="funderId"
              label="资金方"
              rules={[{ required: true, message: "请选择资金方" }]}
            >
              <Select
                placeholder="请选择资金方"
                showSearch
                optionFilterProp="children"
                loading={loading}
              >
                {funders.map(f => (
                  <Select.Option key={f.id} value={f.id}>{f.institutionName}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="financierId"
              label="融资方"
              rules={[{ required: true, message: "请选择融资方" }]}
            >
              <Select
                placeholder="请选择融资方"
                showSearch
                optionFilterProp="children"
                loading={loading}
              >
                {financiers.map(f => (
                  <Select.Option key={f.id} value={f.id}>{f.enterpriseName}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={24}>
          <Col span={12}>
            <Form.Item
              name="creditLimit"
              label="授信总额度"
              rules={[
                { required: true, message: "请输入授信总额度" },
                { type: "number", min: 0, message: "额度不能为负数" }
              ]}
            >
              <InputNumber
                placeholder="请输入授信总额度"
                style={{ width: "100%" }}
                formatter={(value) => `¥ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                parser={(value) => value?.replace(/¥\s?|(,*)/g, "") as unknown as number}
                min={0}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="annualInterestRate"
              label="年化利率 (%)"
              rules={[
                { required: true, message: "请输入年化利率" },
                { type: "number", min: 0, max: 100, message: "利率范围 0-100%" }
              ]}
            >
              <InputNumber
                placeholder="请输入年化利率"
                style={{ width: "100%" }}
                suffix="%"
                min={0}
                max={100}
                precision={2}
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          name="contractPeriod"
          label="合同有效期"
          rules={[{ required: true, message: "请选择合同有效期" }]}
        >
          <RangePicker style={{ width: "100%" }} />
        </Form.Item>

        <Form.Item name="remark" label="备注">
          <TextArea rows={3} placeholder="请输入备注信息" />
        </Form.Item>
      </Form>
    </div>
  );

  // 第二步：支付类别配置
  const renderCategoryConfig = () => (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <Title level={4}>支付类别配置</Title>
      <Paragraph type="secondary">配置合同支持的支付类别及相关参数</Paragraph>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Text>添加支付类别：</Text>
          {categoryTemplates.map(t => (
            <Button
              key={t.code}
              size="small"
              icon={<PlusOutlined />}
              onClick={() => handleAddCategory(t.code)}
              disabled={categoryConfigs.some(c => c.categoryCode === t.code)}
            >
              {t.name}
            </Button>
          ))}
        </Space>
      </Card>

      {categoryConfigs.length === 0 ? (
        <Alert
          message="请添加至少一个支付类别"
          type="info"
          showIcon
        />
      ) : (
        <Table
          dataSource={categoryConfigs}
          rowKey="key"
          pagination={false}
          size="small"
          columns={[
            {
              title: "类别",
              dataIndex: "categoryName",
              width: 100
            },
            {
              title: "支付比例 (%)",
              dataIndex: "paymentRatio",
              width: 120,
              render: (_, record) => (
                <InputNumber
                  size="small"
                  value={record.paymentRatio}
                  onChange={(v) => handleUpdateCategory(record.key, "paymentRatio", v || 100)}
                  min={0}
                  max={100}
                  precision={2}
                  style={{ width: 80 }}
                />
              )
            },
            {
              title: "单笔限额",
              width: 200,
              render: (_, record) => (
                <Space>
                  <InputNumber
                    size="small"
                    placeholder="最小"
                    value={record.minAmount}
                    onChange={(v) => handleUpdateCategory(record.key, "minAmount", v)}
                    min={0}
                    style={{ width: 80 }}
                  />
                  <span>-</span>
                  <InputNumber
                    size="small"
                    placeholder="最大"
                    value={record.maxAmount}
                    onChange={(v) => handleUpdateCategory(record.key, "maxAmount", v)}
                    min={0}
                    style={{ width: 80 }}
                  />
                </Space>
              )
            },
            {
              title: "日限额",
              width: 120,
              render: (_, record) => (
                <InputNumber
                  size="small"
                  placeholder="日限额"
                  value={record.dailyLimit}
                  onChange={(v) => handleUpdateCategory(record.key, "dailyLimit", v)}
                  min={0}
                  style={{ width: 100 }}
                />
              )
            },
            {
              title: "审批",
              width: 160,
              render: (_, record) => (
                <Space direction="vertical" size={0}>
                  <Checkbox
                    checked={record.requirePlatformApproval}
                    onChange={(e) => handleUpdateCategory(record.key, "requirePlatformApproval", e.target.checked)}
                  >
                    平台审批
                  </Checkbox>
                  <Checkbox
                    checked={record.requireFunderApproval}
                    onChange={(e) => handleUpdateCategory(record.key, "requireFunderApproval", e.target.checked)}
                  >
                    资金方审批
                  </Checkbox>
                </Space>
              )
            },
            {
              title: "自动支付",
              width: 100,
              render: (_, record) => (
                <Switch
                  size="small"
                  checked={record.autoPaymentEnabled}
                  onChange={(v) => handleUpdateCategory(record.key, "autoPaymentEnabled", v)}
                />
              )
            },
            {
              title: "解锁状态",
              dataIndex: "unlockStatus",
              width: 140,
              render: (_, record) => (
                <Select
                  size="small"
                  value={record.unlockStatus}
                  onChange={(v) => handleUpdateCategory(record.key, "unlockStatus", v)}
                  style={{ width: 120 }}
                  options={WAYBILL_STATUS_OPTIONS}
                />
              )
            },
            {
              title: "操作",
              width: 80,
              render: (_, record) => (
                <Button
                  type="link"
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={() => handleRemoveCategory(record.key)}
                />
              )
            }
          ]}
        />
      )}
    </div>
  );

  // 第三步：结算配置
  const renderSettlementConfig = () => (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      <Title level={4}>结算配置</Title>
      <Paragraph type="secondary">配置合同的结算周期和计息方式</Paragraph>

      <Form form={form} layout="vertical" initialValues={{ ...formData, interestCalcBase: 360, gracePeriodDays: 3 }}>
        <Form.Item
          name="settlementCycle"
          label="结算周期"
          rules={[{ required: true, message: "请选择结算周期" }]}
        >
          <Select placeholder="请选择结算周期">
            <Select.Option value="monthly">月结</Select.Option>
            <Select.Option value="biweekly">双周结</Select.Option>
            <Select.Option value="weekly">周结</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item
          name="settlementDay"
          label="结算日"
          rules={[
            { required: true, message: "请输入结算日" },
            { type: "number", min: 1, max: 28, message: "结算日范围 1-28" }
          ]}
          extra="每月/每周的第几天进行结算"
        >
          <InputNumber
            placeholder="请输入结算日"
            style={{ width: "100%" }}
            min={1}
            max={28}
          />
        </Form.Item>

        <Form.Item
          name="gracePeriodDays"
          label="宽限期（天）"
          rules={[{ required: true, message: "请输入宽限期" }]}
          extra="还款宽限期天数"
        >
          <InputNumber
            placeholder="请输入宽限期"
            style={{ width: "100%" }}
            min={0}
            max={30}
          />
        </Form.Item>

        <Form.Item
          name="interestCalcBase"
          label="计息基数"
          rules={[{ required: true, message: "请选择计息基数" }]}
          extra="年化利率计算的天数基数"
        >
          <Select placeholder="请选择计息基数">
            <Select.Option value={360}>360天</Select.Option>
            <Select.Option value={365}>365天</Select.Option>
          </Select>
        </Form.Item>
      </Form>
    </div>
  );

  // 第四步：确认提交
  const renderConfirm = () => {
    const selectedFunder = funders.find(f => f.id === formData.funderId);
    const selectedFinancier = financiers.find(f => f.id === formData.financierId);
    const enabledCategories = categoryConfigs.filter(c => c.enabled);

    return (
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <Title level={4}>确认信息</Title>
        <Paragraph type="secondary">请确认以下合同信息无误后提交</Paragraph>

        <Card title="基本信息" style={{ marginBottom: 16 }}>
          <Row gutter={[16, 8]}>
            <Col span={8}><Text type="secondary">资金方：</Text></Col>
            <Col span={16}><Text strong>{selectedFunder?.institutionName || "-"}</Text></Col>
            <Col span={8}><Text type="secondary">融资方：</Text></Col>
            <Col span={16}><Text strong>{selectedFinancier?.enterpriseName || "-"}</Text></Col>
            <Col span={8}><Text type="secondary">授信总额度：</Text></Col>
            <Col span={16}><Text strong>¥{formData.creditLimit?.toLocaleString()}</Text></Col>
            <Col span={8}><Text type="secondary">年化利率：</Text></Col>
            <Col span={16}><Text strong>{formData.annualInterestRate}%</Text></Col>
            <Col span={8}><Text type="secondary">合同期限：</Text></Col>
            <Col span={16}>
              <Text strong>
                {formData.contractPeriod?.[0]?.format("YYYY-MM-DD")} 至{" "}
                {formData.contractPeriod?.[1]?.format("YYYY-MM-DD")}
              </Text>
            </Col>
          </Row>
        </Card>

        <Card title="支付类别配置" style={{ marginBottom: 16 }}>
          {enabledCategories.length === 0 ? (
            <Text type="secondary">无支付类别配置</Text>
          ) : (
            <Space wrap>
              {enabledCategories.map(c => (
                <Tag key={c.key} color="blue">
                  {c.categoryName}
                  {c.paymentRatio < 100 && ` (支付比例${c.paymentRatio}%)`}
                </Tag>
              ))}
            </Space>
          )}
        </Card>

        <Card title="结算配置">
          <Row gutter={[16, 8]}>
            <Col span={8}><Text type="secondary">结算周期：</Text></Col>
            <Col span={16}>
              <Text strong>
                {formData.settlementCycle === "monthly" ? "月结" :
                 formData.settlementCycle === "biweekly" ? "双周结" : "周结"}
              </Text>
            </Col>
            <Col span={8}><Text type="secondary">结算日：</Text></Col>
            <Col span={16}><Text strong>每月/周第{formData.settlementDay}天</Text></Col>
            <Col span={8}><Text type="secondary">宽限期：</Text></Col>
            <Col span={16}><Text strong>{formData.gracePeriodDays}天</Text></Col>
            <Col span={8}><Text type="secondary">计息基数：</Text></Col>
            <Col span={16}><Text strong>{formData.interestCalcBase}天</Text></Col>
          </Row>
        </Card>

        {formData.remark && (
          <Card title="备注" style={{ marginTop: 16 }}>
            <Text>{formData.remark}</Text>
          </Card>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: 24 }}>
      {/* 页面标题 */}
      <div style={{ marginBottom: 24 }}>
        <Button 
          type="link" 
          icon={<ArrowLeftOutlined />} 
          onClick={() => navigate("/directed-pay-contracts")}
          style={{ paddingLeft: 0 }}
        >
          返回列表
        </Button>
        <Title level={3} style={{ margin: 0 }}>创建定向支付合同</Title>
      </div>

      {/* 步骤条 */}
      <Card style={{ marginBottom: 24 }}>
        <Steps
          current={currentStep}
          items={[
            { title: "基本信息", description: "签约方和额度" },
            { title: "支付类别", description: "配置支付类别" },
            { title: "结算配置", description: "周期和计息" },
            { title: "确认提交", description: "预览并提交" }
          ]}
        />
      </Card>

      {/* 步骤内容 */}
      <Card style={{ minHeight: 400 }}>
        {renderStepContent()}
      </Card>

      {/* 操作按钮 */}
      <div style={{ marginTop: 24, textAlign: "center" }}>
        <Space size="large">
          {currentStep > 0 && (
            <Button size="large" icon={<ArrowLeftOutlined />} onClick={handlePrev}>
              上一步
            </Button>
          )}
          {currentStep < 3 && (
            <Button type="primary" size="large" icon={<ArrowRightOutlined />} onClick={handleNext}>
              下一步
            </Button>
          )}
          {currentStep === 3 && (
            <Button
              type="primary"
              size="large"
              icon={<CheckOutlined />}
              onClick={handleSubmit}
              loading={submitting}
            >
              提交合同
            </Button>
          )}
        </Space>
      </div>
    </div>
  );
}

export default CreateDirectedPayContractPage;
