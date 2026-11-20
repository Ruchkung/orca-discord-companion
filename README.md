# Discord Companion for Orca

See the voice room, participant count, and microphone state from Discord Desktop in Orca on macOS. Click the status bar item to switch to the active call. Open the **Discord** sidebar to see the participant list and mute or unmute your mic.

## Install

1. Use Orca Desktop 1.4.266 or later on macOS. Install Discord Desktop and set its interface language to English.
2. From this folder, run `orca plugin dev load . --json`. Review the trusted worker approval, then run the approval command Orca prints.
3. If Orca cannot read Discord, enable Orca in macOS **System Settings → Privacy & Security → Accessibility**.
4. Open a Discord window. Join a voice room and open the call view to check the participant list in Orca.

The plugin reads the Discord window through Orca’s macOS Accessibility integration. It keeps the current call state in memory. It uses no bot, Discord token, or network service.

Discord supplies the room and roster through its visible accessibility controls. Orca omits the count when the participant list is unavailable. The connection can remain active after you switch to another Discord view.

**Pop out stream** appears when Discord exposes its native pop-out button in the call view. Use Discord’s **Stay On Top** control to keep the pop-out above Orca.

## When Discord is unavailable

- If Discord is closed, select **Open Discord** in the sidebar. The sidebar reads Discord again as its window becomes available.
- If Discord has no accessible window, restore or open a window.
- If macOS blocks access, enable Orca in **System Settings → Privacy & Security → Accessibility**.
- The status bar item appears while you are in a voice room. On Windows and Linux, the sidebar displays the macOS requirement.

## Windows development

The worker and panel share the state types in `src/protocol.ts`. The desktop adapter in `src/discord-desktop.ts` currently runs only on macOS, and `src/accessibility.ts` parses its accessibility tree.

On a Windows machine with Orca and Discord Desktop, run these read-only probes before adding the Windows adapter.

```powershell
orca.exe computer capabilities --json
orca.exe computer list-apps --json
orca.exe computer get-app-state --app Discord --no-screenshot --json
```

Use the app selector returned by `list-apps` if the name differs. Inspect the tree with Discord idle and while connected to a voice room. Redact names, IDs, and unrelated window content before saving fixtures. Check room and roster updates, mute and unmute, opening the current room, and recovery after Discord closes or returns from the system tray.

## Check changes

```sh
npm ci
orca plugin types . --json
npm run typecheck
orca plugin validate . --json
orca plugin test . --json
orca plugin check . --json
```
