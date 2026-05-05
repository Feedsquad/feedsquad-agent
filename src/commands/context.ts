/**
 * `feedsquad context show [section]` — surface what your FeedSquad
 * account knows about you: tier, connected platforms, usage, and
 * (when populated) brand-context sections like voice / brand / story.
 *
 * Returns the operator's calibrated voice and brand context.
 * Empty state is informative when no context has been seeded yet —
 * complete onboarding in the FeedSquad dashboard or import voice
 * samples to populate the per-section views.
 */

import type { ProfileCredentials } from '../credentials.js';
import { callTool } from '../api.js';
import { bold, cyan, dim, printError } from '../format.js';

interface ContextFlags {
  full?: boolean;
  json?: boolean;
}

const KNOWN_SECTIONS = ['story', 'voice', 'brand', 'brain', 'people', 'momentum'] as const;

export async function contextShow(
  creds: ProfileCredentials,
  profileName: string,
  section: string | undefined,
  flags: ContextFlags,
): Promise<number> {
  try {
    const usage = await callTool(creds, 'get_usage', {}, { profileName });
    if (flags.json) {
      console.log(
        JSON.stringify(
          {
            section: section || 'summary',
            sections_available: [],
            sections_known: KNOWN_SECTIONS,
            account: usage,
          },
          null,
          2,
        ),
      );
      return 0;
    }

    console.log(bold('Context'));
    console.log(
      dim(
        '  Brand-context sections (story / voice / brand / brain / people / momentum)\n' +
          '  populate as you complete onboarding. v0.1 of this command shows\n' +
          '  account state below; per-section views land as each section is wired\n' +
          '  through to the API.',
      ),
    );
    console.log();
    console.log(bold('Account state'));
    const tier = (usage.tier as string) || 'unknown';
    const linkedinConnected = usage.linkedin_connected;
    console.log(`  ${dim('tier:')}              ${cyan(tier)}`);
    console.log(`  ${dim('linkedin:')}          ${linkedinConnected ? cyan('connected') : dim('not connected')}`);

    const mcpUsage = (usage.mcp_usage || {}) as Record<string, unknown>;
    if (typeof mcpUsage.posts_this_month === 'number') {
      const limit = mcpUsage.monthly_limit ?? 'unlimited';
      console.log(`  ${dim('posts/month:')}        ${mcpUsage.posts_this_month} / ${limit}`);
    }

    if (section) {
      console.log();
      console.log(
        dim(
          `  Section "${section}" requested but not yet available via the CLI.\n` +
            '  Seed the section in the FeedSquad dashboard or by importing voice\n' +
            '  samples, then retry — sections become readable as they\'re populated.',
        ),
      );
    }

    return 0;
  } catch (err) {
    printError(err instanceof Error ? err.message : 'Failed to fetch context.');
    return 1;
  }
}
