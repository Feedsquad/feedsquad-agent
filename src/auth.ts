/**
 * OAuth 2.1 + PKCE login flow for the FeedSquad CLI.
 *
 * Flow:
 *  1. Generate PKCE code_verifier (base64url(32 random bytes)) and
 *     code_challenge (base64url(sha256(verifier))).
 *  2. Open the system browser to /api/oauth/mcp/authorize with the
 *     PKCE challenge and a localhost redirect_uri.
 *  3. Listen on a random localhost port for the OAuth callback.
 *  4. Exchange the code at /api/oauth/mcp/token using PKCE verifier.
 *  5. Save tokens to the local credentials file.
 *
 * No client_secret. The CLI is a public client per OAuth 2.1 §9.4 —
 * PKCE is the proof. This matches what Claude Desktop and other MCP
 * clients use against the same endpoints.
 */

import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { URL } from 'node:url';
import type { ProfileCredentials } from './credentials.js';
import { newCallerId, saveProfile } from './credentials.js';

const AUTH_TIMEOUT_MS = 5 * 60_000; // 5 min for the user to complete the browser flow
const DEFAULT_SCOPES = [
  'posts:read',
  'posts:write',
  'posts:publish',
  'campaigns:read',
  'campaigns:write',
  'connections:write',
  'analytics:read',
].join(' ');

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makePkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  const args = platform === 'win32' ? ['', url] : [url];
  spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
}

interface CallbackResult {
  code: string;
  state: string;
}

function awaitCallback(port: number, expectedState: string): Promise<CallbackResult> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (!req.url) {
        res.writeHead(400);
        res.end();
        return;
      }
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const err = url.searchParams.get('error');

      const respond = (status: number, body: string) => {
        res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(body);
      };

      if (err) {
        respond(
          400,
          `<!doctype html><meta charset=utf-8><title>FeedSquad CLI</title><body style="font-family:system-ui;max-width:480px;margin:64px auto;color:#111"><h1>Login failed</h1><p>${escapeHtml(err)}</p><p>You can close this tab and retry <code>feedsquad login</code>.</p></body>`,
        );
        cleanup();
        reject(new Error(`OAuth error: ${err}`));
        return;
      }
      if (!code || !state) {
        respond(400, '<!doctype html><meta charset=utf-8><body>Missing code or state in callback.</body>');
        return;
      }
      if (state !== expectedState) {
        respond(400, '<!doctype html><meta charset=utf-8><body>State mismatch — possible CSRF. Aborted.</body>');
        cleanup();
        reject(new Error('OAuth state mismatch.'));
        return;
      }

      respond(
        200,
        `<!doctype html><meta charset=utf-8><title>FeedSquad CLI</title><body style="font-family:system-ui;max-width:480px;margin:64px auto;color:#111"><h1>You're signed in.</h1><p>You can close this tab and return to your terminal.</p></body>`,
      );
      cleanup();
      resolve({ code, state });
    });

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('OAuth timeout — no callback received in 5 minutes.'));
    }, AUTH_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timer);
      server.close();
    }

    server.listen(port, '127.0.0.1');
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] || c);
}

async function pickFreePort(): Promise<number> {
  // Bind to port 0, read assigned port from server.address(), close immediately.
  const server = createServer();
  await new Promise<void>((res, rej) => {
    server.once('error', rej);
    server.listen(0, '127.0.0.1', () => res());
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  await new Promise<void>((res) => server.close(() => res()));
  if (!port) throw new Error('Failed to find a free localhost port for OAuth callback.');
  return port;
}

export interface LoginOptions {
  apiBase: string;
  profileName: string;
  scopes?: string;
}

export async function runLogin(opts: LoginOptions): Promise<ProfileCredentials> {
  const port = await pickFreePort();
  const redirectUri = `http://127.0.0.1:${port}/callback`;
  const state = base64url(randomBytes(16));
  const { verifier, challenge } = makePkcePair();
  const callerId = newCallerId();

  const authorizeUrl = new URL('/api/oauth/mcp/authorize', opts.apiBase);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('scope', opts.scopes || DEFAULT_SCOPES);
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('code_challenge', challenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  // Stable client identifier so the server can attribute requests to the CLI.
  authorizeUrl.searchParams.set('client_id', 'feedsquad-cli');

  // eslint-disable-next-line no-console
  console.error(`Opening browser for FeedSquad sign-in...\nIf it doesn't open, paste this URL:\n${authorizeUrl.toString()}\n`);
  openBrowser(authorizeUrl.toString());

  const { code } = await awaitCallback(port, state);

  // Exchange code for tokens. Body is form-urlencoded per OAuth 2.1.
  const tokenUrl = new URL('/api/oauth/mcp/token', opts.apiBase);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
    client_id: 'feedsquad-cli',
  });

  const tokenRes = await fetch(tokenUrl.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-MCP-Client-Name': 'feedsquad-cli',
      'X-MCP-Caller-Id': callerId,
    },
    body: body.toString(),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Token exchange failed (${tokenRes.status}): ${text.slice(0, 400)}`);
  }

  const json = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  };

  if (!json.access_token) {
    throw new Error('Token response missing access_token.');
  }

  const expiresAt = Date.now() + (json.expires_in || 3600) * 1000;
  const creds: ProfileCredentials = {
    api_base: opts.apiBase.replace(/\/+$/, ''),
    access_token: json.access_token,
    ...(json.refresh_token ? { refresh_token: json.refresh_token } : {}),
    expires_at: expiresAt,
    scope: json.scope || opts.scopes || DEFAULT_SCOPES,
    caller_id: callerId,
  };

  saveProfile(opts.profileName, creds);
  return creds;
}

/**
 * Try to refresh the access token if a refresh_token is present and the
 * access token is expired or close to expiring. Returns refreshed creds
 * or the original creds if refresh isn't needed/possible.
 */
export async function refreshIfNeeded(
  profileName: string,
  creds: ProfileCredentials,
): Promise<ProfileCredentials> {
  const skewMs = 30_000; // refresh 30s before actual expiry
  if (creds.expires_at > Date.now() + skewMs) return creds;
  if (!creds.refresh_token) return creds; // can't refresh; let the next call 401

  const tokenUrl = new URL('/api/oauth/mcp/token', creds.api_base);
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: creds.refresh_token,
    client_id: 'feedsquad-cli',
  });

  const res = await fetch(tokenUrl.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-MCP-Client-Name': 'feedsquad-cli',
      'X-MCP-Caller-Id': creds.caller_id,
    },
    body: body.toString(),
  });

  if (!res.ok) return creds; // best-effort; let the next API call handle 401

  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };

  if (!json.access_token) return creds;

  const refreshed: ProfileCredentials = {
    ...creds,
    access_token: json.access_token,
    expires_at: Date.now() + (json.expires_in || 3600) * 1000,
    ...(json.refresh_token ? { refresh_token: json.refresh_token } : {}),
    scope: json.scope || creds.scope,
  };
  saveProfile(profileName, refreshed);
  return refreshed;
}
