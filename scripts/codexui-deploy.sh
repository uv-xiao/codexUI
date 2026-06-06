#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/compose/docker-compose.ios-tailscale.yml"
ACTION="${1:-up}"
if [[ "${2:-}" == "--tailscale" ]]; then
  ACTION="${ACTION}-tailscale"
  shift
fi

CODEXUI_HOST_PORT="${CODEXUI_HOST_PORT:-5900}"
CODEXUI_HOST_BIND="${CODEXUI_HOST_BIND:-auto}"
CODEXUI_HOST_SESSION="${CODEXUI_HOST_SESSION:-codexui-host}"
CODEXUI_PROJECT_PATH="${CODEXUI_PROJECT_PATH:-/home/uvxiao/codexUI}"
CODEXUI_BUILD_ON_UP="${CODEXUI_BUILD_ON_UP:-1}"
CODEXUI_NO_PASSWORD="${CODEXUI_NO_PASSWORD:-0}"
CODEXUI_TAILSCALE_HTTP_PORT="${CODEXUI_TAILSCALE_HTTP_PORT:-8080}"
CODEXUI_TAILSCALE_ENABLE_HTTP_80="${CODEXUI_TAILSCALE_ENABLE_HTTP_80:-1}"

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

default_route_addr() {
  ip -4 route get 1.1.1.1 2>/dev/null \
    | awk '{ for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit } }'
}

fallback_host_addr() {
  hostname -I 2>/dev/null \
    | tr ' ' '\n' \
    | awk '
      /^127\./ { next }
      /^172\.17\./ { next }
      NF { print; exit }
    '
}

host_bind_addr() {
  if [[ "$CODEXUI_HOST_BIND" != "auto" ]]; then
    printf '%s\n' "$CODEXUI_HOST_BIND"
    return 0
  fi

  local addr
  addr="$(default_route_addr || true)"
  if [[ -n "$addr" ]]; then
    printf '%s\n' "$addr"
    return 0
  fi
  fallback_host_addr
}

host_url() {
  local port="${1:-$CODEXUI_HOST_PORT}"
  printf 'http://%s:%s\n' "$(host_bind_addr)" "$port"
}

effective_host_port() {
  local output port
  output="$(tmux capture-pane -pt "$CODEXUI_HOST_SESSION":0 -S -200 2>/dev/null || true)"
  port="$(
    printf '%s\n' "$output" \
      | sed -n 's/.*Requested port [0-9][0-9]* was unavailable; using \([0-9][0-9]*\).*/\1/p' \
      | tail -1
  )"
  if [[ -z "$port" ]]; then
    port="$(
      printf '%s\n' "$output" \
        | sed -n 's/.*Local:[[:space:]]*http:\/\/[^:]*:\([0-9][0-9]*\).*/\1/p' \
        | tail -1
    )"
  fi
  printf '%s\n' "${port:-$CODEXUI_HOST_PORT}"
}

effective_host_url() {
  host_url "$(effective_host_port)"
}

print_direct_urls() {
  local url
  url="$(effective_host_url)"
  printf 'Direct Mac/browser URL: %s\n' "$url"
  if [[ "$CODEXUI_NO_PASSWORD" != "1" ]]; then
    printf 'Password file: %s\n' "${CODEX_HOME:-$HOME/.codex}/codexui-password"
  fi
}

tailscale_cli() {
  compose exec -T tailscale tailscale --socket=/tmp/tailscaled.sock "$@"
}

wait_for_host_codexui() {
  local output url
  for _ in {1..30}; do
    output="$(tmux capture-pane -pt "$CODEXUI_HOST_SESSION":0 -S -200 2>/dev/null || true)"
    if printf '%s\n' "$output" | grep -Eq 'Codex Web Local is running|Requested port|Local:[[:space:]]*http://'; then
      url="$(effective_host_url)"
      if curl --noproxy '*' -fsSI "$url/" >/dev/null; then
        return 0
      fi
    fi
    sleep 1
  done

  tmux capture-pane -pt "$CODEXUI_HOST_SESSION":0 -S -200 2>/dev/null || true
  url="$(effective_host_url)"
  curl --noproxy '*' -fsSI "$url/" >/dev/null
}

start_host_codexui() {
  local bind_addr
  bind_addr="$(host_bind_addr)"
  if [[ -z "$bind_addr" ]]; then
    printf 'Could not detect a host IP for codexUI. Set CODEXUI_HOST_BIND explicitly.\n' >&2
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

  local password_args=()
  if [[ "$CODEXUI_NO_PASSWORD" == "1" ]]; then
    password_args+=(--no-password)
  fi

  tmux kill-session -t "$CODEXUI_HOST_SESSION" 2>/dev/null || true
  tmux new-session -d -s "$CODEXUI_HOST_SESSION" \
    "export PATH='$PATH'; cd '$REPO_ROOT' && exec '$node_bin' dist-cli/index.js --no-tunnel --no-open --no-login ${password_args[*]} --port '$CODEXUI_HOST_PORT' '$CODEXUI_PROJECT_PATH'"
  wait_for_host_codexui
  printf 'host codexUI is reachable at %s\n' "$(effective_host_url)"
}

stop_host_codexui() {
  tmux kill-session -t "$CODEXUI_HOST_SESSION" 2>/dev/null || true
}

stop_tailscale() {
  compose down --remove-orphans >/dev/null 2>&1 || true
}

host_codexui_status() {
  if tmux has-session -t "$CODEXUI_HOST_SESSION" 2>/dev/null; then
    printf 'host codexUI tmux session: %s\n' "$CODEXUI_HOST_SESSION"
  else
    printf 'host codexUI tmux session: not running\n'
  fi
  curl --noproxy '*' -fsSI "$(effective_host_url)/" | sed -n '1,12p'
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

serve_tailscale() {
  local target
  target="$(effective_host_url)"
  tailscale_cli serve --bg "$target"
  if [[ "$CODEXUI_TAILSCALE_ENABLE_HTTP_80" == "1" ]]; then
    tailscale_cli serve --http=80 --bg "$target"
  fi
  if [[ -n "$CODEXUI_TAILSCALE_HTTP_PORT" && "$CODEXUI_TAILSCALE_HTTP_PORT" != "80" ]]; then
    tailscale_cli serve --http="$CODEXUI_TAILSCALE_HTTP_PORT" --bg "$target"
  fi
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

start_tailscale() {
  compose up -d --remove-orphans
  if [[ "$(tailscale_backend_state)" != "Running" ]]; then
    tailscale_up || true
  fi
  if [[ "$(tailscale_backend_state)" == "Running" ]]; then
    serve_tailscale
  else
    wait_for_auth_url >/dev/null 2>&1 || true
    print_auth_url
    printf 'After authenticating, run: %s serve-tailscale\n' "$0"
  fi
}

tailscale_status() {
  compose ps
  printf 'Tailscale target: %s\n' "$(effective_host_url)"
  if ! compose ps --status running --services 2>/dev/null | grep -qx 'tailscale'; then
    printf 'Tailscale container: not running\n'
    return 0
  fi
  tailscale_cli status || true
  tailscale_cli serve status || true
}

case "$ACTION" in
  up)
    start_host_codexui
    stop_tailscale
    print_direct_urls
    ;;
  up-tailscale)
    start_host_codexui
    start_tailscale
    print_direct_urls
    ;;
  serve-tailscale)
    wait_for_host_codexui
    serve_tailscale
    ;;
  status)
    host_codexui_status
    print_direct_urls
    ;;
  status-tailscale)
    host_codexui_status
    print_direct_urls
    tailscale_status
    ;;
  logs)
    compose logs --tail 200 -f
    ;;
  restart-tailscale)
    compose restart tailscale
    if [[ "$(tailscale_backend_state)" != "Running" ]]; then
      tailscale_up || true
    fi
    if [[ "$(tailscale_backend_state)" == "Running" ]]; then
      serve_tailscale
    else
      print_auth_url
    fi
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
    stop_tailscale
    stop_host_codexui
    ;;
  stop-tailscale)
    stop_tailscale
    ;;
  *)
    printf 'Usage: %s [up|up-tailscale|serve-tailscale|status|status-tailscale|logs|restart-tailscale|host-logs|auth-url|down|stop-tailscale]\n' "$0" >&2
    exit 2
    ;;
esac
