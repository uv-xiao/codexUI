# Feature: codexUI local extension host

## Prerequisites

- The codexUI branch contains the native Learning route and Jupyter proxy.
- The notes repository contains `packages/codexui-notes-extension/codexui.extension.json` and `codexui.learning.toml`.
- `.codexui/extensions.json` points at the notes extension package and sets `settings.learningConfig` to the notes repository's `codexui.learning.toml`.
- The notes extension manifest includes a sidebar `itemsUrl` such as `/codex-api/learning/notes/sidebar`.

## Actions

1. Run `corepack pnpm run dev --host 0.0.0.0 --port 4173`.
2. Open the direct server URL in local Safari, for example `http://<server-ip>:4173`.
3. Confirm the sidebar shows `Learning`.
4. Click `Learning`.
5. Confirm the route changes to `#/extension/notes/home` and the embedded Learning page lists CS336.
6. Confirm `Learning` uses the same large icon-row treatment as `Skills` and `Automations`.
7. Confirm the sidebar shows the Learning-provided series tree under the `Learning` row.
8. Click the CS336 series row and confirm the right pane updates without changing away from `#/extension/notes/home`.
9. Click a CS336 note row and confirm the same right pane renders that note content.
10. Click `Notebook 7` and confirm the notebook opens inside the codexUI Learning pane, not in a new browser tab.
11. Use Back, click `JupyterLab`, and confirm JupyterLab also opens inside the codexUI Learning pane.
12. Click `Learning` again and confirm the Learning tree folds while Projects and Chats move up and remain usable.
13. Rename `.codexui/extensions.json` temporarily and refresh.
14. Confirm codexUI still starts and the normal chat, Skills, and Automations routes still work.
15. Restore `.codexui/extensions.json`, then set the notes extension path to a missing directory and refresh.
16. Confirm a sidebar extension-load error appears without breaking codexUI.

## Expected Results

- Enabled extensions register sidebar and route entries.
- Extension-provided sidebar item URLs populate nested sidebar rows.
- Extension sidebar entries use the same visual treatment as Skills and Automations.
- Clicking an active extension sidebar entry folds or unfolds its nested rows so they stay out of the way of Projects and Chats.
- Nested extension sidebar selection updates the stable extension pane through state, without creating per-note codexUI routes.
- Notebook 7 and JupyterLab stay embedded inside the codexUI extension pane.
- Disabled or missing extension config leaves codexUI usable.
- Broken extension paths show a visible error and do not block other routes.
- Deployment-style checks use the direct server URL from local Safari, not Tailscale.

## Rollback / Cleanup

- Restore `.codexui/extensions.json`.
- Stop only the verification `4173` process if it was started for this test.
