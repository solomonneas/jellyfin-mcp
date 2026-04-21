---
topic: project conventions
category: docs
tags: [mcp, readme, conventions, claude-code, claude-desktop, openclaw, hermes, codex]
---

# MCP / AI-agent README convention: document all 5 clients

For every MCP server or AI-agent-adjacent tool published under `solomonneas/*`, the README's Configuration section must include setup instructions for all five MCP-capable clients Solomon uses:

1. **Claude Desktop** — `claude_desktop_config.json` JSON snippet (macOS + Windows paths).
2. **Claude Code** — `claude mcp add <name> --env ... -- <command>`, with a note about `--scope user` for global availability.
3. **OpenClaw** — `openclaw mcp set <name> '<json>'` for both source-checkout (`node /path/dist/index.js`) and global-npm forms, then `systemctl --user restart openclaw-gateway` and `openclaw mcp list` to verify.
4. **Hermes Agent** ([github](https://github.com/NousResearch/hermes-agent)) — YAML block under `mcp_servers:` in `~/.hermes/config.yaml`, both source and global-npm forms, then `/reload-mcp` slash command in-session.
5. **Codex CLI** ([github](https://github.com/openai/codex)) — `codex mcp add <name> --env ... -- <command>` (writes to `~/.codex/config.toml` under `[mcp_servers.<name>]`), then `codex mcp list` to verify.

**Why:** Solomon uses all five regularly. He explicitly noted "OpenAI is catching up with MCP + plugins" and that any new repo we ship should be plug-and-play across the whole stack, not just the first client we happened to wire it into. Skipping a client means a paper cut later when he wants to use the tool from that runtime and has to reverse-engineer the syntax himself.

**How to apply:**
- Scaffold all 5 sections from day one on new MCP repos — don't backfill later.
- When editing an existing repo's README that's missing any of the 5, add them in the same PR you're already touching the README for.
- The verbatim syntax for each client is in `solomonneas/jellyfin-mcp` README at HEAD — copy from there.
- Applies to MCP servers AND adjacent AI-agent tooling.
- Always link each client's canonical repo on first mention.
