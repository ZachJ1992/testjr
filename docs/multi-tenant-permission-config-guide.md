# 多方主体权限 · 配置指南（v1）

适用版本：`feature/multi-tenant-permission` 分支阶段 A→D 上线后的版本。

读者：平台超级管理员、平台运营、租户管理员（融资方 / 资金方的本方管理员）。

本指南聚焦"**怎么操作**"。系统设计原理与字段约定见 [`docs/multi-tenant-permission-prd.md`](./multi-tenant-permission-prd.md)。

---

## 1. 你需要先理解的 6 个概念

| 概念 | 字面 | 一句话理解 |
| --- | --- | --- |
| 主体（Tenant） | `org_units.type ∈ {platform, funder, financier}` | 真正的"租户边界"，平台 / 资金方 / 融资方各自一种主体类型 |
| 主体实体（Related Entity） | `org_units.related_entity_id` 指向 `funders.id` 或 `financiers.id` | 主体节点的"业务身份证"。**所有数据隔离查询都按这个 ID 过滤**，不是按主体节点 id |
| 角色（Role） | `roles` 表 + `role_permissions` | 岗位职责的主载体。一个角色挂一组权限码 |
| 用户组（Group） | `user_groups` 表 + `group_permissions` | 本期定位为"批量授权工具"，但**底层仍参与权限合并**。`Administrators` 组 = 平台全权 |
| 权限码（Permission Code） | 字符串，如 `manage_users` `view_platform_revenue` | 后端用这些码控制接口可见 / 操作；前端用同名码控制菜单 / 按钮 |
| 数据范围（Data Scope） | 由 `orgContext.orgType + relatedEntityId` 派生 | **不需要单独配置**，跟着用户的主体走（融资方账号自动只看本主体相关数据） |

最关键一句：**用户最终的有效权限 = 角色权限 ∪ 用户组权限；用户最终能看见的数据 = 当前主体决定**。

---

## 2. 系统目前内置了什么

### 2.1 主体类型

只有三种，本期不能扩展：

- `platform`：平台。一般只有一个根主体（默认 `Root`），代表平台运营方。
- `funder`：资金方。每个资金方实体（`funders` 表）都会有对应一个 `funder` 主体节点。
- `financier`：融资方 / 落地合作方。每个融资方实体（`financiers` 表）都会有对应一个 `financier` 主体节点。

### 2.2 内置角色

| 角色 | 权限数 | 用途 | 谁能拥有 |
| --- | --- | --- | --- |
| `admin` | 35 | 内置超级角色，**所有功能权限** | 仅平台超级管理员 |

> 本期**只有这一个内置角色**。其它岗位角色（如"融资方管理员""资金方运营"）需要平台运营自行创建（见 §5）。

### 2.3 内置用户组

| 用户组 | 权限数 | 实际效果 |
| --- | --- | --- |
| `Administrators` | 35 | **等同平台全权**，跨所有主体 |
| `融资方员工` | 6 | 运单 / 定向支付合同 / 虚拟账户 / 融资方支出查看等 |
| `资金方员工` | 6 | 资金池 / 资金方收益 / 定向支付合同审批等 |

### 2.4 主体数据隔离的"自动"行为

下表概括了不同主体的账号在各业务模块下"默认能看到的数据"。这是**写在代码里的硬规则**，不需要额外配置。

| 模块 | 平台账号 | 融资方账号（financier） | 资金方账号（funder） |
| --- | --- | --- | --- |
| 运单（waybills） | 全量 | `customer_id = 本融资方实体 ID` 的运单 | 与本资金方有 active 定向支付合同的所有融资方的运单 |
| 合同（contracts） | 全量 | `logistics_provider_id = 本融资方` 的合同 | `funder_id = 本资金方` 的合同 |
| 对账（recon-batches） | 全量 | `financier_id = 本融资方` 的批次 | 当前空集（资金方暂不参与对账） |
| 收益（revenue） | 全量 | 自身相关的 `expense` 记录 | 自身相关的 `revenue` 记录 |
| Dashboard 登录态 `/dashboard/tenant/*` | 全量 | 按主体名匹配 `partner_name` | 当前空集（store 暂不支持 funder 维度） |
| Dashboard 对外 `/dashboard/*` | 全量 | 全量 | 全量 |

> **不要手动给融资方账号配 `view_platform_revenue` 想"让他看自己那部分平台收益"——他能看到的还是自己主体那部分**，因为数据范围一层会先把 SQL 收窄掉。

---

## 3. 一个标准账号的配置流程

下面以"为融资方『融满』配置一个员工账号"为例，描述完整 5 步：

### Step 1 · 准备主体节点

平台账号登录 → `系统管理 → 组织管理`。

- 默认情况下，每创建一个 `funders` / `financiers` 实体，系统会自动创建对应的 `funder` / `financier` 主体节点（见 `migrations/create-orgs-for-existing-entities.ts`）。所以一般你不需要手工建。
- 如果发现某个融资方没有对应主体节点，可以在「组织管理」里手动新建一个，类型选 `financier`（节点 type 字段在表里，前端目前只显示 tag）。

### Step 2 · 准备角色（推荐做法）

进入 `系统管理 → 角色管理`，点「新建角色」：

| 字段 | 推荐填法 |
| --- | --- |
| 名称 | `融资方管理员` / `融资方员工` / `资金方管理员` 等 |
| 描述 | 一句话岗位描述 |
| 权限 | 在权限树里勾选；**绝对不要勾 `manage_users` 之外的全局管理类权限**（具体推荐见 §5） |

> 先建角色，再去 §3.4 给账号绑角色。这样将来同岗位的账号可以批量复用。

### Step 3 · 创建账号

回到 `系统管理 → 组织管理` → 选中"融满"主体 → 点「**新增员工**」（不是顶部的「编辑组织」）：

| 表单字段 | 填法 |
| --- | --- |
| 用户名 | 例如 `rongman_admin`，主体内唯一即可 |
| 姓名 | 显示名，例如 `融满管理员` |
| 密码 | 初始密码，建议告诉用户首次登录后自己改 |
| **角色（必看）** | 勾选 §3.2 建的"融资方管理员"角色 |
| **用户组（必看）** | **不要勾选 `Administrators`**（这等同平台全权）。如果你建了岗位角色就空着；旧账号兼容时可以勾"融资方员工" |
| 状态 | 启用 |

> ⚠️ 你之前遇到的"融满 admin 看到全部"就是这一步漏选 → 用户组留了 `Administrators`。

### Step 4 · 校验权限是否到位

让该账号自己登录，或者你用 `curl` 验证：

```bash
TOKEN=$(curl -s -X POST http://<host>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"rongman_admin","password":"<密码>"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

curl -s http://<host>/api/auth/me -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

应能看到：

```json
{
  "tenant": { "name": "融满", "type": "financier", "status": "active" },
  "tenantContext": { "isPlatform": false, "isFrozen": false, "accessibleTenantIds": ["..."] },
  "user": { "permissions": ["...你授予的码..."] }
}
```

| 该看到 | 说明 |
| --- | --- |
| `tenant.name = 融满` | 主体绑对了 |
| `isPlatform = false` | 不会被当成平台用户 |
| `permissions` 是合理的几条 | 不再是 35 条全权 |

### Step 5 · 业务模块自检

让该账号去：

| 页面 | 期望 |
| --- | --- |
| 运单数据 | 只能看到 `customer_id = 融满` 的运单 |
| 业务抽成结算 → 对账单 | 只看到融满的批次 |
| 平台收益看板 | 没权限不会出菜单；如果你授了 `view_platform_revenue`，他看到的也是融满范围（详细差异见 §2.4） |
| 系统管理 → 操作日志 | 只看到本主体相关日志 |

---

## 4. 主体管理员授权边界

> 阶段 B 已经落地了 `grant_boundaries` 表和 `GET/PUT /api/users/:id/grant-boundary`，但**目前是只读模式**：UI 还没暴露，授权动作也不强制校验"是否在边界内"。当前的边界靠"平台运营给某主体管理员只勾选有限权限码"来事实保证。

实操建议：

- **平台运营**：给某主体管理员发账号时，仅给他他能用得到的角色（例如「融资方管理员」），不要给 `manage_orgs / manage_permissions / manage_roles` 这种平台全局权限。
- **主体管理员**：可以给本主体员工分角色 / 用户组，但**当前 UI 没限制"不能选超出自己范围的角色"**。下一阶段会用 `grant_boundaries` 实际拦截。

---

## 5. 角色 / 权限码速查

完整权限码请到 `系统管理 → 权限管理`。下面给一份"按岗位推荐"的清单，**直接拷贝可用**。

### 5.1 平台超级管理员

只用一个：内置 `admin` 角色 + `Administrators` 用户组。**不要给其他人**。

### 5.2 平台运营

> 平台主体下、负责日常配主体/账号/对账的人。

```
manage_users
manage_roles
manage_groups
manage_orgs
manage_contracts
view_platform_revenue
view_operation_logs
```

不给：`manage_permissions`（动权限码本身有破坏性）、`manage_system_parameters`（动全局参数）。

### 5.3 融资方管理员

```
manage_waybills
manage_directed_pay_contracts
create_directed_payment
view_directed_pay_settlements
view_financier_expense
view_virtual_accounts
manage_users          ← 仅用于管本主体员工，配合 §4 的 grant_boundary
```

### 5.4 融资方员工（操作）

```
manage_waybills
create_directed_payment
view_directed_pay_settlements
view_financier_expense
view_virtual_accounts
```

### 5.5 资金方管理员

```
approve_directed_pay_contracts
approve_directed_payment_funder
manage_directed_pay_contracts
view_fund_pool
view_funder_revenue
view_directed_pay_settlements
manage_virtual_accounts
manage_users          ← 同上
```

### 5.6 资金方员工

```
approve_directed_payment_funder
view_fund_pool
view_funder_revenue
view_directed_pay_settlements
view_virtual_accounts
```

### 5.7 兼容老权限码（不要慌）

阶段 D 已经在后端 / 前端把以下老码自动映射到新粒度码，存量配置无需迁移：

| 老码 | 自动派生（兼容期） |
| --- | --- |
| `view_platform_revenue` | `+ view_page_platform_revenue + action_view_revenue + action_export_revenue` |
| `view_funder_revenue` | `+ view_page_funder_revenue + action_view_funder_revenue + action_export_funder_revenue` |
| `view_financier_expense` | `+ view_page_financier_expense + action_export_financier_expense` |
| `manage_contracts` | `+ view_page_contracts + view_page_recon_batches + action_edit_contract` |
| `manage_waybills` | `+ action_edit_waybill` |
| `manage_users` | `+ view_page_users + action_edit_user` |
| `manage_roles` | `+ view_page_roles + action_edit_role` |
| `manage_directed_pay` | `+ view_page_directed_pay + action_edit_directed_pay` |
| `view_operation_logs` | `+ view_page_operation_logs` |

> 这意味着前端如果将来用 `hasCapability(user, 'action_export_revenue')` 判断按钮是否显示，旧角色仍然能看到导出按钮。

---

## 6. 主体启停（冻结）操作流程

### 6.1 谁能启停？

只有拥有 `manage_orgs` 权限的账号（一般是平台运营 / 平台 admin）能启停主体。

### 6.2 操作步骤

1. `系统管理 → 组织管理`
2. 左侧树选中要操作的主体（例如某个融资方）
3. 顶部点「停用主体」
4. 二次确认弹窗会提示："停用后该主体下的用户仍可登录，但所有写操作会被后端统一拦截"
5. 启用同理，按钮文案会变成「启用主体」

### 6.3 冻结后系统的实际行为

| 操作 | 表现 |
| --- | --- |
| 该主体下的账号登录 | ✅ 允许 |
| `/auth/me` | 返回 `tenantContext.isFrozen = true` |
| GET 类查询接口 | ✅ 允许（前端可以加冻结提示条） |
| POST/PUT/PATCH/DELETE 写接口（合同、对账、定向支付、运单、用户角色变更…） | ❌ 全部返回 `403 + { error, code: 'TENANT_FROZEN' }` |
| 操作日志 | 启停动作本身会被记录到 `operation_logs`，包含敏感标记 |

### 6.4 哪些写接口被覆盖了

阶段 A→D 下的覆盖范围：

| 模块 | 是否冻结拦截 |
| --- | --- |
| 用户管理 PUT `/users/:id` | ✅ |
| 角色管理 POST/PUT/DELETE `/roles*` | ✅ |
| 主体管理 POST `/tenants/:id/disable\|enable` | ✅（disable 自身需平台账号，自然不受冻结影响） |
| 运单 POST/PUT/DELETE `/waybills*`、`/waybills/import` | ✅ |
| 合同 POST/PUT/PATCH/DELETE `/contracts*` | ✅ |
| 对账 POST `/recon-batches*`（全部状态切换） | ✅ |
| 定向支付 23 个写接口 | ✅（阶段 D 全量挂载） |
| 收益导出 GET（不属于写） | 不受冻结影响 |

> 如果你新增了模块，请在路由层挂上 `loadUserContext + ensureTenantWritable` 中间件，并参照 `backend/src/permission-policy.ts` 的注释。

---

## 7. 操作日志的查看与解读

### 7.1 谁能看

| 角色 | 可见范围 |
| --- | --- |
| 平台用户（`isPlatformUser=true`） | 全量。可以按"主体"筛选 |
| 租户管理员（在主体下且有 `view_operation_logs`/`manage_users`/`manage_roles` 任一） | 仅本主体相关日志 |
| 普通员工 | 看不到（默认无 `view_operation_logs`） |

### 7.2 当前会被记录的关键操作

| Action 码 | 中文 | 是否敏感 |
| --- | --- | --- |
| `role.create` / `role.update` / `role.delete` | 角色 CRUD | ✅ |
| `tenant.enable` / `tenant.disable` | 主体启停 | ✅ |
| `user.update` | 用户角色 / 用户组 / 启停变更 | ✅ |
| `user.reset_password` | 重置密码 | ✅ |
| `user.grant_boundary.update` | 修改授权上限 | ✅ |

### 7.3 操作日志页面提供的过滤

- 主体（仅平台用户可见）
- 操作类型（上面列表）
- 操作员姓名 / 用户名
- 是否敏感
- 日期

---

## 8. 双轨 Dashboard 对接说明

### 8.1 两条路径

| 路径 | 鉴权 | 数据范围 | 用途 |
| --- | --- | --- | --- |
| `/api/dashboard/*` | `X-API-Key`（在代码常量 `production-readonly-key`） | **平台全量**，对外契约 | 山海鲸大屏 / 第三方对外只读 |
| `/api/dashboard/tenant/*` | JWT（标准登录态） | 跟随当前用户主体 | 系统内部"按主体看的"看板 |

### 8.2 `/api/dashboard/tenant/*` 当前已上线的端点

| 端点 | financier 主体 | funder 主体 |
| --- | --- | --- |
| `/dashboard/tenant/overview` | 自动按主体名注入 `partnerName` | 暂返回零值 |
| `/dashboard/tenant/income-structure` | 自动按主体名注入 `partnerName` | 暂返回零值 |
| `/dashboard/tenant/income-trend` | 自动按主体名注入 `partnerName` | 暂返回零值 |
| `/dashboard/tenant/platform-revenue/overview` | POC，本期返回全量（待 revenue-store 扩 partnerName 入参） | 同左 |

> funder 维度需要 `dashboard-store` 增加 `funder_id` 过滤入参，留作后续增量。

### 8.3 给前端的接入指导

如果你要在融资方账号的工作台上接 dashboard 数据：
- 不要直接调 `/api/dashboard/overview`（这是给对外的，要带 `X-API-Key`）
- 调 `/api/dashboard/tenant/overview`（带 JWT，自动按主体过滤）

---

## 9. 常见错误与排错指南

### 9.1 「我建的融资方 admin 怎么看到了所有公司的数据」

90% 是这个：编辑用户时**用户组**勾了 `Administrators`。这是平台全权组，等于跨所有主体。

排错步骤：
1. `curl /api/auth/me` 看 `user.permissions` 数量。如果 30+ 条，几乎肯定是 `Administrators`。
2. 进 `系统管理 → 组织管理 → 选主体 → 选用户行 →「编辑」`，把 `Administrators` 从用户组里删掉。
3. 让用户**退出重登**，权限才会刷新。

### 9.2 「这个账号能登录但点页面就 403」

- 大概率没给到对应权限码。对照 §5 的清单加角色。

### 9.3 「主体冻结后写操作还能成功」

检查路由是否挂了 `loadUserContext + ensureTenantWritable`。  
所有阶段 A→D 已覆盖的清单见 §6.4。  
如果是新写的接口，参考 `backend/src/routes.ts` 里 `/contracts/financing` 这一组的写法。

### 9.4 「角色管理菜单点了打不开」

已修复（提交 `9ad171a`）。如果你的环境还是空白，确认 `frontend/src/App.tsx` 包含：

```tsx
<Route path="/roles" element={<RolesPage />} />
```

### 9.5 「rongman 看到了别家主体的对账批次详情」

- 阶段 C 已经在 `/recon-batches/:id` 加了主体边界检查；越权访问会返回 `404`（隐藏式拒绝，不泄露 ID 是否存在）。
- 如果你看到泄露，说明该账号挂在了平台主体下。检查 `org_units.type` 是否真的是 `financier`。

### 9.6 「子组织（如「融满华北分部」）下的账号看不到融满的运单」

这是**当前已知限制**：`resolveBusinessScope` 不会沿 `parent_id` 回溯。两个解法：

- **临时**：把员工挂到融满主体本身（不要挂到子组织）。
- **正解**：等下一个增量，扩展 `resolveBusinessScope` 让它沿 `parent_id` 一路回溯到最近的 `financier/funder` 节点。

---

## 10. 当前限制与下次增量

| 项 | 现状 | 下次增量做什么 |
| --- | --- | --- |
| 子组织（部门）继承父主体边界 | ❌ 不支持 | 扩 `resolveBusinessScope` 沿 `parent_id` 回溯到最近主体 |
| `grant_boundaries` 强校验 | 仅读，不拦截 | 在 `PUT /users/:id` 等授权接口里实际比对 |
| funder 主体的 dashboard 数据 | 暂返回零值 | `dashboard-store` 增加 `funder_id` 入参 |
| 收益模块按主体过滤 | 已用 `if (orgType === funder/financier)` 实现，未统一到 `resolveBusinessScope` | 用同一抽象重写，便于后续加细粒度 |
| 定向支付重复路由 700 行 | 已加 deprecated 注释，实际不生效 | 物理删除并做全量回归 |
| 字段级遮罩 / 部门细粒度 | 未支持 | 暂不计划 |

---

## 11. 端到端验证脚本（运维自检）

把下面脚本放到 `scripts/verify-permission.sh` 跑一遍，能验大部分场景。占位符 `<host> / <admin_pwd> / <financier_user> / <financier_pwd> / <financier_tenant_id>` 自行替换。

```bash
#!/bin/bash
set -e
BASE="http://<host>/api"
ADMIN_TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<admin_pwd>"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

echo "[1] admin /auth/me:"
curl -s $BASE/auth/me -H "Authorization: Bearer $ADMIN_TOKEN" \
  | python3 -c 'import sys,json;r=json.load(sys.stdin);print({"isPlatform":r["tenantContext"]["isPlatform"],"perms":len(r["user"]["permissions"])})'

FIN_TOKEN=$(curl -s -X POST $BASE/auth/login -H "Content-Type: application/json" \
  -d '{"username":"<financier_user>","password":"<financier_pwd>"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

echo "[2] financier /auth/me:"
curl -s $BASE/auth/me -H "Authorization: Bearer $FIN_TOKEN" \
  | python3 -c 'import sys,json;r=json.load(sys.stdin);print({"tenant":r["tenant"]["name"],"isPlatform":r["tenantContext"]["isPlatform"],"perms":len(r["user"]["permissions"])})'

echo "[3] financier 看对账批次（应 < admin 看到的）:"
curl -s $BASE/recon-batches -H "Authorization: Bearer $FIN_TOKEN" \
  | python3 -c 'import sys,json;r=json.load(sys.stdin);print("financier batches:",len(r.get("batches",[])))'

echo "[4] disable + 写合同应被拦"
curl -s -X POST $BASE/tenants/<financier_tenant_id>/disable \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "X-Confirmed: true" >/dev/null
curl -s -o /dev/null -w "PUT /contracts/x HTTP %{http_code}\n" \
  -X PUT $BASE/contracts/x -H "Authorization: Bearer $FIN_TOKEN" \
  -H "Content-Type: application/json" -d '{}'
curl -s -X POST $BASE/tenants/<financier_tenant_id>/enable \
  -H "Authorization: Bearer $ADMIN_TOKEN" >/dev/null
echo "[done]"
```

预期：
- `[1] perms=35, isPlatform=true`
- `[2] tenant=融满, isPlatform=false, perms<35`
- `[3] financier batches < admin batches`
- `[4] HTTP 403`

---

## 12. 反馈与扩展

如果发现：
- 某个写接口在主体冻结后还能成功 → 提 issue 标 `tenant-freeze-miss`
- 某个查询接口对融资方/资金方账号返回了不该看的数据 → 提 issue 标 `data-scope-leak`
- 想新增"按区域 / 部门"做隔离 → 走架构评审，不要在业务模块里写新的 `if/else`，先扩 `resolveBusinessScope`

---

附录 A：相关代码文件索引

| 主题 | 文件 |
| --- | --- |
| 主体上下文 + 中间件 | [`backend/src/permission-policy.ts`](../backend/src/permission-policy.ts) |
| 认证 + orgContext 装填 | [`backend/src/auth.ts`](../backend/src/auth.ts) |
| `/auth/me` 扩字段 | [`backend/src/routes.ts`](../backend/src/routes.ts) 中 `/auth/me` 段 |
| 角色 / 主体启停 / 操作日志路由 | 同上 |
| 操作日志 store | [`backend/src/operation-log-store.ts`](../backend/src/operation-log-store.ts) |
| 运单数据范围 | [`backend/src/waybills-query.ts`](../backend/src/waybills-query.ts) |
| 对账 store | [`backend/src/reconciliation-store.ts`](../backend/src/reconciliation-store.ts) |
| 双轨 Dashboard | [`backend/src/dashboard-routes.ts`](../backend/src/dashboard-routes.ts) |
| 定向支付写接口冻结 | [`backend/src/directed-payment-routes.ts`](../backend/src/directed-payment-routes.ts) |
| 角色管理 UI | [`frontend/src/pages/Roles.tsx`](../frontend/src/pages/Roles.tsx) |
| 主体启停 UI | [`frontend/src/pages/Orgs.tsx`](../frontend/src/pages/Orgs.tsx) |
| 操作日志 UI | [`frontend/src/pages/OperationLogs.tsx`](../frontend/src/pages/OperationLogs.tsx) |
| 用户角色多选表单 | [`frontend/src/pages/Users.tsx`](../frontend/src/pages/Users.tsx) / [`Orgs.tsx`](../frontend/src/pages/Orgs.tsx) |
| 前端 hasCapability 工具 | [`frontend/src/api.ts`](../frontend/src/api.ts) |
