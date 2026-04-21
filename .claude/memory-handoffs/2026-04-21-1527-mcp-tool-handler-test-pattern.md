# Memory Handoff

## Type
decision

## Title
MCP tool handler test pattern (fake-server capture)

## Summary
Our MCP server repos (jellyfin-mcp and future ones) previously only had client-level tests (mocked fetch, URL-shape assertions). The safety-critical logic in these servers lives in the tool layer: confirm gates, secret redaction, zod validation, error shaping. jellyfin-mcp PR #1 (v0.3.0) established a lightweight pattern for unit-testing tool handlers without standing up a real MCP stdio transport: pass a fake object with a `.tool()` method to `registerXTools()`, capture the handlers into a Map, invoke directly. Fast, synchronous, lets each test swap in a `vi.fn()` client to assert both tool output and whether the underlying client was called.

## Durable facts
- The pattern is canonical in `tests/quickconnect.test.ts` in jellyfin-mcp (created in v0.3.0).
- Tool-level tests must verify: (a) confirm gates refuse without `confirm: true` AND don't call the client on refusal, (b) secrets passed in (codes, tokens, passwords) are not echoed back in refusal messages or success payloads, (c) error paths return `isError: true` with the message surfaced.
- Client-level encoding tests are still needed whenever a user-controlled string lands in a URL: path segment (`encodeURIComponent`) or query param (`URLSearchParams`). Assert via `new URL(url).pathname` / `.searchParams.get(key)` so the test doesn't care whether the encoder uses `%20` vs `+`.
- Codex review on the v0.3.0 PR flagged the missing tool-level tests and the code-echo leak in `refuseUnconfirmed()`; both patterns are now in place.

## Evidence
- Repo: solomonneas/jellyfin-mcp
- PR: https://github.com/solomonneas/jellyfin-mcp/pull/1
- Files: `tests/quickconnect.test.ts` (new), `src/tools/quickconnect.ts` (confirm-gated tool with redaction)
- Test count: 31/31 (15 existing client + 12 new client + 4 new tool-level)

## Recommended memory action
create-card

## Target card
mcp-tool-handler-test-pattern.md

## Suggested card content
---
topic: testing
category: patterns
tags: [mcp, testing, vitest, jellyfin-mcp, arr-cli]
---

# MCP tool handler test pattern

Our MCP server repos register tools via `server.tool(name, description, zodSchema, handler)`. To unit-test handler logic (confirm gates, secret redaction, error shaping) without standing up a real MCP stdio transport, pass a fake server into the `registerXTools()` function and capture handlers out of the `.tool()` call.

## Canonical implementation
In `jellyfin-mcp/tests/quickconnect.test.ts`:

```ts
function makeFakeServer() {
  const tools = new Map<string, { name: string; handler: (args) => Promise<...> }>();
  const server = {
    tool: (name, _desc, _schema, handler) => { tools.set(name, { name, handler }); },
  };
  return { server, tools };
}

registerQuickConnectTools(server as never, fakeClient);
const result = await tools.get("jellyfin_quick_connect_authorize")!.handler({ code, userId });
```

## What to test at the tool layer
- Confirm-gated tools refuse without `confirm: true` AND do NOT call the underlying client on refusal (verify via `expect(clientMethod).not.toHaveBeenCalled()`).
- Secrets passed in (codes, tokens, passwords) are not echoed back in refusal messages or success payloads. Assert with `.not.toContain(secret)`.
- Error paths return `isError: true` with the error message surfaced via `fail()`, not swallowed.

## What still belongs in client-level tests
URL encoding. Whenever a user-controlled string lands in a URL (path or query), add a client test that uses `new URL(url).pathname` or `.searchParams.get(key)` so you assert the decoded value, not the raw encoded string. This stays resilient to `%20` vs `+` and other encoder choices.

## Why tool-level tests are load-bearing
Client-level tests (mocked fetch) prove the HTTP shape but skip the tool layer where safety-critical logic lives. Without tool tests, a regression that removes the `confirm` gate or starts echoing codes into output would pass all existing tests.

## Target document
memory/cards/mcp-tool-handler-test-pattern.md

## Suggested document content
(See `Suggested card content` above — this handoff is card-targeted.)
