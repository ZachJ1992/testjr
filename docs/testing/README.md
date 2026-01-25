# 全系统测试计划 - 测试 Agent 分工

## 概述

本系统包含5个独立的测试业务线，可以分配给5个测试 Agent 并行执行。

## 测试 Agent 分配

| Agent | 业务线 | 文档 | 依赖 | 预计耗时 |
|-------|--------|------|------|----------|
| **Agent A** | 三方融资合同 | `test-agent-A-financing.md` | 无 | ~10分钟 |
| **Agent B** | 撮合业务合同 | `test-agent-B-brokerage.md` | 无 | ~10分钟 |
| **Agent C** | 抽成合同 | `test-agent-C-commission.md` | 无 | ~8分钟 |
| **Agent D** | 定向支付合同（核心） | `test-agent-D-directed-payment.md` | 无 | ~20分钟 |
| **Agent E** | 数据权限 | `test-agent-E-permissions.md` | Agent A/D 先完成 | ~15分钟 |

## 执行顺序建议

```
阶段1（并行）：Agent A + Agent B + Agent C + Agent D
          ↓
阶段2：Agent E（需要基础数据）
```

## 环境准备

### 1. 启动服务
```bash
# 终端1：启动后端
DB_HOST=127.0.0.1 DB_PORT=3307 DB_USER=root DB_PASSWORD=root123 DB_NAME=testjr npm run dev:backend

# 终端2：启动前端
npm run dev:frontend
```

### 2. 确认服务正常
```bash
# 健康检查
curl http://localhost:3001/api/health

# 登录测试
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'
```

## 给测试 Agent 的指令模板

### Agent A 指令
```
你是测试 Agent A，负责测试三方融资合同业务线。

请阅读 docs/testing/test-agent-A-financing.md 文件，按照步骤执行测试。

测试完成后，按照文档中的"测试报告格式"输出报告。

注意事项：
1. 使用 curl 命令执行 API 调用
2. 记录每个步骤的返回结果
3. 发现问题时记录详细错误信息
```

### Agent B 指令
```
你是测试 Agent B，负责测试撮合业务合同业务线。

请阅读 docs/testing/test-agent-B-brokerage.md 文件，按照步骤执行测试。

测试完成后，按照文档中的"测试报告格式"输出报告。
```

### Agent C 指令
```
你是测试 Agent C，负责测试抽成合同业务线。

请阅读 docs/testing/test-agent-C-commission.md 文件，按照步骤执行测试。

测试完成后，按照文档中的"测试报告格式"输出报告。
```

### Agent D 指令
```
你是测试 Agent D，负责测试定向支付合同业务线（这是核心测试）。

请阅读 docs/testing/test-agent-D-directed-payment.md 文件，按照步骤执行测试。

这是最重要的测试，包含：
- 合同创建与激活
- 支付类别配置（免审批、平台审批、双重审批）
- 支付比例限制测试
- 运单费用解锁逻辑
- 审批流程（通过/拒绝）
- 支付执行
- 超额支付失败回滚验证（关键！）

测试完成后，按照文档中的"测试报告格式"输出报告。
```

### Agent E 指令
```
你是测试 Agent E，负责测试数据权限与系统管理。

注意：请在 Agent A 和 Agent D 完成后再执行，因为需要使用他们创建的基础数据。

请阅读 docs/testing/test-agent-E-permissions.md 文件，按照步骤执行测试。

重点测试：
- 多租户数据隔离
- 融资方/资金方用户只能看自己的数据
- 越权操作拦截

测试完成后，按照文档中的"测试报告格式"输出报告。
```

## 测试结果汇总模板

```markdown
# 全系统测试结果汇总

测试时间：YYYY-MM-DD
测试环境：本地开发环境

## 总体结果

| 业务线 | 测试Agent | 结果 | 问题数 |
|--------|-----------|------|--------|
| 三方融资合同 | A | ✅/❌ | 0 |
| 撮合业务合同 | B | ✅/❌ | 0 |
| 抽成合同 | C | ✅/❌ | 0 |
| 定向支付合同 | D | ✅/❌ | 0 |
| 数据权限 | E | ✅/❌ | 0 |

## 发现的问题

### 严重问题
- （列出需要立即修复的问题）

### 一般问题
- （列出可以后续修复的问题）

### 优化建议
- （列出改进建议）
```

## 常见问题

### Q: 端口被占用
```bash
# 杀掉占用端口的进程
lsof -ti:3001 | xargs kill -9
lsof -ti:5173 | xargs kill -9
```

### Q: 数据库连接失败
```bash
# 检查 Docker MySQL 是否运行
docker ps | grep mysql

# 启动 MySQL
docker start testjr-mysql
```

### Q: Token 过期
```bash
# 重新登录获取新 Token
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "admin123"}'
```
