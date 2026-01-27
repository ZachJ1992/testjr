/**
 * 合同放款管理组件
 * 
 * 用于在合同详情页显示和管理放款、还款记录
 */

import React, { useState, useEffect } from 'react';
import { 
  Card, Row, Col, Statistic, Button, Modal, Form, InputNumber, 
  DatePicker, Input, Table, Tag, Space, message, Popconfirm, Tabs, Divider 
} from 'antd';
import { 
  PlusOutlined, DollarOutlined, HistoryOutlined, 
  ArrowUpOutlined, ArrowDownOutlined, ExclamationCircleOutlined 
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAuth } from '../auth';

// API 基础地址
const getApiBase = () => {
  if (import.meta.env.VITE_API_BASE) {
    return import.meta.env.VITE_API_BASE;
  }
  const hostname = window.location.hostname;
  return `http://${hostname}:3001/api`;
};
const API_BASE = getApiBase();

const { TextArea } = Input;

interface ContractLoanManagerProps {
  contractId: string;
  creditLimit: number;
  annualInterestRate: number;
  contractEndDate: string;
  onUpdate?: () => void;
}

interface LoanSummary {
  contractId: string;
  creditLimit: number;
  totalDisbursed: number;
  totalRepaidPrincipal: number;
  totalRepaidInterest: number;
  outstandingPrincipal: number;
  accruedInterest: number;
  availableCredit: number;
  loanStatus: string;
  firstDisbursementDate?: string;
  lastDisbursementDate?: string;
  lastRepaymentDate?: string;
}

interface Disbursement {
  id: string;
  contractId: string;
  amount: number;
  disbursementDate: string;
  operatorName?: string;
  remark?: string;
  status: string;
  createdAt: string;
}

interface Repayment {
  id: string;
  contractId: string;
  principalAmount: number;
  interestAmount: number;
  totalAmount: number;
  repaymentDate: string;
  operatorName?: string;
  remark?: string;
  status: string;
  createdAt: string;
}

interface InterestAccrual {
  id: string;
  contractId: string;
  accrualDate: string;
  principalBase: number;
  annualRate: number;
  dailyRate: number;
  interestAmount: number;
  status: string;
  createdAt: string;
}

const loanStatusMap: Record<string, { text: string; color: string }> = {
  not_disbursed: { text: '未放款', color: 'default' },
  partially_disbursed: { text: '部分放款', color: 'blue' },
  fully_disbursed: { text: '全额放款', color: 'cyan' },
  repaying: { text: '还款中', color: 'orange' },
  fully_repaid: { text: '已结清', color: 'green' },
  overdue: { text: '逾期', color: 'red' },
};

export const ContractLoanManager: React.FC<ContractLoanManagerProps> = ({
  contractId,
  creditLimit,
  annualInterestRate,
  contractEndDate,
  onUpdate,
}) => {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<LoanSummary | null>(null);
  const [disbursements, setDisbursements] = useState<Disbursement[]>([]);
  const [repayments, setRepayments] = useState<Repayment[]>([]);
  const [interestAccruals, setInterestAccruals] = useState<InterestAccrual[]>([]);
  
  const [disbursementModalOpen, setDisbursementModalOpen] = useState(false);
  const [repaymentModalOpen, setRepaymentModalOpen] = useState(false);
  const [disbursementForm] = Form.useForm();
  const [repaymentForm] = Form.useForm();

  // 加载数据
  const loadData = async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      // 并行加载所有数据
      const [summaryRes, disbursementsRes, repaymentsRes, accrualsRes] = await Promise.all([
        fetch(`${API_BASE}/contracts/${contractId}/loan-summary`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/contracts/${contractId}/disbursements`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/contracts/${contractId}/repayments`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/contracts/${contractId}/interest-accruals`, { headers }).then(r => r.json()),
      ]);
      
      setSummary(summaryRes.summary);
      setDisbursements(disbursementsRes.disbursements || []);
      setRepayments(repaymentsRes.repayments || []);
      setInterestAccruals(accrualsRes.accruals || []);
    } catch (err) {
      console.error('加载放款数据失败:', err);
      message.error('加载放款数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (contractId) {
      loadData();
    }
  }, [contractId, token]);

  // 创建放款
  const handleCreateDisbursement = async (values: any) => {
    try {
      const res = await fetch(`${API_BASE}/contracts/${contractId}/disbursements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: values.amount,
          disbursementDate: values.disbursementDate.format('YYYY-MM-DD'),
          remark: values.remark,
        }),
      });
      
      const data = await res.json();
      if (data.success) {
        message.success('放款成功');
        setDisbursementModalOpen(false);
        disbursementForm.resetFields();
        loadData();
        onUpdate?.();
      } else {
        message.error(data.error || '放款失败');
      }
    } catch (err) {
      message.error('放款失败');
    }
  };

  // 创建还款
  const handleCreateRepayment = async (values: any) => {
    try {
      const res = await fetch(`${API_BASE}/contracts/${contractId}/repayments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          principalAmount: values.principalAmount || 0,
          interestAmount: values.interestAmount || 0,
          repaymentDate: values.repaymentDate.format('YYYY-MM-DD'),
          remark: values.remark,
        }),
      });
      
      const data = await res.json();
      if (data.success) {
        message.success('还款成功');
        setRepaymentModalOpen(false);
        repaymentForm.resetFields();
        loadData();
        onUpdate?.();
      } else {
        message.error(data.error || '还款失败');
      }
    } catch (err) {
      message.error('还款失败');
    }
  };

  // 取消放款
  const handleCancelDisbursement = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/disbursements/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      const data = await res.json();
      if (data.success) {
        message.success('已取消放款');
        loadData();
        onUpdate?.();
      } else {
        message.error(data.error || '取消失败');
      }
    } catch (err) {
      message.error('取消失败');
    }
  };

  const statusInfo = summary?.loanStatus ? loanStatusMap[summary.loanStatus] : loanStatusMap.not_disbursed;

  // 放款记录表格列
  const disbursementColumns = [
    { title: '放款日期', dataIndex: 'disbursementDate', key: 'date', render: (v: string) => dayjs(v).format('YYYY-MM-DD') },
    { title: '金额', dataIndex: 'amount', key: 'amount', render: (v: number) => `¥${v.toLocaleString()}` },
    { title: '操作人', dataIndex: 'operatorName', key: 'operator' },
    { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Disbursement) => (
        <Popconfirm title="确定取消此放款记录？" onConfirm={() => handleCancelDisbursement(record.id)}>
          <Button type="link" danger size="small">取消</Button>
        </Popconfirm>
      ),
    },
  ];

  // 还款记录表格列
  const repaymentColumns = [
    { title: '还款日期', dataIndex: 'repaymentDate', key: 'date', render: (v: string) => dayjs(v).format('YYYY-MM-DD') },
    { title: '还本金', dataIndex: 'principalAmount', key: 'principal', render: (v: number) => `¥${v.toLocaleString()}` },
    { title: '还利息', dataIndex: 'interestAmount', key: 'interest', render: (v: number) => `¥${v.toLocaleString()}` },
    { title: '合计', dataIndex: 'totalAmount', key: 'total', render: (v: number) => `¥${v.toLocaleString()}` },
    { title: '操作人', dataIndex: 'operatorName', key: 'operator' },
    { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
  ];

  // 利息台账表格列
  const interestColumns = [
    { title: '日期', dataIndex: 'accrualDate', key: 'date', render: (v: string) => dayjs(v).format('YYYY-MM-DD') },
    { title: '计息本金', dataIndex: 'principalBase', key: 'principal', render: (v: number) => `¥${v.toLocaleString()}` },
    { title: '年利率', dataIndex: 'annualRate', key: 'rate', render: (v: number) => `${(v * 100).toFixed(2)}%` },
    { title: '当日利息', dataIndex: 'interestAmount', key: 'interest', render: (v: number) => `¥${v.toFixed(2)}` },
    { 
      title: '状态', 
      dataIndex: 'status', 
      key: 'status', 
      render: (v: string) => (
        <Tag color={v === 'settled' ? 'green' : 'orange'}>
          {v === 'settled' ? '已结算' : '待结算'}
        </Tag>
      )
    },
  ];

  return (
    <Card 
      title={
        <Space>
          <DollarOutlined />
          <span>放款管理</span>
          <Tag color={statusInfo.color}>{statusInfo.text}</Tag>
        </Space>
      }
      extra={
        <Space>
          <Button 
            type="primary" 
            icon={<ArrowDownOutlined />} 
            onClick={() => {
              disbursementForm.setFieldsValue({ disbursementDate: dayjs() });
              setDisbursementModalOpen(true);
            }}
            disabled={summary?.availableCredit === 0}
          >
            放款
          </Button>
          <Button 
            icon={<ArrowUpOutlined />} 
            onClick={() => {
              repaymentForm.setFieldsValue({ 
                repaymentDate: dayjs(),
                interestAmount: summary?.accruedInterest || 0,
              });
              setRepaymentModalOpen(true);
            }}
            disabled={!summary?.outstandingPrincipal && !summary?.accruedInterest}
          >
            还款
          </Button>
        </Space>
      }
      loading={loading}
    >
      {/* 汇总信息 */}
      <div style={{ 
        background: '#fafafa', 
        borderRadius: 8, 
        padding: '16px 20px',
        marginBottom: 20 
      }}>
        <Row gutter={[32, 20]}>
          <Col span={8}>
            <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 6 }}>授信额度</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: '#262626' }}>
              ¥{creditLimit.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </div>
          </Col>
          <Col span={8}>
            <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 6 }}>累计放款</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: '#1890ff' }}>
              ¥{(summary?.totalDisbursed || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </div>
          </Col>
          <Col span={8}>
            <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 6 }}>可用额度</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: '#52c41a' }}>
              ¥{(summary?.availableCredit || creditLimit).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </div>
          </Col>
          <Col span={8}>
            <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 6 }}>剩余本金</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: '#fa8c16' }}>
              ¥{(summary?.outstandingPrincipal || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </div>
          </Col>
          <Col span={8}>
            <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 6 }}>待还利息</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: '#ff4d4f' }}>
              ¥{(summary?.accruedInterest || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </div>
          </Col>
          <Col span={8}>
            <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 6 }}>累计还息</div>
            <div style={{ fontSize: 20, fontWeight: 500, color: '#595959' }}>
              ¥{(summary?.totalRepaidInterest || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </div>
          </Col>
        </Row>
      </div>

      <Divider />

      {/* 记录列表 */}
      <Tabs
        items={[
          {
            key: 'disbursements',
            label: `放款记录 (${disbursements.length})`,
            children: (
              <Table
                dataSource={disbursements}
                columns={disbursementColumns}
                rowKey="id"
                size="small"
                pagination={{ pageSize: 5 }}
              />
            ),
          },
          {
            key: 'repayments',
            label: `还款记录 (${repayments.length})`,
            children: (
              <Table
                dataSource={repayments}
                columns={repaymentColumns}
                rowKey="id"
                size="small"
                pagination={{ pageSize: 5 }}
              />
            ),
          },
          {
            key: 'interest',
            label: `利息台账 (${interestAccruals.length})`,
            children: (
              <Table
                dataSource={interestAccruals}
                columns={interestColumns}
                rowKey="id"
                size="small"
                pagination={{ pageSize: 10 }}
              />
            ),
          },
        ]}
      />

      {/* 放款弹窗 */}
      <Modal
        title="放款"
        open={disbursementModalOpen}
        onCancel={() => setDisbursementModalOpen(false)}
        footer={null}
      >
        <Form form={disbursementForm} layout="vertical" onFinish={handleCreateDisbursement}>
          <Form.Item 
            name="amount" 
            label="放款金额" 
            rules={[{ required: true, message: '请输入放款金额' }]}
          >
            <InputNumber 
              style={{ width: '100%' }} 
              prefix="¥" 
              min={0.01} 
              max={summary?.availableCredit || creditLimit}
              precision={2}
              placeholder={`最大可放款 ¥${(summary?.availableCredit || creditLimit).toLocaleString()}`}
            />
          </Form.Item>
          <Form.Item 
            name="disbursementDate" 
            label="放款日期" 
            rules={[{ required: true, message: '请选择放款日期' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <TextArea rows={2} placeholder="可选填写备注" />
          </Form.Item>
          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setDisbursementModalOpen(false)}>取消</Button>
              <Button type="primary" htmlType="submit">确认放款</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 还款弹窗 */}
      <Modal
        title="还款"
        open={repaymentModalOpen}
        onCancel={() => setRepaymentModalOpen(false)}
        footer={null}
      >
        <Form form={repaymentForm} layout="vertical" onFinish={handleCreateRepayment}>
          <Form.Item 
            name="principalAmount" 
            label="还款本金"
          >
            <InputNumber 
              style={{ width: '100%' }} 
              prefix="¥" 
              min={0} 
              max={summary?.outstandingPrincipal || 0}
              precision={2}
              placeholder={`剩余本金 ¥${(summary?.outstandingPrincipal || 0).toLocaleString()}`}
            />
          </Form.Item>
          <Form.Item 
            name="interestAmount" 
            label="还款利息"
          >
            <InputNumber 
              style={{ width: '100%' }} 
              prefix="¥" 
              min={0}
              precision={2}
              placeholder={`待还利息 ¥${(summary?.accruedInterest || 0).toFixed(2)}`}
            />
          </Form.Item>
          <Form.Item 
            name="repaymentDate" 
            label="还款日期" 
            rules={[{ required: true, message: '请选择还款日期' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <TextArea rows={2} placeholder="可选填写备注" />
          </Form.Item>
          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setRepaymentModalOpen(false)}>取消</Button>
              <Button type="primary" htmlType="submit">确认还款</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default ContractLoanManager;
