# T4 · 前端线路 ↔ TMS 网点关联：合同维护改造

## 任务上下文

之前合同维护页面（`frontend/src/pages/NewContracts.tsx`）创建线路时，用户手填「线路名称」（如「镖宇快邦郑州湖北A」）。问题是：当 TMS 系统（摇钱树）里改了网点名字，前端维护的 `routes.name` 不会同步更新，导致新进运单匹配不到线路、收益生成失败。

T1/T2/T3 已完成后端基建：

- 系统里有了一张 TMS 网点字典 `tms_org_nodes`（约 1500 条 yaoqianshu 网点，含稳定 ID `node_id`）
- `routes` 表新增 `tms_source` 和 `tms_node_id` 两个字段
- 爬虫每次会刷新字典并把改名自动同步到 `routes.name`
- 收益匹配改成「按 `tms_node_id` 主匹配 + 按 `name` 兜底」

本任务 T4 的目标是：**让前端创建/编辑线路时，从 TMS 网点字典里选，而不是手填名字**。同时**保留**手填模式（用于非 TMS 来源的线路，如人工维护的子分包方）。

## 前置依赖

⚠️ **T1 必须先合并**：要保证 `routes.tms_source` 和 `tms_node_id` 字段已存在
⚠️ **T2 推荐先合并**：保证 `tms_org_nodes` 表里有数据，前端联调时下拉能拉到真实选项

如果 T2 还没合并，可以用以下方式 mock：

```sql
-- 在本地数据库手动插入几条样本数据
INSERT INTO tms_org_nodes (id, tms_source, node_id, node_name, short_name, node_type, state)
VALUES
  (UUID(), 'yaoqianshu', '199033', '镖宇快邦郑州湖北A', '镖宇快邦郑州湖北A', '9', '2'),
  (UUID(), 'yaoqianshu', '199814', '丰合顺广州A', '丰合顺广州A', '9', '2'),
  (UUID(), 'yaoqianshu', '199271', '南京项目部E', '南京项目部E', '10', '2'),
  (UUID(), 'yaoqianshu', '198446', '有有达泉州江西A', '有有达泉州江西A', '9', '2'),
  (UUID(), 'yaoqianshu', '198921', '鑫佳顺杰天津内蒙A', '鑫佳顺杰天津内蒙A', '9', '2');
```

## 范围

### 在范围内

1. **后端**：新增 `GET /api/tms-org-nodes` 接口，支持按 `tms_source` 过滤、关键字搜索、状态过滤
2. **后端**：扩展 `POST /api/routes` 和 `PUT /api/routes/:id`，支持接收 `tmsSource` + `tmsNodeId`
3. **前端 API 封装**：在 `frontend/src/api.ts` 增加 `fetchTmsOrgNodes()` + 扩展 `createRouteApi` / `updateRouteApi` 参数
4. **前端 UI**：在 `frontend/src/pages/NewContracts.tsx` 的「新建线路」/「管理线路」弹窗里，把「线路名称」字段改成下拉选 TMS 网点 + 「手动输入」开关
5. **前端展示**：在线路列表里展示 TMS 网点关联状态（小标签：「✓ 已绑定 TMS」/「手填」）

### 不在范围内

- ❌ **不要改爬虫**（T2 已完成）
- ❌ **不要改收益匹配逻辑**（T3 已完成）
- ❌ **不要做线路批量绑定 / 历史 routes 批量回填 TMS 网点**（运维手工逐条绑，本任务只提供 UI 入口）
- ❌ **不要触碰生产数据库 / 不要部署**

## 协作约定

- 工作分支：`feature/tms-org-sync/T4-frontend-route-picker`（从 `main` 拉）
- 完成后 PR，不自动合并
- 后端改动小（一个 GET 接口 + 两个 PUT/POST 的字段扩展），但要跟前端联调，所以同分支提交

---

## 一、后端：新增 TMS 网点列表接口

### 1.1 接口定义

**Endpoint**: `GET /api/tms-org-nodes`

**Query Parameters**:

| 参数 | 必填 | 说明 |
|---|---|---|
| `tmsSource` | 否 | 过滤 TMS 来源，如 `yaoqianshu` |
| `state` | 否 | 过滤状态，默认 `2`（启用）；传 `all` 表示不过滤 |
| `nodeType` | 否 | 过滤类型；如 `9,3,10` 表示专线/网点/三方（逗号分隔） |
| `keyword` | 否 | 关键字搜索（匹配 `node_name`、`short_name`、`company_code`） |
| `pageSize` | 否 | 默认 200，最大 500 |

**Response**:

```json
{
  "items": [
    {
      "id": "uuid",
      "tmsSource": "yaoqianshu",
      "nodeId": "199033",
      "nodeName": "镖宇快邦郑州湖北A",
      "shortName": "镖宇快邦郑州湖北A",
      "companyCode": "8071",
      "accountCode": "8071",
      "nodeType": "9",
      "nodeTypeLabel": "专线",
      "property": "1",
      "propertyLabel": "自营",
      "state": "2",
      "stateLabel": "启用",
      "parentNodeId": "199032",
      "province": "河南省",
      "city": "郑州市"
    }
  ],
  "total": 1454
}
```

`nodeTypeLabel` / `propertyLabel` / `stateLabel` 在后端映射好，省得前端各处自己映射。映射表：

```typescript
const NODE_TYPE_LABELS: Record<string, string> = {
  '1': '总部', '2': '职能机构', '3': '网点', '4': '货站',
  '5': '分拨中心', '6': '冻结网点', '7': '车队', '8': '仓库',
  '9': '专线', '10': '三方',
};
const PROPERTY_LABELS: Record<string, string> = { '1': '自营', '2': '加盟' };
const STATE_LABELS: Record<string, string> = { '0': '删除', '1': '未激活', '2': '启用', '3': '停用' };
```

### 1.2 实现位置

- 路由注册：`backend/src/routes.ts`（参考 `/api/routes` 的注册位置，放在它附近）
- Store 方法：新建文件 `backend/src/tms-org-nodes-store.ts`，导出 `getTmsOrgNodes(params)` 函数
- 权限：和 `/routes` 一样，需要 `manage_contracts` 权限

### 1.3 关键字搜索 SQL

```sql
SELECT * FROM tms_org_nodes
WHERE (? IS NULL OR tms_source = ?)
  AND (? IS NULL OR state = ?)
  AND (
    ? IS NULL OR
    node_name LIKE ? OR
    short_name LIKE ? OR
    company_code LIKE ?
  )
  AND (? IS NULL OR FIND_IN_SET(node_type, ?))
ORDER BY 
  CASE state WHEN '2' THEN 0 ELSE 1 END,
  CASE node_type WHEN '9' THEN 0 WHEN '3' THEN 1 WHEN '10' THEN 2 ELSE 3 END,
  short_name
LIMIT ?
```

注意：

- `LIKE` 用 `'%' + keyword + '%'`（前后都模糊）
- ORDER BY 是为了让运维优先看到「启用 + 专线」类的网点
- LIMIT 用 pageSize（前端用 antd 的 Select with virtual scroll，500 条足够）

### 1.4 性能

`tms_org_nodes` 1500 条，全表扫描也不慢（几十毫秒）。不需要分页。但要做关键字过滤，避免拉全量。

---

## 二、后端：扩展 routes API

### 2.1 POST /api/routes

文件 `backend/src/routes.ts`，约 4357 行

**当前实现**：

```typescript
router.post("/routes", authenticate, requirePermissions("manage_contracts"), async (req, res) => {
  const { name, localPartnerId, remark } = req.body ?? {};
  if (!name || !localPartnerId) {
    sendError(res, req, 400, "名称和落地合作方为必填");
    return;
  }
  const item = await commissionV2Store.createRoute({ name, localPartnerId, remark });
  res.status(201).json({ route: item });
});
```

**改造**：接收两个新字段 `tmsSource` 和 `tmsNodeId`：

```typescript
router.post("/routes", ..., async (req, res) => {
  const { name, localPartnerId, remark, tmsSource, tmsNodeId } = req.body ?? {};
  if (!name || !localPartnerId) {
    sendError(res, req, 400, "名称和落地合作方为必填");
    return;
  }
  // 校验：如果给了 tmsNodeId 必须同时给 tmsSource
  if ((tmsNodeId && !tmsSource) || (tmsSource && !tmsNodeId)) {
    sendError(res, req, 400, "tmsSource 和 tmsNodeId 必须同时提供");
    return;
  }
  // 校验：tmsNodeId 在字典里要存在
  if (tmsNodeId) {
    const exists = await commissionV2Store.checkTmsNodeExists(tmsSource, tmsNodeId);
    if (!exists) {
      sendError(res, req, 400, `TMS 网点不存在: ${tmsSource}/${tmsNodeId}`);
      return;
    }
  }
  const item = await commissionV2Store.createRoute({ name, localPartnerId, remark, tmsSource, tmsNodeId });
  res.status(201).json({ route: item });
});
```

`commissionV2Store.createRoute` 函数（`backend/src/commission-v2-store.ts` 约 294 行）也要扩展：

```typescript
export async function createRoute(input: {
  name: string;
  localPartnerId: string;
  remark?: string;
  tmsSource?: string;
  tmsNodeId?: string;
}): Promise<Route> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO routes (id, name, local_partner_id, remark, tms_source, tms_node_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, input.name, input.localPartnerId, input.remark || null, input.tmsSource || null, input.tmsNodeId || null]
  );
  return (await getRouteById(id))!;
}
```

也补 `checkTmsNodeExists`：

```typescript
export async function checkTmsNodeExists(tmsSource: string, tmsNodeId: string): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 FROM tms_org_nodes WHERE tms_source = ? AND node_id = ? LIMIT 1`,
    [tmsSource, tmsNodeId]
  );
  return rows.length > 0;
}
```

### 2.2 PUT /api/routes/:id

同理扩展：支持 `tmsSource` + `tmsNodeId` 字段。允许传 `null` 解绑。

`updateRoute` 函数（约 307 行）：

```typescript
if (input.tmsSource !== undefined) {
  sets.push("tms_source = ?");
  vals.push(input.tmsSource || null);
}
if (input.tmsNodeId !== undefined) {
  sets.push("tms_node_id = ?");
  vals.push(input.tmsNodeId || null);
}
```

### 2.3 GET /api/routes 返回字段

`mapRouteRow`（约 231 行）扩展：

```typescript
function mapRouteRow(row: RowDataPacket): Route {
  return {
    // 现有字段
    id: row.id,
    name: row.name,
    // ...
    // 新增
    tmsSource: row.tms_source ?? undefined,
    tmsNodeId: row.tms_node_id ?? undefined,
    // 如果有关联，把网点名也带出来便于前端展示
    tmsNodeName: row.tms_node_name ?? undefined,  // 见下方 LEFT JOIN
  };
}
```

`getRoutes` 的 SQL 调整成：

```sql
SELECT r.*, lp.name AS local_partner_name, a.name AS area_name,
       o.node_name AS tms_node_name
FROM routes r
LEFT JOIN local_partners lp ON r.local_partner_id = lp.id
LEFT JOIN areas a ON lp.area_id = a.id
LEFT JOIN tms_org_nodes o
  ON o.tms_source = r.tms_source AND o.node_id = r.tms_node_id
WHERE 1=1
```

`Route` 类型（在 `backend/src/types.ts` 或同文件顶部）也要补字段，前端 `RouteItem` 类型同步补。

---

## 三、前端 API 封装

### 3.1 新增 `fetchTmsOrgNodes`

文件 `frontend/src/api.ts`

```typescript
export interface TmsOrgNode {
  id: string;
  tmsSource: string;
  nodeId: string;
  nodeName: string;
  shortName?: string;
  companyCode?: string;
  accountCode?: string;
  nodeType?: string;
  nodeTypeLabel?: string;
  property?: string;
  propertyLabel?: string;
  state?: string;
  stateLabel?: string;
  parentNodeId?: string;
  province?: string;
  city?: string;
}

export async function fetchTmsOrgNodes(
  token: string,
  params?: {
    tmsSource?: string;
    state?: string;
    nodeType?: string;  // 逗号分隔，如 "9,3,10"
    keyword?: string;
    pageSize?: number;
  }
): Promise<{ items: TmsOrgNode[]; total: number }> {
  const sp = new URLSearchParams();
  if (params?.tmsSource) sp.append("tmsSource", params.tmsSource);
  if (params?.state) sp.append("state", params.state);
  if (params?.nodeType) sp.append("nodeType", params.nodeType);
  if (params?.keyword) sp.append("keyword", params.keyword);
  if (params?.pageSize) sp.append("pageSize", String(params.pageSize));
  const q = sp.toString();
  return request(`/tms-org-nodes${q ? `?${q}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
```

### 3.2 扩展 RouteItem 和创建/更新接口参数

```typescript
export interface RouteItem {
  // 现有字段
  id: string;
  name: string;
  localPartnerId: string;
  localPartnerName?: string;
  areaName?: string;
  remark?: string;
  status: "active" | "disabled";
  createdAt: string;
  updatedAt: string;
  // 新增
  tmsSource?: string;
  tmsNodeId?: string;
  tmsNodeName?: string;  // 关联的网点当前名（如果绑了）
}

export async function createRouteApi(
  token: string,
  payload: {
    name: string;
    localPartnerId: string;
    remark?: string;
    tmsSource?: string;
    tmsNodeId?: string;
  }
): Promise<{ route: RouteItem }> { /* ... */ }

export async function updateRouteApi(
  token: string,
  id: string,
  payload: Partial<{
    name: string;
    localPartnerId: string;
    remark: string;
    status: "active" | "disabled";
    tmsSource: string | null;  // 允许 null 解绑
    tmsNodeId: string | null;
  }>
): Promise<{ route: RouteItem }> { /* ... */ }
```

---

## 四、前端 UI 改造

### 4.1 新建线路弹窗

文件 `frontend/src/pages/NewContracts.tsx`，约第 1369-1392 行（你能搜索 `title="新建线路"` 找到）

**当前实现**：

```tsx
<Modal title="新建线路" ...>
  <Form form={routeForm} layout="vertical">
    <Form.Item name="localPartnerId" label="所属落地合作方" rules={[{ required: true }]}>
      <Select options={localPartners.map(lp => ({ value: lp.id, label: lp.name }))} />
    </Form.Item>
    <Form.Item name="name" label="线路名称" rules={[{ required: true }]}>
      <Input placeholder="如：重庆-山东A线" />
    </Form.Item>
    <Form.Item name="remark" label="备注">
      <TextArea rows={2} placeholder="选填" />
    </Form.Item>
  </Form>
</Modal>
```

**改造**：增加一个「绑定 TMS 网点」开关 + 一个网点下拉。

```tsx
<Modal title="新建线路" ...>
  <Form form={routeForm} layout="vertical" initialValues={{ bindMode: 'tms' }}>
    <Form.Item name="localPartnerId" label="所属落地合作方" rules={[{ required: true }]}>
      <Select options={...} />
    </Form.Item>
    
    {/* 新增：绑定模式切换 */}
    <Form.Item name="bindMode" label="线路命名方式">
      <Radio.Group>
        <Radio value="tms">绑定 TMS 网点（推荐）</Radio>
        <Radio value="manual">手动输入</Radio>
      </Radio.Group>
    </Form.Item>
    
    {/* 新增：TMS 网点选择 - 仅在 bindMode='tms' 时显示 */}
    <Form.Item
      noStyle
      shouldUpdate={(prev, curr) => prev.bindMode !== curr.bindMode}
    >
      {({ getFieldValue }) => getFieldValue('bindMode') === 'tms' ? (
        <Form.Item
          name="tmsNode"
          label="选择 TMS 网点"
          rules={[{ required: true, message: '请选择网点' }]}
          extra="选择后，「线路名称」会自动跟随 TMS 网点的当前名称"
        >
          <TmsOrgNodeSelect
            tmsSource="yaoqianshu"
            onChange={(node) => {
              if (node) {
                routeForm.setFieldsValue({
                  name: node.shortName || node.nodeName,
                  tmsSource: node.tmsSource,
                  tmsNodeId: node.nodeId,
                });
              }
            }}
          />
        </Form.Item>
      ) : null}
    </Form.Item>
    
    {/* 「线路名称」字段：TMS 模式下只读、手动模式下可填 */}
    <Form.Item
      noStyle
      shouldUpdate={(prev, curr) => prev.bindMode !== curr.bindMode}
    >
      {({ getFieldValue }) => (
        <Form.Item
          name="name"
          label="线路名称"
          rules={[{ required: true, message: '请输入线路名称' }]}
        >
          <Input
            placeholder={getFieldValue('bindMode') === 'tms' ? '由 TMS 网点自动填充' : '如：重庆-山东A线'}
            disabled={getFieldValue('bindMode') === 'tms'}
          />
        </Form.Item>
      )}
    </Form.Item>
    
    <Form.Item name="remark" label="备注">
      <TextArea rows={2} placeholder="选填" />
    </Form.Item>
  </Form>
</Modal>
```

提交时（在 `handleCreateRoute` 函数里）：

```typescript
const handleCreateRoute = async () => {
  const values = await routeForm.validateFields();
  const payload: any = {
    name: values.name,
    localPartnerId: values.localPartnerId,
    remark: values.remark,
  };
  if (values.bindMode === 'tms' && values.tmsNodeId) {
    payload.tmsSource = values.tmsSource;
    payload.tmsNodeId = values.tmsNodeId;
  }
  // 调 createRouteApi(token, payload)
};
```

### 4.2 编辑线路：增加「绑定/解绑 TMS 网点」入口

线路列表里如果有线路已经存在但没绑 TMS 网点，给一个「绑定网点」按钮（小图标）。点击弹窗，弹窗里只有一个 TmsOrgNodeSelect，选完调 `updateRouteApi`，并提示「绑定成功后，线路名称会自动跟随 TMS 网点最新名」。

这里不要做完整的「编辑线路」对话框（线路目前没有完整的编辑入口，新加一个会引入更多改动）。**只加一个「绑定/解绑 TMS 网点」按钮**即可。

### 4.3 线路列表展示

文件同上，找展示「线路」列表的位置（可能在 `routeTreeData` 或 Table column 里），在每条线路名后面加一个小 Tag：

```tsx
{route.tmsNodeId ? (
  <Tag color="blue" style={{ fontSize: 11, marginLeft: 6 }}>
    ✓ TMS: {route.tmsNodeName || route.tmsNodeId}
  </Tag>
) : (
  <Tag color="default" style={{ fontSize: 11, marginLeft: 6 }}>手填</Tag>
)}
```

### 4.4 TmsOrgNodeSelect 组件

新建一个可复用的 antd Select 包装组件，文件路径建议：`frontend/src/components/TmsOrgNodeSelect.tsx`

```typescript
import { Select, Tag } from 'antd';
import { useEffect, useState, useMemo } from 'react';
import { fetchTmsOrgNodes, TmsOrgNode } from '../api';
import { useAuth } from '../hooks/useAuth';  // 或者其他获取 token 的方式

type Props = {
  value?: { tmsSource: string; tmsNodeId: string } | string;  // 兼容受控/非受控
  onChange?: (node: TmsOrgNode | null) => void;
  tmsSource?: string;  // 默认 yaoqianshu
  placeholder?: string;
};

export default function TmsOrgNodeSelect(props: Props) {
  const { tmsSource = 'yaoqianshu', placeholder = '搜索网点名称或代码' } = props;
  const [options, setOptions] = useState<TmsOrgNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const { token } = useAuth();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTmsOrgNodes(token, {
      tmsSource,
      state: '2',
      nodeType: '9,3,10,2,5',  // 默认显示常用类型；运维想要全部也行，自己再开
      keyword: keyword || undefined,
      pageSize: 200,
    })
      .then(res => {
        if (!cancelled) setOptions(res.items);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [token, tmsSource, keyword]);

  const valueKey = useMemo(() => {
    if (!props.value) return undefined;
    if (typeof props.value === 'string') return props.value;  // tmsNodeId 字符串
    return props.value.tmsNodeId;
  }, [props.value]);

  return (
    <Select
      showSearch
      placeholder={placeholder}
      loading={loading}
      filterOption={false}
      onSearch={setKeyword}
      value={valueKey}
      onChange={(selectedNodeId) => {
        const node = options.find(o => o.nodeId === selectedNodeId);
        props.onChange?.(node || null);
      }}
      options={options.map(o => ({
        value: o.nodeId,
        label: (
          <span>
            <span>{o.shortName || o.nodeName}</span>
            {o.nodeTypeLabel && <Tag style={{ marginLeft: 6 }} color="blue">{o.nodeTypeLabel}</Tag>}
            {o.companyCode && <span style={{ color: '#999', marginLeft: 6, fontSize: 12 }}>#{o.companyCode}</span>}
          </span>
        ),
      }))}
      style={{ width: '100%' }}
    />
  );
}
```

注意：

- `filterOption={false}` + 自己 `onSearch` 触发远程搜索（防止下拉里只能筛已加载的几百条）
- `value` 兼容两种形式：直接传 `tmsNodeId` 字符串，或传 `{ tmsSource, tmsNodeId }` 对象
- 搜索关键字传给后端，做 LIKE 匹配。前端不做本地过滤
- 加 debounce 是加分项（防止打字过快疯狂请求），用 `useDeferredValue` 或 `lodash/debounce`

---

## 五、验收标准

### 5.1 代码层

```bash
npm run build:frontend
npm run build:backend
npm --workspace backend run lint
npm --workspace frontend run lint
```

`exit code 0`。

### 5.2 后端 API 验收

启动本地服务，用 curl 测试新接口：

```bash
# 1. 列表
curl -s "http://localhost:3001/api/tms-org-nodes?tmsSource=yaoqianshu&pageSize=5" \
  -H "Authorization: Bearer <token>" | jq

# 期望：items 至少 5 条，total 接近 1454（如果 T2 已跑），字段齐全

# 2. 关键字搜索
curl -s "http://localhost:3001/api/tms-org-nodes?keyword=镖宇" \
  -H "Authorization: Bearer <token>" | jq

# 期望：返回所有名字带「镖宇」的网点

# 3. POST /routes 带 TMS 绑定
curl -X POST -s "http://localhost:3001/api/routes" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"镖宇快邦郑州湖北A","localPartnerId":"<lp-id>","tmsSource":"yaoqianshu","tmsNodeId":"199033"}' | jq

# 期望：返回的 route 对象里 tmsSource 和 tmsNodeId 都有值

# 4. POST /routes 不带 TMS 绑定（手填模式）
curl -X POST ... -d '{"name":"我的手填线路","localPartnerId":"<lp-id>"}' | jq

# 期望：成功，tmsSource 和 tmsNodeId 为 null

# 5. POST 给一个不存在的 tmsNodeId
curl -X POST ... -d '{"name":"X","localPartnerId":"<lp-id>","tmsSource":"yaoqianshu","tmsNodeId":"999999"}'

# 期望：400 错误，「TMS 网点不存在」
```

把这 5 个 curl 的输出贴 PR。

### 5.3 前端 UI 验收

跑前端：

```bash
npm run dev:frontend
```

打开浏览器，登录后进入合同维护页（路径根据项目实际）。验收点：

1. **新建线路弹窗默认是「绑定 TMS 网点」模式**
2. **TMS 网点下拉**：能搜索（输入「镖宇」能筛出对应网点）；选中后「线路名称」字段自动填充并变灰
3. **切换到「手动输入」模式**：「线路名称」变为可编辑，TMS 网点下拉消失
4. **提交后**：新线路在列表里显示 ✓ TMS 标签
5. **手填线路**：列表里显示「手填」标签

录屏或截图 4-5 张关键步骤，贴 PR。

### 5.4 集成验收（与 T2/T3 联动）

新建一条绑定 TMS 网点的线路（比如「镖宇快邦郑州湖北A」绑 node_id=199033），关联到某个 active 合同。

跑一次本地数据库的回算：

```typescript
// 在 backend/scripts 写：
await recalculateHistoricalWaybillCommissions();
```

确认：

- 既往有 `tms_branch_node_id=199033` 的运单，能匹配到这条线路（主匹配命中）
- 没有 `tms_branch_node_id` 但 `branch='镖宇快邦郑州湖北A'` 的运单，能 fallback 命中

把回算前后的运单/收益数对比贴 PR。

---

## 六、风险与边界

### 6.1 用户体验

- 「绑定 TMS 网点」对运维是个新概念，给充分的 placeholder / extra 文案说明
- 下拉数据没拉到时，要友好提示「正在加载...」或「未找到匹配网点」
- 切换 bindMode 时如果用户已经选了 TMS 网点又切到手动，不要清空 name（让用户决定）

### 6.2 老数据兼容

- 现有 `routes` 表里的线路都是 `tms_source=NULL, tms_node_id=NULL`，列表里显示「手填」标签是合理的
- 用户可以通过「绑定网点」按钮把老线路升级到「绑定 TMS」

### 6.3 不要做的事

- ❌ 不要在创建时自动批量「猜测」线路对应的 TMS 网点（按 name 自动匹配）。**这是错误源**，因为名字可能完全不一样
- ❌ 不要禁用「手动输入」选项 —— 业务上有些线路确实没有对应 TMS 网点
- ❌ 不要让用户「编辑」TMS 网点字段（如修改 nodeName），字典是只读的

### 6.4 权限

- `GET /api/tms-org-nodes` 需要 `manage_contracts` 权限（跟 routes 一致）
- 普通用户看不到这个下拉

---

## 七、参考资料

### 7.1 现有代码入口

- 后端路由：`backend/src/routes.ts` 第 4337-4402 行（routes 相关 4 个 endpoint）
- 后端 store：`backend/src/commission-v2-store.ts` 第 227-380 行（routes + contract_routes）
- 前端 API：`frontend/src/api.ts` 第 3313-3370 行（RouteItem + fetchRoutes + createRouteApi + updateRouteApi）
- 前端页面：`frontend/src/pages/NewContracts.tsx` 第 1369-1450 行附近（新建线路 / 管理线路弹窗）

### 7.2 antd 组件参考

- `Select` 带远程搜索：[antd Select Async](https://ant.design/components/select#components-select-demo-search-box)
- `Form` 条件渲染：用 `Form.Item shouldUpdate={...}` + 函数子节点

### 7.3 不要复用 sub-financier 的下拉

之前 `commission_contracts` 的 `commission_config` 里某些字段是 sub-financier 下拉（数据源是 `financiers` 表）。**那是不同概念**，不要复用那个下拉组件。

---

## 八、完成报告要求

PR 描述里包含：

1. **改了哪些文件**
2. **§5 的全部验收输出**（5.1 / 5.2 / 5.3 / 5.4 全部）
3. **关键界面截图**（4-5 张）：新建线路弹窗（两种模式）、网点下拉、线路列表标签
4. **方案偏离说明**
5. **遗留事项**（如果有运维需要手工绑定的线路，给出数量）

---

## 九、问题反馈

遇到以下情况，**停下来 PR 里写明，不要自行决策**：

- T1 还没合并（数据库字段不存在）
- 现有 `NewContracts.tsx` 结构太复杂，找不到合适的插入点
- antd 版本不支持某个 Select 特性
- 项目里没有现成的 `useAuth()` 或类似获取 token 的 hook
- 「线路名称」字段被运维用作业务编号（不仅仅是显示），改成只读会有冲突

不要为了交付而硬塞代码。设计问题先讨论，再实现。
