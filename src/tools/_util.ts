// Shared helpers for tool response formatting. Keeps every tool handler
// returning the same shape without each one reimplementing try/catch.

type TextContent = { type: "text"; text: string };
type ToolResult = { content: TextContent[]; isError?: boolean };

export function ok(payload: unknown): ToolResult {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

export function fail(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ error: message }, null, 2),
      },
    ],
    isError: true,
  };
}

// Returned by destructive tools when confirm: true was not passed. Surfaces
// as an isError result so MCP clients see it as a refusal, not a success.
export function refuseUnconfirmed(action: string): ToolResult {
  return fail(
    new Error(
      `Refusing to ${action} without explicit confirmation. Re-call this tool with confirm: true to proceed.`,
    ),
  );
}
