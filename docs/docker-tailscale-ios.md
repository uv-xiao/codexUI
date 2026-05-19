# Docker Tailscale iOS Deployment

This workflow runs codexUI on the host and uses Docker only for the Tailscale node that exposes it privately to iPhone or iPad Safari.

## Why This Shape

The server does not have host-level Tailscale access, so Tailscale still runs in Docker. Codex and codexUI stay on the host so they use the normal host runtime:

- host `~/.codex/auth.json`
- host session index and state DB
- host proxy environment from `~/.zshrc`
- host filesystem paths
- host CA certificates

The wrapper starts host codexUI in a tmux session named `codexui-host`, bound to an auto-detected non-loopback host IP such as `10.101.0.11`. The Tailscale container then serves that host URL through the tailnet.

```text
iOS Safari
  -> https://codexui-ios.<tailnet>.ts.net
  -> Docker Tailscale Serve
  -> http://<host-ip>:5900
  -> host codexUI
  -> host Codex app-server
```

This avoids running a second Codex runtime inside Docker.

## Start

```bash
scripts/docker-tailscale-ios.sh up
```

The script builds the host codexUI bundle by default, starts host codexUI in tmux, starts the Tailscale container, and configures Tailscale Serve.

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
CODEXUI_HOST_BIND=10.101.0.11 CODEXUI_HOST_PORT=5900 scripts/docker-tailscale-ios.sh up
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

Use this probe URL first when the main app appears blank or endlessly loads:

```text
http://codexui-ios.tail27dc02.ts.net:8080/ios-probe.html
```

If the probe page does not render, the failure is in the iPhone-to-Tailscale path before codexUI JavaScript starts. If the probe renders but the app is blank, check `scripts/docker-tailscale-ios.sh host-logs` for `/codex-api/debug-log` entries.

For Mac without Tailscale, use SSH forwarding:

```bash
ssh -N -L 15900:10.101.0.11:5900 uvxiao@115.27.161.184
```

Then open:

```text
http://127.0.0.1:15900
```

If `CODEXUI_HOST_BIND` changes, use that host IP in the SSH tunnel command.

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

- `Open CodexUI`: starts or reuses an SSH tunnel and opens `http://127.0.0.1:15900`.
- `Test status`: runs the server status command and checks the host codexUI HTTP endpoint.
- `Restart services`: restarts host codexUI and Docker Tailscale, then optionally opens the UI.
- `Stop services`: stops host codexUI and Docker Tailscale.
- `Open iOS URL`: opens the Tailscale Serve URL.

The app assumes these defaults:

```text
SSH target:     uvxiao@115.27.161.184
Remote repo:    /home/uvxiao/codexUI
Remote UI:      http://10.101.0.11:5900
Local tunnel:   http://127.0.0.1:15900
Tailscale URL:  https://codexui-ios.tail27dc02.ts.net
```

If any value changes, edit the `property` lines at the top of `scripts/macos-codexui-control.applescript` and run `osacompile` again.

If `Open CodexUI` opens a blank page, a stale process may already be listening on local port `15900`. The app checks the local HTTP endpoint before opening the browser and recreates the tunnel when the check fails. To clear it manually:

```bash
lsof -tiTCP:15900 -sTCP:LISTEN | xargs kill
```

Then reopen `CodexUI.app`.

## Maintenance

```bash
scripts/docker-tailscale-ios.sh status
scripts/docker-tailscale-ios.sh host-logs
scripts/docker-tailscale-ios.sh logs
scripts/docker-tailscale-ios.sh restart-tailscale
scripts/docker-tailscale-ios.sh down
```

`down` stops the Docker Tailscale container and the host `codexui-host` tmux session. The Tailscale node identity is stored in Docker volume `codexui-tailscale-state`, so restarts should not create a new tailnet device after authentication.
