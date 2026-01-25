import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, Row, Col, Statistic, Table, Select, DatePicker, Button, Space, message, Empty, Spin } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import * as echarts from 'echarts';
import dayjs, { Dayjs } from 'dayjs';
import { useAuth } from '../auth';
import {
  fetchFunderRevenueStats,
  fetchFunderRevenueList,
  fetchFunderRevenueTrend,
  fetchFunderRevenueComposition,
  fetchFunderFinancierRanking,
  getFunderRevenueExportUrl,
  RevenueStats,
  RevenueRecord,
  RevenueTrendPoint,
  RevenueComposition,
  RevenueRankItem,
  RevenueSourceType,
  getErrorMessage,
} from '../api';

const { RangePicker } = DatePicker;

type TimeRange = 'today' | 'week' | 'month' | 'year' | 'custom';

const SOURCE_TYPE_MAP: Record<string, string> = {
  financing_interest: '三方融资利息',
  directed_pay_interest: '定向支付利息',
};

const FunderRevenue: React.FC = () => {
  const { token, user } = useAuth();
  
  // 检查是否为资金方用户
  const isFunderUser = user?.orgContext?.orgType === 'funder' || user?.orgContext?.isPlatformUser;
  
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
  const [tableLoading, setTableLoading] = useState(false);
  
  const [filters, setFilters] = useState({
    sourceType: undefined as RevenueSourceType | undefined,
    financierId: undefined as string | undefined,
    page: 1,
    pageSize: 10,
  });

  // 图表引用
  const trendChartRef = useRef<HTMLDivElement>(null);
  const compositionChartRef = useRef<HTMLDivElement>(null);
  const trendChartInstance = useRef<echarts.ECharts | null>(null);
  const compositionChartInstance = useRef<echarts.ECharts | null>(null);

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

  // 加载统计数据
  const loadData = async () => {
    if (!token || !isFunderUser) return;
    setLoading(true);
    try {
      const [statsRes, trendRes, compositionRes, financierRes] = await Promise.all([
        fetchFunderRevenueStats(token, dateRange),
        fetchFunderRevenueTrend(token, { ...dateRange, groupBy }),
        fetchFunderRevenueComposition(token, dateRange),
        fetchFunderFinancierRanking(token, { ...dateRange, limit: 5 }),
      ]);
      
      setStats(statsRes);
      setTrend(trendRes.trend || []);
      setComposition(compositionRes.composition || []);
      setFinancierRanking(financierRes.ranking || []);
    } catch (error) {
      message.error('加载收益数据失败: ' + getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  // 加载明细列表
  const loadRecords = async () => {
    if (!token || !isFunderUser) return;
    setTableLoading(true);
    try {
      const res = await fetchFunderRevenueList(token, { ...dateRange, ...filters });
      setRecords(res.records || []);
      setTotal(res.total || 0);
    } catch (error) {
      message.error('加载收益明细失败: ' + getErrorMessage(error));
    } finally {
      setTableLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [dateRange, groupBy, isFunderUser, token]);

  useEffect(() => {
    loadRecords();
  }, [dateRange, filters, isFunderUser, token]);

  // 初始化趋势图 - 只显示总收益
  useEffect(() => {
    if (!trendChartRef.current || trend.length === 0 || !isFunderUser) return;
    
    if (!trendChartInstance.current) {
      trendChartInstance.current = echarts.init(trendChartRef.current);
    }
    
    trendChartInstance.current.setOption({
      tooltip: { 
        trigger: 'axis',
        formatter: (params: any) => {
          const date = params[0]?.axisValue || '';
          let result = `${date}<br/>`;
          params.forEach((p: any) => {
            result += `${p.marker} ${p.seriesName}: ¥${p.value?.toLocaleString() || 0}<br/>`;
          });
          return result;
        }
      },
      legend: { data: ['收益金额'], bottom: 0 },
      grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
      xAxis: { type: 'category', data: trend.map(t => t.date), boundaryGap: false },
      yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `¥${(v / 1000).toFixed(0)}k` } },
      series: [
        { 
          name: '收益金额', 
          type: 'line', 
          data: trend.map(t => t.amount), 
          smooth: true, 
          areaStyle: { opacity: 0.3 },
          itemStyle: { color: '#52c41a' },
        },
      ],
    });

    const handleResize = () => trendChartInstance.current?.resize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [trend, isFunderUser]);

  // 初始化饼图
  useEffect(() => {
    if (!compositionChartRef.current || composition.length === 0 || !isFunderUser) return;
    
    if (!compositionChartInstance.current) {
      compositionChartInstance.current = echarts.init(compositionChartRef.current);
    }
    
    compositionChartInstance.current.setOption({
      tooltip: { 
        trigger: 'item', 
        formatter: (params: any) => `${params.name}: ¥${params.value?.toLocaleString() || 0} (${params.percent}%)`
      },
      legend: { bottom: 0 },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['50%', '45%'],
        label: { show: false },
        emphasis: {
          label: { show: true, fontSize: 14, fontWeight: 'bold' }
        },
        data: composition.map(c => ({ 
          name: c.sourceName || SOURCE_TYPE_MAP[c.sourceType] || c.sourceType, 
          value: c.amount 
        })),
      }],
      color: ['#1890ff', '#52c41a'],
    });

    const handleResize = () => compositionChartInstance.current?.resize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [composition, isFunderUser]);

  // 销毁图表
  useEffect(() => {
    return () => {
      trendChartInstance.current?.dispose();
      compositionChartInstance.current?.dispose();
    };
  }, []);

  const handleExport = () => {
    const url = getFunderRevenueExportUrl({ ...dateRange, ...filters });
    // 需要带上 token
    const authToken = localStorage.getItem('auth_token');
    if (authToken) {
      const urlWithToken = url + (url.includes('?') ? '&' : '?') + `token=${encodeURIComponent(authToken)}`;
      window.open(urlWithToken, '_blank');
    } else {
      window.open(url, '_blank');
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
      width: 120,
      render: (type: string) => SOURCE_TYPE_MAP[type] || type,
    },
    { title: '合同编号', dataIndex: 'contractNumber', key: 'contractNumber', width: 150 },
    { title: '融资方', dataIndex: 'financierName', key: 'financierName', width: 120 },
    { 
      title: '金额', 
      dataIndex: 'amount', 
      key: 'amount',
      width: 120,
      align: 'right' as const,
      render: (amount: number) => (
        <span style={{ color: '#52c41a', fontWeight: 500 }}>
          +¥{amount?.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) || '0.00'}
        </span>
      ),
    },
    { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
  ];

  return (
    <Spin spinning={loading}>
      <div style={{ padding: 24 }}>
        {/* 标题和时间选择器 */}
        <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
          <Col>
            <h2 style={{ margin: 0 }}>我的收益</h2>
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
                  if (dates) setTimeRange('custom');
                }}
              />
            </Space>
          </Col>
        </Row>

        {/* 统计卡片 - 只保留3个：累计收益、本期新增、预估收益 */}
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={8}>
            <Card>
              <Statistic
                title="累计收益"
                value={stats?.totalRevenue || 0}
                precision={2}
                prefix="¥"
                valueStyle={{ color: '#52c41a', fontSize: 28 }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title="本期新增"
                value={stats?.periodRevenue || 0}
                precision={2}
                prefix="¥"
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title="预估收益(未来30天)"
                value={stats?.estimatedRevenue || 0}
                precision={2}
                prefix="¥"
                valueStyle={{ color: '#722ed1' }}
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
          {trend.length > 0 ? (
            <div ref={trendChartRef} style={{ height: 300 }} />
          ) : (
            <Empty description="暂无趋势数据" style={{ height: 300, paddingTop: 100 }} />
          )}
        </Card>

        {/* 构成和排行 */}
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={12}>
            <Card title="收益来源构成">
              {composition.length > 0 ? (
                <div ref={compositionChartRef} style={{ height: 250 }} />
              ) : (
                <Empty description="暂无数据" style={{ height: 250, paddingTop: 80 }} />
              )}
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
                        color: index < 2 ? '#fff' : '#666',
                        marginRight: 8,
                        fontSize: 12,
                      }}>
                        {index + 1}
                      </span>
                      {item.name}
                    </span>
                    <span style={{ color: '#52c41a', fontWeight: 500 }}>
                      ¥{item.amount?.toLocaleString() || 0}
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
              导出 CSV
            </Button>
          }
        >
          {/* 筛选器 - 移除状态筛选 */}
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
          </Space>

          <Table
            columns={columns}
            dataSource={records}
            rowKey="id"
            loading={tableLoading}
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
    </Spin>
  );
};

export default FunderRevenue;
