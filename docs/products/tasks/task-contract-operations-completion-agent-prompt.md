# Agent 提示词：合同管理功能补全

## 角色定义

你是登途云项目的前端开发 Agent，负责统一完善各类合同页面的操作功能。

## 背景知识

在开始任务前，请先阅读以下文档了解项目架构：
- `docs/development/PROJECT_ARCHITECTURE.md` - 项目架构说明
- `docs/development/DEVELOPMENT_LOG.md` - 开发日志
- `docs/development/ERROR_HANDLING_LOG.md` - 错误处理规范

## 任务目标

统一完善以下合同页面的操作功能，确保各页面功能一致性：

| 页面 | 文件 | 需要完善 |
|------|------|----------|
| 抽成合同 | `frontend/src/pages/NewContracts.tsx` | 移除操作限制 |
| 撮合业务合同 | `frontend/src/pages/BrokerageContracts.tsx` | 补充启用/停用按钮 |
| 日期格式统一 | 多个页面 | 统一为 YYYY-MM-DD |

---

## 任务 1：抽成合同功能补全

### 文件：`frontend/src/pages/NewContracts.tsx`

### 问题描述

当前代码第 467 行有条件判断 `record.id.startsWith("cc-")`，导致非 "cc-" 前缀的合同无法编辑/删除。
同样第 448 行 Switch 也有此限制。

### 修改要点

1. **移除 Switch 的 disabled 限制（约第 448 行）**

```tsx
// 修改前
<Switch
  checked={record.status !== "disabled"}
  onChange={() => handleToggleStatus(record)}
  disabled={!record.id.startsWith("cc-")}
  size="small"
/>

// 修改后
<Switch
  checked={record.status !== "disabled"}
  onChange={() => handleToggleStatus(record)}
  size="small"
/>
```

2. **移除操作列的条件渲染限制（约第 467-494 行）**

```tsx
// 修改前
{record.id.startsWith("cc-") && (
  <>
    <Button ... onClick={() => handleOpenEditModal(record)}>编辑</Button>
    <Popconfirm ... onConfirm={() => handleDeleteContract(record)}>
      <Button ... danger>删除</Button>
    </Popconfirm>
  </>
)}

// 修改后 - 移除条件包装，直接显示
<Button ... onClick={() => handleOpenEditModal(record)}>编辑</Button>
<Popconfirm ... onConfirm={() => handleDeleteContract(record)}>
  <Button ... danger>删除</Button>
</Popconfirm>
```

3. **同样移除详情弹窗中 Switch 的限制（约第 638 行）**

```tsx
// 修改前
{viewingContract.id.startsWith("cc-") && (
  <Switch ... />
)}

// 修改后
<Switch ... />
```

---

## 任务 2：撮合业务合同启用/停用按钮

### 文件：`frontend/src/pages/BrokerageContracts.tsx`

### 问题描述

当前页面有 Switch 列可以切换状态，但操作列没有明确的启用/停用按钮，不够直观。

### 修改要点

在操作列（约第 556-592 行）添加启用/停用按钮：

```tsx
{
  title: t("contracts.operations", "操作"),
  key: "actions",
  width: 240,  // 增加宽度
  render: (_: any, record: Contract) => (
    <Space size="small">
      <Button
        type="link"
        size="small"
        icon={<EyeOutlined />}
        onClick={() => handleView(record)}
      >
        查看
      </Button>
      
      {/* 新增：启用/停用按钮 */}
      <Button
        type="link"
        size="small"
        style={{ color: record.status === "disabled" ? "#52c41a" : "#faad14" }}
        onClick={() => handleToggleStatus(record)}
      >
        {record.status === "disabled" ? "启用" : "停用"}
      </Button>
      
      <Button
        type="link"
        size="small"
        icon={<EditOutlined />}
        onClick={() => handleEdit(record)}
      >
        编辑
      </Button>
      <Popconfirm
        title="确认删除"
        description="确定要删除这个合同吗？删除后无法恢复。"
        onConfirm={() => handleDelete(record)}
        okText="确定"
        cancelText="取消"
      >
        <Button
          type="link"
          size="small"
          danger
          icon={<DeleteOutlined />}
        >
          删除
        </Button>
      </Popconfirm>
    </Space>
  )
}
```

### 可选优化

考虑移除独立的"启用"Switch 列（第 540-551 行），因为操作列已有启用/停用按钮，避免重复。

---

## 任务 3：日期格式统一

### 涉及文件

- `frontend/src/pages/NewContracts.tsx`
- `frontend/src/pages/BrokerageContracts.tsx`

### 修改要点

1. **抽成合同表格日期列（约第 386-395 行）**

```tsx
// 修改前
render: (_: any, record: CommissionContract) => (
  <div>
    <div>{record.startDate}</div>
    <div style={{ fontSize: 12, color: "#8c8c8c" }}>
      至 {record.endDate}
    </div>
  </div>
)

// 修改后
render: (_: any, record: CommissionContract) => (
  <div>
    <div>{dayjs(record.startDate).format("YYYY-MM-DD")}</div>
    <div style={{ fontSize: 12, color: "#8c8c8c" }}>
      至 {dayjs(record.endDate).format("YYYY-MM-DD")}
    </div>
  </div>
)
```

2. **抽成合同详情弹窗日期（约第 631 行）**

```tsx
// 修改前
<Text>{viewingContract.startDate} 至 {viewingContract.endDate}</Text>

// 修改后
<Text>{dayjs(viewingContract.startDate).format("YYYY-MM-DD")} 至 {dayjs(viewingContract.endDate).format("YYYY-MM-DD")}</Text>
```

3. **撮合业务合同详情弹窗日期（约第 825-830 行）**

```tsx
// 修改前
<div>{viewingContract.startDate}</div>
// ...
<div>{viewingContract.endDate}</div>

// 修改后
<div>{dayjs(viewingContract.startDate).format("YYYY-MM-DD")}</div>
// ...
<div>{dayjs(viewingContract.endDate).format("YYYY-MM-DD")}</div>
```

---

## 任务 4：操作后数据刷新规范

### 检查项

确保所有操作后的 `refresh()` 调用都使用 `await`：

```tsx
// 正确写法
await deleteXxxApi(token, id);
message.success("删除成功");
await refresh();

// 错误写法（不要这样）
await deleteXxxApi(token, id);
message.success("删除成功");
refresh();  // 缺少 await
```

### 需检查的函数

**NewContracts.tsx:**
- `handleDeleteContract`
- `handleToggleStatus`
- `handleCreateSubmit`

**BrokerageContracts.tsx:**
- `handleDelete`
- `handleToggleStatus`
- `handleEditSubmit`（第 345 行 `refresh()` 需要加 `await`）

---

## 验收标准

完成后请检查：

1. [ ] 抽成合同：所有合同都能编辑、删除、启用/停用
2. [ ] 抽成合同：移除了 `id.startsWith("cc-")` 的限制
3. [ ] 撮合业务合同：操作列有启用/停用按钮
4. [ ] 日期显示统一为 `YYYY-MM-DD` 格式
5. [ ] 所有 `refresh()` 调用都使用了 `await`
6. [ ] 测试各页面的增删改查功能正常

---

## 开发规范

- 所有异步操作使用 `async/await`
- 操作成功后必须 `await refresh()` 刷新数据
- 金额显示统一使用 `toLocaleString('zh-CN', { minimumFractionDigits: 2 })`
- 日期显示使用 `dayjs(date).format('YYYY-MM-DD')`
- 错误处理使用 `getErrorMessage(err)` 获取错误信息

---

## 完成后

1. 测试所有功能正常
2. 更新 `docs/development/DEVELOPMENT_LOG.md` 记录本次开发
3. 如遇错误，记录到 `docs/development/ERROR_HANDLING_LOG.md`

---

## 附：功能一致性对照表

修改完成后，各页面应具备以下功能：

| 功能 | 三方融资 | 撮合业务 | 抽成合同 | 定向支付 |
|------|:-------:|:-------:|:-------:|:-------:|
| 查看 | ✅ | ✅ | ✅ | ✅ |
| 编辑 | ✅ | ✅ | ✅ | ✅ |
| 删除 | ✅ | ✅ | ✅ | ✅ |
| 启用/停用 | ✅ | ✅ | ✅ | 状态流转 |
| 日期格式 | YYYY-MM-DD | YYYY-MM-DD | YYYY-MM-DD | YYYY-MM-DD |
| await refresh | ✅ | ✅ | ✅ | ✅ |
