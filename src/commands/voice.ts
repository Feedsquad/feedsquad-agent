/**
 * `feedsquad voice-match "<text>"` — rewrite arbitrary text in the
 * operator's calibrated brand voice.
 *
 * Takes any input text — a draft, an email, an old post, an article,
 * notes from a call — and returns it rewritten in the operator's
 * voice. The voice context lives server-side; the CLI passes only
 * the text. Empty / generic output usually means brand-voice context
 * hasn't been seeded yet; run `feedsquad context show` to check.
 *
 * Implementation: posts to the adapt_for_platform tool with an
 * angle override that turns off the platform-formatting bias —
 * preserves source structure and length, applies brand voice,
 * skips hashtag injection, no thread-splitting.
 */

import type { ProfileCredentials } from '../credentials.js';
import { callTool } from '../api.js';
import { bold, dim, printError, yellow } from '../format.js';

interface VoiceMatchFlags {
  /** Optional extra direction (e.g. "make it shorter", "more contrarian"). */
  angle?: string;
  /**
   * Underlying platform target. Default: linkedin (longest natural-prose
   * surface). Pass --as twitter for short-form rewrites.
   */
  as?: string;
  /** Print raw JSON instead of just the rewritten text. */
  json?: boolean;
}

const VOICE_OVERRIDE_ANGLE =
  'This is a voice-rewrite, not a platform-tuned post. ' +
  'Preserve structure, length, and intent of the source as closely as possible. ' +
  'Match the operator\'s brand voice from the system prompt. ' +
  'Do not add hashtags, do not reformat as a social post unless the source already is one. ' +
  'Do not split into a thread. Output only the rewritten text.';

export async function voiceMatch(
  creds: ProfileCredentials,
  profileName: string,
  text: string,
  flags: VoiceMatchFlags,
): Promise<number> {
  if (!text || text.trim().length === 0) {
    printError(
      'Missing text to rewrite.',
      'Usage: feedsquad voice-match "<text>" [--angle "<extra direction>"] [--as linkedin|twitter|threads]',
    );
    return 2;
  }

  const platform = flags.as || 'linkedin';
  const angle = flags.angle ? `${VOICE_OVERRIDE_ANGLE}\nAdditional direction: ${flags.angle}` : VOICE_OVERRIDE_ANGLE;

  try {
    const result = await callTool(
      creds,
      'adapt_for_platform',
      {
        draft: text,
        platforms: [platform],
        angle,
      },
      { profileName },
    );

    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    const adaptations = Array.isArray(result.adaptations)
      ? (result.adaptations as Array<Record<string, unknown>>)
      : [];

    if (adaptations.length === 0) {
      printError('Voice-match returned no result. The brand-voice context may be empty — run `feedsquad context show` to check.');
      return 1;
    }

    const out = adaptations[0];
    if (out.error) {
      printError(typeof out.message === 'string' ? out.message : 'Voice-match generation failed.');
      return 1;
    }

    if (!result.brand_voice_applied && !flags.json) {
      console.error(
        yellow('!') +
          ' ' +
          dim(
            'No brand voice on file — output is generic. ' +
              'Seed your voice through onboarding in the FeedSquad dashboard.',
          ),
      );
      console.error();
    }

    // Print only the rewritten text on stdout — agent-friendly composition.
    // Header/metadata go to stderr so `feedsquad voice-match ... | pbcopy` works.
    const content = typeof out.content === 'string' ? out.content : '';
    console.error(bold('── voice-matched ──'));
    console.log(content);

    return 0;
  } catch (err) {
    printError(err instanceof Error ? err.message : 'Voice-match failed.');
    return 1;
  }
}
