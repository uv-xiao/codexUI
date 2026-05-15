#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/compose/docker-compose.ios-tailscale.yml"
ACTION="${1:-up}"

CODEXUI_HOST_PORT="${CODEXUI_HOST_PORT:-5900}"
CODEXUI_HOST_BIND="${CODEXUI_HOST_BIND:-auto}"
CODEXUI_HOST_SESSION="${CODEXUI_HOST_SESSION:-codexui-host}"
CODEXUI_PROJECT_PATH="${CODEXUI_PROJECT_PATH:-/home/uvxiao/codexUI}"
CODEXUI_BUILD_ON_UP="${CODEXUI_BUILD_ON_UP:-1}"

load_node_env() {
  if command -v node >/dev/null && (command -v pnpm >/dev/null || command -v corepack >/dev/null); then
    return 0
  fi
  if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    # shellcheck source=/dev/null
    . "$HOME/.nvm/nvm.sh"
  fi
}

run_host_build() {
  load_node_env
  PATH="$REPO_ROOT/node_modules/.bin:$PATH" npm run build:frontend
  PATH="$REPO_ROOT/node_modules/.bin:$PATH" npm run build:cli
}

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

host_bind_addr() {
  if [[ "$CODEXUI_HOST_BIND" != "auto" ]]; then
    printf '%s\n' "$CODEXUI_HOST_BIND"
    return 0
  fi

  hostname -I 2>/dev/null \
    | tr ' ' '\n' \
    | awk '
      /^10\./ { print; exit }
      /^192\.168\./ { print; exit }
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./ && $0 !~ /^172\.17\./ { print; exit }
    '
}

host_url() {
  printf 'http://%s:%s\n' "$(host_bind_addr)" "$CODEXUI_HOST_PORT"
}

tailscale_cli() {
  compose exec -T tailscale tailscale --socket=/tmp/tailscaled.sock "$@"
}

wait_for_host_codexui() {
  local url
  url="$(host_url)"
  for _ in {1..30}; do
    if curl -fsSI "$url/" >/dev/null; then
      return 0
    fi
    sleep 1
  done

  curl -fsSI "$url/" >/dev/null
}

start_host_codexui() {
  local bind_addr
  bind_addr="$(host_bind_addr)"
  if [[ -z "$bind_addr" ]]; then
    printf 'Could not detect a non-loopback host IP for codexUI. Set CODEXUI_HOST_BIND explicitly.\n' >&2
    return 1
  fi

  if [[ "$CODEXUI_BUILD_ON_UP" != "0" ]]; then
    (cd "$REPO_ROOT" && run_host_build)
  fi

  load_node_env
  local node_bin
  node_bin="$(command -v node)"
  if [[ -z "$node_bin" ]]; then
    printf 'node is not available in PATH.\n' >&2
    return 1
  fi

  tmux kill-session -t "$CODEXUI_HOST_SESSION" 2>/dev/null || true
  tmux new-session -d -s "$CODEXUI_HOST_SESSION" \
    "export PATH='$PATH'; cd '$REPO_ROOT' && exec '$node_bin' dist-cli/index.js --no-tunnel --no-open --no-login --no-password --host '$bind_addr' --port '$CODEXUI_HOST_PORT' '$CODEXUI_PROJECT_PATH'"
  wait_for_host_codexui
  printf 'host codexUI is reachable at %s\n' "$(host_url)"
}

stop_host_codexui() {
  tmux kill-session -t "$CODEXUI_HOST_SESSION" 2>/dev/null || true
}

host_codexui_status() {
  if tmux has-session -t "$CODEXUI_HOST_SESSION" 2>/dev/null; then
    printf 'host codexUI tmux session: %s\n' "$CODEXUI_HOST_SESSION"
  else
    printf 'host codexUI tmux session: not running\n'
  fi
  curl -fsSI "$(host_url)/" | sed -n '1,12p'
}

print_auth_url() {
  local auth_url
  auth_url="$(tailscale_auth_url || true)"

  if [[ -n "$auth_url" ]]; then
    printf 'Tailscale auth URL: %s\n' "$auth_url"
  else
    printf 'No Tailscale auth URL found yet. Check: %s logs\n' "$0"
  fi
}

serve() {
  local target
  target="$(host_url)"
  tailscale_cli serve --bg "$target"
  tailscale_cli serve status
}

tailscale_up() {
  local args=(up --hostname "${TS_HOSTNAME:-codexui-ios}")
  if [[ -n "${TS_AUTHKEY:-}" ]]; then
    args+=(--auth-key "$TS_AUTHKEY")
    tailscale_cli "${args[@]}"
  else
    timeout 12s docker compose -f "$COMPOSE_FILE" exec -T tailscale \
      tailscale --socket=/tmp/tailscaled.sock "${args[@]}"
  fi
}

tailscale_backend_state() {
  tailscale_cli status --json 2>/dev/null \
    | node -e "let data=''; process.stdin.on('data', c => data += c); process.stdin.on('end', () => { try { process.stdout.write(JSON.parse(data).BackendState || '') } catch {} })"
}

tailscale_auth_url() {
  local auth_url
  auth_url="$(
    tailscale_cli status --json 2>/dev/null \
      | node -e "let data=''; process.stdin.on('data', c => data += c); process.stdin.on('end', () => { try { process.stdout.write(JSON.parse(data).AuthURL || '') } catch {} })"
  )"
  if [[ -n "$auth_url" ]]; then
    printf '%s\n' "$auth_url"
    return 0
  fi

  compose logs --no-color --tail 200 tailscale 2>/dev/null \
    | sed -n 's/.*\(https:\/\/login\.tailscale\.com\/a\/[[:alnum:]]*\).*/\1/p' \
    | tail -1
}

wait_for_auth_url() {
  local auth_url
  for _ in {1..20}; do
    auth_url="$(tailscale_auth_url || true)"
    if [[ -n "$auth_url" ]]; then
      printf '%s\n' "$auth_url"
      return 0
    fi
    sleep 1
  done
  return 1
}

case "$ACTION" in
  up)
    start_host_codexui
    compose up -d --remove-orphans
    if [[ "$(tailscale_backend_state)" != "Running" ]]; then
      tailscale_up || true
    fi
    if [[ "$(tailscale_backend_state)" == "Running" ]]; then
      serve
    else
      wait_for_auth_url >/dev/null 2>&1 || true
      print_auth_url
      printf 'After authenticating, run: %s serve\n' "$0"
    fi
    ;;
  serve)
    wait_for_host_codexui
    serve
    ;;
  status)
    compose ps
    host_codexui_status
    printf 'Tailscale target: %s\n' "$(host_url)"
    tailscale_cli status || true
    tailscale_cli serve status || true
    ;;
  logs)
    compose logs --tail 200 -f
    ;;
  host-logs)
    tmux capture-pane -pt "$CODEXUI_HOST_SESSION" -S -200
    ;;
  auth-url)
    if [[ "$(tailscale_backend_state)" != "Running" ]]; then
      tailscale_up || true
    fi
    print_auth_url
    ;;
  down)
    compose down --remove-orphans
    stop_host_codexui
    ;;
  *)
    printf 'Usage: %s [up|serve|status|logs|host-logs|auth-url|down]\n' "$0" >&2
    exit 2
    ;;
esac
