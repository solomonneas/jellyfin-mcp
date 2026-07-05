# security-sweep report: jellyfin-mcp (2026-06-10)

Auditor: skillet security-sweep skill, read-only pass over the working tree, full git history, and lockfile. No live Jellyfin server was exercised.

## Verdict

Overall posture is strong for a personal MCP server: the working tree and the full git history are clean of secrets, TLS verification skipping is correctly confined to the Jellyfin connection instead of process-global, upstream error bodies are redacted from LLM-visible output, Quick Connect codes are scrubbed from error messages in every encoding, all path parameters are URL-encoded, and every destructive tool is gated behind a `confirm: true` argument. The scariest confirmed finding is structural rather than a bug: the `confirm` gate is advisory only because the same LLM that decides to call `jellyfin_delete_user` or `jellyfin_shutdown_server` also supplies `confirm: true`, and no MCP tool annotations (`readOnlyHint`, `destructiveHint`) are registered, so MCP clients cannot distinguish destructive tools and route them to human approval. Combined with the fact that the server requires a full-admin Jellyfin API key and always registers all 56 tools, a prompt-injected agent (for example via attacker-controlled media titles returned by `jellyfin_search_items`) has an unobstructed path to user deletion, password resets, Quick Connect session grants, and server shutdown. Nothing needs same-day action: no credential rotation is required, and the two moderate dependency advisories sit in transitive code paths (hono HTTP server, express/qs) that this stdio-only server never executes.

## Scorecard

| Lens | Score (0-5) | Summary |
|------|-------------|---------|
| Secrets | 5 | No secrets in tree or full history; `.env` gitignored; API key read from env only; Quick Connect code redaction is exemplary |
| Dependencies | 4 | Lockfile present; 2 moderate advisories (hono, qs) resolved via @modelcontextprotocol/sdk but on unused transport code paths |
| Input handling | 4 | Consistent `encodeURIComponent`/`URLSearchParams` on every path segment and query param; zod validation on all tool args; media metadata flows into LLM context untreated |
| AuthN/AuthZ | 3 | Single full-admin API key, no least-privilege or read-only mode; confirm gates exist but are enforceable only by the caller they are meant to constrain |
| Exposure | 4 | Stdio transport only, no network listener; upstream error bodies logged to stderr not returned; missing destructive-tool annotations; CI publish gate is vacuous |

## Findings

### [MEDIUM] confirm gates are advisory and destructive tools carry no MCP annotations
- **Lens:** Exposure / AuthN-AuthZ
- **Where:** `src/tools/_util.ts:28` (`refuseUnconfirmed`), used in `src/tools/users.ts`, `src/tools/system.ts`, `src/tools/sessions.ts`, `src/tools/userdata.ts`, `src/tools/quickconnect.ts`; tool registration via `server.tool(...)` throughout `src/tools/*.ts`
- **What:** Destructive tools (`jellyfin_delete_user`, `jellyfin_set_user_password`, `jellyfin_shutdown_server`, `jellyfin_restart_server`, `jellyfin_quick_connect_authorize`, the `*_all_sessions` bulk tools, resume-clear tools) refuse to act unless `confirm: true` is passed, but the LLM agent supplies that argument itself. The refusal message even instructs the caller to re-call with `confirm: true`, so a single extra turn defeats the gate. No tool registers MCP annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`), so MCP clients that implement human-in-the-loop approval for destructive tools cannot identify which ones qualify.
- **Why it matters:** A prompt-injected or simply over-eager agent can delete users, reset passwords, grant Quick Connect sessions, or shut the server down with no human ever seeing an approval prompt. The confirm flag protects against accidental single-call invocation only, not against a motivated or manipulated caller.
- **Fix:** Register destructive tools with annotations via the SDK's `registerTool` API (e.g. `annotations: { destructiveHint: true, readOnlyHint: false }`, and `readOnlyHint: true` on all list/get tools) so clients can enforce approval. Keep the confirm gate as a second layer. Document in the README that operators should configure their MCP client to require approval for destructive tools.
- **Effort:** M

### [MEDIUM] No least-privilege or read-only mode; full admin key always backs all 56 tools
- **Lens:** AuthN/AuthZ
- **Where:** `src/config.ts:14`, `src/index.ts:35-45`
- **What:** The server requires `JELLYFIN_API_KEY`, which in Jellyfin is always a full-admin credential, and unconditionally registers every tool including user deletion, password reset, Quick Connect authorization, and server shutdown. There is no environment switch to run with only read/query tools registered.
- **Why it matters:** Every deployment carries the maximum blast radius even when the operator only wants "what is playing" and "scan the library" capabilities. The compromise of any connected agent equals compromise of the Jellyfin server's admin plane.
- **Fix:** Add an opt-in env gate, e.g. `JELLYFIN_MCP_DESTRUCTIVE=true` (default false) that controls whether destructive tools are registered at all, or a `JELLYFIN_MCP_READONLY=true` mode that registers only list/get/search tools. Tools that are never registered cannot be abused, which is strictly stronger than the confirm gate.
- **Effort:** M

### [MEDIUM] Prompt-injection chain from media metadata to destructive tools (unverified)
- **Lens:** Input handling
- **Where:** `src/tools/items.ts`, `src/tools/discovery.ts`, `src/tools/sessions.ts` (tool results return `Name`, `SeriesName`, `Overview` and similar fields verbatim); destructive tools listed above
- **What:** Item names, series names, overviews, and activity-log text come from the Jellyfin database and are returned to the LLM untreated. On servers where any non-admin user or automated importer can introduce media (filenames become titles), this is attacker-influenceable text injected directly into the agent's context, in the same session where destructive tools are available. Marked unverified because exploitability depends on who can write to the library, which is deployment configuration not visible in this repo.
- **Why it matters:** A crafted title like an instruction block could steer an agent toward calling `jellyfin_quick_connect_authorize` (granting the attacker a session as any user, including admins) or other destructive tools, with `confirm: true` supplied by the agent itself per the finding above.
- **Fix:** Primary mitigation is the annotation/approval finding above plus the read-only mode. Additionally, document the threat in the README, and consider refusing `jellyfin_quick_connect_authorize` for admin accounts unless an extra env flag is set.
- **Effort:** S (documentation and QC admin restriction) on top of the M items above

### [LOW] Two moderate advisories in transitive dependencies (hono, qs)
- **Lens:** Dependencies
- **Where:** `package-lock.json`: `hono@4.12.18` and `qs@6.15.1`, both pulled in by `@modelcontextprotocol/sdk@1.29.0` (verified with `npm ls hono qs`)
- **What:** `npm audit` reports 4 moderate advisories against hono (IP restriction bypass, Set-Cookie injection, JWT scheme laxity, mount path routing) and 1 against qs (stringify DoS). This server uses only the stdio transport; the hono/express HTTP server code paths inside the SDK are never started, so none of the vulnerable code is reachable in this deployment.
- **Why it matters:** Unreachable today, but a future switch to the SDK's HTTP transport would activate the vulnerable surface, and audit noise trains people to ignore audits.
- **Fix:** `npm audit fix` (or bump `@modelcontextprotocol/sdk` to a release that lifts hono past 4.12.20 and qs past 6.15.1), re-run tests.
- **Effort:** S

### [LOW] CI publish gate is vacuous: tests run with continue-on-error
- **Lens:** Exposure (supply chain)
- **Where:** `.github/workflows/ci.yml:24-25` (`run: npm test` with `continue-on-error: true`), publish job at line 27 (`needs: test`)
- **What:** The test step never fails the job, so `needs: test` always passes and a `v*` tag publishes to npm even with a fully red test suite. Additionally, actions are pinned to mutable tags (`actions/checkout@v4`, `actions/setup-node@v4`) rather than commit SHAs, and `npm publish` does not request provenance.
- **Why it matters:** Broken or unexpectedly-behaving code can ship to npm under a release tag; mutable action tags are a (low-probability) supply-chain takeover vector for a workflow that holds `NPM_TOKEN`.
- **Fix:** Remove `continue-on-error: true` from the test step (if a known-flaky test motivated it, quarantine that test instead). Pin actions to full SHAs. Add `--provenance` to `npm publish` and `id-token: write` permission, or switch to npm trusted publishing.
- **Effort:** S

### [LOW] Plaintext password transits the LLM provider on jellyfin_set_user_password
- **Lens:** Exposure
- **Where:** `src/tools/users.ts:90-110` (`newPassword` zod arg, described as plaintext)
- **What:** Setting a user password requires the agent to place the plaintext password into a tool call, which means it appears in the LLM provider's request logs, the MCP client's transcript, and any session recording. The transport to Jellyfin itself is fine (POST body, server-side hashing) and the tool result does not echo the password.
- **Why it matters:** Passwords set this way should be considered exposed to every system in the agent pipeline; users will not realize this.
- **Fix:** Add a warning to the tool description and README ("the password will appear in your LLM conversation logs; prefer setting passwords in the Jellyfin UI, or treat passwords set here as temporary and force a change"). Optionally support a generate-random-password mode that returns the generated value once, so the secret originates server-side instead of in the prompt.
- **Effort:** S

### [INFO] JELLYFIN_TIMEOUT is not validated
- **Lens:** Input handling
- **Where:** `src/config.ts:22`
- **What:** `parseInt(process.env.JELLYFIN_TIMEOUT ?? "30", 10) * 1000` yields `NaN` for non-numeric input, which Node's `setTimeout` coerces to a 1 ms delay, aborting every request instantly with a confusing timeout error.
- **Why it matters:** Self-inflicted denial of service with a misleading symptom; not attacker-reachable since the env is operator-controlled.
- **Fix:** Validate with `Number.isFinite` and fall back to the 30 s default (optionally warn on stderr).
- **Effort:** S

### [INFO] Removed internal handoff artifacts remain in git history (verified benign)
- **Lens:** Secrets / Exposure
- **Where:** History of commit `829691a` (parent contains `memory/cards/*.md` and `memory/handoff-inbox/*.md`, deleted by that commit)
- **What:** Two internal workflow notes were committed and later removed. Both files were grepped in history for credentials, tokens, passwords, private IPs, and internal hostnames: zero matches. They contain only README-convention notes.
- **Why it matters:** Nothing exploitable; recorded so a future sweep does not re-investigate. No history rewrite needed.
- **Fix:** None required. The `.gitignore` and content-guard pre-push hook added afterward already prevent recurrence.
- **Effort:** S

## Backlog

1. [MEDIUM/M] Register MCP tool annotations (destructiveHint/readOnlyHint) and document client-side approval for destructive tools (Exposure)
2. [MEDIUM/M] Add a read-only / destructive-tools-off env mode so unused destructive tools are never registered (AuthN/AuthZ)
3. [MEDIUM/S] Document the media-metadata prompt-injection chain and restrict Quick Connect authorization for admin accounts behind an extra flag (Input handling)
4. [LOW/S] Remove continue-on-error from the CI test step, pin actions to SHAs, add npm publish provenance (Exposure)
5. [LOW/S] Bump @modelcontextprotocol/sdk or npm audit fix to clear the hono and qs advisories (Dependencies)
6. [LOW/S] Warn in the tool description and README that jellyfin_set_user_password sends the plaintext password through LLM logs (Exposure)
7. [INFO/S] Validate JELLYFIN_TIMEOUT and fall back to the default on non-numeric input (Input handling)

## Not checked

- Runtime behavior against a live Jellyfin server (no test instance exercised; all findings are traced code paths)
- The published npm artifact contents (only the repo `files` allowlist and build config were reviewed)
- GitHub repository settings (branch protection, secret scanning, NPM_TOKEN scope) which are not visible from the working tree
- `dist/` build outputs (gitignored, generated; source was audited instead)
- `.brigade/` and `.claude/` local artifacts beyond confirming they are gitignored and untracked
