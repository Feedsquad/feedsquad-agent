/**
 * Thin client for the FeedSquad MCP REST adapter at /api/mcp/action.
 *
 * Each call posts { tool, params } and gets back the same shape every
 * MCP tool returns. We don't parse the result here — commands format
 * for terminal output as needed.
 *
 * The CLI sets two caller-identity headers on every request:
 *   X-MCP-Client-Name: feedsquad-cli
 *   X-MCP-Caller-Id: <stable per-install UUID>
 *
 * That makes every CLI request distinguishable in server-side audit
 * logs from other clients hitting the same user account.
 */

import type { ProfileCredentials } from './credentials.js';
import { refreshIfNeeded } from './auth.js';
import { saveProfile } from './credentials.js';

const CLI_VERSION = '0.1.0';

export class MCPApiError extends Error {
  override readonly name = 'MCPApiError';
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
  }
}

/** Result of a tool call — handler-shaped JSON, not parsed by us. */
export type ToolResult = Record<string, unknown>;

export interface CallToolOptions {
  /** Active profile name; updated creds (after refresh) are saved back to it. */
  profileName: string;
  /** Caller identifier passed in X-MCP-Caller-Id (defaults to creds.caller_id). */
  callerId?: string;
}

export async function callTool(
  creds: ProfileCredentials,
  tool: string,
  params: Record<string, unknown>,
  opts: CallToolOptions,
): Promise<ToolResult> {
  // Refresh the token if it's near expiry before the call. saveProfile
  // is invoked by refreshIfNeeded; we re-bind creds to the fresh value.
  const freshCreds = await refreshIfNeeded(opts.profileName, creds);

  const url = new URL('/api/mcp/action', freshCreds.api_base);
  const callerId = opts.callerId || freshCreds.caller_id;

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${freshCreds.access_token}`,
      'User-Agent': `feedsquad-cli/${CLI_VERSION}`,
      'X-MCP-Client-Name': 'feedsquad-cli',
      'X-MCP-Caller-Id': callerId,
    },
    body: JSON.stringify({ tool, params }),
  });

  let body: unknown = null;
  const text = await res.text();
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    // 401 on a fresh token usually means the server revoked us — drop
    // expires_at so the next call attempts refresh again.
    if (res.status === 401 && freshCreds.refresh_token) {
      saveProfile(opts.profileName, { ...freshCreds, expires_at: 0 });
    }
    const message =
      (body && typeof body === 'object' && 'error' in body && typeof (body as { error?: unknown }).error === 'string'
        ? ((body as { error: string }).error)
        : `MCP request failed (${res.status})`);
    throw new MCPApiError(message, res.status, body);
  }

  if (body && typeof body === 'object') {
    return body as ToolResult;
  }
  return { raw: body };
}
