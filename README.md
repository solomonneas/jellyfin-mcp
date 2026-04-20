# jellyfin-mcp

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green?logo=node.js)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-1.x-purple)](https://modelcontextprotocol.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An MCP (Model Context Protocol) server for [Jellyfin](https://jellyfin.org). Exposes Jellyfin's management and playback control surface to LLMs — list who's watching what, pause a session, scan a library, run a scheduled task, or message a client, all as typed tool calls.

Companion to [media-cli](https://github.com/solomonneas/media-cli) (the *arr stack CLI). media-cli handles acquiring content; jellyfin-mcp handles serving, monitoring, and controlling playback.

## Features

- **20 MCP tools** covering system info, libraries, users, sessions, items, and scheduled tasks
- Playback control: pause / resume / stop / send-message to any active session
- Library scan triggering (per-library or all)
- User admin: list, create, delete, enable/disable, reset password
- Activity log queries for recent events
- Works with Claude Desktop, Claude Code, any MCP-compatible client

## Tools

### System
- `jellyfin_get_status` — server name, version, OS, pending restart, update availability
- `jellyfin_restart_server` — restart the Jellyfin process
- `jellyfin_shutdown_server` — stop the Jellyfin process

### Libraries
- `jellyfin_list_libraries` — all virtual folders with IDs, collection types, paths
- `jellyfin_scan_library` — trigger scan for one library or all

### Users
- `jellyfin_list_users` — with admin / disabled flags and last login timestamps
- `jellyfin_create_user`
- `jellyfin_delete_user`
- `jellyfin_set_user_disabled`
- `jellyfin_set_user_password`

### Sessions & Playback
- `jellyfin_list_sessions` — active/idle clients with now-playing, progress, paused state
- `jellyfin_pause_session`
- `jellyfin_resume_session`
- `jellyfin_stop_session`
- `jellyfin_send_message_to_session` — toast/dialog on the client

### Items
- `jellyfin_search_items` — by name, optional type filter
- `jellyfin_get_recent_items` — latest added (per-user)
- `jellyfin_get_item` — full metadata

### Tasks & Activity
- `jellyfin_list_scheduled_tasks`
- `jellyfin_run_scheduled_task`
- `jellyfin_get_activity_log`

## Install

```bash
npm install -g jellyfin-mcp
```

Or from source:

```bash
git clone https://github.com/solomonneas/jellyfin-mcp.git
cd jellyfin-mcp
npm install
npm run build
```

## Configuration

Set these environment variables in your MCP client config:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JELLYFIN_URL` | yes | — | Base URL, e.g. `http://localhost:8096` or `https://jellyfin.example.com` |
| `JELLYFIN_API_KEY` | yes | — | API key from Jellyfin Dashboard > API Keys |
| `JELLYFIN_TIMEOUT` | no | `30` | Request timeout in seconds |
| `JELLYFIN_VERIFY_SSL` | no | `true` | Set to `false` for self-signed certs |

### Getting an API key

1. Log into Jellyfin as an admin
2. Dashboard > API Keys > `+`
3. Name it (e.g. `mcp`) and save
4. Copy the value

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "jellyfin": {
      "command": "jellyfin-mcp",
      "env": {
        "JELLYFIN_URL": "http://localhost:8096",
        "JELLYFIN_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add jellyfin \
  --env JELLYFIN_URL=http://localhost:8096 \
  --env JELLYFIN_API_KEY=your-api-key-here \
  -- jellyfin-mcp
```

### Remote Jellyfin via SSH tunnel

If Jellyfin binds to `localhost` on a remote host (common on Windows media servers), forward the port before starting your MCP client:

```bash
ssh -N -L 8096:localhost:8096 mediaserver
```

Then point `JELLYFIN_URL` at `http://localhost:8096`. The MCP itself has no SSH logic — it just talks HTTP.

## Example Prompts

> What's actively playing on Jellyfin right now?

Calls `jellyfin_list_sessions` with `activeOnly=true`.

> Pause whatever's playing in the living room

Calls `jellyfin_list_sessions`, finds the session by device name, then `jellyfin_pause_session`.

> Scan the Movies library

Calls `jellyfin_list_libraries` to find the ID, then `jellyfin_scan_library`.

> Send a message to my partner's Jellyfin that dinner is ready

`jellyfin_list_sessions` → pick by username → `jellyfin_send_message_to_session`.

> What scheduled tasks have failed recently?

`jellyfin_list_scheduled_tasks` and filter by `lastStatus`.

## Development

```bash
npm install
npm run dev       # watch mode with tsx
npm run typecheck # tsc --noEmit
npm run build     # tsup bundle
npm test          # vitest
```

## Contributing

PRs welcome. Some ideas:

- [ ] Playback Reporting plugin support (viewing stats, popular content)
- [ ] Collections CRUD
- [ ] Playlist management
- [ ] Transcoding session deep inspection
- [ ] Plugin install / enable / disable

## License

[MIT](LICENSE)
