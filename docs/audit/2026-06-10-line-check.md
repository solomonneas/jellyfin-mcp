# line-check report: jellyfin-mcp (2026-06-10)

## Verdict

jellyfin-mcp is a healthy, well-documented MCP server with accurate docs (the README's "56 MCP tools" claim matches exactly 56 registered tool names), clean typecheck, 66 passing tests, solid agent wiring, and an installed content-guard pre-push hook. The problem is entirely at the release boundary: a security fix (TLS scoping plus upstream error-body redaction) and an Anthropic compatibility fix are stranded on the unmerged `fix/strip-draft07-schema` branch with no PR and no CI run, while npm still serves v0.3.0 from April 22, which contains the process-global TLS disable, leaks raw upstream error bodies to the model, and lacks roughly seven tools the README advertises. The single most important thing to do is merge that branch and cut v0.4.0. Secondary but cheap: the CI test step has `continue-on-error: true`, so the test suite cannot fail a build. Overall: healthy code, needs release work.

## Scorecard

| Station | Score (0-5) | Summary |
|---|---|---|
| 1. Docs and onboarding | 4 | Excellent README: accurate 56-tool inventory, config table, install recipes for 5 MCP clients, example prompts. Docked because `npm install -g` delivers a package missing documented tools and behavior |
| 2. Agent-readiness | 5 | AGENTS.md present, concise, and accurate; `brigade handoff doctor` all-ok (5 processed handoffs, 0 pending); `brigade memory care scan` 0 issues; build/test commands documented |
| 3. Tests and CI | 3 | 66 tests pass, typecheck clean, CI green on main. But the test step has `continue-on-error: true` so failures cannot gate, and confirm-gates in users.ts/system.ts are untested |
| 4. Hygiene | 4 | .gitignore covers `.claude/`, `.codex/`, `.learnings/`, `/memory/`, `.brigade/`; MIT LICENSE; no secrets found in tracked files; pre-push content-guard active via `core.hooksPath=hooks`. Minor: stale local branch, an `auto-backup` commit on main |
| 5. Structure | 4 | Clean client/tools split enforced by AGENTS.md; newcomer can predict where changes go. Minor DRY drift (duplicated version string and ticks constant) and 2 moderate transitive advisories |
| 6. Release hygiene | 2 | No CHANGELOG; npm at 0.3.0 (2026-04-22) while main has 2 unreleased features; security and compat fixes sit on an unmerged branch with no PR and no CI coverage; version not bumped |
| 7. TODO and issue mining | 5 | Zero TODO/FIXME/HACK markers in src/ and tests/ (one false positive: `XXXXXX` in a comment showing a Quick Connect code format); zero open GitHub issues |

## Findings

### [HIGH] Merge the stranded security and compatibility branch
- **Station:** Release hygiene
- **Where:** branch `fix/strip-draft07-schema` (3 commits ahead of origin/main: `bcc3d28`, `7e12fdc`, `89bde36`)
- **What:** Commit `7e12fdc` replaces the process-global TLS disable with a per-request undici dispatcher and stops returning raw upstream error bodies to the MCP client (verified in `src/client.ts:29-42` and `src/client.ts:83-93`). Commit `bcc3d28` strips the draft-07 `$schema` that Anthropic rejects (verified in `src/index.ts:48-61`). No PR exists for this branch (the only PR in repo history is April's v0.3.0 PR), and because `ci.yml` only triggers on pushes to main, tags, and PRs to main, these commits have never run in CI.
- **Why it matters:** A security fix that exists but is not on main or in any release protects nobody. The Anthropic compat fix is also blocking real usage (subagent spawns reject the full tool set).
- **Fix:** `gh pr create --base main --head fix/strip-draft07-schema`, let CI run, merge. The working tree already passes `npm test` (66/66) and `npm run typecheck`.
- **Effort:** S

### [HIGH] CI cannot fail on test regressions
- **Station:** Tests and CI
- **Where:** `.github/workflows/ci.yml:26`
- **What:** The `npm test` step carries `continue-on-error: true`, so a red test suite still produces a green check and still feeds the publish job.
- **Why it matters:** The test suite is decoration. A regression in a confirm-gate or the error-redaction path would merge and publish silently.
- **Fix:** Delete line 26. The suite currently passes (66/66 in ~215ms), so CI stays green immediately.
- **Effort:** S

### [HIGH] Cut and publish v0.4.0; npm is 7 weeks stale and missing documented features
- **Station:** Release hygiene
- **Where:** repo-wide (`package.json:3` version 0.3.0; npm registry shows only 0.3.0, published 2026-04-22; latest tag v0.3.0)
- **What:** origin/main has two unreleased feature commits (`d7f433d` continue-watching clear, `bbe8b20` resume cleanup tools, both 2026-05-30) that the README advertises (`jellyfin_clear_continue_watching`, `jellyfin_preview_continue_watching_clear`, `jellyfin_clear_series_continue_watching`, `jellyfin_clear_episode_continue_watching_except_latest`, `jellyfin_set_resume_position`, and related). The README's primary install path, `npm install -g jellyfin-mcp`, delivers 0.3.0, which lacks all of them and still contains the pre-`7e12fdc` global TLS disable and raw error-body leak.
- **Why it matters:** New users following the README get tools that do not exist plus the exact security behavior the branch fixes. This blocks adoption and undermines trust in the otherwise excellent docs.
- **Fix:** After merging the branch: bump `package.json` to 0.4.0, update the version literal in `src/index.ts:28`, tag `v0.4.0`, push the tag; the existing publish job handles npm.
- **Effort:** S

### [MEDIUM] No CHANGELOG
- **Station:** Release hygiene
- **Where:** repo root (file absent)
- **What:** There is no CHANGELOG.md. Release history lives only in git log and one GitHub release note.
- **Why it matters:** Users upgrading across versions (especially with destructive-tool semantics changing) have no way to see what changed; agents working the repo have no "Unreleased" section to accumulate into, which the owner's release-on-request workflow depends on.
- **Fix:** Add `CHANGELOG.md` with Keep-a-Changelog headings: backfill v0.3.0 from the GitHub release, list the two feature commits plus the security and compat fixes under v0.4.0/Unreleased.
- **Effort:** S

### [MEDIUM] Confirm-gates for user and system destructive tools are untested
- **Station:** Tests and CI
- **Where:** `src/tools/users.ts:102` (set_user_password), users.ts delete_user, `src/tools/system.ts` (restart/shutdown); tests/ covers only client, quickconnect, sessions, userdata
- **What:** 8 of 12 tool modules have no direct tests. Most are thin wrappers and fine, but the `confirm: true` refusal paths for `jellyfin_delete_user`, `jellyfin_set_user_password`, `jellyfin_restart_server`, and `jellyfin_shutdown_server` are unverified, while the equivalent gates in sessions and quickconnect do have refusal tests (`tests/sessions.test.ts:33`, `tests/quickconnect.test.ts:32`).
- **Why it matters:** AGENTS.md names confirmation gating as a hard implementation rule. These are the most destructive operations in the server (lock a user out, delete a user, shut the server down), and a refactor could drop a gate without any test noticing, especially while CI ignores test failures.
- **Fix:** Add a `tests/users.test.ts` and extend or add a system test using the existing MCP server double pattern: one "refuses without confirm and does not call the client" case plus one happy-path case per gated tool, mirroring `tests/quickconnect.test.ts`.
- **Effort:** M

### [LOW] Transitive qs DoS advisory via the MCP SDK
- **Station:** Structure
- **Where:** `node_modules/qs` via `@modelcontextprotocol/sdk@1.29.0 > express@5.2.1` (npm audit: 2 moderate, GHSA-q8mj-m7cp-5q26)
- **What:** `npm audit --omit=dev` reports a remotely triggerable qs.stringify DoS, fixable in-range. Practical exposure is near zero: this server uses the stdio transport only, so express never serves traffic.
- **Why it matters:** Mostly badge hygiene; a red audit scares away contributors and the fix is free.
- **Fix:** `npm audit fix` and commit the lockfile.
- **Effort:** S

### [LOW] Duplicated literals will drift on the next release
- **Station:** Structure
- **Where:** `src/index.ts:28` (version "0.3.0" hardcoded, duplicating `package.json`) and `src/tools/userdata.ts:7` (TICKS_PER_SECOND redefined despite `src/client.ts:19-21` exporting it with `secondsToTicks`)
- **What:** Two copies of the version string and two copies of the ticks constant.
- **Why it matters:** The version pair will be wrong the moment v0.4.0 is cut unless someone remembers both spots; the server would then advertise the wrong version to MCP clients.
- **Fix:** Read the version from package.json (`createRequire(import.meta.url)("../package.json").version` or a tsup define), and import `TICKS_PER_SECOND`/`secondsToTicks` from `../client.js` in userdata.ts.
- **Effort:** S

### [LOW] undici is one major behind
- **Station:** Structure
- **Where:** `package.json` dependencies (`undici@^7.27.2`, latest 8.4.1); `@types/node`, `tsx`, `vitest` also have in-range updates
- **What:** The only runtime dependency added for the TLS work is a major behind. The usage surface is one `Agent` construction with `connect.rejectUnauthorized`.
- **Why it matters:** Falling a major behind on the security-relevant TLS dependency makes future advisory patches harder.
- **Fix:** Bump to `undici@^8`, run `npm test` (the dispatcher tests in `tests/client.test.ts` cover the surface), and fold into the v0.4.0 release.
- **Effort:** S

### [INFO] Local checkout and main-branch housekeeping
- **Station:** Hygiene
- **Where:** local clone (stale local `main` ref, merged local branch `v0.3.0-discovery-and-quickconnect`); origin/main commit `220c4c6` ("auto-backup: 2026-05-03 03:00")
- **What:** The local main ref is weeks behind origin/main, a fully merged feature branch lingers locally, and an automated backup job has committed directly to main at least once.
- **Why it matters:** The stale refs make `git log main..HEAD` lie about what is unmerged (it reported 13 commits when the true delta is 3). The auto-backup commit suggests a cron with push access to main that could land unreviewed changes again.
- **Fix:** `git fetch --prune && git branch -d v0.3.0-discovery-and-quickconnect`; check whatever cron produced `220c4c6` and point it away from main.
- **Effort:** S

## Backlog

1. [HIGH/S] Merge the stranded security and compatibility branch (Release hygiene)
2. [HIGH/S] CI cannot fail on test regressions (Tests and CI)
3. [HIGH/S] Cut and publish v0.4.0; npm is 7 weeks stale and missing documented features (Release hygiene)
4. [MEDIUM/S] No CHANGELOG (Release hygiene)
5. [LOW/S] Duplicated literals will drift on the next release (Structure)
6. [LOW/S] Transitive qs DoS advisory via the MCP SDK (Structure)
7. [LOW/S] undici is one major behind (Structure)
8. [MEDIUM/M] Confirm-gates for user and system destructive tools are untested (Tests and CI)
9. [INFO/S] Local checkout and main-branch housekeeping (Hygiene)

## Not checked

- Runtime behavior against a live Jellyfin server: no server was contacted; all findings come from static reading, the test suite, and registry/GitHub metadata.
- `node_modules/`, `dist/`, and `package-lock.json` internals beyond `npm ls`/`npm audit` output (generated/vendored trees, per skill rules).
- npm package tarball contents (assumed to match the `files` allowlist in package.json).
- GitHub repo settings (branch protection, secrets configuration, NPM_TOKEN validity); the publish job has not exercised a new version since 0.3.0.
- Deep line-by-line review of all 12 tool modules; client.ts, index.ts, config.ts, _util.ts, users.ts, and userdata.ts were read directly, the rest were sampled for tool-name counts and confirm usage.
