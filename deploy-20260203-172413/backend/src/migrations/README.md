# 多租户数据隔离迁移说明

## 概述

此迁移实现了基于组织的多租户数据隔离功能。

## 已完成的修改

### 1. 类型定义 (`types.ts`)

- 添加了 `OrgType` 类型: `"platform" | "funder" | "financier"`
- `OrgUnit` 接口新增字段:
  - `type: OrgType` - 组织类型
  - `relatedEntityId?: string` - 关联的实体ID

- `Funder` 接口新增字段:
  - `orgId?: string` - 关联的组织ID

- `Financier` 接口新增字段:
  - `orgId?: string` - 关联的组织ID

### 2. 资金方存储 (`funders-store.ts`)

- 创建资金方时自动创建对应组织
- 更新资金方名称时同步更新组织名称
- 删除资金方时同时禁用组织

### 3. 融资方存储 (`financiers-store.ts`)

- 创建融资方时自动创建对应组织
- 更新融资方名称时同步更新组织名称
- 删除融资方时同时禁用组织

### 4. 迁移脚本 (`migrations/multi-tenant.ts`)

自动在启动时运行，添加以下数据库字段:
- `org_units.type` - 组织类型
- `org_units.related_entity_id` - 关联实体ID
- `funders.org_id` - 资金方关联组织
- `financiers.org_id` - 融资方关联组织

## 手动需要完成的修改

### store.ts 中的 OrgRow 类型

需要在 `store.ts` 第 230 行附近，修改 `OrgRow` 类型定义:

```typescript
type OrgRow = RowDataPacket & {
  id: string;
  name: string;
  parent_id: string | null;
  type: string;                    // 新增
  related_entity_id: string | null; // 新增
  is_active: number | null;
};
```

### store.ts 中的 getAllOrgUnits 函数

需要更新查询和映射:

```typescript
export async function getAllOrgUnits(): Promise<OrgUnit[]> {
  // ...
  const [rows] = await pool.query<OrgRow[]>(
    "SELECT id, name, parent_id, type, related_entity_id, is_active FROM org_units WHERE deleted_at IS NULL"
  );

  const result = rows.map((row) => ({
    id: row.id,
    name: row.name,
    parentId: row.parent_id ?? undefined,
    type: (row.type || 'platform') as OrgType,
    relatedEntityId: row.related_entity_id ?? undefined,
    isActive: row.is_active !== 0
  }));
  // ...
}
```

### store.ts 中的 findOrgById 函数

需要更新查询和映射:

```typescript
export async function findOrgById(orgId: string): Promise<OrgUnit | undefined> {
  const [rows] = await pool.query<OrgRow[]>(
    "SELECT id, name, parent_id, type, related_entity_id, is_active FROM org_units WHERE id = ? AND deleted_at IS NULL LIMIT 1",
    [orgId]
  );

  const row = rows[0];
  return row
    ? {
        id: row.id,
        name: row.name,
        parentId: row.parent_id ?? undefined,
        type: (row.type || 'platform') as OrgType,
        relatedEntityId: row.related_entity_id ?? undefined,
        isActive: row.is_active !== 0
      }
    : undefined;
}
```

### store.ts 中的 createOrgUnit 函数

需要更新函数签名和插入语句:

```typescript
export async function createOrgUnit(
  name: string,
  parentId?: string,
  isActive = true,
  type: OrgType = "platform",
  relatedEntityId?: string
): Promise<OrgUnit> {
  // ...
  await pool.query(
    "INSERT INTO org_units (id, name, parent_id, is_active, type, related_entity_id) VALUES (?, ?, ?, ?, ?, ?)",
    [id, name, parentId ?? null, isActive ? 1 : 0, type, relatedEntityId ?? null]
  );

  return { id, name, parentId, type, relatedEntityId, isActive };
}
```

## 数据隔离逻辑

数据可见性规则:
- **平台组织**: 可以看到所有数据
- **资金方组织**: 只能看到与自己相关的合同、结算数据
- **融资方组织**: 只能看到自己的运单、合同、结算数据

后续需要实现:
1. 在 API 层添加组织过滤中间件
2. 在数据查询层根据用户组织类型过滤数据
