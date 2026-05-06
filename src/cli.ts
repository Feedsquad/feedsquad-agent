#!/usr/bin/env node
/**
 * FeedSquad CLI entrypoint.
 *
 *   feedsquad <command> [subcommand] [args] [--flags]
 *
 * Top-level commands:
 *   login | logout | whoami | auth (alias namespace)
 *   post {draft,list,show,publish,delete,adapt,approve}
 *   campaign {create,approve,cancel}
 *   calendar
 *   insights
 *   health
 *   version | help
 *
 * Global flags:
 *   --api-base <url>     Override the FeedSquad server URL.
 *                        Defaults to FEEDSQUAD_API_BASE env or
 *                        https://feedsquad.com.
 *   --profile <name>     Switch credential profile (default: 'default').
 *   --json               Print raw JSON output (where supported).
 *
 * Auth model: OAuth 2.1 + PKCE. Run `feedsquad login` to authenticate.
 * Tokens are stored at $XDG_CONFIG_HOME/feedsquad/credentials (mode 0600).
 */

import { parseArgs } from 'node:util';
import { loadProfile } from './credentials.js';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { whoamiCommand } from './commands/whoami.js';
import { calendarCommand } from './commands/calendar.js';
import { insightsCommand } from './commands/insights.js';
import { healthCommand } from './commands/health.js';
import {
  postDraft,
  postList,
  postShow,
  postPublish,
  postDelete,
  postAdapt,
  postApprove,
} from './commands/post.js';
import { campaignCreate, campaignApprove, campaignCancel } from './commands/campaign.js';
import { voiceMatch } from './commands/voice.js';
import { contextShow } from './commands/context.js';
import { dim, bold, printError } from './format.js';

const VERSION = '0.1.0';

const HELP = `${bold('feedsquad')} ${dim(`v${VERSION}`)}  ${dim('— FeedSquad CLI for agent workflows.')}

${bold('Voice')}
  feedsquad voice-match "<text>"         Rewrite text in your calibrated brand voice
    [--angle "<extra direction>"] [--as linkedin|twitter|threads] [--json]

${bold('Auth')}
  feedsquad login                        Open browser to authenticate (OAuth 2.1 PKCE)
  feedsquad logout                       Remove the active profile's credentials
  feedsquad whoami                       Show current profile + scopes
  feedsquad auth login|logout|status     Aliases for the above

${bold('Posts')}
  feedsquad post draft "<idea>"          Generate a calibrated draft from an idea
    [--platform x|li|threads] [--schedule <iso>] [--literal] [--dry-run]
  feedsquad post create -c "<text>" -s <iso-time> -i <platform>
                                         Schedule literal text (no generation)
  feedsquad post list                    Show calendar posts (concise)
    [--platform <p>] [--status <s>] [--limit <n>] [--json]
  feedsquad post show <id>               Show one post detail
    [--include analytics,history] [--json]
  feedsquad post approve <id>            Approve a draft for scheduled publishing
    [--schedule <iso>] [--yes]
  feedsquad post publish <id>            Publish immediately (asks to confirm)
    [--yes] [--dry-run]
  feedsquad post delete <id>             Delete a draft (asks to confirm)
    [--yes] [--dry-run]
  feedsquad post adapt "<draft>"         Adapt a draft for multiple platforms
    --platforms linkedin,twitter,threads [--angle <text>] [--json]

${bold('Campaigns')}
  feedsquad campaign create --name "<n>" [--theme] [--platform] [--posts-per-week] [--weeks]
  feedsquad campaign approve <id>        Approve all posts in a campaign  [--yes]
  feedsquad campaign cancel <id>         Cancel + delete all unpublished campaign posts  [--yes]

${bold('Calendar + intelligence')}
  feedsquad calendar                     Calendar overview
    [--from <date>] [--to <date>] [--platform <p>] [--status <s>] [--limit <n>] [--json]
  feedsquad context show [section]       Show your account and brand-context status
  feedsquad health                       Calendar-health audit (clusters, gaps, drift)
    [--lookback <days>] [--lookahead <days>] [--platform <p>] [--json]
  feedsquad insights                     Performance insights with LLM summary
    [--platform <p>] [--lookback <days>] [--top-n <n>] [--no-summary] [--json]
  feedsquad analytics last7d             Alias: insights with --lookback 7
    [--platform <p>] [--json]

${bold('Global flags')}
  --api-base <url>    Override server URL (default: $FEEDSQUAD_API_BASE or https://feedsquad.com)
  --profile <name>    Switch credential profile (default: 'default')
  --json              Print raw JSON output where supported
  --help, -h          Show this help
  --version, -v       Print version

${dim('Docs: https://feedsquad.com/mcp  ·  Issues: https://github.com/Feedsquad/feedsquad-agent/issues')}
`;

function defaultApiBase(): string {
  return (process.env.FEEDSQUAD_API_BASE || 'https://feedsquad.com').replace(/\/+$/, '');
}

function parseCommaList(v: string | undefined): string[] {
  if (!v) return [];
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

function parseNumber(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

interface ParsedTop {
  positional: string[];
  values: Record<string, string | boolean | string[] | undefined>;
}

/**
 * Run parseArgs in non-strict mode so subcommand-specific flags don't trip
 * top-level parsing. We pass `strict: false, allowPositionals: true` and
 * accept everything as string|boolean.
 */
function parseTop(argv: string[]): ParsedTop {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      'api-base': { type: 'string' },
      'profile': { type: 'string' },
      'help': { type: 'boolean', short: 'h' },
      'version': { type: 'boolean', short: 'v' },
      'json': { type: 'boolean' },
      'platform': { type: 'string' },
      'platforms': { type: 'string' },
      'status': { type: 'string' },
      'statuses': { type: 'string' },
      'limit': { type: 'string' },
      'from': { type: 'string' },
      'to': { type: 'string' },
      'schedule': { type: 'string', short: 's' },
      'title': { type: 'string' },
      'include': { type: 'string' },
      'lookback': { type: 'string' },
      'lookahead': { type: 'string' },
      'top-n': { type: 'string' },
      'no-summary': { type: 'boolean' },
      'angle': { type: 'string' },
      'theme': { type: 'string' },
      'description': { type: 'string' },
      'name': { type: 'string' },
      'posts-per-week': { type: 'string' },
      'weeks': { type: 'string' },
      'dry-run': { type: 'boolean' },
      'yes': { type: 'boolean', short: 'y' },
      'scopes': { type: 'string' },
      // post create -c -s -i shortcut flags from the plan / Postiz pattern
      'content': { type: 'string', short: 'c' },
      'integration': { type: 'string', short: 'i' },
      // (-s collides with --schedule; commander-style we'd need a separate
      // long form. For zero-deps parseArgs, we accept --schedule and -s
      // both. parseArgs uses long form natively; the short option below
      // is the standard way to map -s -> schedule.)
      'as': { type: 'string' },
      'literal': { type: 'boolean' },
    },
    strict: false,
    allowPositionals: true,
  });
  return { positional: positionals, values: values as ParsedTop['values'] };
}

async function withProfile<T>(
  profileName: string,
  fn: (creds: NonNullable<ReturnType<typeof loadProfile>>['creds']) => Promise<T> | T,
): Promise<T | number> {
  const profile = loadProfile(profileName);
  if (!profile) {
    printError(`Not logged in as "${profileName}".`, 'Run `feedsquad login` first.');
    return 1;
  }
  return fn(profile.creds);
}

async function dispatch(argv: string[]): Promise<number> {
  const parsed = parseTop(argv);
  const { positional, values } = parsed;
  const profileName = (values['profile'] as string | undefined) || 'default';
  const apiBase = (values['api-base'] as string | undefined) || defaultApiBase();

  if (values['help']) {
    console.log(HELP);
    return 0;
  }
  if (values['version']) {
    console.log(VERSION);
    return 0;
  }
  if (positional.length === 0) {
    console.log(HELP);
    return 0;
  }

  const [cmd, ...rest] = positional;

  switch (cmd) {
    case 'help':
      console.log(HELP);
      return 0;
    case 'version':
      console.log(VERSION);
      return 0;

    // ---- Auth (flat) ----
    case 'login':
      return loginCommand({
        apiBase,
        profile: profileName,
        ...(typeof values['scopes'] === 'string' ? { scopes: values['scopes'] as string } : {}),
      });
    case 'logout':
      return logoutCommand(profileName);
    case 'whoami':
      return whoamiCommand(profileName);

    // ---- Auth (namespaced alias) ----
    case 'auth': {
      const sub = rest[0];
      if (sub === 'login') return loginCommand({ apiBase, profile: profileName });
      if (sub === 'logout') return logoutCommand(profileName);
      if (sub === 'status' || sub === 'whoami') return whoamiCommand(profileName);
      printError(`Unknown auth subcommand: ${sub || '(none)'}`, 'Try: feedsquad auth login|logout|status');
      return 2;
    }

    // ---- Voice-match — the lead command ----
    case 'voice-match':
    case 'voice': {
      return (await withProfile(profileName, (creds) =>
        voiceMatch(creds, profileName, rest.join(' '), {
          ...(typeof values['angle'] === 'string' ? { angle: values['angle'] as string } : {}),
          ...(typeof values['as'] === 'string' ? { as: values['as'] as string } : {}),
          ...(values['json'] ? { json: true } : {}),
        }),
      )) as number;
    }

    // ---- Context status ----
    case 'context': {
      const sub = rest[0];
      if (sub !== 'show' && sub !== undefined) {
        printError(`Unknown context subcommand: ${sub}`, 'Try: feedsquad context show [section]');
        return 2;
      }
      const section = sub === 'show' ? rest[1] : undefined;
      return (await withProfile(profileName, (creds) =>
        contextShow(creds, profileName, section, {
          ...(values['json'] ? { json: true } : {}),
        }),
      )) as number;
    }

    // ---- Analytics — alias for `insights --lookback 7` ----
    case 'analytics': {
      // `feedsquad analytics last7d [--platform]` or `analytics last30d`
      const sub = rest[0] || 'last7d';
      const lookbackMatch = sub.match(/^last(\d+)d$/i);
      const lookback = lookbackMatch ? Number(lookbackMatch[1]) : 7;
      return (await withProfile(profileName, (creds) =>
        insightsCommand(creds, profileName, {
          ...(typeof values['platform'] === 'string' ? { platform: values['platform'] as string } : {}),
          lookback,
          ...(parseNumber(values['top-n'] as string) !== undefined
            ? { topN: parseNumber(values['top-n'] as string)! }
            : {}),
          ...(values['no-summary'] ? { noSummary: true } : {}),
          ...(values['json'] ? { json: true } : {}),
        }),
      )) as number;
    }

    case 'calendar': {
      return (await withProfile(profileName, (creds) =>
        calendarCommand(creds, profileName, {
          ...(typeof values['from'] === 'string' ? { from: values['from'] as string } : {}),
          ...(typeof values['to'] === 'string' ? { to: values['to'] as string } : {}),
          ...(typeof values['platform'] === 'string' ? { platform: values['platform'] as string } : {}),
          ...(typeof values['status'] === 'string' ? { status: values['status'] as string } : {}),
          ...(parseNumber(values['limit'] as string) !== undefined
            ? { limit: parseNumber(values['limit'] as string)! }
            : {}),
          ...(values['json'] ? { json: true } : {}),
        }),
      )) as number;
    }

    case 'insights': {
      return (await withProfile(profileName, (creds) =>
        insightsCommand(creds, profileName, {
          ...(typeof values['platform'] === 'string' ? { platform: values['platform'] as string } : {}),
          ...(parseNumber(values['lookback'] as string) !== undefined
            ? { lookback: parseNumber(values['lookback'] as string)! }
            : {}),
          ...(parseNumber(values['top-n'] as string) !== undefined
            ? { topN: parseNumber(values['top-n'] as string)! }
            : {}),
          ...(values['no-summary'] ? { noSummary: true } : {}),
          ...(values['json'] ? { json: true } : {}),
        }),
      )) as number;
    }

    case 'health': {
      return (await withProfile(profileName, (creds) =>
        healthCommand(creds, profileName, {
          ...(parseNumber(values['lookback'] as string) !== undefined
            ? { lookback: parseNumber(values['lookback'] as string)! }
            : {}),
          ...(parseNumber(values['lookahead'] as string) !== undefined
            ? { lookahead: parseNumber(values['lookahead'] as string)! }
            : {}),
          ...(typeof values['platform'] === 'string' ? { platform: values['platform'] as string } : {}),
          ...(values['json'] ? { json: true } : {}),
        }),
      )) as number;
    }

    case 'post': {
      const sub = rest[0];
      const remaining = rest.slice(1);
      const arg = remaining[0];

      switch (sub) {
        case 'draft':
          return (await withProfile(profileName, (creds) =>
            postDraft({ creds, profileName }, arg || '', {
              ...(typeof values['platform'] === 'string' ? { platform: values['platform'] as string } : {}),
              ...(typeof values['schedule'] === 'string' ? { schedule: values['schedule'] as string } : {}),
              ...(typeof values['title'] === 'string' ? { title: values['title'] as string } : {}),
              ...(values['dry-run'] ? { dryRun: true } : {}),
              // Honor explicit literal opt-in via flag.
              ...(values['literal'] ? { literal: true } : {}),
            }),
          )) as number;

        case 'create':
          // Postiz-pattern shortcut: -c content, -s schedule, -i integration (platform).
          // Equivalent to `post draft "<content>" --literal --platform <i> --schedule <s>`.
          return (await withProfile(profileName, (creds) =>
            postDraft(
              { creds, profileName },
              (values['content'] as string | undefined) || arg || '',
              {
                literal: true,
                ...(typeof values['integration'] === 'string'
                  ? { platform: values['integration'] as string }
                  : typeof values['platform'] === 'string'
                    ? { platform: values['platform'] as string }
                    : {}),
                ...(typeof values['schedule'] === 'string' ? { schedule: values['schedule'] as string } : {}),
                ...(typeof values['title'] === 'string' ? { title: values['title'] as string } : {}),
                ...(values['dry-run'] ? { dryRun: true } : {}),
              },
            ),
          )) as number;

        case 'list':
          return (await withProfile(profileName, (creds) =>
            postList({ creds, profileName }, {
              ...(typeof values['platform'] === 'string' ? { platform: values['platform'] as string } : {}),
              ...(typeof values['status'] === 'string' ? { status: values['status'] as string } : {}),
              ...(parseNumber(values['limit'] as string) !== undefined
                ? { limit: parseNumber(values['limit'] as string)! }
                : {}),
              ...(values['json'] ? { json: true } : {}),
            }),
          )) as number;

        case 'show':
          return (await withProfile(profileName, (creds) =>
            postShow({ creds, profileName }, arg || '', {
              ...(typeof values['include'] === 'string'
                ? { include: parseCommaList(values['include'] as string) }
                : {}),
              ...(values['json'] ? { json: true } : {}),
            }),
          )) as number;

        case 'approve':
          return (await withProfile(profileName, (creds) =>
            postApprove({ creds, profileName }, arg || '', {
              ...(values['yes'] ? { yes: true } : {}),
              ...(typeof values['schedule'] === 'string' ? { schedule: values['schedule'] as string } : {}),
            }),
          )) as number;

        case 'publish':
          return (await withProfile(profileName, (creds) =>
            postPublish({ creds, profileName }, arg || '', {
              ...(values['yes'] ? { yes: true } : {}),
              ...(values['dry-run'] ? { dryRun: true } : {}),
            }),
          )) as number;

        case 'delete':
        case 'rm':
          return (await withProfile(profileName, (creds) =>
            postDelete({ creds, profileName }, arg || '', {
              ...(values['yes'] ? { yes: true } : {}),
              ...(values['dry-run'] ? { dryRun: true } : {}),
            }),
          )) as number;

        case 'adapt':
          return (await withProfile(profileName, (creds) =>
            postAdapt({ creds, profileName }, arg || '', {
              platforms: parseCommaList(
                (values['platforms'] as string | undefined) || (values['platform'] as string | undefined),
              ),
              ...(typeof values['angle'] === 'string' ? { angle: values['angle'] as string } : {}),
              ...(values['json'] ? { json: true } : {}),
            }),
          )) as number;

        default:
          printError(`Unknown post subcommand: ${sub || '(none)'}`,
            'Try: feedsquad post draft|list|show|approve|publish|delete|adapt');
          return 2;
      }
    }

    case 'campaign': {
      const sub = rest[0];
      const remaining = rest.slice(1);
      switch (sub) {
        case 'create':
          return (await withProfile(profileName, (creds) =>
            campaignCreate({ creds, profileName }, {
              name: (values['name'] as string | undefined) || '',
              ...(typeof values['theme'] === 'string' ? { theme: values['theme'] as string } : {}),
              ...(typeof values['platform'] === 'string' ? { platform: values['platform'] as string } : {}),
              ...(typeof values['description'] === 'string' ? { description: values['description'] as string } : {}),
              ...(parseNumber(values['posts-per-week'] as string) !== undefined
                ? { postsPerWeek: parseNumber(values['posts-per-week'] as string)! }
                : {}),
              ...(parseNumber(values['weeks'] as string) !== undefined
                ? { durationWeeks: parseNumber(values['weeks'] as string)! }
                : {}),
            }),
          )) as number;

        case 'approve':
          return (await withProfile(profileName, (creds) =>
            campaignApprove({ creds, profileName }, remaining[0] || '', {
              ...(values['yes'] ? { yes: true } : {}),
            }),
          )) as number;

        case 'cancel':
          return (await withProfile(profileName, (creds) =>
            campaignCancel({ creds, profileName }, remaining[0] || '', {
              ...(values['yes'] ? { yes: true } : {}),
            }),
          )) as number;

        default:
          printError(`Unknown campaign subcommand: ${sub || '(none)'}`,
            'Try: feedsquad campaign create|approve|cancel');
          return 2;
      }
    }

    default:
      printError(`Unknown command: ${cmd}`, 'Run `feedsquad help` for the full list.');
      return 2;
  }
}

const argv = process.argv.slice(2);
dispatch(argv)
  .then((code) => {
    process.exit(typeof code === 'number' ? code : 0);
  })
  .catch((err) => {
    printError(`Internal error: ${err instanceof Error ? err.message : 'unknown'}`);
    process.exit(1);
  });
