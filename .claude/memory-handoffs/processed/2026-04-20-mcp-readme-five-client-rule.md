# Memory Handoff

## Type
preference

## Title
MCP / AI-agent repo READMEs must document all 5 clients (Claude Desktop, Claude Code, OpenClaw, Hermes Agent, Codex CLI)

## Summary
On 2026-04-20 Solomon set a project-wide convention: every MCP server or AI-agent-adjacent tool we publish under `solomonneas/*` must include setup instructions in its README for all five MCP-capable clients he uses regularly. The trigger was the v0.2.0 release of `solomonneas/jellyfin-mcp` — initially the README only had Claude Desktop + Claude Code; Solomon asked for OpenClaw, then Hermes Agent, then Codex CLI in three successive prompts. He then said "include claude code/claude desktop/openclaw/hermes agent instructions on our repos for things like MCPs and AI agent related stuff" and explicitly added "and codex app, openai is catching up i believe they added mcp support and plugins". This is a durable preference, not a one-off.

## Durable facts
- Required clients in the README's Configuration section, in this order: Claude Desktop, Claude Code, OpenClaw, Hermes Agent, Codex CLI.
- Each client's section should show both the global-npm-install form and the source-checkout form (`node /path/dist/index.js`) where applicable.
- Verbatim syntax for each client lives in the current `solomonneas/jellyfin-mcp` README at HEAD — copy from there rather than re-deriving, since the syntax has already been verified end-to-end.
- Applies to MCP servers AND adjacent AI-agent tooling (CLI tools meant to be invoked from agents, plugin packs, skill bundles).
- Always link each client's canonical repo on first mention (Hermes: `https://github.com/NousResearch/hermes-agent`, Codex: `https://github.com/openai/codex`). Don't invent URLs for the others.

## Evidence
- repo: solomonneas/jellyfin-mcp
- commits: e0c39c4 (Hermes), 478fa0e (Codex), dc1f35c (OpenClaw)
- file: README.md at HEAD has the canonical 5-client block in the Configuration section
- prompts: Solomon's three follow-ups in the v0.2.0 session: "include that it works with openclaw and include instructions for openclaw" → "include instructions for hermes if this works with that" → "and codex app, openai is catching up i believe they added mcp support and plugins"

## Recommended memory action
create-card

## Target card
mcp-readme-five-client-rule.md

## Suggested card content
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

## Target document
(none)

## Suggested document content
(n/a — card-only)
