# Task: 资金方收益页面前端开发

## 任务概述

| 项目 | 说明 |
|------|------|
| 负责Agent | Agent-Frontend-Funder |
| 任务类型 | 前端开发 |
| 优先级 | 高 |
| 预估工时 | 2-3小时 |

## 业务背景

资金方用户需要一个页面查看自己的收益情况，包括：
- 三方融资合同产生的利息收益
- 定向支付产生的利息收益
- 收益趋势和明细

**重要**：该页面仅对资金方用户可见，数据自动按当前登录用户所属资金方过滤。

---

## 页面设计

### 页面路径
- **路由**: `/revenue/funder`
- **菜单**: 收益管理 > 我的收益
- **权限**: `view_funder_revenue`
- **可见性**: 仅资金方组织用户可见

### 页面布局

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  我的收益                                                                   │
│                                                                             │
│  时间范围: [今日] [本周] [本月] [本年] [自定义 📅 ────────────]            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────┐│
│  │ 💰 累计收益      │ │ ✅ 已到账        │ │ ⏳ 待结算       │ │ 📈 预估收益  ││
│  │                 │ │                 │ │                 │ │             ││
│  │ ¥856,789       │ │ ¥650,000       │ │ ¥156,789       │ │ ¥50,000    ││
│  │ 总收益         │ │ 已还款确认      │ │ 未还款部分      │ │ (未来30天) ││
│  └─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────┘│
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         收益趋势图                                    │  │
│  │                                                                      │  │
│  │  📈 ECharts 折线图                              [按日] [按周] [按月] │  │
│  │                                                                      │  │
│  │                                                                      │  │
│  │                                                                      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌────────────────────────────────────┐ ┌────────────────────────────────┐ │
│  │       收益来源构成                  │ │       合作融资方排行            │ │
│  │                                    │ │                                │ │
│  │  🍩 饼图                           │ │  1. 🚛 金罗物流     ¥400,000   │ │
│  │                                    │ │  2. 🚛 融满运输     ¥280,000   │ │
│  │  • 三方融资利息  60%               │ │  3. 🚛 xxx物流      ¥126,789   │ │
│  │  • 定向支付利息  40%               │ │  4. 🚛 yyy运输       ¥50,000   │ │
│  │                                    │ │                                │ │
│  └────────────────────────────────────┘ └────────────────────────────────┘ │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  收益明细                                                     [导出 Excel] │
│                                                                             │
│  🔍 搜索  [收益类型 ▼] [融资方 ▼] [状态 ▼]                                │
├──────────┬────────────┬──────────────┬──────────────┬──────────┬───────────┤
│ 日期     │ 收益类型   │ 合同编号     │ 融资方       │ 金额     │ 状态      │
├──────────┼────────────┼──────────────┼──────────────┼──────────┼───────────┤
│ 01-15    │ 融资利息   │ FC20260101   │ 金罗物流     │ ¥1,250   │ 待确认    │
│ 01-15    │ 定向支付   │ DPC20260105  │ 融满运输     │ ¥833     │ 已确认    │
│ 01-14    │ 融资利息   │ FC20260101   │ 金罗物流     │ ¥1,250   │ 待确认    │
│ ...      │            │              │              │          │           │
├──────────┴────────────┴──────────────┴──────────────┴──────────┴───────────┤
│                              < 1 2 3 4 5 >                 共 456 条        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 技术实现

### 1. 文件结构

```
frontend/src/pages/
└── FunderRevenue.tsx          # 资金方收益页面
```

### 2. API 调用

在 `frontend/src/api.ts` 添加（如果平台页面Agent还没添加）：

```typescript
// 资金方收益API
export const fetchFunderRevenueStats = (params: {
  startDate?: string;
  endDate?: string;
}) => api.get<RevenueStats>('/revenue/funder/stats', { params });

export const fetchFunderRevenueList = (params: {
  startDate?: string;
  endDate?: string;
  sourceType?: string;
  financierId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) => api.get<{ records: RevenueRecord[]; total: number }>('/revenue/funder/list', { params });

export const fetchFunderRevenueTrend = (params: {
  startDate: string;
  endDate: string;
  groupBy: 'day' | 'week' | 'month' | 'year';
}) => api.get<RevenueTrendPoint[]>('/revenue/funder/trend', { params });

export const fetchFunderRevenueComposition = (params: {
  startDate?: string;
  endDate?: string;
}) => api.get<RevenueComposition[]>('/revenue/funder/composition', { params });

export const fetchFunderFinancierRanking = (params: {
  startDate?: string;
  endDate?: string;
  limit?: number;
}) => api.get<RevenueRankItem[]>('/revenue/funder/ranking/financiers', { params });

export const exportFunderRevenue = (params: {
  startDate?: string;
  endDate?: string;
  sourceType?: string;
  financierId?: string;
  status?: string;
}) => api.get('/revenue/funder/export', { params, responseType: 'blob' });
```

### 3. 主页面组件

创建 `frontend/src/pages/FunderRevenue.tsx`：

```tsx
import React, { useState, useEffect, useMemo } from 'react';
import { Card, Row, Col, Statistic, Table, Select, DatePicker, Button, Space, Tag, Empty } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import * as echarts from 'echarts';
import dayjs, { Dayjs } from 'dayjs';
import {
  fetchFunderRevenueStats,
  fetchFunderRevenueList,
  fetchFunderRevenueTrend,
  fetchFunderRevenueComposition,
  fetchFunderFinancierRanking,
  exportFunderRevenue,
  RevenueStats,
  RevenueRecord,
  RevenueTrendPoint,
  RevenueComposition,
  RevenueRankItem,
} from '../api';
import { useAuth } from '../auth';

const { RangePicker } = DatePicker;

type TimeRange = 'today' | 'week' | 'month' | 'year' | 'custom';

const SOURCE_TYPE_MAP: Record<string, string> = {
  financing_interest: '三方融资利息',
  directed_pay_interest: '定向支付利息',
};

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  pending: { text: '待确认', color: 'orange' },
  confirmed: { text: '已到账', color: 'green' },
  settled: { text: '已结算', color: 'blue' },
};

const FunderRevenue: React.FC = () => {
  const { user } = useAuth();
  
  // 检查是否为资金方用户
  const isFunderUser = user?.orgContext?.orgType === 'funder';
  
  const [timeRange, setTimeRange] = useState<TimeRange>('month');
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');
  
  const [stats, setStats] = useState<RevenueStats | null>(null);
  const [trend, setTrend] = useState<RevenueTrendPoint[]>([]);
  const [composition, setComposition] = useState<RevenueComposition[]>([]);
  const [financierRanking, setFinancierRanking] = useState<RevenueRankItem[]>([]);
  const [records, setRecords] = useState<RevenueRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  
  const [filters, setFilters] = useState({
    sourceType: undefined as string | undefined,
    financierId: undefined as string | undefined,
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
    if (isFunderUser) {
      loadData();
    }
  }, [dateRange, groupBy, isFunderUser]);

  useEffect(() => {
    if (isFunderUser) {
      loadRecords();
    }
  }, [dateRange, filters, isFunderUser]);

  // 初始化图表
  useEffect(() => {
    if (!isFunderUser || trend.length === 0) return;
    
    const trendChart = echarts.init(document.getElementById('funderTrendChart'));
    trendChart.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['总收益', '已到账', '待确认'] },
      xAxis: { type: 'category', data: trend.map(t => t.date) },
      yAxis: { type: 'value', axisLabel: { formatter: '¥{value}' } },
      series: [
        { name: '总收益', type: 'line', data: trend.map(t => t.amount), smooth: true, areaStyle: {} },
        { name: '已到账', type: 'line', data: trend.map(t => t.confirmedAmount), smooth: true },
        { name: '待确认', type: 'line', data: trend.map(t => t.pendingAmount), smooth: true },
      ],
      color: ['#1890ff', '#52c41a', '#faad14'],
    });

    const handleResize = () => trendChart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      trendChart.dispose();
      window.removeEventListener('resize', handleResize);
    };
  }, [trend, isFunderUser]);

  useEffect(() => {
    if (!isFunderUser || composition.length === 0) return;
    
    const compositionChart = echarts.init(document.getElementById('funderCompositionChart'));
    compositionChart.setOption({
      tooltip: { trigger: 'item', formatter: '{b}: ¥{c} ({d}%)' },
      legend: { bottom: 0 },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        label: { show: false },
        data: composition.map(c => ({ name: c.sourceName, value: c.amount })),
      }],
      color: ['#1890ff', '#52c41a'],
    });

    return () => compositionChart.dispose();
  }, [composition, isFunderUser]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, trendRes, compositionRes, financierRes] = await Promise.all([
        fetchFunderRevenueStats(dateRange),
        fetchFunderRevenueTrend({ ...dateRange, groupBy }),
        fetchFunderRevenueComposition(dateRange),
        fetchFunderFinancierRanking({ ...dateRange, limit: 5 }),
      ]);
      
      setStats(statsRes.data);
      setTrend(trendRes.data);
      setComposition(compositionRes.data);
      setFinancierRanking(financierRes.data);
    } catch (error) {
      console.error('加载收益数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRecords = async () => {
    try {
      const res = await fetchFunderRevenueList({ ...dateRange, ...filters });
      setRecords(res.data.records);
      setTotal(res.data.total);
    } catch (error) {
      console.error('加载收益明细失败:', error);
    }
  };

  const handleExport = async () => {
    try {
      const res = await exportFunderRevenue({ ...dateRange, ...filters });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `我的收益明细_${dateRange.startDate}_${dateRange.endDate}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('导出失败:', error);
    }
  };

  // 非资金方用户显示无权限
  if (!isFunderUser) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Empty description="您没有权限访问此页面" />
      </div>
    );
  }

  const columns = [
    { title: '日期', dataIndex: 'revenueDate', key: 'revenueDate', width: 100 },
    { 
      title: '收益类型', 
      dataIndex: 'sourceType', 
      key: 'sourceType',
      render: (type: string) => SOURCE_TYPE_MAP[type] || type,
    },
    { title: '合同编号', dataIndex: 'contractNumber', key: 'contractNumber' },
    { title: '融资方', dataIndex: 'financierName', key: 'financierName' },
    { 
      title: '金额', 
      dataIndex: 'amount', 
      key: 'amount',
      render: (amount: number) => (
        <span style={{ color: '#52c41a', fontWeight: 500 }}>
          +¥{amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
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
          <h2 style={{ margin: 0 }}>💰 我的收益</h2>
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
              title="💰 累计收益"
              value={stats?.totalRevenue || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#1890ff', fontSize: 28 }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="✅ 已到账"
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
              title="⏳ 待结算"
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
              title="📈 预估收益"
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
        title="收益趋势" 
        style={{ marginBottom: 24 }}
        extra={
          <Space>
            <Button type={groupBy === 'day' ? 'primary' : 'default'} size="small" onClick={() => setGroupBy('day')}>按日</Button>
            <Button type={groupBy === 'week' ? 'primary' : 'default'} size="small" onClick={() => setGroupBy('week')}>按周</Button>
            <Button type={groupBy === 'month' ? 'primary' : 'default'} size="small" onClick={() => setGroupBy('month')}>按月</Button>
          </Space>
        }
      >
        <div id="funderTrendChart" style={{ height: 300 }} />
      </Card>

      {/* 构成和排行 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <Card title="收益来源构成">
            <div id="funderCompositionChart" style={{ height: 250 }} />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="合作融资方排行">
            {financierRanking.length === 0 ? (
              <Empty description="暂无数据" />
            ) : (
              financierRanking.map((item, index) => (
                <div key={item.id} style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  padding: '12px 0', 
                  borderBottom: index < financierRanking.length - 1 ? '1px solid #f0f0f0' : 'none' 
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
                    🚛 {item.name}
                  </span>
                  <span style={{ color: '#52c41a', fontWeight: 500 }}>
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
        title="收益明细" 
        extra={
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            导出 Excel
          </Button>
        }
      >
        <Space style={{ marginBottom: 16 }}>
          <Select
            placeholder="收益类型"
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

export default FunderRevenue;
```

### 4. 路由配置

在 `frontend/src/App.tsx` 添加路由：

```tsx
import FunderRevenue from './pages/FunderRevenue';

// 在 routes 中添加
{
  path: '/revenue/funder',
  element: <FunderRevenue />,
}
```

### 5. 菜单配置

在 `frontend/src/layouts/AppLayout.tsx` 的收益管理菜单中添加：

```tsx
{
  key: '/revenue/funder',
  label: '我的收益',
  // 仅资金方用户可见
}
```

**注意**：需要根据用户的 `orgContext.orgType` 动态显示/隐藏此菜单项。

---

## 菜单可见性控制

```tsx
// 在生成菜单时检查
const revenueMenuItems = [];

// 平台用户可见平台收益
if (isPlatformUser) {
  revenueMenuItems.push({ key: '/revenue/platform', label: '平台收益看板' });
}

// 资金方用户可见我的收益
if (isFunderUser) {
  revenueMenuItems.push({ key: '/revenue/funder', label: '我的收益' });
}

// 融资方用户可见我的支出
if (isFinancierUser) {
  revenueMenuItems.push({ key: '/expense/financier', label: '我的支出' });
}
```

---

## 验收标准

- [ ] 页面可正常访问
- [ ] 非资金方用户显示无权限提示
- [ ] 时间范围切换正常工作
- [ ] 统计卡片数据正确显示（自动过滤为当前资金方数据）
- [ ] 趋势图正确渲染
- [ ] 饼图正确渲染
- [ ] 融资方排行榜正确显示
- [ ] 明细表格分页、筛选正常
- [ ] 导出功能正常
- [ ] 菜单仅对资金方用户可见

---

## 注意事项

1. **数据隔离**：后端API会自动根据登录用户的 `orgContext` 过滤数据，前端无需传 funderId
2. **权限检查**：页面加载时检查用户是否为资金方用户
3. **菜单可见性**：菜单项根据用户组织类型动态显示
4. **金额显示**：收益金额使用绿色 +¥ 格式，突出收入属性
