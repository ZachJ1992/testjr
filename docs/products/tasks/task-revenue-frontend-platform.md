# Task: 平台收益看板前端开发

## 任务概述

| 项目 | 说明 |
|------|------|
| 负责Agent | Agent-Frontend-Platform |
| 任务类型 | 前端开发 |
| 优先级 | 高 |
| 预估工时 | 3-4小时 |

## 业务背景

平台管理员需要一个收益看板，用于查看整个平台的收益情况，包括：
- 所有资金方的利息收益
- 平台自身的抽成收益
- 按多维度分析和筛选

---

## 页面设计

### 页面路径
- **路由**: `/revenue/platform`
- **菜单**: 收益管理 > 平台收益看板
- **权限**: `view_platform_revenue`

### 页面布局

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  平台收益看板                                                               │
│                                                                             │
│  时间范围: [今日] [本周] [本月] [本年] [自定义 📅 ────────────]            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐    │
│  │ 💰 总收益  │ │ ✅ 已确认  │ │ ⏳ 待确认  │ │ 📈 预估收益 │ │ 🆕 本期新增 │    │
│  │           │ │           │ │           │ │           │ │           │    │
│  │ ¥2,567,890│ │ ¥1,890,000│ │ ¥567,890  │ │ ¥110,000  │ │ ¥45,678   │    │
│  │   ↑15.2%  │ │           │ │           │ │ (未来30天)│ │ (本期)    │    │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘ └───────────┘    │
│                                                                             │
│  ┌────────────────────────────────────┐ ┌────────────────────────────────┐ │
│  │          收益趋势图                 │ │         收益构成                │ │
│  │                                    │ │                                │ │
│  │  📈 ECharts 折线/柱状图            │ │  🍩 ECharts 饼图               │ │
│  │                                    │ │                                │ │
│  │  [折线] [柱状]                     │ │  • 融资利息     45%  ¥1.2M    │ │
│  │                                    │ │  • 定向支付利息 35%  ¥900K    │ │
│  │                                    │ │  • 撮合抽成     15%  ¥380K    │ │
│  │                                    │ │  • 抽成合同      5%  ¥87K     │ │
│  │                                    │ │                                │ │
│  └────────────────────────────────────┘ └────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────┐ ┌────────────────────────────────┐ │
│  │       TOP5 资金方收益               │ │       TOP5 融资方贡献           │ │
│  │                                    │ │                                │ │
│  │  1. 🏦 登途银行     ¥856,000       │ │  1. 🚛 金罗物流     ¥650,000   │ │
│  │  2. 🏦 xxx银行      ¥534,000       │ │  2. 🚛 融满运输     ¥420,000   │ │
│  │  3. 🏦 yyy银行      ¥312,000       │ │  3. 🚛 xxx物流      ¥280,000   │ │
│  │  4. 🏦 zzz银行      ¥189,000       │ │  4. 🚛 yyy运输      ¥156,000   │ │
│  │  5. 🏦 aaa银行       ¥78,000       │ │  5. 🚛 zzz货运       ¥89,000   │ │
│  │                                    │ │                                │ │
│  └────────────────────────────────────┘ └────────────────────────────────┘ │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  收益明细                                                     [导出 Excel] │
│                                                                             │
│  🔍 搜索  [收益类型 ▼] [资金方 ▼] [融资方 ▼] [状态 ▼]                      │
├──────────┬────────────┬──────────────┬──────────┬──────────┬────────┬──────┤
│ 日期     │ 收益类型   │ 合同编号     │ 资金方   │ 融资方   │ 金额   │ 状态 │
├──────────┼────────────┼──────────────┼──────────┼──────────┼────────┼──────┤
│ 01-15    │ 融资利息   │ FC20260101   │ 登途银行 │ 金罗物流 │ ¥1,250 │ 待确认│
│ 01-15    │ 定向支付   │ DPC20260105  │ 登途银行 │ 融满运输 │ ¥833   │ 已确认│
│ 01-15    │ 撮合抽成   │ BC20260103   │ -        │ 金罗物流 │ ¥500   │ 已确认│
│ ...      │            │              │          │          │        │      │
├──────────┴────────────┴──────────────┴──────────┴──────────┴────────┴──────┤
│                              < 1 2 3 4 5 >                 共 1,234 条      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 技术实现

### 1. 文件结构

```
frontend/src/pages/
├── PlatformRevenue.tsx          # 主页面组件
└── components/
    └── revenue/
        ├── RevenueStatsCards.tsx    # 统计卡片组件
        ├── RevenueTrendChart.tsx    # 趋势图组件
        ├── RevenueCompositionChart.tsx  # 构成饼图组件
        ├── RevenueRankingCard.tsx   # 排行榜组件
        └── RevenueExportButton.tsx  # 导出按钮组件
```

### 2. API 调用

在 `frontend/src/api.ts` 添加：

```typescript
// 收益类型定义
export interface RevenueStats {
  totalRevenue: number;
  confirmedRevenue: number;
  pendingRevenue: number;
  estimatedRevenue: number;
  periodRevenue: number;
}

export interface RevenueTrendPoint {
  date: string;
  amount: number;
  confirmedAmount: number;
  pendingAmount: number;
}

export interface RevenueComposition {
  sourceType: string;
  sourceName: string;
  amount: number;
  percentage: number;
}

export interface RevenueRankItem {
  id: string;
  name: string;
  amount: number;
  count: number;
}

export interface RevenueRecord {
  id: string;
  recordType: 'revenue' | 'expense';
  sourceType: string;
  contractId: string;
  contractNumber?: string;
  funderName?: string;
  financierName?: string;
  amount: number;
  revenueDate: string;
  status: string;
}

// 平台收益API
export const fetchPlatformRevenueStats = (params: {
  startDate?: string;
  endDate?: string;
}) => api.get<RevenueStats>('/revenue/platform/stats', { params });

export const fetchPlatformRevenueList = (params: {
  startDate?: string;
  endDate?: string;
  sourceType?: string;
  funderId?: string;
  financierId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) => api.get<{ records: RevenueRecord[]; total: number }>('/revenue/platform/list', { params });

export const fetchPlatformRevenueTrend = (params: {
  startDate: string;
  endDate: string;
  groupBy: 'day' | 'week' | 'month' | 'year';
}) => api.get<RevenueTrendPoint[]>('/revenue/platform/trend', { params });

export const fetchPlatformRevenueComposition = (params: {
  startDate?: string;
  endDate?: string;
}) => api.get<RevenueComposition[]>('/revenue/platform/composition', { params });

export const fetchPlatformFunderRanking = (params: {
  startDate?: string;
  endDate?: string;
  limit?: number;
}) => api.get<RevenueRankItem[]>('/revenue/platform/ranking/funders', { params });

export const fetchPlatformFinancierRanking = (params: {
  startDate?: string;
  endDate?: string;
  limit?: number;
}) => api.get<RevenueRankItem[]>('/revenue/platform/ranking/financiers', { params });

export const exportPlatformRevenue = (params: {
  startDate?: string;
  endDate?: string;
  sourceType?: string;
  funderId?: string;
  financierId?: string;
  status?: string;
}) => api.get('/revenue/platform/export', { params, responseType: 'blob' });
```

### 3. 主页面组件

创建 `frontend/src/pages/PlatformRevenue.tsx`：

```tsx
import React, { useState, useEffect, useMemo } from 'react';
import { Card, Row, Col, Statistic, Table, Select, DatePicker, Button, Space, Tag } from 'antd';
import { DownloadOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import * as echarts from 'echarts';
import dayjs, { Dayjs } from 'dayjs';
import {
  fetchPlatformRevenueStats,
  fetchPlatformRevenueList,
  fetchPlatformRevenueTrend,
  fetchPlatformRevenueComposition,
  fetchPlatformFunderRanking,
  fetchPlatformFinancierRanking,
  exportPlatformRevenue,
  RevenueStats,
  RevenueRecord,
  RevenueTrendPoint,
  RevenueComposition,
  RevenueRankItem,
} from '../api';

const { RangePicker } = DatePicker;

// 时间范围快捷选项
type TimeRange = 'today' | 'week' | 'month' | 'year' | 'custom';

// 收益类型映射
const SOURCE_TYPE_MAP: Record<string, string> = {
  financing_interest: '融资利息',
  directed_pay_interest: '定向支付利息',
  brokerage_commission: '撮合抽成',
  commission_fee: '抽成费用',
};

// 状态映射
const STATUS_MAP: Record<string, { text: string; color: string }> = {
  pending: { text: '待确认', color: 'orange' },
  confirmed: { text: '已确认', color: 'green' },
  settled: { text: '已结算', color: 'blue' },
};

const PlatformRevenue: React.FC = () => {
  // 状态
  const [timeRange, setTimeRange] = useState<TimeRange>('month');
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month' | 'year'>('day');
  
  const [stats, setStats] = useState<RevenueStats | null>(null);
  const [trend, setTrend] = useState<RevenueTrendPoint[]>([]);
  const [composition, setComposition] = useState<RevenueComposition[]>([]);
  const [funderRanking, setFunderRanking] = useState<RevenueRankItem[]>([]);
  const [financierRanking, setFinancierRanking] = useState<RevenueRankItem[]>([]);
  const [records, setRecords] = useState<RevenueRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  
  // 筛选条件
  const [filters, setFilters] = useState({
    sourceType: undefined as string | undefined,
    funderId: undefined as string | undefined,
    financierId: undefined as string | undefined,
    status: undefined as string | undefined,
    page: 1,
    pageSize: 10,
  });

  // 计算日期范围
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
        return { startDate: today.startOf('month').format('YYYY-MM-DD'), endDate: today.format('YYYY-MM-DD') };
      default:
        return { startDate: today.startOf('month').format('YYYY-MM-DD'), endDate: today.format('YYYY-MM-DD') };
    }
  }, [timeRange, customRange]);

  // 加载数据
  useEffect(() => {
    loadData();
  }, [dateRange, groupBy]);

  useEffect(() => {
    loadRecords();
  }, [dateRange, filters]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, trendRes, compositionRes, funderRes, financierRes] = await Promise.all([
        fetchPlatformRevenueStats(dateRange),
        fetchPlatformRevenueTrend({ ...dateRange, groupBy }),
        fetchPlatformRevenueComposition(dateRange),
        fetchPlatformFunderRanking({ ...dateRange, limit: 5 }),
        fetchPlatformFinancierRanking({ ...dateRange, limit: 5 }),
      ]);
      
      setStats(statsRes.data);
      setTrend(trendRes.data);
      setComposition(compositionRes.data);
      setFunderRanking(funderRes.data);
      setFinancierRanking(financierRes.data);
    } catch (error) {
      console.error('加载收益数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRecords = async () => {
    try {
      const res = await fetchPlatformRevenueList({
        ...dateRange,
        ...filters,
      });
      setRecords(res.data.records);
      setTotal(res.data.total);
    } catch (error) {
      console.error('加载收益明细失败:', error);
    }
  };

  // 导出
  const handleExport = async () => {
    try {
      const res = await exportPlatformRevenue({
        ...dateRange,
        ...filters,
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `平台收益明细_${dateRange.startDate}_${dateRange.endDate}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('导出失败:', error);
    }
  };

  // 表格列定义
  const columns = [
    { title: '日期', dataIndex: 'revenueDate', key: 'revenueDate', width: 100 },
    { 
      title: '收益类型', 
      dataIndex: 'sourceType', 
      key: 'sourceType',
      render: (type: string) => SOURCE_TYPE_MAP[type] || type,
    },
    { title: '合同编号', dataIndex: 'contractNumber', key: 'contractNumber' },
    { title: '资金方', dataIndex: 'funderName', key: 'funderName' },
    { title: '融资方', dataIndex: 'financierName', key: 'financierName' },
    { 
      title: '金额', 
      dataIndex: 'amount', 
      key: 'amount',
      render: (amount: number) => `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`,
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
          <h2 style={{ margin: 0 }}>平台收益看板</h2>
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
        <Col span={4}>
          <Card>
            <Statistic
              title="💰 总收益"
              value={stats?.totalRevenue || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={5}>
          <Card>
            <Statistic
              title="✅ 已确认"
              value={stats?.confirmedRevenue || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={5}>
          <Card>
            <Statistic
              title="⏳ 待确认"
              value={stats?.pendingRevenue || 0}
              precision={2}
              prefix="¥"
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={5}>
          <Card>
            <Statistic
              title="📈 预估收益"
              value={stats?.estimatedRevenue || 0}
              precision={2}
              prefix="¥"
              suffix={<span style={{ fontSize: 12 }}>(未来30天)</span>}
            />
          </Card>
        </Col>
        <Col span={5}>
          <Card>
            <Statistic
              title="🆕 本期新增"
              value={stats?.periodRevenue || 0}
              precision={2}
              prefix="¥"
            />
          </Card>
        </Col>
      </Row>

      {/* 图表区域 - 需要实现 ECharts 组件 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={14}>
          <Card title="收益趋势" extra={
            <Select value={groupBy} onChange={setGroupBy} style={{ width: 100 }}>
              <Select.Option value="day">按日</Select.Option>
              <Select.Option value="week">按周</Select.Option>
              <Select.Option value="month">按月</Select.Option>
              <Select.Option value="year">按年</Select.Option>
            </Select>
          }>
            {/* ECharts 趋势图组件 */}
            <div id="trendChart" style={{ height: 300 }} />
          </Card>
        </Col>
        <Col span={10}>
          <Card title="收益构成">
            {/* ECharts 饼图组件 */}
            <div id="compositionChart" style={{ height: 300 }} />
          </Card>
        </Col>
      </Row>

      {/* 排行榜 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <Card title="TOP5 资金方收益">
            {funderRanking.map((item, index) => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span>{index + 1}. 🏦 {item.name}</span>
                <span style={{ color: '#1890ff' }}>¥{item.amount.toLocaleString()}</span>
              </div>
            ))}
          </Card>
        </Col>
        <Col span={12}>
          <Card title="TOP5 融资方贡献">
            {financierRanking.map((item, index) => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span>{index + 1}. 🚛 {item.name}</span>
                <span style={{ color: '#52c41a' }}>¥{item.amount.toLocaleString()}</span>
              </div>
            ))}
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
        {/* 筛选器 */}
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
          {/* TODO: 资金方、融资方下拉框 */}
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

export default PlatformRevenue;
```

### 4. ECharts 图表实现

趋势图和饼图需要使用 ECharts 实现，在组件 mount 后初始化：

```tsx
// 在 useEffect 中初始化图表
useEffect(() => {
  // 趋势图
  const trendChart = echarts.init(document.getElementById('trendChart'));
  trendChart.setOption({
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: trend.map(t => t.date) },
    yAxis: { type: 'value' },
    series: [
      { name: '总收益', type: 'line', data: trend.map(t => t.amount), smooth: true },
      { name: '已确认', type: 'line', data: trend.map(t => t.confirmedAmount), smooth: true },
    ],
  });

  // 饼图
  const compositionChart = echarts.init(document.getElementById('compositionChart'));
  compositionChart.setOption({
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      data: composition.map(c => ({ name: c.sourceName, value: c.amount })),
    }],
  });

  return () => {
    trendChart.dispose();
    compositionChart.dispose();
  };
}, [trend, composition]);
```

### 5. 路由配置

在 `frontend/src/App.tsx` 添加路由：

```tsx
import PlatformRevenue from './pages/PlatformRevenue';

// 在 routes 中添加
{
  path: '/revenue/platform',
  element: <PlatformRevenue />,
}
```

### 6. 菜单配置

在 `frontend/src/layouts/AppLayout.tsx` 添加菜单：

```tsx
// 在 menuItems 中添加
{
  key: 'revenue',
  icon: <DollarOutlined />,
  label: '收益管理',
  children: [
    {
      key: '/revenue/platform',
      label: '平台收益看板',
    },
    // 其他子菜单由其他Agent添加
  ],
}
```

### 7. 类型同步

在 `frontend/src/types.ts` 添加类型定义（与 api.ts 中一致）。

---

## ECharts 依赖安装

```bash
npm install echarts --workspace frontend
```

---

## 验收标准

- [ ] 页面可正常访问
- [ ] 时间范围切换正常工作
- [ ] 统计卡片数据正确显示
- [ ] 趋势图正确渲染
- [ ] 饼图正确渲染
- [ ] 排行榜正确显示
- [ ] 明细表格分页、筛选正常
- [ ] 导出功能正常
- [ ] 权限控制正确（仅平台用户可见）

---

## 注意事项

1. **ECharts 响应式**：窗口大小变化时需要 resize 图表
2. **数据加载状态**：加载中显示 loading 状态
3. **错误处理**：API 调用失败时显示友好提示
4. **数字格式化**：金额显示千分位和两位小数
5. **权限检查**：页面加载时检查用户权限
