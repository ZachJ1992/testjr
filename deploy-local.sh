#!/bin/bash

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo -e "${RED}错误: 未安装 Docker${NC}"
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo -e "${RED}错误: 未安装 docker compose / docker-compose${NC}"
  exit 1
fi

CURRENT_BRANCH="$(git branch --show-current)"
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo -e "${YELLOW}切换到 main 分支...${NC}"
  git checkout main
fi

echo -e "${YELLOW}[1/5] 拉取 main 最新代码...${NC}"
git pull --ff-only origin main

echo -e "${YELLOW}[2/5] 构建最新镜像...${NC}"
docker build -t testapp:latest .

echo -e "${YELLOW}[3/5] 重建本机容器...${NC}"
"${COMPOSE_CMD[@]}" up -d --force-recreate

echo -e "${YELLOW}[4/5] 等待服务就绪...${NC}"
APP_URL="http://127.0.0.1:3001"
READY="false"

for i in $(seq 1 24); do
  HTTP_CODE="$(curl -sS -o /dev/null -w '%{http_code}' "$APP_URL" || true)"
  if [ "$HTTP_CODE" = "200" ]; then
    READY="true"
    break
  fi
  sleep 5
done

echo -e "${YELLOW}[5/5] 输出容器状态...${NC}"
"${COMPOSE_CMD[@]}" ps

if [ "$READY" != "true" ]; then
  echo -e "${RED}应用未在预期时间内就绪，最近日志如下:${NC}"
  docker logs --tail 80 testapp || true
  exit 1
fi

echo -e "${GREEN}✅ 本机部署成功${NC}"
echo -e "${BLUE}访问地址: ${APP_URL}${NC}"
