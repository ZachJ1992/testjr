#!/usr/bin/env bash
#
# 本地后端联调：释放 3001、避免误用 Docker 内旧代码、用当前仓库构建并启动 Node 后端。
# 用法见 docs/local-backend-dev-flow.md
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-3001}"
LOCAL_DIR="$ROOT/.local"
LOG_DIR="$LOCAL_DIR/logs"
PID_FILE="$LOCAL_DIR/backend.pid"
LATEST_LOG="$LOG_DIR/backend-latest.log"
SKIP_BUILD=0
USE_DEV=0
FOREGROUND=0

usage() {
  echo "本地后端联调：释放 ${PORT:-3001}、停 testapp、build（可选）并用本机 Node 启动 backend。"
  echo ""
  echo "用法: $(basename "$0") [选项]"
  echo "  --skip-build   跳过 npm run build:backend（仅改 .env 等无需编译的场景）"
  echo "  --dev          使用 tsx watch 开发模式（不跑 tsc，改 TS 即生效；前台运行）"
  echo "  --foreground   前台运行 npm start（默认后台 + 日志）"
  echo "  -h, --help     显示本说明"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-build) SKIP_BUILD=1 ;;
    --dev) USE_DEV=1 ;;
    --foreground) FOREGROUND=1 ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "未知参数: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if [ "$USE_DEV" -eq 1 ]; then
  FOREGROUND=1
  SKIP_BUILD=1
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[restart-local-backend]${NC} $*"; }
warn() { echo -e "${YELLOW}[restart-local-backend]${NC} $*" >&2; }
err() { echo -e "${RED}[restart-local-backend]${NC} $*" >&2; }

if ! command -v node >/dev/null 2>&1; then
  err "未找到 node，请先安装 Node.js（建议 >= 18）。"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  err "未找到 npm。"
  exit 1
fi

mkdir -p "$LOG_DIR"

compose_stop_app() {
  if command -v docker >/dev/null 2>&1; then
    if docker compose version >/dev/null 2>&1; then
      docker compose -f "$ROOT/docker-compose.yml" stop app 2>/dev/null || true
    elif command -v docker-compose >/dev/null 2>&1; then
      docker-compose -f "$ROOT/docker-compose.yml" stop app 2>/dev/null || true
    fi
  fi
}

stop_docker_testapp() {
  if ! command -v docker >/dev/null 2>&1; then
    return 0
  fi
  if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx 'testapp'; then
    log "停止 Docker 容器 testapp（避免与本机 Node 抢 ${PORT} 端口，且镜像内代码可能落后于仓库）。"
    docker stop testapp >/dev/null 2>&1 || true
  fi
  compose_stop_app
}

kill_pid_file_backend() {
  if [ -f "$PID_FILE" ]; then
    local old
    old="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [ -n "${old:-}" ] && kill -0 "$old" 2>/dev/null; then
      log "结束此前由本脚本启动的进程 (pid=$old)。"
      kill "$old" 2>/dev/null || true
      sleep 1
      kill -9 "$old" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
}

port_listeners() {
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true
}

free_port() {
  local pids
  pids="$(port_listeners | tr '\n' ' ')"
  if [ -z "${pids// /}" ]; then
    return 0
  fi
  warn "端口 ${PORT} 仍被占用，尝试结束监听进程: ${pids}"
  # shellcheck disable=SC2046
  kill $(port_listeners) 2>/dev/null || true
  sleep 1
  # shellcheck disable=SC2046
  kill -9 $(port_listeners) 2>/dev/null || true
  sleep 0.5
}

ensure_port_free() {
  stop_docker_testapp
  kill_pid_file_backend
  if [ -n "$(port_listeners | tr -d '[:space:]')" ]; then
    free_port
  fi
  if [ -n "$(port_listeners | tr -d '[:space:]')" ]; then
    err "端口 ${PORT} 仍被占用，请手动处理后重试："
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN || true
    exit 1
  fi
}

ensure_port_free

if [ ! -f "$ROOT/backend/.env" ]; then
  warn "未找到 backend/.env，后端可能无法连接数据库等。请从示例或团队配置复制。"
fi

if [ "$SKIP_BUILD" -eq 0 ]; then
  log "在仓库根目录执行 build:backend（tsc 编译当前 backend 源码）。"
  npm run build:backend
else
  log "已跳过 build（--skip-build 或 --dev）。"
fi

if [ "$USE_DEV" -eq 1 ]; then
  log "开发模式：npm run dev:backend（tsx watch，前台）。"
  echo ""
  echo -e "${GREEN}验证建议:${NC} 另开终端执行: curl -sS http://127.0.0.1:${PORT}/api/health"
  echo -e "${GREEN}说明:${NC} 修改 backend/src 下 TS 会由 tsx 自动重载，一般无需再跑 tsc。"
  echo ""
  exec npm run dev:backend
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$LOG_DIR/backend-${STAMP}.log"
rm -f "$LATEST_LOG"
ln -s "$(basename "$LOG_FILE")" "$LATEST_LOG"

if [ "$FOREGROUND" -eq 1 ]; then
  log "前台启动: npm --workspace backend run start（日志直接输出到终端）。"
  echo ""
  echo -e "${GREEN}验证:${NC} curl -sS http://127.0.0.1:${PORT}/api/health"
  echo ""
  exec npm --workspace backend run start
fi

log "后台启动: npm --workspace backend run start，日志 → $LOG_FILE（同目录 backend-latest.log）"
nohup npm --workspace backend run start >>"$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" >"$PID_FILE"

log "已启动 pid=$NEW_PID，等待 /api/health 就绪..."
READY=""
for _ in $(seq 1 30); do
  code="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/api/health" 2>/dev/null || true)"
  if [ "$code" = "200" ]; then
    READY="yes"
    break
  fi
  sleep 1
done

if [ "$READY" != "yes" ]; then
  err "健康检查未在约 30s 内返回 200，请查看日志: $LOG_FILE"
  tail -n 40 "$LOG_FILE" 2>/dev/null || true
  exit 1
fi

echo ""
echo -e "${GREEN}✓ 本地后端已在 ${PORT} 监听（当前仓库编译产物 + Node）。${NC}"
echo -e "  日志: ${BLUE}$LOG_FILE${NC}（软链 ${BLUE}$LATEST_LOG${NC}）"
echo -e "  验证: ${BLUE}curl -sS http://127.0.0.1:${PORT}/api/health${NC}"
echo -e "  停止: ${BLUE}kill \$(cat $PID_FILE)${NC} 或再次运行本脚本（会先停旧进程）"
echo ""
echo -e "${YELLOW}提示:${NC} Docker 容器 testapp 已停止；联调请使用上述本机 Node 进程。恢复 Docker 见 docs/local-backend-dev-flow.md。"
