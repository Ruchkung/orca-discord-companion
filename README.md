# Discord Companion for Orca

See your Discord Desktop voice room, its participants, and your microphone state in Orca on macOS and Windows. Mute or unmute from the **Discord** sidebar while Discord stays minimized or in the system tray. Click the status bar item to switch to the active call.

## Install

1. Use Orca Desktop 1.4.266 or later on macOS or Windows, and install Discord Desktop.
2. From this folder, run `orca plugin dev load . --json`. Review the trusted worker approval, then run the approval command Orca prints.
3. Create a Discord application. See [Connect a Discord application](#connect-a-discord-application).
4. Open the **Discord** sidebar, enter the application ID and client secret, and select **Connect to Discord**.
5. Select **Authorize** in the window Discord shows.

## Connect a Discord application

The plugin talks to Discord Desktop through Discord’s local RPC interface. Discord grants RPC voice control only to approved partners and to the testers of an unapproved application, so each person connects an application they own or test.

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and create an application.
2. Under **OAuth2 → Redirects**, add `http://localhost`.
3. Copy the **Application ID** from **General Information** and a client secret from **OAuth2 → Reset Secret**.
4. To share the application, add up to 50 people under **App Testers**. Each tester connects with the same ID and secret. Testers follow the Thai guide in [docs/tester-guide.pdf](docs/tester-guide.pdf) ([.docx](docs/tester-guide.docx)).

Orca stores the ID, secret, and Discord access token in the plugin’s encrypted secrets. The worker sends the secret and authorization code to `discord.com` only to get and refresh the access token. The plugin uses no bot and keeps the call state in memory.

## What the sidebar does

- **Mute mic** and **Unmute mic** change Discord’s microphone without bringing its window forward.
- **Switch to voice room** shows Discord’s window, including from the system tray, and opens the current call with a `discord://` link.
- **Pop out call** presses Discord’s **Pop Out** control in the call view through Orca’s accessibility integration. Open the call in Discord first. On macOS, enable Orca in **System Settings → Privacy & Security → Accessibility**. On Windows, Discord exposes the control only when it starts with `--force-renderer-accessibility`. **Open Discord** in the sidebar starts it that way.
- Discord reports microphone, room, and speaking changes as they happen. The person speaking is highlighted and marked **Speaking**. The sidebar also checks Discord every 2.5 seconds for roster changes.

## When Discord is unavailable

- If Discord is closed, select **Open Discord** in the sidebar.
- If Discord rejects the saved authorization, select **Authorize in Discord**.
- If Discord rejects the application ID or client secret, the sidebar asks for them again.
- Discord slows its answer when one application connects many times in a row. The sidebar keeps its last state until Discord answers.

## Development

The worker and panel share the state types in `src/protocol.ts`. `src/rpc.ts` speaks Discord’s IPC framing over the `discord-ipc-N` pipe. `src/discord-desktop.ts` holds authorization, voice state, and the macOS and Windows launch details. `src/accessibility.ts` finds the Pop Out control in Orca’s accessibility snapshot.

The tests in `src/discord-desktop.test.ts` run a stand-in Discord on a real pipe or Unix socket.

## Check changes

```sh
npm ci
orca plugin types . --json
npm run typecheck
orca plugin validate . --json
orca plugin test . --json
orca plugin check . --json
```
