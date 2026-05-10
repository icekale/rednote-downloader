#!/bin/sh
set -eu

case "$(printf '%s' "${DOUYIN_INTERNAL_DOWNLOADER_ENABLED:-true}" | tr '[:upper:]' '[:lower:]')" in
  0|false|no|off)
    exit 0
    ;;
esac

export DOUYIN_PATH="${DOUYIN_PATH:-${DOUYIN_DOWNLOADER_OUTPUT_DIR:-${DOWNLOAD_DIR:-/data/downloads}/douyin}}"
export DOUYIN_DOWNLOADER_BASE_URL="${DOUYIN_DOWNLOADER_BASE_URL:-http://127.0.0.1:${DOUYIN_INTERNAL_DOWNLOADER_PORT:-8000}}"
export DOUYIN_DOWNLOADER_OUTPUT_DIR="${DOUYIN_DOWNLOADER_OUTPUT_DIR:-$DOUYIN_PATH}"
export DOUYIN_INTERNAL_DOWNLOADER_ENABLED=true

mkdir -p "$DOUYIN_PATH"

PYTHON_BIN="${DOUYIN_PYTHON_BIN:-/opt/douyin-venv/bin/python}"
if [ ! -x "$PYTHON_BIN" ]; then
  PYTHON_BIN=python3
fi

cd /opt/douyin-downloader
exec "$PYTHON_BIN" run.py \
  --serve \
  --serve-host 127.0.0.1 \
  --serve-port "${DOUYIN_INTERNAL_DOWNLOADER_PORT:-8000}" \
  --path "$DOUYIN_PATH"
