/**
 * Credential storage for the FeedSquad CLI.
 *
 * Stored at $XDG_CONFIG_HOME/feedsquad/credentials (defaults to
 * ~/.config/feedsquad/credentials). File mode 0600 — readable only by
 * the current user. Profiles are first-class so users can flip between
 * accounts (`feedsquad --profile work post list`).
 *
 * Format is JSON for transparency and easy debugging. We never log
 * tokens — only their length / expiry — so the file should be
 * inspected directly when an integration breaks.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface ProfileCredentials {
  /** Server base URL (e.g. https://feedsquad.com or http://localhost:3000). */
  api_base: string;
  /** OAuth access token (JWT). */
  access_token: string;
  /** OAuth refresh token (opaque). */
  refresh_token?: string;
  /** Unix epoch ms when the access token expires. */
  expires_at: number;
  /** Granted scopes (space-separated). */
  scope: string;
  /** Stable per-install caller id, surfaced in audit logs via X-MCP-Caller-Id. */
  caller_id: string;
}

export interface CredentialsFile {
  /** Active profile name (defaults to 'default'). */
  current_profile: string;
  /** Map of profile name -> credentials. */
  profiles: Record<string, ProfileCredentials>;
}

const CONFIG_DIR_NAME = 'feedsquad';
const CREDENTIALS_FILE = 'credentials';

function configRoot(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg ? join(xdg, CONFIG_DIR_NAME) : join(homedir(), '.config', CONFIG_DIR_NAME);
}

function credentialsPath(): string {
  return join(configRoot(), CREDENTIALS_FILE);
}

export function loadCredentialsFile(): CredentialsFile | null {
  const path = credentialsPath();
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as CredentialsFile;
    if (!parsed.profiles || typeof parsed.profiles !== 'object') return null;
    if (!parsed.current_profile) parsed.current_profile = 'default';
    return parsed;
  } catch {
    return null;
  }
}

export function saveCredentialsFile(file: CredentialsFile): void {
  const dir = configRoot();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = credentialsPath();
  writeFileSync(path, JSON.stringify(file, null, 2), { encoding: 'utf-8', mode: 0o600 });
  // Defensive chmod in case the file already existed with looser perms.
  try {
    chmodSync(path, 0o600);
  } catch {
    /* non-fatal */
  }
}

export function loadProfile(profileName?: string): { name: string; creds: ProfileCredentials } | null {
  const file = loadCredentialsFile();
  if (!file) return null;
  const name = profileName || file.current_profile || 'default';
  const creds = file.profiles[name];
  return creds ? { name, creds } : null;
}

export function saveProfile(name: string, creds: ProfileCredentials, makeCurrent = true): void {
  const existing = loadCredentialsFile() || { current_profile: name, profiles: {} };
  existing.profiles[name] = creds;
  if (makeCurrent) existing.current_profile = name;
  saveCredentialsFile(existing);
}

export function deleteProfile(name: string): boolean {
  const file = loadCredentialsFile();
  if (!file || !file.profiles[name]) return false;
  delete file.profiles[name];
  // If we deleted the active profile, fall back to the first remaining one
  // (or 'default' if none remain — saving an empty profiles map is fine).
  if (file.current_profile === name) {
    const remaining = Object.keys(file.profiles);
    file.current_profile = remaining[0] || 'default';
  }
  saveCredentialsFile(file);
  return true;
}

/**
 * Generate a stable caller id for this CLI install. Stored alongside the
 * profile so server-side audit logs can group requests by install via
 * the X-MCP-Caller-Id header.
 */
export function newCallerId(): string {
  return `cli-${randomUUID()}`;
}

export function credentialsLocation(): string {
  return credentialsPath();
}
