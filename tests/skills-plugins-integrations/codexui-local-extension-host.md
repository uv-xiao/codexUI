# Feature: codexUI local extension host

## Prerequisites

- Branch `codex/extension-host-api` is checked out in `/home/uvxiao/codexUI`.
- The notes runtime is running from `/home/uvxiao/.codex/worktrees/bdcd/notes` with `pixi run web-dev`.
- `.codexui/extensions.json` points at the notes extension package and a reachable notes runtime URL.

## Actions

1. Run `corepack pnpm run dev --host 0.0.0.0 --port 4173`.
2. Open the direct server URL in local Safari, for example `http://<server-ip>:4173`.
3. Confirm the sidebar shows `Learning`.
4. Click `Learning`.
5. Confirm the route changes to `#/extension/notes/home` and the embedded Learning page lists CS336.
6. Rename `.codexui/extensions.json` temporarily and refresh.
7. Confirm codexUI still starts and the normal chat, Skills, and Automations routes still work.
8. Restore `.codexui/extensions.json`, then set the notes extension path to a missing directory and refresh.
9. Confirm a sidebar extension-load error appears without breaking codexUI.

## Expected Results

- Enabled extensions register sidebar and route entries.
- Disabled or missing extension config leaves codexUI usable.
- Broken extension paths show a visible error and do not block other routes.
- Deployment-style checks use the direct server URL from local Safari, not Tailscale.

## Rollback / Cleanup

- Restore `.codexui/extensions.json`.
- Stop only the verification `4173` process if it was started for this test.
