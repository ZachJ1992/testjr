# 爬虫配置前端页面开发任务

## 任务概述

在融资方详情页面中增加"数据源配置"功能，支持配置和管理运单数据爬虫。

## 背景

融资方可能使用不同的TMS系统，需要为每个融资方独立配置数据抓取参数。

---

## 一、页面设计

### 1.1 入口位置

在融资方详情页面增加一个Tab或抽屉：**"数据源配置"**

### 1.2 页面结构

```
融资方详情页
├── 基本信息 Tab
├── 合同列表 Tab
└── 数据源配置 Tab (新增)
    ├── 配置列表
    │   ├── 配置卡片1
    │   │   ├── 名称、状态
    │   │   ├── 最后同步时间、同步数量
    │   │   └── 操作：编辑、同步、日志、删除
    │   └── 配置卡片2 ...
    └── 新建配置按钮
```

### 1.3 配置表单

**新建/编辑配置弹窗**：

| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| 配置名称 | Input | 是 | 如 "zo-cloud 金罗运力" |
| 系统地址 | Input | 是 | 如 https://tms25.zo-cloud.cn |
| API路径 | Input | 是 | 默认 /api/Table/Search/batchList |
| Cookie | TextArea | 是 | 从浏览器复制 |
| Company ID | Input | 否 | TMS系统的公司ID |
| User ID | Input | 否 | TMS系统的用户ID |
| Group ID | Input | 否 | TMS系统的组ID |
| 同步间隔 | Select | 是 | 30分钟/1小时/2小时/6小时/12小时/每日 |
| 启用同步 | Switch | 是 | 是否启用自动同步 |

**表单底部按钮**：
- 测试连接
- 取消
- 保存

---

## 二、UI交互设计

### 2.1 配置列表卡片

```
┌─────────────────────────────────────────────────────────┐
│ 🔗 zo-cloud 金罗运力                         [启用] ● │
├─────────────────────────────────────────────────────────┤
│ 系统地址: https://tms25.zo-cloud.cn                     │
│ 同步间隔: 每小时                                        │
│ 最后同步: 2026-01-15 14:30  |  新增: 23 条             │
├─────────────────────────────────────────────────────────┤
│ [编辑]  [立即同步]  [查看日志]  [删除]                  │
└─────────────────────────────────────────────────────────┘
```

### 2.2 同步状态显示

- 🟢 同步成功 (success)
- 🟡 同步中 (running)
- 🔴 同步失败 (failed)
- ⚪ 未同步 (never)

### 2.3 同步日志抽屉

```
┌─────────────────────────────────────────────────────────┐
│ 同步日志 - zo-cloud 金罗运力                      [✕]  │
├─────────────────────────────────────────────────────────┤
│ 时间              状态    获取   新增   跳过   错误    │
│ 2026-01-15 14:30  成功    150    23     127    0      │
│ 2026-01-15 13:30  成功    120    0      120    0      │
│ 2026-01-15 12:30  失败    0      0      0      0      │
│   └─ 错误: Cookie已过期                               │
│ ...                                                    │
└─────────────────────────────────────────────────────────┘
```

---

## 三、API调用

### 3.1 获取配置列表

```typescript
// GET /api/crawlers?financierId={financierId}
const configs = await fetchCrawlerConfigs(financierId);
```

### 3.2 创建配置

```typescript
// POST /api/crawlers
await createCrawlerConfig({
  financierId,
  name: "配置名称",
  systemUrl: "https://tms25.zo-cloud.cn",
  apiEndpoint: "/api/Table/Search/batchList",
  cookies: "PHPSESSID=...",
  companyId: "223670",
  userId: "1263962",
  groupId: "100020",
  syncIntervalMinutes: 60,
  syncEnabled: true
});
```

### 3.3 测试连接

```typescript
// POST /api/crawlers/:id/test
const result = await testCrawlerConnection(configId);
// 或新配置测试
// POST /api/crawlers/test
const result = await testCrawlerConfig({
  systemUrl: "...",
  apiEndpoint: "...",
  cookies: "..."
});
```

### 3.4 手动同步

```typescript
// POST /api/crawlers/:id/sync
const result = await triggerCrawlerSync(configId);
// result: { success: true, newCount: 23, ... }
```

### 3.5 获取同步日志

```typescript
// GET /api/crawlers/:id/logs
const logs = await fetchCrawlerLogs(configId);
```

---

## 四、文件位置

```
frontend/src/
├── api.ts                        # 添加爬虫相关API函数
├── types.ts                      # 添加爬虫相关类型定义
└── pages/
    ├── Financiers.tsx            # 融资方列表（可选：添加同步状态图标）
    └── FinancierDetail.tsx       # 融资方详情（已有或新建）
        └── DataSourceConfig.tsx  # 数据源配置组件（新建）
```

---

## 五、类型定义

```typescript
// types.ts

export interface CrawlerConfig {
  id: string;
  financierId: string;
  name: string;
  systemUrl: string;
  apiEndpoint: string;
  cookies: string;
  companyId?: string;
  userId?: string;
  groupId?: string;
  syncEnabled: boolean;
  syncIntervalMinutes: number;
  lastSyncTime?: string;
  lastSyncCount?: number;
  lastSyncStatus?: 'success' | 'failed' | 'running';
  lastSyncError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrawlerSyncLog {
  id: string;
  configId: string;
  startTime: string;
  endTime?: string;
  status: 'running' | 'success' | 'failed';
  totalFetched: number;
  newCount: number;
  skippedCount: number;
  errorCount: number;
  errorMessage?: string;
  createdAt: string;
}

export interface CrawlerTestResult {
  success: boolean;
  message: string;
  sampleCount?: number;
  sampleData?: any;
}

export interface CrawlerSyncResult {
  success: boolean;
  totalFetched: number;
  newCount: number;
  skippedCount: number;
  errorCount: number;
  errors: string[];
}

// 同步间隔选项
export const SYNC_INTERVAL_OPTIONS = [
  { value: 30, label: "每30分钟" },
  { value: 60, label: "每小时" },
  { value: 120, label: "每2小时" },
  { value: 360, label: "每6小时" },
  { value: 720, label: "每12小时" },
  { value: 1440, label: "每日" },
];
```

---

## 六、API函数

```typescript
// api.ts

// 获取爬虫配置列表
export async function fetchCrawlerConfigs(financierId: string): Promise<CrawlerConfig[]> {
  const res = await fetch(`/api/crawlers?financierId=${financierId}`, {
    headers: { Authorization: `Bearer ${getToken()}` }
  });
  return res.json();
}

// 创建爬虫配置
export async function createCrawlerConfig(config: Omit<CrawlerConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<CrawlerConfig> {
  const res = await fetch('/api/crawlers', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}` 
    },
    body: JSON.stringify(config)
  });
  return res.json();
}

// 更新爬虫配置
export async function updateCrawlerConfig(id: string, config: Partial<CrawlerConfig>): Promise<CrawlerConfig> {
  const res = await fetch(`/api/crawlers/${id}`, {
    method: 'PUT',
    headers: { 
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}` 
    },
    body: JSON.stringify(config)
  });
  return res.json();
}

// 删除爬虫配置
export async function deleteCrawlerConfig(id: string): Promise<void> {
  await fetch(`/api/crawlers/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${getToken()}` }
  });
}

// 测试连接
export async function testCrawlerConnection(config: Partial<CrawlerConfig>): Promise<CrawlerTestResult> {
  const res = await fetch('/api/crawlers/test', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}` 
    },
    body: JSON.stringify(config)
  });
  return res.json();
}

// 手动触发同步
export async function triggerCrawlerSync(configId: string): Promise<CrawlerSyncResult> {
  const res = await fetch(`/api/crawlers/${configId}/sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` }
  });
  return res.json();
}

// 获取同步日志
export async function fetchCrawlerLogs(configId: string): Promise<CrawlerSyncLog[]> {
  const res = await fetch(`/api/crawlers/${configId}/logs`, {
    headers: { Authorization: `Bearer ${getToken()}` }
  });
  return res.json();
}
```

---

## 七、验收标准

1. **配置管理**
   - [ ] 可以查看融资方的爬虫配置列表
   - [ ] 可以新建爬虫配置
   - [ ] 可以编辑爬虫配置
   - [ ] 可以删除爬虫配置
   - [ ] 可以启用/禁用配置

2. **连接测试**
   - [ ] 测试按钮可用
   - [ ] 显示测试结果（成功/失败+原因）
   - [ ] 成功时显示样例数据数量

3. **手动同步**
   - [ ] 可以触发手动同步
   - [ ] 显示同步进度/结果
   - [ ] 同步完成后刷新状态

4. **日志查看**
   - [ ] 可以查看历史同步日志
   - [ ] 显示每次同步的详细统计

5. **状态展示**
   - [ ] 显示最后同步时间
   - [ ] 显示同步状态（成功/失败）
   - [ ] 失败时显示错误原因

---

## 八、UI组件建议

使用 Ant Design 组件：
- `Card`: 配置卡片
- `Modal`: 新建/编辑配置弹窗
- `Form`: 配置表单
- `Drawer`: 同步日志抽屉
- `Table`: 日志列表
- `Tag`: 状态标签
- `Button`: 操作按钮
- `Switch`: 启用/禁用开关
- `Select`: 同步间隔选择
- `message`: 操作提示
