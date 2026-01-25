# Task: 融资方支出页面前端开发

## 任务概述

| 项目 | 说明 |
|------|------|
| 负责Agent | Agent-Frontend-Financier |
| 任务类型 | 前端开发 |
| 优先级 | 高 |
| 预估工时 | 2-3小时 |

## 业务背景

融资方用户需要一个页面查看自己的支出情况，包括：
- 三方融资合同产生的利息支出
- 定向支付产生的利息支出
- 撮合业务抽成支出
- 抽成合同费用支出

**重要**：该页面仅对融资方用户可见，数据自动按当前登录用户所属融资方过滤。

---

## 页面设计

### 页面路径
- **路由**: `/expense/financier`
- **菜单**: 收益管理 > 我的支出
- **权限**: `view_financier_expense`
- **可见性**: 仅融资方组织用户可见

### 页面布局

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  我的支出                                                                   │
│                                                                             │
│  时间范围: [今日] [本周] [本月] [本年] [自定义 📅 ────────────]            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────┐│
│  │ 💸 累计支出      │ │ ✅ 已支付        │ │ ⏳ 待支付       │ │ 📈 预估支出  ││
│  │                 │ │                 │ │                 │ │             ││
│  │ ¥356,789       │ │ ¥280,000       │ │ ¥76,789        │ │ ¥25,000    ││
│  │ 总支出         │ │ 已结清         │ │ 未结清          │ │ (未来30天) ││
│  └─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────┘│
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         支出趋势图                                    │  │
│  │                                                                      │  │
│  │  📈 ECharts 折线图                              [按日] [按周] [按月] │  │
│  │                                                                      │  │
│  │                                                                      │  │
│  │                                                                      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌────────────────────────────────────┐ ┌────────────────────────────────┐ │
│  │       支出类型构成                  │ │       合作资金方排行            │ │
│  │                                    │ │                                │ │
│  │  🍩 饼图                           │ │  1. 🏦 登途银行     ¥200,000   │ │
│  │                                    │ │  2. 🏦 xxx银行      ¥156,789   │ │
│  │  • 融资利息      50%               │ │                                │ │
│  │  • 定向支付利息  30%               │ │                                │ │
│  │  • 撮合抽成      15%               │ │                                │ │
│  │  • 抽成费用       5%               │ │                                │ │
│  └────────────────────────────────────┘ └────────────────────────────────┘ │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  支出明细                                                     [导出 Excel] │
│                                                                             │
│  🔍 搜索  [支出类型 ▼] [资金方 ▼] [状态 ▼]                                │
├──────────┬────────────┬──────────────┬──────────────┬──────────┬───────────┤
│ 日期     │ 支出类型   │ 合同编号     │ 资金方       │ 金额     │ 状态      │
├──────────┼────────────┼──────────────┼──────────────┼──────────┼───────────┤
│ 01-15    │ 融资利息   │ FC20260101   │ 登途银行     │ ¥1,250   │ 待支付    │
│ 01-15    │ 撮合抽成   │ BC20260103   │ -            │ ¥500     │ 已支付    │
│ 01-14    │ 定向支付   │ DPC20260105  │ 登途银行     │ ¥833     │ 待支付    │
│ ...      │            │              │              │          │           │
├──────────┴────────────┴──────────────┴──────────────┴──────────┴───────────┤
│                              < 1 2 3 4 5 >                 共 234 条        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 技术实现

### 1. 文件结构

```
frontend/src/pages/
└── FinancierExpense.tsx          # 融资方支出页面
```

### 2. API 调用

在 `frontend/src/api.ts` 添加：

```typescript
// 融资方支出API
export const fetchFinancierExpenseStats = (params: {
  startDate?: string;
  endDate?: string;
}) => api.get<RevenueStats>('/expense/financier/stats', { params });

export const fetchFinancierExpenseList = (params: {
  startDate?: string;
  endDate?: string;
  sourceType?: string;
  funderId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) => api.get<{ records: RevenueRecord[]; total: number }>('/expense/financier/list', { params });

export const fetchFinancierExpenseTrend = (params: {
  startDate: string;
  endDate: string;
  groupBy: 'day' | 'week' | 'month' | 'year';
}) => api.get<RevenueTrendPoint[]>('/expense/financier/trend', { params });

export const fetchFinancierExpenseComposition = (params: {
  startDate?: string;
  endDate?: string;
}) => api.get<RevenueComposition[]>('/expense/financier/composition', { params });

export const fetchFinancierFunderRanking = (params: {
  startDate?: string;
  endDate?: string;
  limit?: number;
}) => api.get<RevenueRankItem[]>('/expense/financier/ranking/funders', { params });

export const exportFinancierExpense = (params: {
  startDate?: string;
  endDate?: string;
  sourceType?: string;
  funderId?: string;
  status?: string;
}) => api.get('/expense/financier/export', { params, responseType: 'blob' });
```

### 3. 主页面组件

创建 `frontend/src/pages/FinancierExpense.tsx`：

```tsx
import React, { useState, useEffect, useMemo } from 'react';
import { Card, Row, Col, Statistic, Table, Select, DatePicker, Button, Space, Tag, Empty } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import * as echarts from 'echarts';
import dayjs, { Dayjs } from 'dayjs';
import {
  fetchFinancierExpenseStats,
  fetchFinancierExpenseList,
  fetchFinancierExpenseTrend,
  fetchFinancierExpenseComposition,
  fetchFinancierFunderRanking,
  exportFinancierExpense,
  RevenueStats,
  RevenueRecord,
  RevenueTrendPoint,
  RevenueComposition,
  RevenueRankItem,
} from '../api';
import { useAuth } from '../auth';

const { RangePicker } = DatePicker;

type TimeRange = 'today' | 'week' | 'month' | 'year' | 'custom';

// 支出类型映射（融资方视角，包含所有类型）
const SOURCE_TYPE_MAP: Record<string, string> = {
  financing_interest: '融资利息',
  directed_pay_interest: '定向支付利息',
  brokerage_commission: '撮合抽成',
  commission_fee: '抽成费用',
};

// 状态映射（融资方视角用"待支付/已支付"）
const STATUS_MAP: Record<string, { text: string; color: string }> = {
  pending: { text: '待支付', color: 'orange' },
  confirmed: { text: '已支付', color: 'green' },
  settled: { text: '已结算', color: 'blue' },
};

const FinancierExpense: React.FC = () => {
  const { user } = useAuth();
  
  // 检查是否为融资方用户
  const isFinancierUser = user?.orgContext?.orgType === 'financier';
  
  const [timeRange, setTimeRange] = useState<TimeRange>('month');
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');
  
  const [stats, setStats] = useState<RevenueStats | null>(null);
  const [trend, setTrend] = useState<RevenueTrendPoint[]>([]);
  const [composition, setComposition] = useState<RevenueComposition[]>([]);
  const [funderRanking, setFunderRanking] = useState<RevenueRankItem[]>([]);
  const [records, setRecords] = useState<RevenueRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  
  const [filters, setFilters] = useState({
    sourceType: undefined as string | undefined,
    funderId: undefined as string | undefined,
    status: undefined as string | undefined,
    page: 1,
    pageSize: 10,
  });

  const dateRange = useMemo(() => {
    const today = dayjs();
    switch (timeRange) {
      case 'today':
        return { startDate: today.format('YYYY-MM-DD'), endDate: today.format('YYYY-MM-DD') };
      case 'week':
        return { startDate: today.startOf('week').format('YYYY-MM-DD'), endDate: today.format('YYYY-MM-DD') };
      case 'month':
        return { startDate: today.startOf('month').format('YYYY-MM-DD'), endDate: today.format('YYYY-MM-DD') };
      case 'year':
        return { startDate: today.startOf('year').format('YYYY-MM-DD'), endDate: today.format('YYYY-MM-DD') };
      case 'custom':
        if (customRange) {
          return { startDate: customRange[0].format('YYYY-MM-DD'), endDate: customRange[1].format('YYYY-MM-DD') };
        }
      default:
        return { startDate: today.startOf('month').format('YYYY-MM-DD'), endDate: today.format('YYYY-MM-DD') };
    }
  }, [timeRange, customRange]);

  useEffect(() => {
    if (isFinancierUser) {
      loadData();
    }
  }, [dateRange, groupBy, isFinancierUser]);

  useEffect(() => {
    if (isFinancierUser) {
      loadRecords();
    }
  }, [dateRange, filters, isFinancierUser]);

  // 初始化趋势图
  useEffect(() => {
    if (!isFinancierUser || trend.length === 0) return;
    
    const trendChart = echarts.init(document.getElementById('financierTrendChart'));
    trendChart.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['总支出', '已支付', '待支付'] },
      xAxis: { type: 'category', data: trend.map(t => t.date) },
      yAxis: { type: 'value', axisLabel: { formatter: '¥{value}' } },
      series: [
        { 
          name: '总支出', 
          type: 'line', 
          data: trend.map(t => t.amount), 
          smooth: true, 
          areaStyle: { color: 'rgba(245, 34, 45, 0.1)' },
          lineStyle: { color: '#f5222d' },
          itemStyle: { color: '#f5222d' },
        },
        { 
          name: '已支付', 
          type: 'line', 
          data: trend.map(t => t.confirmedAmount), 
          smooth: true,
          lineStyle: { color: '#52c41a' },
          itemStyle: { color: '#52c41a' },
        },
        { 
          name: '待支付', 
          type: 'line', 
          data: trend.map(t => t.pendingAmount), 
          smooth: true,
          lineStyle: { color: '#faad14' },
          itemStyle: { color: '#faad14' },
        },
      ],
    });

    const handleResize = () => trendChart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      trendChart.dispose();
      window.removeEventListener('resize', handleResize);
    };
  }, [trend, isFinancierUser]);

  // 初始化饼图
  useEffect(() => {
    if (!isFinancierUser || composition.length === 0) return;
    
    const compositionChart = echarts.init(document.getElementById('financierCompositionChart'));
    compositionChart.setOption({
      tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
      legend: { bottom: 0, type: 'scroll' },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        label: { show: false },
        data: composition.map(c => ({ name: c.sourceName, value: c.amount })),
      }],
      color: ['#f5222d', '#fa541c', '#faad14', '#1890ff'],
    });

    return () => compositionChart.dispose();
  }, [composition, isFinancierUser]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, trendRes, compositionRes, funderRes] = await Promise.all([
        fetchFinancierExpenseStats(dateRange),
        fetchFinancierExpenseTrend({ ...dateRange, groupBy }),
        fetchFinancierExpenseComposition(dateRange),
        fetchFinancierFunderRanking({ ...dateRange, limit: 5 }),
      ]);
      
      setStats(statsRes.data);
      setTrend(trendRes.data);
      setComposition(compositionRes.data);
      setFunderRanking(funderRes.data);
    } catch (error) {
      console.error('加载支出数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRecords = async () => {
    try {
      const res = await fetchFinancierExpenseList({ ...dateRange, ...filters });
      setRecords(res.data.records);
      setTotal(res.data.total);
    } catch (error) {
      console.error('加载支出明细失败:', error);
    }
  };

  const handleExport = async () => {
    try {
      const res = await exportFinancierExpense({ ...dateRange, ...filters });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `我的支出明细_${dateRange.startDate}_${dateRange.endDate}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('导出失败:', error);
    }
  };

  // 非融资方用户显示无权限
  if (!isFinancierUser) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Empty description="您没有权限访问此页面" />
      </div>
    );
  }

  const columns = [
    { title: '日期', dataIndex: 'revenueDate', key: 'revenueDate', width: 100 },
    { 
      title: '支出类型', 
      dataIndex: 'sourceType', 
      key: 'sourceType',
      render: (type: string) => SOURCE_TYPE_MAP[type] || type,
    },
    { title: '合同编号', dataIndex: 'contractNumber', key: 'contractNumber' },
    { 
      title: '资金方', 
      dataIndex: 'funderName', 
      key: 'funderName',
      render: (name: string) => name || '-',
    },
    { 
      title: '金额', 
      dataIndex: 'amount', 
      key: 'amount',
      render: (amount: number) => (
        <span style={{ color: '#f5222d', fontWeight: 500 }}>
          -¥{amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const config = STATUS_MAP[status];
        return config ? <Tag color={config.color}>{config.text}</Tag> : status;
      },
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* 标题和时间选择器 */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <h2 style={{ margin: 0 }}>💸 我的支出</h2>
        </Col>
        <Col>
          <Space>
            <Button type={timeRange === 'today' ? 'primary' : 'default'} onClick={() => setTimeRange('today')}>今日</Button>
            <Button type={timeRange === 'week' ? 'primary' : 'default'} onClick={() => setTimeRange('week')}>本周</Button>
            <Button type={timeRange === 'month' ? 'primary' : 'default'} onClick={() => setTimeRange('month')}>本月</Button>
            <Button type={timeRange === 'year' ? 'primary' : 'default'} onClick={() => setTimeRange('year')}>本年</Button>
            <RangePicker
              value={customRange}
              onChange={(dates) => {
                setCustomRange(dates as [Dayjs, Dayjs]);
                setTimeRange('custom');
              }}
            />
          </Space>
        </Col>
      </Row>

      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="💸 累计支出"
              value={stats?.totalRevenue || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#f5222d', fontSize: 28 }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="✅ 已支付"
              value={stats?.confirmedRevenue || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="⏳ 待支付"
              value={stats?.pendingRevenue || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="📈 预估支出"
              value={stats?.estimatedRevenue || 0}
              precision={2}
              prefix="¥"
              suffix={<span style={{ fontSize: 12, color: '#999' }}>/未来30天</span>}
            />
          </Card>
        </Col>
      </Row>

      {/* 趋势图 */}
      <Card 
        title="支出趋势" 
        style={{ marginBottom: 24 }}
        extra={
          <Space>
            <Button type={groupBy === 'day' ? 'primary' : 'default'} size="small" onClick={() => setGroupBy('day')}>按日</Button>
            <Button type={groupBy === 'week' ? 'primary' : 'default'} size="small" onClick={() => setGroupBy('week')}>按周</Button>
            <Button type={groupBy === 'month' ? 'primary' : 'default'} size="small" onClick={() => setGroupBy('month')}>按月</Button>
          </Space>
        }
      >
        <div id="financierTrendChart" style={{ height: 300 }} />
      </Card>

      {/* 构成和排行 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <Card title="支出类型构成">
            <div id="financierCompositionChart" style={{ height: 250 }} />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="合作资金方排行">
            {funderRanking.length === 0 ? (
              <Empty description="暂无数据" />
            ) : (
              funderRanking.map((item, index) => (
                <div key={item.id} style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  padding: '12px 0', 
                  borderBottom: index < funderRanking.length - 1 ? '1px solid #f0f0f0' : 'none' 
                }}>
                  <span>
                    <span style={{ 
                      display: 'inline-block', 
                      width: 24, 
                      height: 24, 
                      lineHeight: '24px',
                      textAlign: 'center',
                      borderRadius: '50%',
                      backgroundColor: index < 3 ? ['#f5222d', '#fa8c16', '#fadb14'][index] : '#d9d9d9',
                      color: index < 3 ? '#fff' : '#666',
                      marginRight: 8,
                      fontSize: 12,
                    }}>
                      {index + 1}
                    </span>
                    🏦 {item.name}
                  </span>
                  <span style={{ color: '#f5222d', fontWeight: 500 }}>
                    ¥{item.amount.toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </Card>
        </Col>
      </Row>

      {/* 明细表格 */}
      <Card 
        title="支出明细" 
        extra={
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            导出 Excel
          </Button>
        }
      >
        <Space style={{ marginBottom: 16 }}>
          <Select
            placeholder="支出类型"
            allowClear
            style={{ width: 150 }}
            value={filters.sourceType}
            onChange={(v) => setFilters({ ...filters, sourceType: v, page: 1 })}
          >
            {Object.entries(SOURCE_TYPE_MAP).map(([key, label]) => (
              <Select.Option key={key} value={key}>{label}</Select.Option>
            ))}
          </Select>
          <Select
            placeholder="状态"
            allowClear
            style={{ width: 120 }}
            value={filters.status}
            onChange={(v) => setFilters({ ...filters, status: v, page: 1 })}
          >
            {Object.entries(STATUS_MAP).map(([key, { text }]) => (
              <Select.Option key={key} value={key}>{text}</Select.Option>
            ))}
          </Select>
        </Space>

        <Table
          columns={columns}
          dataSource={records}
          rowKey="id"
          loading={loading}
          pagination={{
            current: filters.page,
            pageSize: filters.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (page, pageSize) => setFilters({ ...filters, page, pageSize }),
          }}
        />
      </Card>
    </div>
  );
};

export default FinancierExpense;
```

### 4. 路由配置

在 `frontend/src/App.tsx` 添加路由：

```tsx
import FinancierExpense from './pages/FinancierExpense';

// 在 routes 中添加
{
  path: '/expense/financier',
  element: <FinancierExpense />,
}
```

### 5. 菜单配置

在 `frontend/src/layouts/AppLayout.tsx` 的收益管理菜单中添加：

```tsx
{
  key: '/expense/financier',
  label: '我的支出',
  // 仅融资方用户可见
}
```

---

## 与资金方页面的区别

| 方面 | 资金方页面 | 融资方页面 |
|------|-----------|-----------|
| 视角 | 收益（进账） | 支出（出账） |
| 颜色主题 | 绿色（+¥） | 红色（-¥） |
| 支出类型 | 融资利息、定向支付利息 | 融资利息、定向支付利息、撮合抽成、抽成费用 |
| 排行榜 | 合作融资方排行 | 合作资金方排行 |
| 状态文案 | 已到账/待结算 | 已支付/待支付 |

---

## 验收标准

- [ ] 页面可正常访问
- [ ] 非融资方用户显示无权限提示
- [ ] 时间范围切换正常工作
- [ ] 统计卡片数据正确显示（自动过滤为当前融资方数据）
- [ ] 趋势图正确渲染（红色主题）
- [ ] 饼图正确渲染（四种支出类型）
- [ ] 资金方排行榜正确显示
- [ ] 明细表格分页、筛选正常
- [ ] 导出功能正常
- [ ] 菜单仅对融资方用户可见

---

## 注意事项

1. **数据隔离**：后端API会自动根据登录用户的 `orgContext` 过滤数据，前端无需传 financierId
2. **权限检查**：页面加载时检查用户是否为融资方用户
3. **菜单可见性**：菜单项根据用户组织类型动态显示
4. **金额显示**：支出金额使用红色 -¥ 格式，突出支出属性
5. **支出类型**：融资方能看到四种支出类型（比资金方多撮合和抽成）
