import {
  Button,
  Card,
  Col,
  Modal,
  Progress,
  Result,
  Row,
  Table,
  Tag,
  Typography,
  message,
  Switch,
  Space,
  Popconfirm,
  Input,
  Select,
  Descriptions,
  Statistic,
  Divider
} from "antd";
import {
  EyeOutlined,
  PlusOutlined,
  WalletOutlined,
  LineChartOutlined,
  DollarOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  PauseCircleOutlined,
  CloseCircleOutlined,
  SearchOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth";
import { useI18n } from "../i18n";
import {
  fetchDirectedPayContracts,
  fetchDirectedPayContractById,
  fetchDirectedPayContractStats,
  updateDirectedPayContractStatus,
  deleteDirectedPayContractApi,
  fetchPaymentCategoriesByContract,
  getErrorMessage
} from "../api";
import type { WaybillStatus } from "../types";
import { WAYBILL_STATUS_OPTIONS } from "../types";

const { Title, Text } = Typography;
const { Search } = Input;

// 类型定义
interface DirectedPayContract {
  id: string;
  contractNumber: string;
  funderId: string;
  funderName?: string;
  financierId: string;
  financierName?: string;
  funderAccountId?: string;
  creditLimit: number;
  usedAmount: number;
  availableAmount: number;
  annualInterestRate: number;
  interestCalcBase: number;
  startDate: string;
  endDate: string;
  settlementCycle: "monthly" | "biweekly" | "weekly";
  settlementDay: number;
  gracePeriodDays: number;
  autoPaymentEnabled: boolean;
  status: "draft" | "pending_approval" | "active" | "suspended" | "expired" | "terminated";
  remark?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

interface PaymentCategoryConfig {
  id: string;
  contractId: string;
  categoryCode: string;
  categoryName: string;
  paymentRatio: number;  // 支付比例 (0-100)
  minAmount?: number;
  maxAmount?: number;
  dailyLimit?: number;
  requirePlatformApproval: boolean;
  requireFunderApproval: boolean;
  platformApprovalThreshold?: number;
  funderApprovalThreshold?: number;
  autoPaymentEnabled: boolean;
  isEnabled: boolean;
  unlockStatus: WaybillStatus;  // 解锁状态
}

interface ContractStats {
  totalCount: number;
  activeCount: number;
  suspendedCount: number;
  expiredCount: number;
  totalCreditLimit: number;
  totalUsedAmount: number;
  totalAvailableAmount: number;
}

// 状态配置
const statusConfig: Record<string, { color: string; text: string }> = {
  draft: { color: "default", text: "草稿" },
  pending_approval: { color: "processing", text: "待审批" },
  active: { color: "success", text: "生效中" },
  suspended: { color: "warning", text: "已暂停" },
  expired: { color: "error", text: "已到期" },
  terminated: { color: "default", text: "已终止" }
};

// 结算周期配置
const settlementCycleConfig: Record<string, string> = {
  monthly: "月结",
  biweekly: "双周结",
  weekly: "周结"
};

function DirectedPayContractsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token, user } = useAuth();
  const { t } = useI18n();
  
  const [contracts, setContracts] = useState<DirectedPayContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<ContractStats | null>(null);
  
  // 筛选状态
  const [searchKeyword, setSearchKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  
  // 详情弹窗
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [viewingContract, setViewingContract] = useState<DirectedPayContract | null>(null);
  const [categories, setCategories] = useState<PaymentCategoryConfig[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);

  // 加载合同列表
  const refresh = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [contractsRes, statsRes] = await Promise.all([
        fetchDirectedPayContracts(token, {
          keyword: searchKeyword || undefined,
          status: statusFilter as DirectedPayContract["status"] | undefined
        }),
        fetchDirectedPayContractStats(token)
      ]);
      
      // 按创建时间降序排列
      const sortedContracts = [...contractsRes.contracts].sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setContracts(sortedContracts);
      setStats(statsRes);
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [token, statusFilter]);

  // 检测从创建页面返回时的刷新信号
  useEffect(() => {
    if ((location.state as any)?.refresh) {
      void refresh();
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state]);

  // 查看合同详情
  const handleView = async (contract: DirectedPayContract) => {
    setViewingContract(contract);
    setDetailModalOpen(true);
    
    // 加载支付类别配置
    if (token) {
      setLoadingCategories(true);
      try {
        const res = await fetchPaymentCategoriesByContract(token, contract.id);
        setCategories(res.categories);
      } catch (err) {
        console.error("加载支付类别失败:", err);
      } finally {
        setLoadingCategories(false);
      }
    }
  };

  // 编辑合同
  const handleEdit = (contract: DirectedPayContract) => {
    navigate(`/directed-pay-contracts/${contract.id}/edit`);
  };

  // 删除合同
  const handleDelete = async (contract: DirectedPayContract) => {
    if (!token) return;
    try {
      await deleteDirectedPayContractApi(token, contract.id);
      message.success("合同删除成功");
      await refresh();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  // 状态操作
  const handleStatusChange = async (contract: DirectedPayContract, action: "approve" | "submit" | "suspend" | "resume" | "terminate") => {
    if (!token) return;
    try {
      await updateDirectedPayContractStatus(token, contract.id, action);
      message.success("状态更新成功");
      await refresh();
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  // 搜索
  const handleSearch = (value: string) => {
    setSearchKeyword(value);
    refresh();
  };

  // 表格列定义
  const columns = [
    {
      title: "合同编号",
      dataIndex: "contractNumber",
      key: "contractNumber",
      width: 160,
      render: (num: string, record: DirectedPayContract) => (
        <a onClick={() => handleView(record)}>{num}</a>
      )
    },
    {
      title: "资金方",
      dataIndex: "funderName",
      key: "funderName",
      width: 150,
      ellipsis: true
    },
    {
      title: "融资方",
      dataIndex: "financierName",
      key: "financierName",
      width: 150,
      ellipsis: true
    },
    {
      title: "授信额度",
      key: "credit",
      width: 180,
      render: (_: any, record: DirectedPayContract) => (
        <Space direction="vertical" size={0}>
          <Text>总额：¥{record.creditLimit?.toLocaleString() || 0}</Text>
          <Progress 
            percent={record.creditLimit > 0 ? Math.round((record.usedAmount / record.creditLimit) * 100) : 0}
            size="small"
            strokeColor={record.usedAmount / record.creditLimit > 0.8 ? "#ff4d4f" : "#1890ff"}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            已用：¥{record.usedAmount?.toLocaleString() || 0}
          </Text>
        </Space>
      )
    },
    {
      title: "年化利率",
      dataIndex: "annualInterestRate",
      key: "annualInterestRate",
      width: 100,
      render: (rate: number) => `${(rate * 100).toFixed(2)}%`
    },
    {
      title: "合同期限",
      key: "period",
      width: 200,
      render: (_: any, record: DirectedPayContract) => (
        <Space direction="vertical" size={0}>
          <Text>{dayjs(record.startDate).format("YYYY-MM-DD")}</Text>
          <Text type="secondary">至 {dayjs(record.endDate).format("YYYY-MM-DD")}</Text>
        </Space>
      )
    },
    {
      title: "结算周期",
      key: "settlement",
      width: 120,
      render: (_: any, record: DirectedPayContract) => (
        <Space direction="vertical" size={0}>
          <Text>{settlementCycleConfig[record.settlementCycle] || record.settlementCycle}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            每{record.settlementCycle === "weekly" ? "周" : "月"}{record.settlementDay}日
          </Text>
        </Space>
      )
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 100,
      render: (status: string) => {
        const cfg = statusConfig[status] || { color: "default", text: status };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      }
    },
    {
      title: "操作",
      key: "action",
      width: 200,
      fixed: "right" as const,
      render: (_: any, record: DirectedPayContract) => (
        <Space size="small" wrap>
          <Button 
            type="link" 
            size="small" 
            icon={<EyeOutlined />} 
            onClick={() => handleView(record)}
          >
            查看
          </Button>
          
          {record.status === "draft" && (
            <>
              <Button 
                type="link" 
                size="small" 
                icon={<EditOutlined />} 
                onClick={() => handleEdit(record)}
              >
                编辑
              </Button>
              <Popconfirm
                title="确定提交审批？"
                onConfirm={() => handleStatusChange(record, "submit")}
              >
                <Button type="link" size="small" icon={<CheckCircleOutlined />}>
                  提交
                </Button>
              </Popconfirm>
            </>
          )}
          
          {record.status === "pending_approval" && (
            <Popconfirm
              title="确定审批通过？"
              onConfirm={() => handleStatusChange(record, "approve")}
            >
              <Button type="link" size="small" icon={<CheckCircleOutlined />}>
                审批
              </Button>
            </Popconfirm>
          )}
          
          {record.status === "active" && (
            <Popconfirm
              title="确定暂停合同？"
              onConfirm={() => handleStatusChange(record, "suspend")}
            >
              <Button type="link" size="small" icon={<PauseCircleOutlined />}>
                暂停
              </Button>
            </Popconfirm>
          )}
          
          {record.status === "suspended" && (
            <Popconfirm
              title="确定恢复合同？"
              onConfirm={() => handleStatusChange(record, "resume")}
            >
              <Button type="link" size="small" icon={<CheckCircleOutlined />}>
                恢复
              </Button>
            </Popconfirm>
          )}
          
          {(record.status === "draft" || record.status === "suspended") && (
            <Popconfirm
              title="确定删除此合同？"
              onConfirm={() => handleDelete(record)}
              okText="确定"
              cancelText="取消"
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      )
    }
  ];

  // 无权限提示
  if (!user?.permissions?.includes("manage_directed_pay_contracts") && 
      !user?.permissions?.includes("view_directed_pay_contracts")) {
    return (
      <Result
        status="403"
        title="无权限"
        subTitle="您没有访问定向支付合同管理的权限"
        extra={<Button type="primary" onClick={() => navigate("/")}>返回首页</Button>}
      />
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* 页面标题 */}
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>定向支付合同管理</Title>
        <Text type="secondary">管理资金方与融资方之间的定向支付合同</Text>
      </div>

      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="总合同数"
              value={stats?.totalCount || 0}
              prefix={<WalletOutlined style={{ color: "#1890ff" }} />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="生效中"
              value={stats?.activeCount || 0}
              valueStyle={{ color: "#52c41a" }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="总授信额度"
              value={stats?.totalCreditLimit || 0}
              precision={2}
              prefix={<DollarOutlined style={{ color: "#faad14" }} />}
              formatter={(value) => `¥${Number(value).toLocaleString()}`}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="可用额度"
              value={stats?.totalAvailableAmount || 0}
              precision={2}
              prefix={<LineChartOutlined style={{ color: "#52c41a" }} />}
              formatter={(value) => `¥${Number(value).toLocaleString()}`}
            />
          </Card>
        </Col>
      </Row>

      {/* 筛选和操作栏 */}
      <Card style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space size="middle">
              <Search
                placeholder="搜索合同编号/资金方/融资方"
                allowClear
                onSearch={handleSearch}
                style={{ width: 280 }}
              />
              <Select
                placeholder="筛选状态"
                allowClear
                style={{ width: 140 }}
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: "draft", label: "草稿" },
                  { value: "pending_approval", label: "待审批" },
                  { value: "active", label: "生效中" },
                  { value: "suspended", label: "已暂停" },
                  { value: "expired", label: "已到期" },
                  { value: "terminated", label: "已终止" }
                ]}
              />
            </Space>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate("/directed-pay-contracts/create")}
            >
              创建合同
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 合同表格 */}
      <Card>
        <Table
          columns={columns}
          dataSource={contracts}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1400 }}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `显示第 ${range[0]}-${range[1]} 条，共 ${total} 条记录`
          }}
        />
      </Card>

      {/* 详情弹窗 */}
      <Modal
        title="合同详情"
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={null}
        width={800}
      >
        {viewingContract && (
          <div>
            {/* 基本信息 */}
            <Descriptions title="基本信息" bordered column={2} size="small">
              <Descriptions.Item label="合同编号">{viewingContract.contractNumber}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusConfig[viewingContract.status]?.color}>
                  {statusConfig[viewingContract.status]?.text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="资金方">{viewingContract.funderName || "-"}</Descriptions.Item>
              <Descriptions.Item label="融资方">{viewingContract.financierName || "-"}</Descriptions.Item>
              <Descriptions.Item label="资金方账户ID">{viewingContract.funderAccountId || "-"}</Descriptions.Item>
              <Descriptions.Item label="年化利率">{(viewingContract.annualInterestRate * 100).toFixed(2)}%</Descriptions.Item>
              <Descriptions.Item label="计息基数">{viewingContract.interestCalcBase}天</Descriptions.Item>
              <Descriptions.Item label="宽限期">{viewingContract.gracePeriodDays}天</Descriptions.Item>
              <Descriptions.Item label="合同开始日期">{dayjs(viewingContract.startDate).format("YYYY-MM-DD")}</Descriptions.Item>
              <Descriptions.Item label="合同结束日期">{dayjs(viewingContract.endDate).format("YYYY-MM-DD")}</Descriptions.Item>
              <Descriptions.Item label="结算周期">{settlementCycleConfig[viewingContract.settlementCycle]}</Descriptions.Item>
              <Descriptions.Item label="结算日">每{viewingContract.settlementCycle === "weekly" ? "周" : "月"}{viewingContract.settlementDay}日</Descriptions.Item>
            </Descriptions>

            {/* 额度信息 */}
            <Divider />
            <Descriptions title="额度信息" bordered column={3} size="small">
              <Descriptions.Item label="授信总额度">
                <Text strong>¥{viewingContract.creditLimit?.toLocaleString()}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="已用额度">
                <Text type="warning">¥{viewingContract.usedAmount?.toLocaleString()}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="可用额度">
                <Text type="success">¥{viewingContract.availableAmount?.toLocaleString()}</Text>
              </Descriptions.Item>
            </Descriptions>

            {/* 额度使用进度 */}
            <div style={{ marginTop: 16 }}>
              <Text type="secondary">额度使用情况</Text>
              <Progress
                percent={viewingContract.creditLimit > 0 
                  ? Math.round((viewingContract.usedAmount / viewingContract.creditLimit) * 100) 
                  : 0}
                strokeColor={
                  viewingContract.usedAmount / viewingContract.creditLimit > 0.8 
                    ? "#ff4d4f" 
                    : "#1890ff"
                }
              />
            </div>

            {/* 支付类别配置 */}
            <Divider />
            <Title level={5}>支付类别配置</Title>
            {loadingCategories ? (
              <Text type="secondary">加载中...</Text>
            ) : categories.length === 0 ? (
              <Text type="secondary">暂无配置的支付类别</Text>
            ) : (
              <Table
                dataSource={categories}
                rowKey="id"
                size="small"
                pagination={false}
                columns={[
                  { title: "类别", dataIndex: "categoryName", key: "categoryName" },
                  { title: "支付比例", dataIndex: "paymentRatio", key: "paymentRatio", 
                    render: (v: number) => `${v}%` },
                  { title: "单笔限额", key: "limit",
                    render: (_: any, r: PaymentCategoryConfig) => 
                      r.minAmount || r.maxAmount 
                        ? `¥${r.minAmount || 0} - ¥${r.maxAmount || "∞"}` 
                        : "-" },
                  { title: "日限额", dataIndex: "dailyLimit", key: "dailyLimit",
                    render: (v?: number) => v ? `¥${v.toLocaleString()}` : "-" },
                  { title: "自动支付", dataIndex: "autoPaymentEnabled", key: "autoPaymentEnabled",
                    render: (v: boolean) => v ? <Tag color="green">开启</Tag> : <Tag>关闭</Tag> },
                  { title: "解锁状态", dataIndex: "unlockStatus", key: "unlockStatus",
                    render: (v: WaybillStatus) => {
                      const opt = WAYBILL_STATUS_OPTIONS.find(o => o.value === v);
                      return <Tag color="blue">{opt?.label || v || "已创建"}</Tag>;
                    } },
                  { title: "状态", dataIndex: "isEnabled", key: "isEnabled",
                    render: (v: boolean) => v ? <Tag color="green">启用</Tag> : <Tag color="red">禁用</Tag> }
                ]}
              />
            )}

            {/* 备注 */}
            {viewingContract.remark && (
              <>
                <Divider />
                <Descriptions bordered column={1} size="small">
                  <Descriptions.Item label="备注">{viewingContract.remark}</Descriptions.Item>
                </Descriptions>
              </>
            )}

            {/* 时间信息 */}
            <Divider />
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="创建时间">
                {dayjs(viewingContract.createdAt).format("YYYY-MM-DD HH:mm:ss")}
              </Descriptions.Item>
              <Descriptions.Item label="更新时间">
                {dayjs(viewingContract.updatedAt).format("YYYY-MM-DD HH:mm:ss")}
              </Descriptions.Item>
            </Descriptions>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default DirectedPayContractsPage;
