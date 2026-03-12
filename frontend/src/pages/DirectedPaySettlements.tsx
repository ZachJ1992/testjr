import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import {
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Result,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
  Divider
} from "antd";
import {
  SearchOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  DollarOutlined,
  ReloadOutlined,
  FileTextOutlined,
  BankOutlined
} from "@ant-design/icons";
import { useMemo, useState, useEffect, useCallback } from "react";
import dayjs from "dayjs";
import {
  getToken,
  getErrorMessage,
  fetchDirectedPaySettlements,
  fetchDirectedPaySettlementById,
  fetchDirectedPaySettlementStats,
  confirmDirectedPaySettlementApi,
  payDirectedPaySettlementApi,
  type DirectedPaySettlement,
  type DirectedPaySettlementItem,
  type DirectedPaySettlementStats
} from "../api";

const { Title, Text } = Typography;

// 状态映射
const statusMap: Record<string, { color: string; text: string }> = {
  pending: { color: "orange", text: "待处理" },
  confirmed: { color: "blue", text: "已确认" },
  partial_paid: { color: "cyan", text: "部分还款" },
  paid: { color: "green", text: "已结清" },
  overdue: { color: "red", text: "逾期" }
};

function DirectedPaySettlementsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [settlements, setSettlements] = useState<DirectedPaySettlement[]>([]);
  const [stats, setStats] = useState<DirectedPaySettlementStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  
  // 详情弹窗相关状态
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedSettlement, setSelectedSettlement] = useState<DirectedPaySettlement | null>(null);
  const [settlementItems, setSettlementItems] = useState<DirectedPaySettlementItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  
  // 还款弹窗相关状态
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payForm] = Form.useForm();
  const [paying, setPaying] = useState(false);

  // 检查权限
  const canManage = user?.permissions?.includes("manage_directed_pay_settlements");

  // 加载结算单数据
  const loadSettlements = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    
    setLoading(true);
    try {
      const [{ settlements: data }, statsData] = await Promise.all([
        fetchDirectedPaySettlements(token, {
          status: statusFilter as any
        }),
        fetchDirectedPaySettlementStats(token)
      ]);
      setSettlements(data);
      setStats(statsData);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  // 初始加载
  useEffect(() => {
    loadSettlements();
  }, [loadSettlements]);

  // 过滤后的数据
  const filteredData = useMemo(() => {
    if (!searchText) return settlements;
    const lower = searchText.toLowerCase();
    return settlements.filter(
      (s) =>
        s.settlementNumber?.toLowerCase().includes(lower) ||
        s.contractNumber?.toLowerCase().includes(lower) ||
        s.financierName?.toLowerCase().includes(lower)
    );
  }, [settlements, searchText]);

  // 打开详情弹窗
  const handleOpenDetail = async (record: DirectedPaySettlement) => {
    const token = getToken();
    if (!token) return;
    
    setSelectedSettlement(record);
    setDetailModalOpen(true);
    setLoadingDetail(true);
    
    try {
      const { settlement, items } = await fetchDirectedPaySettlementById(token, record.id);
      setSelectedSettlement(settlement);
      setSettlementItems(items);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setLoadingDetail(false);
    }
  };

  // 确认结算单
  const handleConfirm = async (id: string) => {
    const token = getToken();
    if (!token) return;
    
    try {
      await confirmDirectedPaySettlementApi(token, id);
      message.success("结算单已确认");
      loadSettlements();
      if (selectedSettlement?.id === id) {
        handleOpenDetail({ ...selectedSettlement, status: "confirmed" });
      }
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  // 打开还款弹窗
  const handleOpenPayModal = (record: DirectedPaySettlement) => {
    setSelectedSettlement(record);
    const remaining = record.totalAmount - record.actualPaidAmount;
    payForm.setFieldsValue({
      amount: remaining > 0 ? remaining : 0
    });
    setPayModalOpen(true);
  };

  // 提交还款
  const handlePay = async () => {
    if (!selectedSettlement) return;
    
    const token = getToken();
    if (!token) return;
    
    try {
      const values = await payForm.validateFields();
      setPaying(true);
      
      await payDirectedPaySettlementApi(token, selectedSettlement.id, values.amount);
      message.success("还款处理成功");
      setPayModalOpen(false);
      payForm.resetFields();
      loadSettlements();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setPaying(false);
    }
  };

  // 表格列定义
  const columns = [
    {
      title: "结算单号",
      dataIndex: "settlementNumber",
      key: "settlementNumber",
      width: 160,
      render: (text: string, record: DirectedPaySettlement) => (
        <a onClick={() => handleOpenDetail(record)}>{text}</a>
      )
    },
    {
      title: "合同号",
      dataIndex: "contractNumber",
      key: "contractNumber",
      width: 150
    },
    {
      title: "融资方",
      dataIndex: "financierName",
      key: "financierName",
      width: 180,
      ellipsis: true
    },
    {
      title: "结算周期",
      key: "period",
      width: 180,
      render: (_: any, record: DirectedPaySettlement) => (
        <span>
          {dayjs(record.periodStart).format("YYYY-MM-DD")} ~ {dayjs(record.periodEnd).format("YYYY-MM-DD")}
        </span>
      )
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (status: string) => {
        const config = statusMap[status] || { color: "default", text: status };
        return <Tag color={config.color}>{config.text}</Tag>;
      }
    },
    {
      title: "支付笔数",
      dataIndex: "paymentCount",
      key: "paymentCount",
      width: 90,
      align: "center" as const
    },
    {
      title: "应还总额",
      dataIndex: "totalAmount",
      key: "totalAmount",
      width: 120,
      align: "right" as const,
      render: (val: number) => (
        <Text strong>¥{val.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</Text>
      )
    },
    {
      title: "已还金额",
      dataIndex: "actualPaidAmount",
      key: "actualPaidAmount",
      width: 110,
      align: "right" as const,
      render: (val: number) => (
        <Text type="success">¥{val.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</Text>
      )
    },
    {
      title: "应还日期",
      dataIndex: "dueDate",
      key: "dueDate",
      width: 110,
      render: (val: string, record: DirectedPaySettlement) => {
        const isOverdue = record.status !== "paid" && dayjs(val).isBefore(dayjs(), "day");
        return (
          <Text type={isOverdue ? "danger" : undefined}>
            {dayjs(val).format("YYYY-MM-DD")}
          </Text>
        );
      }
    },
    {
      title: "本金",
      dataIndex: "principalAmount",
      key: "principalAmount",
      width: 120,
      align: "right" as const,
      render: (val: number) => `¥${val.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`
    },
    {
      title: "利息",
      dataIndex: "interestAmount",
      key: "interestAmount",
      width: 100,
      align: "right" as const,
      render: (val: number) => (
        <Text type="warning">¥{val.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</Text>
      )
    },
    {
      title: "服务费",
      dataIndex: "serviceAmount",
      key: "serviceAmount",
      width: 100,
      align: "right" as const,
      render: (val: number) => `¥${val.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`
    },
    {
      title: "操作",
      key: "action",
      width: 180,
      fixed: "right" as const,
      render: (_: any, record: DirectedPaySettlement) => (
        <Space size="small">
          <Button type="link" size="small" onClick={() => handleOpenDetail(record)}>
            详情
          </Button>
          {canManage && record.status === "pending" && (
            <Button type="link" size="small" onClick={() => handleConfirm(record.id)}>
              确认
            </Button>
          )}
          {canManage && ["confirmed", "partial_paid", "overdue"].includes(record.status) && (
            <Button type="link" size="small" onClick={() => handleOpenPayModal(record)}>
              还款
            </Button>
          )}
        </Space>
      )
    }
  ];

  // 明细表格列定义
  const itemColumns = [
    {
      title: "支付金额",
      dataIndex: "paymentAmount",
      key: "paymentAmount",
      render: (val: number) => `¥${val.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`
    },
    {
      title: "支付时间",
      dataIndex: "paymentTime",
      key: "paymentTime",
      render: (val: string) => dayjs(val).format("YYYY-MM-DD HH:mm:ss")
    },
    {
      title: "计息天数",
      dataIndex: "interestDays",
      key: "interestDays",
      align: "center" as const,
      render: (val: number) => `${val}天`
    },
    {
      title: "利息金额",
      dataIndex: "interestAmount",
      key: "interestAmount",
      render: (val: number) => (
        <Text type="warning">¥{val.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</Text>
      )
    },
    {
      title: "服务费",
      dataIndex: "serviceFee",
      key: "serviceFee",
      render: (val: number) => `¥${val.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`
    }
  ];

  // 无权限提示
  if (!user?.permissions?.includes("view_directed_pay_settlements") && !canManage) {
    return (
      <Result
        status="403"
        title="无访问权限"
        subTitle="您没有权限访问定向支付结算页面"
      />
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Title level={4} style={{ margin: 0 }}>
          <BankOutlined style={{ marginRight: 8 }} />
          定向支付结算
        </Title>
        <Button
          icon={<ReloadOutlined />}
          onClick={loadSettlements}
          loading={loading}
        >
          刷新
        </Button>
      </div>

      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="待处理金额"
              value={stats?.pendingAmount || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: "#fa8c16" }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">{stats?.totalPending || 0} 笔待处理</Text>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已确认金额"
              value={stats?.totalAmount ? (stats.totalAmount - (stats.pendingAmount || 0) - (stats.overdueAmount || 0) - (stats.totalPaidAmount || 0)) : 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: "#1890ff" }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">{stats?.totalConfirmed || 0} 笔已确认</Text>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="逾期金额"
              value={stats?.overdueAmount || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: "#ff4d4f" }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">{stats?.totalOverdue || 0} 笔逾期</Text>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已结清金额"
              value={stats?.totalPaidAmount || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: "#52c41a" }}
            />
            <div style={{ marginTop: 8 }}>
              <Text type="secondary">{stats?.totalPaid || 0} 笔已结清</Text>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 搜索和筛选 */}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={16} align="middle">
          <Col span={8}>
            <Input
              placeholder="搜索结算单号/合同号/融资方"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
          </Col>
          <Col span={6}>
            <Select
              placeholder="筛选状态"
              style={{ width: "100%" }}
              value={statusFilter}
              onChange={setStatusFilter}
              allowClear
              options={[
                { label: "待处理", value: "pending" },
                { label: "已确认", value: "confirmed" },
                { label: "部分还款", value: "partial_paid" },
                { label: "已结清", value: "paid" },
                { label: "逾期", value: "overdue" }
              ]}
            />
          </Col>
        </Row>
      </Card>

      {/* 结算单列表 */}
      <Card>
        <Table
          columns={columns}
          dataSource={filteredData}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1800 }}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`
          }}
        />
      </Card>

      {/* 详情弹窗 */}
      <Modal
        title={
          <Space>
            <FileTextOutlined />
            结算单详情
          </Space>
        }
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={
          selectedSettlement && (
            <Space>
              {canManage && selectedSettlement.status === "pending" && (
                <Button
                  type="primary"
                  onClick={() => handleConfirm(selectedSettlement.id)}
                >
                  确认结算单
                </Button>
              )}
              {canManage && ["confirmed", "partial_paid", "overdue"].includes(selectedSettlement.status) && (
                <Button type="primary" onClick={() => handleOpenPayModal(selectedSettlement)}>
                  还款
                </Button>
              )}
              <Button onClick={() => setDetailModalOpen(false)}>关闭</Button>
            </Space>
          )
        }
        width={900}
      >
        {selectedSettlement && (
          <>
            <Descriptions bordered column={2} size="small" style={{ marginBottom: 24 }}>
              <Descriptions.Item label="结算单号">{selectedSettlement.settlementNumber}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusMap[selectedSettlement.status]?.color}>
                  {statusMap[selectedSettlement.status]?.text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="合同号">{selectedSettlement.contractNumber || "-"}</Descriptions.Item>
              <Descriptions.Item label="融资方">{selectedSettlement.financierName || "-"}</Descriptions.Item>
              <Descriptions.Item label="结算周期" span={2}>
                {dayjs(selectedSettlement.periodStart).format("YYYY-MM-DD")} ~ {dayjs(selectedSettlement.periodEnd).format("YYYY-MM-DD")}
              </Descriptions.Item>
              <Descriptions.Item label="支付笔数">{selectedSettlement.paymentCount} 笔</Descriptions.Item>
              <Descriptions.Item label="应还日期">
                {dayjs(selectedSettlement.dueDate).format("YYYY-MM-DD")}
              </Descriptions.Item>
              <Descriptions.Item label="本金">
                ¥{selectedSettlement.principalAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
              </Descriptions.Item>
              <Descriptions.Item label="利息">
                <Text type="warning">
                  ¥{selectedSettlement.interestAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="服务费">
                ¥{selectedSettlement.serviceAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
              </Descriptions.Item>
              <Descriptions.Item label="应还总额">
                <Text strong style={{ color: "#1890ff", fontSize: 16 }}>
                  ¥{selectedSettlement.totalAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="已还金额">
                <Text type="success">
                  ¥{selectedSettlement.actualPaidAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="待还金额">
                <Text type="danger">
                  ¥{(selectedSettlement.totalAmount - selectedSettlement.actualPaidAmount).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                </Text>
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">支付明细（利息计算）</Divider>
            
            <Table
              columns={itemColumns}
              dataSource={settlementItems}
              rowKey="id"
              loading={loadingDetail}
              pagination={false}
              size="small"
              summary={(pageData) => {
                const totalPayment = pageData.reduce((sum, item) => sum + item.paymentAmount, 0);
                const totalInterest = pageData.reduce((sum, item) => sum + item.interestAmount, 0);
                const totalServiceFee = pageData.reduce((sum, item) => sum + item.serviceFee, 0);
                
                return (
                  <Table.Summary fixed>
                    <Table.Summary.Row>
                      <Table.Summary.Cell index={0}>
                        <Text strong>合计</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={1}>
                        <Text strong>¥{totalPayment.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={2} />
                      <Table.Summary.Cell index={3}>-</Table.Summary.Cell>
                      <Table.Summary.Cell index={4}>
                        <Text strong type="warning">
                          ¥{totalInterest.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                        </Text>
                      </Table.Summary.Cell>
                      <Table.Summary.Cell index={5}>
                        <Text strong>¥{totalServiceFee.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</Text>
                      </Table.Summary.Cell>
                    </Table.Summary.Row>
                  </Table.Summary>
                );
              }}
            />
            
            <div style={{ marginTop: 16, padding: 12, background: "#fafafa", borderRadius: 4 }}>
              <Text type="secondary">
                利息计算公式：利息 = 本金 × (年化利率 / 计息基数) × 天数
                <br />
                计息规则：从支付时刻开始计息，按日计息，不满一天按一天计算
              </Text>
            </div>
          </>
        )}
      </Modal>

      {/* 还款弹窗 */}
      <Modal
        title="还款处理"
        open={payModalOpen}
        onCancel={() => {
          setPayModalOpen(false);
          payForm.resetFields();
        }}
        onOk={handlePay}
        confirmLoading={paying}
        okText="确认还款"
      >
        {selectedSettlement && (
          <>
            <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="结算单号">{selectedSettlement.settlementNumber}</Descriptions.Item>
              <Descriptions.Item label="应还总额">
                ¥{selectedSettlement.totalAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
              </Descriptions.Item>
              <Descriptions.Item label="已还金额">
                ¥{selectedSettlement.actualPaidAmount.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
              </Descriptions.Item>
              <Descriptions.Item label="待还金额">
                <Text type="danger" strong>
                  ¥{(selectedSettlement.totalAmount - selectedSettlement.actualPaidAmount).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                </Text>
              </Descriptions.Item>
            </Descriptions>
            
            <Form form={payForm} layout="vertical">
              <Form.Item
                name="amount"
                label="本次还款金额"
                rules={[
                  { required: true, message: "请输入还款金额" },
                  {
                    type: "number",
                    min: 0.01,
                    message: "金额必须大于0"
                  },
                  {
                    type: "number",
                    max: selectedSettlement.totalAmount - selectedSettlement.actualPaidAmount,
                    message: "不能超过待还金额"
                  }
                ]}
              >
                <InputNumber
                  style={{ width: "100%" }}
                  precision={2}
                  prefix="¥"
                  placeholder="请输入还款金额"
                />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>
    </div>
  );
}

export default DirectedPaySettlementsPage;
