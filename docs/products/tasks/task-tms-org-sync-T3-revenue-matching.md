# T3 · 收益匹配逻辑改造 + 历史回填脚本

## 任务上下文

经过 T1（数据库结构）和 T2（爬虫改造），系统已经具备：

- 一张 TMS 网点字典表 `tms_org_nodes`（约 1500 条 yaoqianshu 网点）
- 新爬下来的运单带有 `tms_source` 和 `tms_branch_node_id`
- 改名时 `routes.name` 会自动跟着改

但**收益计算** (`calculateWaybillPlatformRevenue`) 还是按 `routes.name == waybills.branch` 匹配。要换成「`routes.tms_node_id == waybills.tms_branch_node_id` 优先 + name fallback」。

同时，**历史运单**还没有 `tms_branch_node_id`，需要一个一次性回填脚本。

## 前置依赖

⚠️ **T1 和 T2 必须都已合并到 main**。请确认：

- 本地数据库已有 `tms_org_nodes` 表，且其中已经有 yaoqianshu 数据（至少 1000 条）
- `waybills` 表里有 `tms_branch_node_id` 字段，且最近爬下来的运单这个字段已填值
- `routes` 表里至少有几条 `tms_node_id` 已绑（运维已手工绑过一些，或 T4 完成后自动）

如果 T2 还没合并，**不要开始 T3**。

## 范围

### 在范围内

1. 改写 `calculateWaybillPlatformRevenue()`（`backend/src/revenue-scheduler.ts`）的匹配核心：
   - 主匹配：`waybills.tms_branch_node_id ↔ routes.tms_node_id` (同 tms_source)
   - Fallback：`waybills.branch == routes.name`（保留兼容）
   - 每次 fallback 命中要记日志
2. 同样改 `recalculateHistoricalWaybillCommissions()` 的匹配逻辑（同样规则）
3. 改 `repairWaybillCommissionIntegrity()`：在「补 commission_contract_id/route_id」时也支持按 tms_node_id 匹配
4. 写一个一次性回填脚本 `backend/src/migrations/backfill-waybills-tms-node.ts`：
   - 把现存 `waybills.tms_branch_node_id IS NULL` 的运单，按 `waybills.branch == tms_org_nodes.short_name` 反查回填 `tms_branch_node_id` 和 `tms_source`
   - 仅处理 `customer_id` 对应有 yaoqianshu 配置的融资方（即融满）
   - 已锁定的运单（reconciling/reconciled/settled/accounted）也回填，因为只是补 ID，不动金额
5. 把 backfill 脚本注册到 `backend/src/index.ts` 启动链（一次性 migration，执行后自动跳过）

### 不在范围内

- ❌ **不要改 yaoqianshu 模板**（T2 已完成）
- ❌ **不要改前端**（T4 处理）
- ❌ **不要改 routes / contract_routes 表结构**
- ❌ **不要碰锁定收益的金额**（漂移问题已确认保留现状）
- ❌ **不要触碰生产数据库 / 不要部署**

## 协作约定

- 工作分支：`feature/tms-org-sync/T3-revenue-matching`（从 `main` 拉）
- 完成后 PR，不自动合并

---

## 一、匹配逻辑改造详细规格

### 1.1 calculateWaybillPlatformRevenue 改造

文件：`backend/src/revenue-scheduler.ts`，函数 `calculateWaybillPlatformRevenue()`，约 403-598 行

**当前实现核心**（学习背景，不是要照搬）：

```typescript
// 1. 拉所有 active 合同 + 线路
const [contractRows] = await pool.query(`
  SELECT cc.id as contract_id, cc.commission_config, cc.financier_id, cc.customer_name,
         r.id as route_id, r.name as route_name
  FROM commission_contracts cc
  JOIN contract_routes cr ON cc.id = cr.contract_id
  JOIN routes r ON cr.route_id = r.id
  WHERE cc.status = 'active' AND r.status = 'active'
`);

// 2. 构建 route_name -> 配置
const routeConfigMap = new Map<string, ...>();
for (const row of contractRows) {
  routeConfigMap.set(row.route_name, { ... });
}

// 3. 查未计算收益的运单
const [waybills] = await pool.query(`SELECT w.* FROM waybills w ... WHERE rr.id IS NULL`);

// 4. 逐条按 branch 匹配
for (const w of waybills) {
  const routeConfig = w.branch ? routeConfigMap.get(w.branch) : undefined;
  if (!routeConfig) { skippedNoRoute++; continue; }
  // ... 算金额
}
```

**改造后**：

```typescript
// 1. 拉合同 + 线路时多带 routes.tms_source 和 routes.tms_node_id
const [contractRows] = await pool.query(`
  SELECT cc.id as contract_id, cc.commission_config, cc.financier_id, cc.customer_name,
         r.id as route_id, r.name as route_name,
         r.tms_source as route_tms_source, r.tms_node_id as route_tms_node_id
  FROM commission_contracts cc
  JOIN contract_routes cr ON cc.id = cr.contract_id
  JOIN routes r ON cr.route_id = r.id
  WHERE cc.status = 'active' AND r.status = 'active'
`);

// 2. 构建两份索引：tms_node_id 索引 + name 索引
type RouteCfg = { contractId, routeId, commissionConfig, financierId, financierName };
const routeByTmsKey = new Map<string, RouteCfg>();   // key = `${tms_source}::${tms_node_id}`
const routeByName   = new Map<string, RouteCfg>();   // key = route_name（兼容）

for (const row of contractRows) {
  // 解析 commission_config（同原逻辑）
  // ...
  const cfg: RouteCfg = { /* ... */ };
  if (row.route_tms_source && row.route_tms_node_id) {
    routeByTmsKey.set(`${row.route_tms_source}::${row.route_tms_node_id}`, cfg);
  }
  routeByName.set(row.route_name, cfg);
}

// 3. 查未计算收益的运单（同原逻辑）
// ...

// 4. 改匹配优先级
let fallbackHits = 0;
for (const w of waybills) {
  // 4.1 主匹配：按 tms_node_id
  let routeConfig: RouteCfg | undefined;
  if (w.tms_source && w.tms_branch_node_id) {
    routeConfig = routeByTmsKey.get(`${w.tms_source}::${w.tms_branch_node_id}`);
  }
  // 4.2 Fallback：按 name
  if (!routeConfig && w.branch) {
    routeConfig = routeByName.get(w.branch);
    if (routeConfig) {
      fallbackHits++;
      console.log(
        `[WaybillRevenue] Fallback 命中: waybill=${w.waybill_number} ` +
        `branch="${w.branch}" tms=${w.tms_source || 'null'}::${w.tms_branch_node_id || 'null'} ` +
        `→ route_id=${routeConfig.routeId}`
      );
    }
  }
  if (!routeConfig) { skippedNoRoute++; continue; }
  // ... 余下金额计算逻辑保持不变
}

// 收尾日志多一行
console.log(
  `[WaybillRevenue] 运单 ${waybills.length} 条: 生成收益 ${records.length} 条, ` +
  `无匹配线路 ${skippedNoRoute}, 基数为0 ${skippedNoBase}, Fallback 命中 ${fallbackHits}`
);
```

**关键约束**：

1. 主匹配走 `tms_source::tms_node_id` 复合 key，**不要**只用 `tms_node_id`（理论上不同 TMS 可能撞 id）
2. Fallback 一定要打日志，方便上线后跟踪。日志格式上面已经规定
3. 同一条运单**不要**主匹配和 fallback 都执行——主匹配命中就用主匹配，不再回退
4. 旧的 `routeConfigMap` 变量名要不要保留？建议改成 `routeByName` 更明确。函数里其他引用同步改

### 1.2 recalculateHistoricalWaybillCommissions 改造

文件同上，函数约 605-707 行

这个函数是 SQL-only 的（`UPDATE` + `INSERT ... SELECT`），不是 JS 循环。改造方式：

**更新已有收益记录**：

```sql
-- 当前实现（节选）
UPDATE revenue_records rr
JOIN waybills w ON rr.waybill_id = w.id
JOIN financiers f ON w.customer_id = f.id
SET
  rr.principal_amount = CASE
    WHEN f.enterprise_name = '融满' THEN COALESCE(w.payable_total, 0)
    ELSE COALESCE(w.receivable_total, 0)
  END,
  rr.amount = ...,
  -- ...
WHERE rr.source_type = 'waybill_commission'
  AND f.enterprise_name IN ('融满', '金罗')
  AND rr.status NOT IN ('reconciling', 'reconciled', 'settled', 'accounted')
```

改造**不需要**改 UPDATE 这部分。UPDATE 是按 waybill_id 锁定记录，不依赖 name 匹配。

**新增收益记录**（INSERT ... SELECT）这部分要改。当前查的是：

```sql
INSERT INTO revenue_records (...)
SELECT ... FROM waybills w
JOIN financiers f ON w.customer_id = f.id
LEFT JOIN revenue_records rr ON rr.waybill_id = w.id AND rr.source_type = 'waybill_commission'
LEFT JOIN revenue_records rr_cn ON rr_cn.contract_number = w.waybill_number AND rr_cn.source_type = 'waybill_commission'
WHERE w.deleted_at IS NULL
  AND f.deleted_at IS NULL
  AND f.enterprise_name IN ('融满', '金罗')
  AND rr.id IS NULL
  AND rr_cn.id IS NULL
  AND (f.enterprise_name <> '融满' OR COALESCE(w.payable_total, 0) > 0)
```

注意：这里**没有按线路过滤**。也就是说，回算函数把「所有 customer_id=融满/金罗 且暂无收益记录的运单」都补出收益。但收益里的 `contract_id` 直接写 `w.customer_id`（融资方 id），不挂线路。

**改造**：保持原 INSERT 不变（因为它不靠线路匹配），只在「补 commission_contract_id 和 route_id」步骤（也就是 `repairWaybillCommissionIntegrity`，见 1.3）里加 tms_node_id 优先匹配。

### 1.3 repairWaybillCommissionIntegrity 改造

文件同上，函数约 33-69 行

**当前实现核心**：

```typescript
async function repairWaybillCommissionIntegrity(): Promise<{ relinked: number; deduped: number }> {
  const [relinkResult] = await pool.query<ResultSetHeader>(`
    UPDATE revenue_records rr
    LEFT JOIN waybills w_current
      ON rr.waybill_id = w_current.id
     AND w_current.deleted_at IS NULL
    JOIN waybills w_target
      ON rr.contract_number = w_target.waybill_number
     AND w_target.deleted_at IS NULL
    LEFT JOIN financiers f_target ON w_target.customer_id = f_target.id
    SET rr.waybill_id = w_target.id,
        rr.contract_id = COALESCE(w_target.customer_id, rr.contract_id),
        rr.financier_id = COALESCE(w_target.customer_id, rr.financier_id),
        rr.financier_name = COALESCE(f_target.enterprise_name, rr.financier_name)
    WHERE ...
  `);
```

这个函数只做了「按运单号回链 waybill_id」，**没有**回填 `commission_contract_id` 和 `route_id`。

之前的对话里我们手动补过一次，但函数本身没固化。

**T3 要做的**：在 `repairWaybillCommissionIntegrity` 末尾新增一个 step，用以下规则补 `commission_contract_id` 和 `route_id`：

```sql
-- 主匹配：按 tms_node_id 复合 key
UPDATE revenue_records rr
JOIN waybills w ON rr.waybill_id = w.id
JOIN routes r 
  ON r.tms_source = w.tms_source 
 AND r.tms_node_id = w.tms_branch_node_id
 AND r.status = 'active'
JOIN contract_routes cr ON cr.route_id = r.id
JOIN commission_contracts cc ON cc.id = cr.contract_id AND cc.status = 'active'
SET rr.commission_contract_id = cr.contract_id,
    rr.route_id = r.id,
    rr.contract_id = cr.contract_id
WHERE rr.source_type = 'waybill_commission'
  AND w.deleted_at IS NULL
  AND w.tms_source IS NOT NULL
  AND w.tms_branch_node_id IS NOT NULL
  AND (rr.commission_contract_id IS NULL OR rr.route_id IS NULL
       OR rr.commission_contract_id <> cr.contract_id
       OR rr.route_id <> r.id);
```

注意：**没有** `rr.status NOT IN (reconciling/reconciled/...)` 这个限制。因为这次只是补关联指针，不动金额/状态。锁定收益也可以补关联，让历史台账归属正确。

```sql
-- Fallback：按 name 匹配
UPDATE revenue_records rr
JOIN waybills w ON rr.waybill_id = w.id
JOIN routes r ON r.name = w.branch AND r.status = 'active'
JOIN contract_routes cr ON cr.route_id = r.id
JOIN commission_contracts cc ON cc.id = cr.contract_id AND cc.status = 'active'
SET rr.commission_contract_id = cr.contract_id,
    rr.route_id = r.id,
    rr.contract_id = cr.contract_id
WHERE rr.source_type = 'waybill_commission'
  AND w.deleted_at IS NULL
  AND rr.commission_contract_id IS NULL
  AND rr.route_id IS NULL;  -- 注意：只补没主匹配上的
```

返回值：把 relinked / deduped / repairedLinks 都返回，函数签名扩展：

```typescript
async function repairWaybillCommissionIntegrity(): Promise<{
  relinked: number;
  deduped: number;
  primaryLinks: number;
  fallbackLinks: number;
}>
```

调用方（`calculateWaybillPlatformRevenue` 和 `recalculateHistoricalWaybillCommissions`）原有 console.log 顺便改成包含 primaryLinks / fallbackLinks 计数。

---

## 二、历史运单回填脚本

### 2.1 文件位置

`backend/src/migrations/backfill-waybills-tms-node.ts`

### 2.2 函数签名

```typescript
export async function backfillWaybillsTmsNode(): Promise<void>
```

### 2.3 行为

1. 检查 `tms_org_nodes` 表里是否有 yaoqianshu 数据。如果一条都没有，跳过（说明 T2 还没跑过）：

```sql
SELECT COUNT(*) FROM tms_org_nodes WHERE tms_source = 'yaoqianshu'
```

2. 找出 yaoqianshu 对应的 financier_id（融满）：

```sql
SELECT financier_id FROM financier_external_systems
WHERE crawler_type = 'yaoqianshu' AND deleted_at IS NULL
```

如果有多条记录（理论上不该有，但兼容），取第一条。如果一条都没有，跳过。

3. 批量回填：

```sql
UPDATE waybills w
JOIN tms_org_nodes o
  ON o.tms_source = 'yaoqianshu'
 AND o.short_name = w.branch  -- 按权威短名匹配
SET w.tms_source = 'yaoqianshu',
    w.tms_branch_node_id = o.node_id,
    w.updated_at = NOW()
WHERE w.deleted_at IS NULL
  AND w.customer_id = ?  -- 融满
  AND w.tms_branch_node_id IS NULL
  AND w.branch IS NOT NULL
  AND w.branch <> ''
```

4. 日志输出：

```
[Migration] 运单 TMS 网点回填 开始...
[Migration] yaoqianshu 网点字典: 1454 条
[Migration] 融资方: 融满 (id=aca8c381-...)
[Migration] 回填运单数: 8721
[Migration] 仍未匹配的 branch 名: 23 个，前 10 个: [...]
[Migration] 运单 TMS 网点回填 完成
```

5. **幂等**：再次执行时，因为 `tms_branch_node_id IS NULL` 已经被填了，UPDATE 受影响行数为 0。第二次跑直接打印「无需回填」。

6. **不要**误回填给其他融资方的运单。WHERE 子句**必须**带 customer_id 过滤。

### 2.4 注册到 index.ts

加到启动链：

```typescript
import { backfillWaybillsTmsNode } from "./migrations/backfill-waybills-tms-node.js";

// ...
  .then(() => runTmsOrgNodesMigration())
  .then(() => backfillWaybillsTmsNode())  // ← 新增
  .then(() => { /* schedulers ... */ })
```

### 2.5 关于多次执行的考虑

这个脚本会在每次后端启动时跑。第一次跑时回填几千条，后续因为 `tms_branch_node_id` 已填，受影响行数为 0，性能开销可以忽略。

但**为了更稳妥**，建议加一个跳过条件：如果 「`customer_id=融满` 且 `tms_branch_node_id IS NULL`」的运单数为 0，整个 UPDATE 都跳过：

```typescript
const [unfilledCount] = await pool.query<RowDataPacket[]>(
  `SELECT COUNT(*) as cnt FROM waybills 
   WHERE deleted_at IS NULL AND customer_id = ? AND tms_branch_node_id IS NULL`,
  [financierId]
);
if (unfilledCount[0].cnt === 0) {
  console.log("[Migration] 无需回填，跳过");
  return;
}
```

---

## 三、验收标准

### 3.1 代码层

```bash
npm run build:backend
npm --workspace backend run lint
```

`exit code 0`。

### 3.2 单元级测试：匹配逻辑（关键）

在本地数据库准备至少以下测试场景：

**场景 A：主匹配命中**
- 1 条运单：`tms_source='yaoqianshu'`, `tms_branch_node_id='199033'`, `branch='镖宇快邦郑州湖北A'`
- 1 条路线：`tms_source='yaoqianshu'`, `tms_node_id='199033'`, `name='镖宇快邦郑州湖北A'` 绑定到一个 active 合同
- 期望：`calculateWaybillPlatformRevenue` 处理后生成 1 条收益，主匹配命中，无 fallback 日志

**场景 B：fallback 命中**
- 1 条运单：`tms_source=NULL`, `tms_branch_node_id=NULL`, `branch='镖宇快邦郑州湖北A'`（模拟老数据）
- 同样的路线
- 期望：生成 1 条收益，**打印 fallback 日志**

**场景 C：主匹配优先于 fallback**
- 1 条运单：`tms_source='yaoqianshu'`, `tms_branch_node_id='199033'`, `branch='错误的名字'`
- 路线 A：`tms_node_id='199033'`, `name='镖宇快邦郑州湖北A'`（绑定合同 X）
- 路线 B：`tms_node_id=NULL`, `name='错误的名字'`（绑定合同 Y）
- 期望：用合同 X 生成收益，**不**用合同 Y

**场景 D：都不匹配**
- 1 条运单：`tms_branch_node_id='999999'`（字典里没这个 id），`branch='没绑路线的名字'`
- 期望：`skippedNoRoute++`，无收益生成

**怎么准备数据**：

写一个 dry-run 脚本，在 `backend/scripts/test-revenue-matching.ts`（不需要 commit 到生产代码，PR 时贴出来用过的脚本就行）：

```typescript
import { pool } from "../src/db.js";
import { calculateWaybillPlatformRevenue } from "../src/revenue-scheduler.js";

// 1. 清空测试用的数据（或者用独立的 customer_id）
// 2. INSERT 测试场景的运单 / 线路 / 合同
// 3. 调 calculateWaybillPlatformRevenue()
// 4. 查询 revenue_records，验证结果
// 5. 清理测试数据
```

PR 里贴 4 个场景的输出。

### 3.3 回填脚本验收

在本地数据库执行：

```bash
npm run dev:backend
```

观察日志包含：

```
[Migration] 运单 TMS 网点回填 开始...
[Migration] yaoqianshu 网点字典: 1454 条
[Migration] 融资方: 融满 (id=...)
[Migration] 回填运单数: <一个非负数>
[Migration] 运单 TMS 网点回填 完成
```

然后查询数据库：

```sql
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN tms_branch_node_id IS NOT NULL THEN 1 ELSE 0 END) as has_node_id,
  SUM(CASE WHEN tms_branch_node_id IS NULL THEN 1 ELSE 0 END) as no_node_id
FROM waybills
WHERE deleted_at IS NULL
  AND customer_id = '<融满 id>'
  AND created_at >= '2026-04-01';  -- 看 4 月以后的运单
```

期望：

- `has_node_id` 占比 > 80%（绝大部分有 branch 的运单都能在字典里找到对应 node）
- 剩下 `no_node_id` 多半是早期那些 branch 字段是手填的「非 TMS 标准名」运单（如「南京融满项目部E」之类），无法自动回填，留待运维人工处理

### 3.4 幂等性

Ctrl+C 重启服务，期望日志：

```
[Migration] 运单 TMS 网点回填 开始...
[Migration] 无需回填，跳过
```

### 3.5 整体回归

最后跑一次完整的：

```typescript
// 在 backend/scripts 里写：
await recalculateHistoricalWaybillCommissions();
```

期望：

- 不报错
- 日志输出 `更新 X 条, 新增 Y 条`
- `repairWaybillCommissionIntegrity` 的输出多一行 `primaryLinks=A fallbackLinks=B`
- `primaryLinks` 应该 >> `fallbackLinks`（说明绝大部分都走主匹配了）

把日志贴 PR。

---

## 四、风险与边界

### 4.1 数据保护

- ⛔ **绝不要 `DELETE`**：本任务所有操作都是 SELECT 和 UPDATE
- ⛔ **不要修改运单金额字段**
- ⛔ **不要清空 `routes.name`**：name 仍然是 fallback 路径，必须保留

### 4.2 关于 fallback 日志的位置

`calculateWaybillPlatformRevenue` 是高频调用（每次爬虫触发都会跑，每天可能几十次）。每条 fallback 命中都打日志，可能让 PM2 日志膨胀。

**控制策略**：

- fallback 命中数 ≤ 10 时：每条都打详情日志
- fallback 命中数 > 10 时：只打前 5 条详情，最后汇总 `[WaybillRevenue] 共 X 条 fallback 命中（仅展示前 5 条）`

### 4.3 锁定状态收益

- `repairWaybillCommissionIntegrity` 里补 `commission_contract_id / route_id` 是**所有状态**都可以补，不动金额。
- `calculateWaybillPlatformRevenue` 是新增记录，**已有收益（锁定或未锁定）都不会被它新建第二条**（因为有 `WHERE rr.id IS NULL` 过滤）。
- `recalculateHistoricalWaybillCommissions` 的 UPDATE 部分有 `status NOT IN (...)` 过滤，**只更新未锁定**。保留这个保护。

### 4.4 不在 yaoqianshu 范围内的运单

如果未来有其他爬虫（如 56qqt-临沂、人工导入），它们的 `tms_source` 可能是别的值（或 NULL）。我们的匹配函数应该兼容：

- `tms_source` 不是 'yaoqianshu' 也能走主匹配（只要 routes 里有同 `tms_source::tms_node_id`）
- `tms_source` 是 NULL 时直接走 fallback

代码上不要 hardcode `'yaoqianshu'`（除了 backfill 脚本之外）。

### 4.5 性能考虑

- `repairWaybillCommissionIntegrity` 的 UPDATE 是 4 张表 JOIN，run 一次大约几秒到几十秒（取决于 revenue_records 量）
- 调用方是 `calculateWaybillPlatformRevenue`，会在每次爬虫后跑。这个开销可以接受。
- 如果实测 repair 函数 > 1 分钟，考虑加 `LIMIT` 或拆分。但不要在 T3 提前优化。

---

## 五、参考资料

### 5.1 现有代码入口

- `backend/src/revenue-scheduler.ts` 关键函数：
  - 33-69：`repairWaybillCommissionIntegrity` → **改**
  - 403-598：`calculateWaybillPlatformRevenue` → **改**
  - 605-707：`recalculateHistoricalWaybillCommissions` → **不必改主逻辑，仅复用 repair**

### 5.2 数据库现状

`routes` 字段（T1 后）：
```
id, name, local_partner_id, remark, status, created_at, updated_at,
tms_source, tms_node_id
```

`waybills` 字段（T1 后，部分）：
```
id, waybill_number, customer_id, branch, ...,
tms_source, tms_branch_node_id
```

`tms_org_nodes` 字段（T1 后）：
```
id, tms_source, node_id, node_name, short_name, company_code, account_code,
parent_node_id, node_type, property, state, province, city,
raw, name_history, first_seen_at, last_seen_at, created_at, updated_at
```

### 5.3 业务约定

- 当前生产里只有「融满」（yaoqianshu）走这套 TMS 同步
- 「金罗」（zo-cloud-orders）走另一个爬虫，本任务**不**改它
- 锁定状态：`reconciling, reconciled, settled, accounted`

---

## 六、完成报告要求

PR 描述里包含：

1. **改了哪些文件**
2. **§3 的全部验收输出**（场景 A/B/C/D 各一段日志 + 回填脚本输出 + 整体回归）
3. **fallback 命中数统计**：在你本地数据上跑一次完整流程，统计 fallback 命中的运单占比。理想情况 < 5%
4. **方案偏离说明**

---

## 七、问题反馈

遇到以下情况，**停下来 PR 里写明，不要自行决策**：

- 测试场景 A/B/C 的运单和路线数据准备过程有歧义
- `repairWaybillCommissionIntegrity` 实测耗时过长
- fallback 日志策略需要调整
- T1/T2 的产物不符合预期（如 `tms_node_id` 字段不在表里）

不要为了「通过验收」而硬编码或绕过实际业务规则。
