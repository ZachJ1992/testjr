# 任务：三方融资合同详情 UI 优化

## 任务概述

优化三方融资合同详情弹窗的布局，并在合同列表中增加放款/还款快捷操作入口。

## 涉及文件

- `frontend/src/pages/Contracts.tsx` - 三方融资合同列表页面
- `frontend/src/components/ContractLoanManager.tsx` - 合同放款管理组件

## 需求 1：合同详情弹窗排版优化

### 问题描述

当前弹窗存在以下排版问题：
1. 信息区块对齐不一致
2. 日期显示格式带时区信息（如 `2026-01-12T16:00:00.000Z`），应简化
3. 金额数字与标签之间的间距不一致

### 期望效果

```
┌─────────────────────────────────────────────────────────────────┐
│ 合同详情                                              [编辑]    │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 合同编号        合同名称              合同状态              │ │
│ │ RZ2026010768   金罗三方融资服务合同   [即将到期] [开关]     │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ 资金方          融资方/物流商          授信总额度           │ │
│ │ 登途            金罗                   ¥4,500,000.00       │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ 合同有效期                年化利率        结算周期          │ │
│ │ 2026-01-12 ~ 2026-01-30   25%            每月结算          │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 放款管理  [全额放款]                    [放款] [还款]       │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ 授信额度    累计放款    剩余本金    待还利息    可用额度    │ │
│ │ ¥4,500,000  ¥4,500,000  ¥4,500,000  ¥0.00      ¥4,500,000  │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 具体修改点

1. **日期格式化**
   - 将 `2026-01-12T16:00:00.000Z` 改为 `2026-01-12`
   - 使用 `dayjs(date).format('YYYY-MM-DD')` 格式化

2. **布局对齐**
   - 使用 Ant Design 的 `Descriptions` 组件或固定宽度的 Grid 布局
   - 确保每行的列宽一致

3. **金额显示**
   - 统一使用 `toLocaleString('zh-CN', { minimumFractionDigits: 2 })` 格式化
   - 金额颜色：正常为蓝色，红色表示需关注项

## 需求 2：列表中添加放款/还款快捷操作

### 问题描述

当前放款和还款操作需要点击"查看"进入详情弹窗才能操作，不够便捷。

### 期望效果

在合同列表的操作列中，增加"放款"和"还款"按钮：

```
操作列：[查看] [放款] [还款] [编辑] [删除]
```

或使用下拉菜单：

```
操作列：[查看] [更多 ▼]
              ├─ 放款
              ├─ 还款
              ├─ 编辑
              └─ 删除
```

### 具体修改点

1. **在 `Contracts.tsx` 的表格 columns 中添加操作按钮**

```tsx
{
  title: "操作",
  key: "actions",
  render: (_, record) => (
    <Space size="small">
      <Button type="link" onClick={() => handleView(record)}>查看</Button>
      <Button type="link" onClick={() => handleOpenDisbursement(record)}>放款</Button>
      <Button type="link" onClick={() => handleOpenRepayment(record)}>还款</Button>
      <Dropdown menu={{ items: moreActions(record) }}>
        <Button type="link">更多</Button>
      </Dropdown>
    </Space>
  )
}
```

2. **添加放款弹窗状态和处理函数**

```tsx
const [disbursementModalOpen, setDisbursementModalOpen] = useState(false);
const [repaymentModalOpen, setRepaymentModalOpen] = useState(false);
const [selectedContract, setSelectedContract] = useState<Contract | null>(null);

const handleOpenDisbursement = (contract: Contract) => {
  setSelectedContract(contract);
  setDisbursementModalOpen(true);
};

const handleOpenRepayment = (contract: Contract) => {
  setSelectedContract(contract);
  setRepaymentModalOpen(true);
};
```

3. **复用 ContractLoanManager 组件中的放款/还款弹窗**

可以将 `ContractLoanManager` 中的放款和还款 Modal 抽取为独立组件，或者直接在列表页渲染该组件。

## 开发建议

### 方案 A：快速实现

直接在列表操作列打开详情弹窗，并自动定位到放款/还款 Tab。

```tsx
const handleQuickDisbursement = (contract: Contract) => {
  setViewingContract(contract);
  setDetailModalOpen(true);
  // 设置一个 flag 让 ContractLoanManager 自动打开放款弹窗
};
```

### 方案 B：独立弹窗（推荐）

抽取放款/还款弹窗为独立组件，可在列表页直接调用：

```tsx
// 新建文件：frontend/src/components/DisbursementModal.tsx
// 新建文件：frontend/src/components/RepaymentModal.tsx
```

## 验收标准

1. [ ] 合同详情弹窗中日期显示为 `YYYY-MM-DD` 格式
2. [ ] 弹窗布局整齐，无错位
3. [ ] 合同列表中有放款/还款快捷入口
4. [ ] 放款/还款操作后列表自动刷新
5. [ ] 交互流畅，无报错

## 参考

- 现有组件：`frontend/src/components/ContractLoanManager.tsx`
- API：`frontend/src/api.ts` 中的 `createDisbursement`, `createRepayment`
- 后端：`backend/src/contract-loan-store.ts`
