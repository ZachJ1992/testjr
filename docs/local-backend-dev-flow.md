# 本地后端联调流程

本文说明：**本地改了 backend 代码后，如何让「当前仓库里的最新后端」在本机生效**，并用统一方式做联调。不依赖某个固定接口，也不依赖重新构建整套 Docker 镜像。

---

## 推荐路径（摘要）

1. 使用**当前仓库**里的源码与依赖。
2. 若改动了需编译的 TypeScript（或 dist 与源码不一致），执行 **`npm run build:backend`**（或由下方脚本自动执行）。
3. 用 **本机 Node** 启动后端（`npm --workspace backend run start` 或开发模式 `npm run dev:backend`）。
4. **不要**指望「只重启 Docker 容器」就能带上你刚写的未进镜像的代码。

一键脚本：

```bash
chmod +x scripts/restart-local-backend.sh   # 仅需首次
./scripts/restart-local-backend.sh
```

---

## 为什么只重启 Docker 可能没用

- 容器 **`testapp`** 跑的是镜像里的构建产物；**镜像未重新 build 时**，里面仍是旧代码。
- `docker compose restart` / `docker restart testapp` **不会**自动把宿主机上刚改的 `backend/src` 同步进镜像。
- 本机 **3001** 若已被 `testapp` 占用，你即使启动了本地 Node，也可能连错进程。

因此：**要以仓库最新代码联调，应停掉抢端口的 Docker 后端，改走本机 Node + 当前仓库 build（或 dev）流程。**

---

## 什么情况下需要「重启后端」

在以下情况需要**停掉当前后端进程再启动**（脚本会自动处理旧进程与端口）：

- 修改了 **`backend/.env`**（或依赖进程启动时读取的环境变量）。
- 修改了 **仅运行期加载** 的逻辑，且你当前跑的是 **`npm start`（node dist）** 而非 `tsx watch`。
- 怀疑进程状态异常、端口粘连、想确认跑的是刚编译的 dist。

---

## 什么情况下必须「重新 build」

后端包脚本为：`build` → `tsc`，`start` → `node dist/index.js`。

在以下情况需要 **`npm run build:backend`**（默认脚本会自动执行）：

- 修改了 **`backend/src` 下任意 TypeScript**（且你使用 **`npm start` / 生产等价路径**）。
- 拉取了别人改过后端的代码，而本机 **`backend/dist` 未更新**。
- 不确定 dist 是否与源码一致时，**build 一次最稳妥**。

以下情况**通常不需要** tsc build：

- 使用 **`./scripts/restart-local-backend.sh --dev`**（`tsx watch` 直接跑 TS）。
- **仅**修改 `.env` 且用 **`--skip-build`** 重启（见脚本说明）。

---

## 执行脚本：`scripts/restart-local-backend.sh`

在**仓库根目录**执行：

```bash
./scripts/restart-local-backend.sh
```

脚本会依次：

1. 检查并释放 **3001**（默认 `PORT`，可通过环境变量覆盖）。
2. 若存在 Docker 容器 **`testapp`**，会 **stop**，避免与本地 Node 抢端口，并避免误连镜像内旧服务。
3. 对 **`docker-compose.yml` 里的 `app` 服务** 执行 **`stop`**（与 `testapp` 一致场景）。
4. 结束本脚本上次记录的本地后端 pid（如有），并必要时结束仍监听 3001 的进程。
5. 默认执行 **`npm run build:backend`**，再 **`npm --workspace backend run start`**（后台），日志写入 **`.local/logs/`**。
6. 轮询 **`http://127.0.0.1:<PORT>/api/health`**（默认 3001；若导出 `PORT` 则使用该端口），成功则打印验证命令。

常用选项：

| 选项 | 含义 |
|------|------|
| `--skip-build` | 跳过 tsc，仅重启（适合只改 `.env`） |
| `--dev` | `npm run dev:backend`（tsx watch，**前台**，改 TS 即生效） |
| `--foreground` | 前台 `npm start`，便于直接看日志 |

日志路径：

- 按次：`.local/logs/backend-YYYYMMDD-HHMMSS.log`
- 软链：`.local/logs/backend-latest.log` → 最近一次

---

## 如何验证「本地最新代码已生效」

1. **进程与端口**：`lsof -nP -iTCP:3001 -sTCP:LISTEN`（若改了 `PORT` 则替换端口号）应为本机 `node`，而不是 Docker 映射占满且容器内旧逻辑（停掉 `testapp` 后应为 Node）。
2. **健康检查**：

   ```bash
   curl -sS "http://127.0.0.1:${PORT:-3001}/api/health"
   ```

   应返回 JSON，`status` 为 `ok`。
3. **业务验证**：对你刚加的接口或逻辑发真实请求；若使用 `npm start`，确认已 **`build`** 再测。

可在临时日志里搜你新加的 `console.log` 或特征字符串，确认跑的是当前构建。

---

## 新增接口 / 功能时如何沿用同一流程

1. 在 `backend/src` 实现路由与逻辑。
2. 运行 **`./scripts/restart-local-backend.sh`**（默认会 build + start）。
3. 或用 **`--dev`** 做密集改动（无需每次 tsc）。
4. 用 **`/api/health` + 你的新接口** 验证即可，无需为新接口单独写脚本。

---

## 如何切回 Docker 运行

当你希望重新使用镜像内的后端（与线上/交付形态一致）时：

1. **先停止本机 Node 后端**，释放 3001：

   ```bash
   kill "$(cat .local/backend.pid)" 2>/dev/null || true
   ```

2. 在项目根目录启动 Compose（需本机已有 **`testapp:latest`** 镜像，或通过团队的镜像/构建流程更新）：

   ```bash
   docker compose up -d app
   ```

3. 若镜像代码过旧，需要 **重新构建镜像**（耗时较长），可参考根目录 **`deploy-local.sh`**；日常「只验证仓库最新后端」不必走整镜像构建。

---

## 常见问题

### 3001 端口被占用

- 执行 **`./scripts/restart-local-backend.sh`** 会先停 **`testapp`** 并尝试释放监听。
- 若仍失败，脚本会打印 **`lsof`**；手动结束对应进程或改用 **`PORT=3002 ./scripts/restart-local-backend.sh`**（需与前端/客户端配置一致）。

### Docker `testapp` 抢端口

- 脚本会 **`docker stop testapp`**。联调阶段应明确：**要么 Docker 后端，要么本机 Node**，不要两个同时占 3001。

### Docker 里还是旧代码

- 未 **重新 build 镜像** 时，容器内永远是旧构建产物；**重启容器不会拉取宿主机源码**。
- 要以仓库为准：用本脚本走 **build + 本机 Node**，或 rebuild 镜像后再 `compose up`。

### 改了 TS 但没重新 build

- 使用 **`npm start`** 时读的是 **`dist`**，必须 **`npm run build:backend`**。
- 或使用 **`--dev`**（tsx watch）开发，保存即重载。

### 本地依赖损坏

在仓库根目录重装（示例）：

```bash
rm -rf node_modules backend/node_modules
npm install
```

然后再执行 **`./scripts/restart-local-backend.sh`**。

### 服务起来了但新功能没生效

- 确认请求打的是 **本机 Node**（非仍运行的 Docker）。
- 确认使用 **`npm start`** 时已 **build**。
- 确认路由挂载、环境变量、数据库数据是否符合新逻辑预期。

---

## 与「整包 Docker 部署」的关系

- **`deploy-local.sh`**：拉代码 + **docker build 全镜像** + compose —— 适合交付/对齐容器环境，**不是**日常每次改几行后端就要跑的流程。
- **`scripts/restart-local-backend.sh`**：聚焦 **本机最新仓库代码 + tsc + Node**，用于日常联调与接口验证。

按场景选择即可。
