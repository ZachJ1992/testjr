# T2 · 摇钱树爬虫改造：组织架构同步 + 运单 node_id 入库

## 任务上下文

本系统通过爬虫从摇钱树（`rm.zo-cloud.cn`）抓取运单数据。当前匹配「合同线路 ↔ 运单」用的是 `routes.name == waybills.branch`（按名字匹配），导致 TMS 里网点改名后，新进运单永远对不上线路，收益生成失败。

T1（前置）已完成数据库结构升级，新增了：
- `tms_org_nodes` 表（TMS 网点字典）
- `routes.tms_node_id`、`waybills.tms_branch_node_id`

本任务 T2 要在「摇钱树爬虫」上做两件事：

1. 每次爬虫执行前，**同步一次组织架构**，写入 `tms_org_nodes`。检测改名时，往 `name_history` 推一条历史，并把当前 `routes.name` 同步为最新名称。
2. **运单 `mapFields` 改造**：把摇钱树返回的 `bsc_company_id`（业务归属网点 ID）写入 `waybills.tms_branch_node_id`，`tms_source` 写 `'yaoqianshu'`，`branch` 字段用 `tms_org_nodes.short_name`（权威名）。

完成后，T3 会改收益计算逻辑用 id 匹配；T4 会改前端合同维护页用下拉选 TMS 网点。

## 前置依赖

⚠️ **T1 必须先完成并合并到 main**。请确认 main 分支上：

- 存在 `backend/src/migrations/tms-org-nodes.ts`
- `backend/src/index.ts` 已注册 `runTmsOrgNodesMigration`
- 本地数据库可见 `tms_org_nodes` 表，`routes` 和 `waybills` 有 `tms_*` 字段

如果 T1 还没合并，**不要开始 T2**。在 PR 里写明阻塞原因。

## 范围

### 在范围内

1. 在 `backend/src/crawler/templates/yaoqianshu.ts` 模板的 `login()` 步骤之后、`fetchData()` 真正抓运单之前，插入一个 **组织架构同步** 动作（调摇钱树 `orgList` 接口 + upsert `tms_org_nodes` + 检测改名 + 刷 `routes.name`）
2. 修改 `mapFields()`，写入 `tmsSource = 'yaoqianshu'` 和 `tmsBranchNodeId = item.bsc_company_id`；`branch` 优先用 `tms_org_nodes.short_name`
3. 修改 `backend/src/crawler/crawler-engine.ts` 的 `saveWaybillData()`，让 `tms_source` 和 `tms_branch_node_id` 字段一起入库（包括新增和更新两个路径）
4. 让 `WaybillData` 类型（`backend/src/crawler/crawler-templates.ts`）支持 `tmsSource` / `tmsBranchNodeId` 字段（如果还没有的话）
5. 不写新的 store 文件，把组织同步逻辑写成 yaoqianshu 模板内的纯函数（或一个独立的 `tms-org-sync.ts` 工具模块也可以）

### 不在范围内

- ❌ **不要改收益计算逻辑**（在 T3 里改）
- ❌ **不要改前端代码**（在 T4 里改）
- ❌ **不要改 56qqt 模板**（业务场景不需要）
- ❌ **不要做历史数据回填**（在 T3 里做）
- ❌ **不要触碰生产数据库**
- ❌ **不要部署上线**
- ❌ **不要修改 yaoqianshu 模板的现有抓取主流程**（fetchData 主体不动，只在前面插一个新动作）

## 协作约定

- 工作分支：`feature/tms-org-sync/T2-yaoqianshu-crawler`（从 `main` 拉）
- 完成后开 PR 回 `main`，不自动合并
- 不部署、不推送到云效/origin 的 main

---

## 一、摇钱树系统的关键接口（已确认）

### 1.1 组织架构列表（你要新接的）

**接口**：`POST https://rm.zo-cloud.cn/api/Table/Search/orgList`

**Body**（urlencoded）：

```
req={"company_id":188696,"page_num":1,"page_size":1000,"category":"Company","filter":[],"query":{"state":["2"]}}
```

字段说明：

- `company_id=188696`：顶层 group 节点 ID。**这个值在不同环境下可能不一样**，从下面的配置项读取（见 §3.2）
- `page_size=1000`：每页 1000 条
- `query.state=["2"]`：只拉启用的（state=2）
- `category=Company`：筛选类型为「公司/网点」

**响应**（关键字段）：

```jsonc
{
  "errno": 0,
  "res": {
    "data": [
      {
        "id": "199033",                       // ← node_id（稳定主键）
        "group_id": "73666",
        "company_name": "镖宇快邦郑州湖北A",   // ← node_name
        "short_name": "镖宇快邦郑州湖北A",     // ← short_name
        "company_code": "8071",               // ← 用户可见的核算代码
        "account_code": "8071",               // ← 账户代码
        "type": "9",                          // ← 类型: 9=专线, 3=网点, 10=三方 等
        "property": "1",                      // ← 1=自营, 2=加盟
        "sup_id": "199032",                   // ← 上级网点 id
        "state": "2",                         // ← 2=启用, 3=停用, 0=删除
        "province": "河南省",
        "city": "郑州市",
        // ... 还有 60 多个字段，整段 JSON 存入 raw 列
      }
      // ...
    ],
    "total": { "count": "1454" },
    "page_size": 100   // ← 注意：这里 page_size 跟请求里给的值无关，是实际页大小，需要忽略
  }
}
```

**分页策略**：

- 实测 1454 条，一页 1000 条共 2 页。
- 拉法：`page_num=1` → `page_num=2` → ... 直到返回 `data.length < page_size_requested`
- 安全上限：最多翻 20 页（防异常情况）
- 不要并发拉，避免触发限流

### 1.2 登录 + 抓批次（已有，不要动）

模板里已经实现了登录和 batchList 抓取。你**不要改这些**。

为了让你写 fetchData 之前的组织同步代码时知道认证状态，登录后 page 对象已经持有 Cookie。你可以两种方式调用 orgList：

- 方式 A（推荐）：用 `page.evaluate(() => fetch(...))`，复用浏览器内 cookie
- 方式 B：从 `page.cookies()` 拿 Cookie，用 Node.js `fetch` 直接调

**建议用方式 A**，因为现有模板的 batchList 抓取就是 `page.evaluate` 路径（请阅读 `backend/src/crawler/templates/yaoqianshu.ts` 中 `fetchData` 的实现风格再决定）。

---

## 二、详细需求

### 2.1 模板 login 后插入：组织架构同步

在模板的 `login()` 成功之后、`fetchData()` 真正抓批次之前，执行一个新的同步流程。

#### 流程

```
1. 调 orgList 接口（分页拉完所有 state=2 的网点）
2. 对每条节点 upsert tms_org_nodes（按 tms_source + node_id）
3. 若发现 node_id 已存在但 node_name 变了：
   - 把旧 node_name 推入 name_history
   - console.log("[摇钱树] 网点改名: id=X 旧:Y → 新:Z")
   - 同步刷 routes.name：UPDATE routes SET name = '新名'
     WHERE tms_source = 'yaoqianshu' AND tms_node_id = node_id
4. 若 orgList 没返回某个 id 但 tms_org_nodes 里有：
   - 不删除，只把 state 改成 3（停用）
   - console.log("[摇钱树] 网点停用: id=X name=Y")
5. 更新 last_seen_at = NOW()，新建则 first_seen_at = NOW()
```

#### 入库字段映射

| `orgList.data[i]` 字段 | `tms_org_nodes` 列 |
|---|---|
| `id` | `node_id` |
| `company_name` | `node_name` |
| `short_name` | `short_name` |
| `company_code` | `company_code` |
| `account_code` | `account_code` |
| `sup_id` | `parent_node_id` |
| `type` | `node_type` |
| `property` | `property` |
| `state` | `state` |
| `province` | `province` |
| `city` | `city` |
| 整条 JSON | `raw`（JSON.stringify） |

`tms_source` 固定写 `'yaoqianshu'`。

#### 写库实现要点

- 用 `INSERT ... ON DUPLICATE KEY UPDATE` 一条 SQL 完成 upsert。`UNIQUE KEY (tms_source, node_id)` 已经在 T1 建好。
- **不要**在循环里一条一条 query，至少分批（每批 200 条）用 `INSERT ... VALUES (...), (...), ...` 批量插入。1500 条左右用循环也可以接受，但批量更稳。
- 检测改名要在 upsert 之前先 SELECT 一次。可以这样：

```typescript
// 一次性把所有当前已存在的（id, name）取出来做对比
const [existing] = await pool.query<RowDataPacket[]>(
  `SELECT node_id, node_name, name_history FROM tms_org_nodes WHERE tms_source = ?`,
  ['yaoqianshu']
);
const existingMap = new Map(existing.map(r => [r.node_id, r]));

for (const node of nodes) {
  const old = existingMap.get(String(node.id));
  if (old && old.node_name !== node.company_name) {
    // 触发改名处理
    // 1) 追加 name_history
    const history = old.name_history ? (typeof old.name_history === 'string' ? JSON.parse(old.name_history) : old.name_history) : [];
    history.push({ name: old.node_name, changed_at: new Date().toISOString() });
    // 2) 同步刷 routes.name
    await pool.query(
      `UPDATE routes SET name = ?, updated_at = NOW()
       WHERE tms_source = ? AND tms_node_id = ?`,
      [node.company_name, 'yaoqianshu', String(node.id)]
    );
    // 3) 把更新后的 history 带进 upsert
    node._historyToWrite = history;
  }
}
```

实际写法可以更优雅，但**必须做到**：
1. 同一个 node 的 name_history 不能丢失之前的记录
2. 改名时必须同步刷 `routes.name`
3. 必须把改名事件 console.log 出来，便于 review 时查日志

#### 停用检测

```sql
-- 凡是这次拉取没出现的 id，但 tms_org_nodes 里有的，标记为停用
UPDATE tms_org_nodes
SET state = '3', updated_at = NOW()
WHERE tms_source = 'yaoqianshu'
  AND state = '2'
  AND node_id NOT IN (本次拉取的所有 id 列表)
```

注意：如果本次 orgList 调用失败（HTTP 错误、JSON 解析失败、`errno != 0`），**不要执行停用检测**——避免一次网络抖动把所有网点都标停。

#### 失败容错

如果组织同步整个失败：

- console.log 错误，不要 throw，**继续走 fetchData**（运单还是要抓的）
- 因为模板的核心职责是抓运单，组织同步是辅助。失败下次再同步。

但有一个例外：**如果是登录态失败（401 / 跳登录页）**，应该抛出 `Error('登录态失效')` 让 crawler-engine 标记同步失败，因为这种情况下 fetchData 也会失败。

### 2.2 mapFields 改造

文件：`backend/src/crawler/templates/yaoqianshu.ts`，函数 `mapFields(rawData)`（约第 2151 行）

**改动**：在返回的 `WaybillData` 对象里新增三个字段（如果 `WaybillData` 类型里没有，先去 `crawler-templates.ts` 加上声明）：

```typescript
tmsSource: 'yaoqianshu',
tmsBranchNodeId: String(item.bsc_company_id || '').trim() || undefined,
// branch: 改用 tms_org_nodes.short_name 优先；fallback 仍走原逻辑
```

**关于 `branch` 字段的新逻辑**：

由于 `mapFields` 是纯函数，无法异步查数据库。可以这样处理：

- 方案 A（最简单）：在 fetchData 阶段，把 orgList 拉到的字典（node_id → short_name）保存到模板的全局 Map，在 mapFields 里直接查
- 方案 B：mapFields 里 `branch` 仍然先用 `bsc_company_id` 拼一个临时值（或保持 `down_line_text` 前半段），在 saveWaybillData 入库前用 `tms_org_nodes.short_name` 覆盖

**推荐方案 A**：在 yaoqianshu 模板里加一个 module-level 变量：

```typescript
// orgList 同步之后填充
const orgNodeNameMap = new Map<string, string>();
```

每次组织同步成功之后清空+填充：

```typescript
orgNodeNameMap.clear();
for (const n of nodes) {
  orgNodeNameMap.set(String(n.id), n.short_name || n.company_name);
}
```

mapFields 里：

```typescript
const branchNodeId = String(item.bsc_company_id || '').trim();
const branchFromTms = branchNodeId ? orgNodeNameMap.get(branchNodeId) : undefined;
return {
  // ...
  branch: branchFromTms 
       || String(item.down_line_text || '').split('->')[0].trim() 
       || extractOutletName(item).split('->')[0].trim() 
       || '',
  tmsSource: 'yaoqianshu',
  tmsBranchNodeId: branchNodeId || undefined,
  // ...
};
```

**重要约定**：

- 如果运单上 `bsc_company_id` 缺失或不在字典里，`tmsBranchNodeId` 写 `undefined`，让 `branch` 走原 fallback
- `subFinancier` 保持不变（仍用 `down_line_text` 前半段）

### 2.3 WaybillData 类型扩展

文件：`backend/src/crawler/crawler-templates.ts`

在 `WaybillData` interface 里增加：

```typescript
export interface WaybillData {
  // ... 现有字段 ...
  tmsSource?: string;
  tmsBranchNodeId?: string;
}
```

### 2.4 saveWaybillData 入库

文件：`backend/src/crawler/crawler-engine.ts`，函数 `saveWaybillData(waybill, financierId)`

**改动**：

1. INSERT 新运单时，把 `tms_source` 和 `tms_branch_node_id` 一起写入：

```sql
INSERT INTO waybills (
  /* 现有字段 */,
  tms_source, tms_branch_node_id
) VALUES (..., ?, ?)
```

```typescript
waybill.tmsSource || null,
waybill.tmsBranchNodeId || null,
```

2. UPDATE 已存在运单时，**仅当**爬虫这次提供的 `tmsBranchNodeId` 非空，才覆盖：

```sql
UPDATE waybills SET
  /* 现有字段 */,
  tms_source = COALESCE(?, tms_source),
  tms_branch_node_id = COALESCE(?, tms_branch_node_id)
WHERE id = ?
```

这样能保证：
- 老运单第一次被新爬虫覆盖时，把 id 字段填进去
- 如果偶尔某次 `bsc_company_id` 缺失，不会把已填好的 id 清空

3. **检查现有 UPDATE 路径的「needUpdate」判断**（约在 saveWaybillData 函数里）：增加一条对比 —— 若 `tms_branch_node_id` 在数据库里跟运单当前抓到的不一致，也要标记为 needUpdate。

---

## 三、配置项

### 3.1 现有 yaoqianshu 模板的配置（不要动）

模板的 `requiredFields` 里已经有 `loginUrl` / `username` / `password` 等字段。这些保持不变。

### 3.2 新增配置项

在 `requiredFields` 里**追加**一项：

```typescript
{
  key: 'orgListGroupId',
  label: '组织架构 group 顶层 ID',
  type: 'text',
  required: false,
  placeholder: '默认 188696；用于 orgList 接口拉网点字典',
  defaultValue: '188696',
}
```

读取时：

```typescript
const orgListGroupId = String(config.orgListGroupId || '188696').trim();
```

### 3.3 同步频率控制

默认行为：**每次爬虫执行前都同步一次**。1500 条网点的同步耗时大约 1-2 秒，对整体爬虫任务影响可以忽略。

不需要做 「每天一次」 或 「N 分钟一次」 的节流。如果未来要做，从这里加。

---

## 四、验收标准

### 4.1 代码层

```bash
# 编译
npm run build:backend

# 类型检查
npm --workspace backend run lint
```

`exit code 0`。

### 4.2 单元级 dry-run（关键）

在你本地数据库准备一份 yaoqianshu 配置（参考 `financier_external_systems` 表里 `crawler_type='yaoqianshu'` 的现有记录格式），然后用以下脚本只跑「组织同步 + 单页运单抓取 + mapFields」，**不要触发收益计算、不要触发实际全量入库**。

**dry-run 脚本要点**：

1. 通过 `getCrawlerTemplate('yaoqianshu')` 拿到模板
2. 手动调 `template.login(page, config)`
3. 调一下你新加的组织同步函数
4. 验证：
   - `SELECT COUNT(*) FROM tms_org_nodes WHERE tms_source='yaoqianshu'` ≈ 1400-1500 之间
   - `SELECT * FROM tms_org_nodes ORDER BY first_seen_at DESC LIMIT 3` 字段填充完整（node_id、node_name、short_name、company_code、parent_node_id、node_type、state 都不为空）
5. 抓 5-10 条 batchList 运单（手动限制只取一页 10 条以内，可以用 maxPages=1 + 改 page_size），调 `template.mapFields(row)`，逐条 console.log：
   - `waybillNumber`
   - `branch`
   - `tmsBranchNodeId`
   - 验证 `tmsBranchNodeId` 等于运单的 `bsc_company_id`
   - 验证 `branch` 不为空、且等于 `tms_org_nodes.short_name`（id 对应那条）

把 dry-run 日志贴到 PR。

### 4.3 改名场景验收

手动模拟一个「改名」场景：

```sql
-- 在本地数据库里手动改一个网点的 name，模拟「上次爬虫记的是旧名」
UPDATE tms_org_nodes
SET node_name = '镖宇快邦郑州湖北A_OLD'
WHERE tms_source = 'yaoqianshu' AND node_id = '199033';
```

再跑一次同步流程，期望：

- 日志输出 `[摇钱树] 网点改名: id=199033 旧:镖宇快邦郑州湖北A_OLD → 新:镖宇快邦郑州湖北A`
- `SELECT name_history FROM tms_org_nodes WHERE node_id='199033'` 里有 `'镖宇快邦郑州湖北A_OLD'`
- 如果该 node_id 已有 `routes.tms_node_id='199033'` 的记录，对应 `routes.name` 也被刷成新名（你可以手动 INSERT 一条 routes 来验证这一步）

### 4.4 mapFields 入库验收

跑一次完整的爬虫（可以只抓 1 天的数据，控制规模），然后查询：

```sql
-- 应该全部有值（新抓的运单）
SELECT COUNT(*),
       SUM(CASE WHEN tms_source IS NOT NULL THEN 1 ELSE 0 END) AS has_source,
       SUM(CASE WHEN tms_branch_node_id IS NOT NULL THEN 1 ELSE 0 END) AS has_node_id
FROM waybills
WHERE deleted_at IS NULL
  AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR);

-- 检查 branch 是否等于 tms_org_nodes.short_name
SELECT w.waybill_number, w.tms_branch_node_id, w.branch, o.short_name
FROM waybills w
JOIN tms_org_nodes o ON o.tms_source = w.tms_source AND o.node_id = w.tms_branch_node_id
WHERE w.deleted_at IS NULL
  AND w.created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
LIMIT 10;
```

期望：
- `has_source` / `has_node_id` 应该等于（或接近等于）`COUNT(*)`
- `w.branch` 应该等于 `o.short_name`

### 4.5 不影响现有流程

确认旧的流程**没有被破坏**：

- 现有的 yaoqianshu 抓批次逻辑产物没变（抓到的运单数量、金额、状态等）
- 收益计算（T3 还没改）暂时仍按 `branch` 走 —— 这个会在 T3 替换

---

## 五、风险与边界

### 5.1 性能

- orgList 单页 1000 条响应大约 500KB-2MB。两页拉完总耗时 < 5 秒。
- upsert 1500 条用批量 INSERT VALUES，单次 query 在本地数据库不超过 1-2 秒。
- 加在爬虫 login 后面，对整体 5-10 分钟的爬虫任务影响 < 1%。

### 5.2 编码问题

- 网点名带中文，确保 SQL 用参数化（`?`），不要字符串拼接
- collation 已在 T1 设为 `utf8mb4_0900_ai_ci`

### 5.3 不要做的事

- ❌ 不要清理 `tms_org_nodes` 表（任何场景）
- ❌ 不要往 `routes` 表里写新行（让 T4 前端去做）
- ❌ 不要触碰 `contract_routes` 表
- ❌ 不要清空 `name_history`

### 5.4 已知限制

- `orgList` 接口 cookie 是会话级别的，跟登录后的 cookie 是同一份。不需要单独鉴权。
- 1454 条是当前线上 yaoqianshu 实际数量，未来可能涨到 5000+。维持分页逻辑可扩展。
- 如果某网点的 `bsc_company_id` 不在 `orgList` 返回里（极端情况，比如刚创建几秒），先入库 `branch=空`、`tms_branch_node_id=已知值`。后续下一轮同步会补上字典。

---

## 六、参考资料

### 6.1 摇钱树系统的真实样本数据

`doc/resp1.txt` 文件是一次 `batchList` 接口完整响应，可以参考字段结构。

`doc/组织页1.txt` + `doc/组织页2.txt` 是 `orgList` 的两页响应（合并起来 1454 条）。

如果文件不在你的工作区里，请在 PR 里写明缺失，我会补。

### 6.2 现有代码入口

- 模板：`backend/src/crawler/templates/yaoqianshu.ts`（约 2317 行）
  - `login()`：完成登录
  - `fetchData()`：约 1878 行起，抓批次的主流程，**不要动**
  - `mapFields()`：约 2151 行起，**要改**
- 引擎：`backend/src/crawler/crawler-engine.ts`（约 628 行）
  - `saveWaybillData()`：找 INSERT 和 UPDATE 两条 SQL，**要改**
- 模板类型：`backend/src/crawler/crawler-templates.ts`（约 234 行）
  - `WaybillData` interface：**要改**

### 6.3 orgList 接口的 curl 样例

下面这条 curl 是我们在浏览器里抓到的，用于参考。**直接用它的 cookie 会过期**，你要从 puppeteer 登录态里取最新 cookie。

```bash
curl 'https://rm.zo-cloud.cn/api/Table/Search/orgList?logid=119463301779073597984&gid=73666' \
  -H 'accept: application/json' \
  -H 'content-type: application/x-www-form-urlencoded' \
  -b 'PHPSESSID=a94ad42bca09b6fe772c0fe205027a34; user_id=1194633; group_id=73666; company_id=74920' \
  -H 'origin: https://rm.zo-cloud.cn' \
  -H 'referer: https://rm.zo-cloud.cn/Company/companyGroup' \
  --data-raw 'req=%7B%22company_id%22%3A%2274920%22%2C%22page_num%22%3A1%2C%22page_size%22%3A100%2C%22category%22%3A%22Company%22%7D'
```

⚠️ 这个 curl 用的 company_id 是 `74920`（次级），我们要用 `188696`（顶层），数据更全。

---

## 七、完成报告要求

PR 描述里必须包含：

1. **改了哪些文件**：清单 + 行数变化
2. **§4 验收标准的全部输出**：4.1 / 4.2 / 4.3 / 4.4 / 4.5
3. **本地 `tms_org_nodes` 表的数据样本**：贴 5 条 `SELECT * FROM tms_org_nodes LIMIT 5`
4. **运行 dry-run 时的完整 console 日志**（前 100 行就够，重点是同步阶段、改名检测、mapFields 验证）
5. **方案偏离说明**：任何对本文档的偏离都要明确写明原因
6. **遗留问题清单**：T3/T4 需要用到、但 T2 没解决的问题

---

## 八、提问机制

如果遇到以下情况，**停下来在 PR 里提问，不要自行决策**：

- T1 还没合并，但你想先开发，提问怎么 mock T1 的表结构
- orgList 接口跟文档描述的格式不一样
- 现有 yaoqianshu 模板的代码风格跟你预期不符
- 字段映射有歧义（比如 `state` 用 enum 还是 string）

我会在 PR review 时回应。**不要为了完成任务而绕过这些问题**——它们可能是设计问题，不是实现问题。
