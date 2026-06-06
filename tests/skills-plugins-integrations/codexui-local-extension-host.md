# Feature: codexUI local extension host

## Prerequisites

- Branch `codex/learning-sidebar-state` is checked out in `/home/uvxiao/codexUI`.
- The notes runtime is running from `/home/uvxiao/.codex/worktrees/bdcd/notes` with `pixi run web-dev`.
- `.codexui/extensions.json` points at the notes extension package and a reachable notes runtime URL.
- The notes extension manifest includes a sidebar `itemsUrl` such as `/api/codexui/sidebar`.

## Actions

1. Run `corepack pnpm run dev --host 0.0.0.0 --port 4173`.
2. Open the direct server URL in local Safari, for example `http://<server-ip>:4173`.
3. Confirm the sidebar shows `Learning`.
4. Click `Learning`.
5. Confirm the route changes to `#/extension/notes/home` and the embedded Learning page lists CS336.
6. Confirm the sidebar shows the Learning-provided series tree under the `Learning` entry.
7. Click the CS336 series row and confirm the right pane updates without changing away from `#/extension/notes/home`.
8. Click a CS336 note row and confirm the same right pane renders that note content.
9. Click the top `Learning` entry again and confirm the right pane returns to the all-series list.
10. Rename `.codexui/extensions.json` temporarily and refresh.
11. Confirm codexUI still starts and the normal chat, Skills, and Automations routes still work.
12. Restore `.codexui/extensions.json`, then set the notes extension path to a missing directory and refresh.
13. Confirm a sidebar extension-load error appears without breaking codexUI.

## Expected Results

- Enabled extensions register sidebar and route entries.
- Extension-provided sidebar item URLs populate nested sidebar rows.
- Nested extension sidebar selection updates the stable extension pane through state, without creating per-note codexUI routes.
- Disabled or missing extension config leaves codexUI usable.
- Broken extension paths show a visible error and do not block other routes.
- Deployment-style checks use the direct server URL from local Safari, not Tailscale.

## Rollback / Cleanup

- Restore `.codexui/extensions.json`.
- Stop only the verification `4173` process if it was started for this test.
