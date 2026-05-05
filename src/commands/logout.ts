import { deleteProfile, loadCredentialsFile } from '../credentials.js';
import { printError, printSuccess, dim } from '../format.js';

export function logoutCommand(profile: string): number {
  const file = loadCredentialsFile();
  if (!file || !file.profiles[profile]) {
    printError(`No saved credentials for profile "${profile}".`);
    return 1;
  }
  deleteProfile(profile);
  printSuccess(`Logged out of profile "${profile}".`);
  const remaining = Object.keys(loadCredentialsFile()?.profiles || {});
  if (remaining.length > 0) {
    console.log(dim(`  Remaining profiles: ${remaining.join(', ')}`));
  }
  return 0;
}
