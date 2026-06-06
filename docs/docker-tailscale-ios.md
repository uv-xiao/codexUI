# CodexUI Direct and Docker Tailscale Deployment

This workflow runs codexUI on the host. Direct Mac/browser access is the default path. Docker Tailscale is an optional iOS/tailnet path that is enabled only through the Tailscale-specific wrapper.

## Why This Shape

The server does not have host-level Tailscale access, so Tailscale still runs in Docker. Codex and codexUI stay on the host so they use the normal host runtime:

- host `~/.codex/auth.json`
- host session index and state DB
- host proxy environment from `~/.zshrc`
- host filesystem paths
- host CA certificates

The common deploy script starts host codexUI in a tmux session named `codexui-host`, bound by default to the server's default-route address, such as `115.27.161.184`. That URL is the one to open from Mac Safari when the network allows direct access. The Tailscale wrapper starts the same host codexUI process, then serves that host URL through the tailnet.

```text
iOS Safari
  -> https://codexui-ios.<tailnet>.ts.net
  -> Docker Tailscale Serve
  -> http://<host-ip>:5900
  -> host codexUI
  -> host Codex app-server
```

This avoids running a second Codex runtime inside Docker.

## Direct Mac/Browser Access

```bash
scripts/codexui-deploy.sh up
```

The direct script builds the host codexUI bundle by default, starts host codexUI in tmux, stops any Docker Tailscale container for this workflow, and prints a direct URL such as:

```text
http://115.27.161.184:5900
```

If the requested port is occupied, codexUI automatically uses the next available port and the deploy script prints that effective URL, for example `http://115.27.161.184:5901`.

Use that direct URL from Mac Safari. Do not use `127.0.0.1` unless you are intentionally using SSH forwarding, and do not use a private WireGuard address such as `10.101.0.11` unless your Mac can route to that network.

By default, direct deployment keeps password protection enabled and prints the password file path. For trusted private deployments only, set `CODEXUI_NO_PASSWORD=1`.

## Tailscale iOS Access

```bash
scripts/docker-tailscale-ios.sh up
```

The Tailscale wrapper starts host codexUI, starts the Docker Tailscale container, and configures Tailscale Serve. This is the path to use for iPhone or iPad Safari through the tailnet.

If `TS_AUTHKEY` is not set, the script prints a Tailscale login URL. Open it once, then run:

```bash
scripts/docker-tailscale-ios.sh serve
```

With an auth key:

```bash
TS_AUTHKEY='tskey-auth-...' scripts/docker-tailscale-ios.sh up
```

Useful overrides:

```bash
TS_HOSTNAME=codexui-ios scripts/docker-tailscale-ios.sh up
CODEXUI_PROJECT_PATH=/home/uvxiao/codexUI scripts/docker-tailscale-ios.sh up
CODEXUI_HOST_BIND=115.27.161.184 CODEXUI_HOST_PORT=5900 scripts/codexui-deploy.sh up
CODEXUI_BUILD_ON_UP=0 scripts/docker-tailscale-ios.sh up
```

## Access

For iOS through Tailscale, open the HTTPS MagicDNS URL printed by:

```bash
scripts/docker-tailscale-ios.sh status
```

The wrapper also configures plain HTTP fallbacks for Safari/Tailscale debugging:

```text
http://codexui-ios.tail27dc02.ts.net/
http://codexui-ios.tail27dc02.ts.net:8080/
```

If iOS shows a blank or endlessly loading page, run `scripts/docker-tailscale-ios.sh status` and check whether the iPhone is active in Tailscale. If the Tailscale path looks stale or the port is refused, run `scripts/docker-tailscale-ios.sh restart-tailscale` and retry the HTTP `:8080` URL.

For Mac without Tailscale, use the direct URL printed by `scripts/codexui-deploy.sh up` or `scripts/codexui-deploy.sh status`. The Mac Dock app asks the server for that current direct URL before opening, so it also handles fallback ports such as `5901`.

## Mac Dock App

The repo includes a Mac-side AppleScript controller at:

```text
scripts/macos-codexui-control.applescript
```

Copy or check out this repo on the Mac, then compile it into an app:

```bash
osacompile -o ~/Applications/CodexUI.app scripts/macos-codexui-control.applescript
```

Drag `~/Applications/CodexUI.app` to the Dock. The app provides buttons for:

- `Open CodexUI`: opens the current direct host URL reported by the server.
- `Test Direct`: checks the host codexUI HTTP endpoint and prints the direct URL.
- `Restart Direct`: restarts host codexUI and stops the Docker Tailscale workflow.
- `Restart With Tailscale`: restarts host codexUI and explicitly enables Docker Tailscale Serve.
- `Test Tailscale`: runs the Tailscale status command.
- `Stop All`: stops host codexUI and Docker Tailscale.
- `Open iOS URL`: opens the Tailscale Serve URL.

The app assumes these defaults:

```text
SSH target:     uvxiao@115.27.161.184
Remote repo:    /home/uvxiao/codexUI
Direct UI:      http://115.27.161.184:5900
Tailscale URL:  https://codexui-ios.tail27dc02.ts.net
```

If any value changes, edit the `property` lines at the top of `scripts/macos-codexui-control.applescript` and run `osacompile` again.

If `Open CodexUI` cannot reach the direct URL, run `Test Direct`. If the server-side status succeeds but Safari still cannot connect, the remaining issue is network or firewall access to the direct host port.

## Maintenance

```bash
scripts/codexui-deploy.sh status
scripts/codexui-deploy.sh down
scripts/docker-tailscale-ios.sh status
scripts/docker-tailscale-ios.sh host-logs
scripts/docker-tailscale-ios.sh logs
scripts/docker-tailscale-ios.sh restart-tailscale
scripts/docker-tailscale-ios.sh down
```

`scripts/codexui-deploy.sh down` stops the Docker Tailscale container and the host `codexui-host` tmux session. The Tailscale node identity is stored in Docker volume `codexui-tailscale-state`, so restarts should not create a new tailnet device after authentication.
