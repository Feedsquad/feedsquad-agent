import { runLogin } from '../auth.js';
import { printError, printSuccess, dim } from '../format.js';
import { credentialsLocation } from '../credentials.js';

export interface LoginArgs {
  apiBase: string;
  profile: string;
  scopes?: string;
}

export async function loginCommand(args: LoginArgs): Promise<number> {
  try {
    const creds = await runLogin({
      apiBase: args.apiBase,
      profileName: args.profile,
      ...(args.scopes ? { scopes: args.scopes } : {}),
    });
    printSuccess(`Logged in as profile "${args.profile}".`);
    console.log(dim(`  Granted scopes: ${creds.scope}`));
    console.log(dim(`  Saved to: ${credentialsLocation()}`));
    return 0;
  } catch (err) {
    printError(`Login failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    return 1;
  }
}
