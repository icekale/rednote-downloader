#!/bin/sh
set -eu

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
  mkdir -p /data/downloads /data/config

  chown "$TARGET_UID:$TARGET_GID" /data /data/downloads /data/config 2>/dev/null || true

  if [ -e /data/config/.rednote-config.json ]; then
    chown "$TARGET_UID:$TARGET_GID" /data/config/.rednote-config.json 2>/dev/null || true
  fi

  if [ -e /data/config/.rednote-state.json ]; then
    chown "$TARGET_UID:$TARGET_GID" /data/config/.rednote-state.json 2>/dev/null || true
  fi

  echo "[startup] runtime uid:gid -> ${TARGET_UID}:${TARGET_GID}"
  exec su-exec "$TARGET_UID:$TARGET_GID" docker-entrypoint.sh "$@"
fi

if [ -n "${PUID:-}" ] || [ -n "${PGID:-}" ]; then
  echo "[startup] PUID/PGID provided but ignored because the container is not running as root" >&2
fi

mkdir -p /data/downloads /data/config 2>/dev/null || true
exec docker-entrypoint.sh "$@"
