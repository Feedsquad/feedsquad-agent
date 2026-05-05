import { loadProfile, loadCredentialsFile } from '../credentials.js';
import { dim, bold, printError, fmtDate } from '../format.js';

export function whoamiCommand(profileName: string): number {
  const profile = loadProfile(profileName);
  if (!profile) {
    printError(`Not logged in as "${profileName}".`, 'Run `feedsquad login` to authenticate.');
    return 1;
  }
  const file = loadCredentialsFile();
  const allProfiles = Object.keys(file?.profiles || {});

  console.log(bold('Profile:    ') + profile.name);
  console.log(bold('API base:   ') + profile.creds.api_base);
  console.log(bold('Caller ID:  ') + profile.creds.caller_id);
  console.log(bold('Scopes:     ') + profile.creds.scope);
  console.log(bold('Expires:    ') + fmtDate(new Date(profile.creds.expires_at).toISOString()) + dim(`  (${describeExpiry(profile.creds.expires_at)})`));
  if (allProfiles.length > 1) {
    console.log(dim(`  Other profiles: ${allProfiles.filter((p) => p !== profile.name).join(', ')}`));
  }
  return 0;
}

function describeExpiry(epochMs: number): string {
  const diff = epochMs - Date.now();
  if (diff <= 0) return 'expired — refresh on next call';
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `in ${mins} min`;
  const hrs = Math.round(mins / 60);
  return `in ${hrs} hr`;
}
