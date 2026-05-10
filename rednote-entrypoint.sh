#!/bin/sh
set -eu

is_truthy() {
  case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|on)
      return 0
      ;;
    0|false|no|off)
      return 1
      ;;
    *)
      [ "${2:-true}" = "true" ]
      ;;
  esac
}

DEFAULT_UID="$(id -u node)"
DEFAULT_GID="$(id -g node)"
TARGET_UID="${PUID:-$DEFAULT_UID}"
TARGET_GID="${PGID:-$DEFAULT_GID}"

case "$TARGET_UID" in
  ''|*[!0-9]*)
    TARGET_UID="$DEFAULT_UID"
    ;;
esac

case "$TARGET_GID" in
  ''|*[!0-9]*)
    TARGET_GID="$DEFAULT_GID"
    ;;
esac

if [ "$(id -u)" = "0" ]; then
  mkdir -p /data/downloads /data/config "${DOUYIN_DOWNLOADER_OUTPUT_DIR:-${DOWNLOAD_DIR:-/data/downloads}/douyin}"

  chown "$TARGET_UID:$TARGET_GID" /data /data/downloads /data/config "${DOUYIN_DOWNLOADER_OUTPUT_DIR:-${DOWNLOAD_DIR:-/data/downloads}/douyin}" 2>/dev/null || true

  if [ -e /data/config/.rednote-config.json ]; then
    chown "$TARGET_UID:$TARGET_GID" /data/config/.rednote-config.json 2>/dev/null || true
  fi

  if [ -e /data/config/.rednote-state.json ]; then
    chown "$TARGET_UID:$TARGET_GID" /data/config/.rednote-state.json 2>/dev/null || true
  fi

  echo "[startup] runtime uid:gid -> ${TARGET_UID}:${TARGET_GID}"
  exec su-exec "$TARGET_UID:$TARGET_GID" "$0" "$@"
fi

if [ -n "${PUID:-}" ] || [ -n "${PGID:-}" ]; then
  echo "[startup] PUID/PGID provided but ignored because the container is not running as root" >&2
fi

mkdir -p /data/downloads /data/config "${DOUYIN_DOWNLOADER_OUTPUT_DIR:-${DOWNLOAD_DIR:-/data/downloads}/douyin}" 2>/dev/null || true

if is_truthy "${DOUYIN_INTERNAL_DOWNLOADER_ENABLED:-true}" true; then
  export DOUYIN_PATH="${DOUYIN_PATH:-${DOUYIN_DOWNLOADER_OUTPUT_DIR:-${DOWNLOAD_DIR:-/data/downloads}/douyin}}"
  export DOUYIN_DOWNLOADER_BASE_URL="${DOUYIN_DOWNLOADER_BASE_URL:-http://127.0.0.1:${DOUYIN_INTERNAL_DOWNLOADER_PORT:-8000}}"
  export DOUYIN_DOWNLOADER_OUTPUT_DIR="${DOUYIN_DOWNLOADER_OUTPUT_DIR:-$DOUYIN_PATH}"
  export DOUYIN_INTERNAL_DOWNLOADER_ENABLED=true
  echo "[startup] internal Douyin downloader -> ${DOUYIN_DOWNLOADER_BASE_URL}"
  /usr/local/bin/start-internal-douyin.sh &
  DOUYIN_PID="$!"

  stop_children() {
    if [ -n "${NODE_PID:-}" ]; then
      kill "$NODE_PID" 2>/dev/null || true
    fi
    kill "$DOUYIN_PID" 2>/dev/null || true
  }
  trap stop_children INT TERM

  docker-entrypoint.sh "$@" &
  NODE_PID="$!"

  while :; do
    if ! kill -0 "$NODE_PID" 2>/dev/null; then
      set +e
      wait "$NODE_PID"
      status="$?"
      set -e
      kill "$DOUYIN_PID" 2>/dev/null || true
      wait "$DOUYIN_PID" 2>/dev/null || true
      exit "$status"
    fi

    if ! kill -0 "$DOUYIN_PID" 2>/dev/null; then
      set +e
      wait "$DOUYIN_PID"
      status="$?"
      set -e
      kill "$NODE_PID" 2>/dev/null || true
      wait "$NODE_PID" 2>/dev/null || true
      exit "${status:-1}"
    fi

    sleep 1
  done
fi

exec docker-entrypoint.sh "$@"
