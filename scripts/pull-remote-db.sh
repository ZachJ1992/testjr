#!/usr/bin/env bash
# 从线上 MySQL 导出并覆盖本地 Docker 中的库（默认 testjr-mysql:3307）。
#
# 用法：
#   1) cp scripts/remote-db.env.example scripts/remote-db.env
#   2) 编辑 scripts/remote-db.env 填写线上 DB_HOST / DB_USER / DB_PASSWORD / DB_NAME
#   3) 确保本机 IP 已在 RDS 白名单，且本地容器已启动：docker ps | grep testjr-mysql
#   4) ./scripts/pull-remote-db.sh
#
# 非交互覆盖本地（自动化 / CI 慎用）：
#   PULL_REMOTE_DB_YES=1 ./scripts/pull-remote-db.sh
#
# 指定文件：
#   REMOTE_ENV=/path/to/prod.env LOCAL_ENV=backend/.env ./scripts/pull-remote-db.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_ENV="${REMOTE_ENV:-$ROOT/scripts/remote-db.env}"
LOCAL_ENV="${LOCAL_ENV:-$ROOT/backend/.env}"
LOCAL_DOCKER="${LOCAL_MYSQL_CONTAINER:-testjr-mysql}"
DUMP_KEEP="${DUMP_KEEP:-}"

if [[ ! -f "$REMOTE_ENV" ]]; then
  echo "缺少线上库配置: $REMOTE_ENV"
  echo "请: cp scripts/remote-db.env.example scripts/remote-db.env 并填写连接信息。"
  exit 1
fi

if [[ ! -f "$LOCAL_ENV" ]]; then
  echo "缺少本地配置: $LOCAL_ENV"
  exit 1
fi

# shellcheck source=/dev/null
set -a && source "$REMOTE_ENV" && set +a
R_HOST="${DB_HOST:?请在 remote-db.env 中设置 DB_HOST}"
R_PORT="${DB_PORT:-3306}"
R_USER="${DB_USER:?请在 remote-db.env 中设置 DB_USER}"
R_PASS="${DB_PASSWORD:?请在 remote-db.env 中设置 DB_PASSWORD}"
R_NAME="${DB_NAME:?请在 remote-db.env 中设置 DB_NAME}"

set +a
# shellcheck source=/dev/null
set -a && source "$LOCAL_ENV" && set +a
L_HOST="${DB_HOST:?请在 backend/.env 中设置 DB_HOST}"
L_PORT="${DB_PORT:-3306}"
L_USER="${DB_USER:?请在 backend/.env 中设置 DB_USER}"
L_PASS="${DB_PASSWORD:?请在 backend/.env 中设置 DB_PASSWORD}"
L_NAME="${DB_NAME:?请在 backend/.env 中设置 DB_NAME}"

if [[ "${PULL_REMOTE_DB_YES:-}" != "1" ]]; then
  echo "即将删除本地库 ${L_NAME}（Docker: ${LOCAL_DOCKER}）并导入线上 ${R_NAME} 的快照。"
  read -r -p "确认继续？输入 yes: " ans
  if [[ "$ans" != "yes" ]]; then
    echo "已取消。"
    exit 1
  fi
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$LOCAL_DOCKER"; then
  echo "未找到运行中的容器: $LOCAL_DOCKER"
  echo "可先执行: docker run -d --name testjr-mysql -e MYSQL_ROOT_PASSWORD=root123 -e MYSQL_DATABASE=testjr -p 3307:3306 mysql:8.0"
  exit 1
fi

dump_remote() {
  local extra=()
  if [[ -n "${MYSQLDUMP_EXTRA:-}" ]]; then
    # shellcheck disable=SC2206
    extra=($MYSQLDUMP_EXTRA)
  fi
  if command -v mysqldump >/dev/null 2>&1; then
    MYSQL_PWD="$R_PASS" mysqldump \
      -h "$R_HOST" -P "$R_PORT" -u "$R_USER" \
      --single-transaction --routines --triggers \
      --set-gtid-purged=OFF \
      --column-statistics=0 \
      "${extra[@]}" \
      "$R_NAME"
  else
    docker run --rm \
      -e MYSQL_PWD="$R_PASS" \
      mysql:8.0 \
      mysqldump \
      -h "$R_HOST" -P "$R_PORT" -u "$R_USER" \
      --single-transaction --routines --triggers \
      --set-gtid-purged=OFF \
      --column-statistics=0 \
      "${extra[@]}" \
      "$R_NAME"
  fi
}

# 若线上库名与本地不一致，改写 DUMP 中的 USE，避免导入到错误 schema
rewrite_use() {
  if [[ "$R_NAME" == "$L_NAME" ]]; then
    cat
    return
  fi
  sed "s/^USE \`${R_NAME}\`/USE \`${L_NAME}\`/"
}

TS="$(date +%Y%m%d_%H%M%S)"
TMP_SQL="${TMPDIR:-/tmp}/jinrong_remote_${TS}.sql"

echo "正在从线上导出（可能需要几分钟）..."
dump_remote | rewrite_use >"$TMP_SQL"
if [[ -n "$DUMP_KEEP" ]]; then
  echo "已保存 SQL: $TMP_SQL"
fi

echo "正在重建本地库 ${L_NAME}..."
docker exec -e MYSQL_PWD="$L_PASS" "$LOCAL_DOCKER" mysql -u"$L_USER" \
  -e "DROP DATABASE IF EXISTS \`${L_NAME}\`; CREATE DATABASE \`${L_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo "正在导入..."
docker exec -i -e MYSQL_PWD="$L_PASS" "$LOCAL_DOCKER" mysql -u"$L_USER" "$L_NAME" <"$TMP_SQL"

if [[ -z "$DUMP_KEEP" ]]; then
  rm -f "$TMP_SQL"
else
  echo "保留 dump: $TMP_SQL"
fi

echo "完成。请确认 backend/.env 指向本地（当前 DB_HOST=${L_HOST} DB_NAME=${L_NAME}），然后重启后端。"
