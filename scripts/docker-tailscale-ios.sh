#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACTION="${1:-up}"

case "$ACTION" in
  up)
    shift || true
    exec "$SCRIPT_DIR/codexui-deploy.sh" up-tailscale "$@"
    ;;
  serve)
    shift || true
    exec "$SCRIPT_DIR/codexui-deploy.sh" serve-tailscale "$@"
    ;;
  status)
    shift || true
    exec "$SCRIPT_DIR/codexui-deploy.sh" status-tailscale "$@"
    ;;
  down|logs|restart-tailscale|host-logs|auth-url|stop-tailscale)
    exec "$SCRIPT_DIR/codexui-deploy.sh" "$@"
    ;;
  *)
    printf 'Usage: %s [up|serve|status|logs|restart-tailscale|host-logs|auth-url|down|stop-tailscale]\n' "$0" >&2
    exit 2
    ;;
esac
