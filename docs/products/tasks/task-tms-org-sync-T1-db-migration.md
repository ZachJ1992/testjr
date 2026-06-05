# T1 · 数据库 Migration：TMS 网点稳定 ID 关联体系

## 任务上下文

我们当前用「线路名称」(`routes.name`) 作为业务网点与 TMS（摇钱树系统）网点的匹配键。但 TMS 里网点名字会被人改，一旦改名，新进运单的 `branch` 字段对不上 `routes.name`，收益就匹配不到。

我们要换成「以 TMS 网点的稳定 ID 为主键」的关联体系。摇钱树系统里每个网点（公司/专线/三方/分拨中心 …）都有一个稳定 `id`（PK，永不变），即使改名也不变。

本任务是整套改造的 **第一步**：只做数据库结构改动，不动业务逻辑。后续 T2/T3/T4 会基于这次的表结构展开。

## 范围

### 在范围内

1. 新建 `tms_org_nodes` 表（TMS 网点字典）
2. 给 `routes` 表加两列：`tms_source`、`tms_node_id`
3. 给 `waybills` 表加两列：`tms_source`、`tms_branch_node_id`
4. 编写一个新的 migration 文件 `backend/src/migrations/tms-org-nodes.ts`
5. 把这个 migration 注册到 `backend/src/index.ts` 的启动链上

### 不在范围内

- ❌ **不要写任何业务逻辑**（爬虫改造、匹配逻辑、回填脚本等都在 T2/T3 里做）
- ❌ **不要修改前端代码**
- ❌ **不要触碰生产数据库**
- ❌ **不要执行 `deploy.sh` 或任何上线动作**
- ❌ **不要清理旧的 `name` 字段或老数据**（兼容性必须保留）

## 协作约定

- 工作分支：`feature/tms-org-sync/T1-db-migration`（从 `main` 拉取）
- 完成后开 PR 回 `main`，不要自己合并
- 完成后**不要触发部署**，由人工 review 合并后统一上线
- 不要 push 到云效（origin/codeup）的 main 分支，只推 PR 分支

---

## 一、数据库改动详细规格

### 1.1 新建 `tms_org_nodes` 表

存储从摇钱树系统拉取的全量网点字典。一个网点对应一行。

```sql
CREATE TABLE IF NOT EXISTS tms_org_nodes (
  id              VARCHAR(36) PRIMARY KEY,
  tms_source      VARCHAR(50) NOT NULL COMMENT 'TMS 来源标识，如 yaoqianshu',
  node_id         VARCHAR(50) NOT NULL COMMENT 'TMS 内部稳定 ID（来自 orgList.id）',
  node_name       VARCHAR(255) NOT NULL COMMENT '当前完整名称（company_name）',
  short_name      VARCHAR(255) NULL COMMENT '当前简称（short_name）',
  company_code    VARCHAR(50) NULL COMMENT 'TMS 中可见的核算代码',
  account_code    VARCHAR(50) NULL COMMENT '账户代码',
  parent_node_id  VARCHAR(50) NULL COMMENT '上级网点 node_id（来自 sup_id）',
  node_type       VARCHAR(20) NULL COMMENT 'TMS 节点类型 type：2=职能机构 3=网点 4=货站 5=分拨中心 6=冻结网点 7=车队 8=仓库 9=专线 10=三方',
  property        VARCHAR(20) NULL COMMENT '属性 property：1=自营 2=加盟',
  state           VARCHAR(20) NULL COMMENT '状态 state：0=删除 1=未激活 2=启用 3=停用',
  province        VARCHAR(100) NULL,
  city            VARCHAR(100) NULL,
  raw             JSON NULL COMMENT '原始字段保留，便于后续扩展',
  name_history    JSON NULL COMMENT '历史曾用名 [{name, changed_at}]',
  first_seen_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_tms_source_node_id (tms_source, node_id),
  KEY idx_node_name (node_name),
  KEY idx_short_name (short_name),
  KEY idx_parent (tms_source, parent_node_id),
  KEY idx_state (tms_source, state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='TMS 网点（组织架构）字典，关联键 tms_source+node_id';
```

字段说明：

- `id`：本系统内部主键（UUID）
- `tms_source` + `node_id`：业务联合主键（外部唯一标识）。T1 阶段只会出现 `'yaoqianshu'` 一个值，但字段语义保留扩展性。
- `parent_node_id`：父级节点 node_id（不是本表 `id`），后续要用来重建组织树
- `state`：TMS 自己的状态字段，我们不删除「消失」的节点，只把 `state` 改为 0/3。删除安全。
- `name_history`：JSON 数组，每次改名时由后续 T2 爬虫追加 `{name, changed_at}`。本任务**不需要**写入逻辑，只建字段。
- `raw`：保留原始 JSON 字段。便于以后业务字段扩展时不需要再次 migration。
- collation 用 `utf8mb4_0900_ai_ci`：与现有 `routes / contract_routes` 一致（参考 `commission-v2-tables.ts`）

### 1.2 `routes` 表加两列

```sql
ALTER TABLE routes
  ADD COLUMN tms_source  VARCHAR(50) NULL COMMENT 'TMS 来源；为空表示该线路非自动同步',
  ADD COLUMN tms_node_id VARCHAR(50) NULL COMMENT '关联 tms_org_nodes.node_id',
  ADD INDEX idx_routes_tms (tms_source, tms_node_id);
```

说明：

- 加这两个字段后，老线路（人工建的、没绑 TMS 网点的）依然能用。匹配时主走 `tms_node_id`，回退到 `name`。
- 字段先设可空。后续是否升级为「合同线路必须绑定 TMS 网点」由业务决定，不在本任务范围。

### 1.3 `waybills` 表加两列

```sql
ALTER TABLE waybills
  ADD COLUMN tms_source         VARCHAR(50) NULL COMMENT '运单来源 TMS',
  ADD COLUMN tms_branch_node_id VARCHAR(50) NULL COMMENT '该运单业务归属网点 node_id（如摇钱树的 bsc_company_id）',
  ADD INDEX idx_waybills_tms_branch (tms_source, tms_branch_node_id);
```

说明：

- T2 改造后，新爬下来的运单会把摇钱树的 `bsc_company_id` 写到 `tms_branch_node_id`
- 旧运单仍然只有 `branch` 字段，T3 历史回填会处理

### 1.4 Migration 文件

文件位置：`backend/src/migrations/tms-org-nodes.ts`

要求：

- 导出函数 `export async function runTmsOrgNodesMigration(): Promise<void>`
- 内部分多个 step，每个 step 用 try/catch，**幂等**：重复执行不应报错
- 用 `INFORMATION_SCHEMA` 查表/列是否已存在，已存在就跳过（参考 `backend/src/migrations/waybills-extend-columns.ts` 的 `columnExists` 实现）
- 用 `console.log("[Migration] ...")` 输出每步进展（参考 `backend/src/migrations/revenue-contract-link.ts` 风格）

参考骨架（请按这个风格写，不是直接复制粘贴）：

```typescript
import { pool } from "../db.js";

async function tableExists(table: string): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return (rows as any[]).length > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return (rows as any[]).length > 0;
}

async function indexExists(table: string, indexName: string): Promise<boolean> {
  const [rows] = await pool.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName]
  );
  return (rows as any[]).length > 0;
}

export async function runTmsOrgNodesMigration(): Promise<void> {
  console.log("[Migration] TMS 网点字典迁移 开始...");

  // Step 1: 创建 tms_org_nodes 表
  if (!(await tableExists("tms_org_nodes"))) {
    await pool.query(/* CREATE TABLE ... */);
    console.log("[Migration] 创建表 tms_org_nodes");
  } else {
    console.log("[Migration] 表 tms_org_nodes 已存在，跳过");
  }

  // Step 2: routes 加列
  if (!(await columnExists("routes", "tms_source"))) {
    await pool.query(`ALTER TABLE routes ADD COLUMN tms_source VARCHAR(50) NULL`);
    console.log("[Migration] routes 新增 tms_source");
  }
  if (!(await columnExists("routes", "tms_node_id"))) {
    await pool.query(`ALTER TABLE routes ADD COLUMN tms_node_id VARCHAR(50) NULL`);
    console.log("[Migration] routes 新增 tms_node_id");
  }
  if (!(await indexExists("routes", "idx_routes_tms"))) {
    await pool.query(`ALTER TABLE routes ADD INDEX idx_routes_tms (tms_source, tms_node_id)`);
    console.log("[Migration] routes 新增索引 idx_routes_tms");
  }

  // Step 3: waybills 加列
  // ... 同上
  
  console.log("[Migration] TMS 网点字典迁移 完成");
}
```

### 1.5 注册到启动链

在 `backend/src/index.ts` 里追加：

1. import：

```typescript
import { runTmsOrgNodesMigration } from "./migrations/tms-org-nodes.js";
```

2. 加到 `.then()` 链里。**位置建议**：放在 `runMultiTenantPermissionMigration()` 之后、`cleanupOldTempDirectories()` 之前。

参考当前文件第 76-90 行的链式调用：

```typescript
initData()
  .then(() => runMultiTenantMigration())
  // ... 其他 migrations ...
  .then(() => runMultiTenantPermissionMigration())
  .then(() => runTmsOrgNodesMigration())  // ← 新增
  .then(() => { /* cleanup + scheduler */ })
```

---

## 二、验收标准

请在 PR 描述里贴出以下命令的执行结果：

### 2.1 代码层验收

```bash
# 编译通过
npm run build:backend

# 类型检查通过
npm --workspace backend run lint
```

期望：两条命令均 `exit code 0`，无错误。

### 2.2 本地数据库验收

请在你的**本地 / 测试**数据库执行 migration，并贴出结果。

启动服务（会自动跑 migration）：

```bash
npm run dev:backend
```

观察日志包含：

```
[Migration] TMS 网点字典迁移 开始...
[Migration] 创建表 tms_org_nodes
[Migration] routes 新增 tms_source
[Migration] routes 新增 tms_node_id
[Migration] routes 新增索引 idx_routes_tms
[Migration] waybills 新增 tms_source
[Migration] waybills 新增 tms_branch_node_id
[Migration] waybills 新增索引 idx_waybills_tms_branch
[Migration] TMS 网点字典迁移 完成
```

### 2.3 幂等性验收

**Ctrl+C 杀掉服务，再启动一次**，观察日志应包含：

```
[Migration] 表 tms_org_nodes 已存在，跳过
```

每个「已存在」分支都应该被命中，不能再有 ALTER 或 CREATE 报错。

### 2.4 表结构验收

连接本地数据库执行以下 SQL，把结果贴到 PR：

```sql
SHOW CREATE TABLE tms_org_nodes\G
SHOW COLUMNS FROM routes LIKE 'tms_%';
SHOW COLUMNS FROM waybills LIKE 'tms_%';
SHOW INDEX FROM routes WHERE Key_name = 'idx_routes_tms';
SHOW INDEX FROM waybills WHERE Key_name = 'idx_waybills_tms_branch';
```

期望：

- `tms_org_nodes` 表存在、字段、索引齐全
- `routes` 多两个列 `tms_source`、`tms_node_id`
- `waybills` 多两个列 `tms_source`、`tms_branch_node_id`
- 两张表都新增了对应索引

---

## 三、风险与边界

### 3.1 数据库环境

- **MySQL 版本**：项目使用 MySQL 8.0+（看到 `commission-v2-tables.ts` 使用 `utf8mb4_0900_ai_ci`）
- **本地数据库 .env**：参考 `backend/.env`（如果没有，按 `README.deploy.md` 的环境变量配置），用本机 docker MySQL 或本地实例。**不要连生产 RDS**（`rm-2ze1goenjfq338302.mysql.rds.aliyuncs.com`）。

### 3.2 性能

- `tms_org_nodes` 上线后预计 1500 条左右（基于现网 yaoqianshu 数据），无性能压力
- `routes` 加索引前后表大小很小（线上目前不到 200 条线路）
- `waybills` 是大表（线上数万行），`ADD INDEX` 可能耗时。如果你本地数据多，可以观察执行时间，但不必担心生产 —— 上线时会单独评估。

### 3.3 字段长度

- `node_id` / `tms_node_id` / `parent_node_id` 用 `VARCHAR(50)`。摇钱树实际 ID 是 6 位数字（如 `199033`），50 已经远超。
- `node_name` / `short_name` 用 `VARCHAR(255)`。从样本数据看摇钱树名字最长不超过 50 个汉字。

### 3.4 不要尝试做的事

- ❌ 不要给 `routes.tms_node_id` 建外键约束（指向 `tms_org_nodes`），因为 routes 已有线路要兼容
- ❌ 不要在 migration 里读取或写入业务数据，本任务只动 DDL
- ❌ 不要给 `routes.tms_node_id` 建 UNIQUE 约束 —— 业务上一个 TMS 网点理论上可能对应多条线路（虽然现在 1:1）

---

## 四、参考资料

### 4.1 现有 migration 文件（学习风格）

- `backend/src/migrations/waybills-extend-columns.ts`：批量加列的写法
- `backend/src/migrations/revenue-contract-link.ts`：分 step + console.log 风格
- `backend/src/migrations/commission-v2-tables.ts`：复杂表 + collation + 索引

### 4.2 现有表结构（你要操作的目标）

`routes` 当前列：
```
id              VARCHAR(36)  PK
name            VARCHAR(200) NOT NULL
local_partner_id VARCHAR(36) NOT NULL
remark          TEXT
status          ENUM('active','disabled') DEFAULT 'active'
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

`contract_routes` 当前列（本任务不动）：
```
id          VARCHAR(36) PK
contract_id VARCHAR(36) NOT NULL
route_id    VARCHAR(36) NOT NULL
created_at  TIMESTAMP
```

`waybills` 当前列（节选，本任务只关心要新增的）：
```
id              VARCHAR(36) PK
branch          VARCHAR(100)
sub_financier   VARCHAR(200)
customer_id     VARCHAR(36)
... 还有 70+ 列，详见 backend/src/migrations/waybills-extend-columns.ts ...
```

### 4.3 摇钱树系统的真实数据样例

为了让你理解字段含义，给一段从摇钱树拉到的 `orgList` 接口响应里的一条记录：

```json
{
  "id": "199033",
  "group_id": "73666",
  "company_name": "镖宇快邦郑州湖北A",
  "short_name": "镖宇快邦郑州湖北A",
  "company_code": "8071",
  "account_code": "8071",
  "type": "9",          // 9 = 专线
  "property": "1",      // 1 = 自营
  "sup_id": "199032",   // 上级网点 id
  "state": "2",         // 2 = 启用
  "province": "河南省",
  "city": "郑州市",
  ...
}
```

写入 `tms_org_nodes` 时，字段映射（仅供你写 migration 时理解，不在 T1 实现）：
- `node_id`        ← `id`
- `node_name`      ← `company_name`
- `short_name`     ← `short_name`
- `company_code`   ← `company_code`
- `account_code`   ← `account_code`
- `parent_node_id` ← `sup_id`
- `node_type`      ← `type`
- `property`       ← `property`
- `state`          ← `state`
- `province`       ← `province`
- `city`           ← `city`
- `raw`            ← 整条 JSON

---

## 五、完成报告要求

PR 描述里包含：

1. **改了哪些文件**（一定包含新建的 `backend/src/migrations/tms-org-nodes.ts` 和被修改的 `backend/src/index.ts`）
2. **验收命令执行结果**（2.1 / 2.2 / 2.3 / 2.4 全部贴）
3. **遇到的问题和决策**（如果有任何对方案的偏离，必须明确说明）
4. **本地数据库 schema 截图或导出**（导出 `SHOW CREATE TABLE tms_org_nodes` 的输出贴上）

---

## 六、问题反馈

如果遇到以下情况，**停下来在 PR 里写明问题，不要自行决策**：

- 字段定义跟现有表有冲突
- MySQL 版本不支持 JSON 类型或某个语法
- 启动链上的 migration 顺序应该不一样
- 项目 lint / build 失败但不是你改动导致的

我会在 review 时回应。不要为了「让 CI 过」而把无关代码改动塞进去。
