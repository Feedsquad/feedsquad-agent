import type { ProfileCredentials } from '../credentials.js';
import { callTool } from '../api.js';
import { bold, cyan, dim, fmtDate, platformBadge, printError, truncate, yellow } from '../format.js';

export interface InsightsFlags {
  platform?: string;
  lookback?: number;
  topN?: number;
  noSummary?: boolean;
  json?: boolean;
}

export async function insightsCommand(
  creds: ProfileCredentials,
  profileName: string,
  flags: InsightsFlags,
): Promise<number> {
  const params: Record<string, unknown> = {};
  if (flags.platform) params.platform = flags.platform;
  if (typeof flags.lookback === 'number') params.lookback_days = flags.lookback;
  if (typeof flags.topN === 'number') params.top_n = flags.topN;
  if (flags.noSummary) params.include_summary = false;

  try {
    const result = await callTool(creds, 'get_performance_insights', params, { profileName });
    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    const sample = result.sample_size ?? 0;
    const lookback = result.lookback_days ?? '?';
    console.log(bold(`Performance insights`) + dim(`  ${result.platform || 'all'} · last ${lookback}d · ${sample} posts`));

    if (sample === 0) {
      console.log(dim('\n  No performance data in window. The analytics cron polls every few hours after a post publishes.'));
      console.log(dim('  Try again later or use --lookback to widen the window.'));
      return 0;
    }

    const top = Array.isArray(result.top_performers) ? (result.top_performers as Array<Record<string, unknown>>) : [];
    const bottom = Array.isArray(result.underperformers) ? (result.underperformers as Array<Record<string, unknown>>) : [];

    if (top.length > 0) {
      console.log();
      console.log(bold('Top performers'));
      for (const p of top) {
        printPerfRow(p);
      }
    }
    if (bottom.length > 0) {
      console.log();
      console.log(bold('Underperformers'));
      for (const p of bottom) {
        printPerfRow(p);
      }
    }

    if (result.summary) {
      console.log();
      console.log(bold('What worked'));
      console.log(`  ${result.summary}`);
    }
    if (result.suggested_next_angle) {
      console.log();
      console.log(bold('Next angle'));
      console.log(`  ${cyan(String(result.suggested_next_angle))}`);
    }

    return 0;
  } catch (err) {
    printError(err instanceof Error ? err.message : 'Failed to fetch insights.');
    return 1;
  }
}

function printPerfRow(p: Record<string, unknown>): void {
  const platform = platformBadge(typeof p.platform === 'string' ? p.platform : '');
  const er = typeof p.engagement_rate === 'number' ? p.engagement_rate.toFixed(2) : '?';
  const likes = p.likes ?? 0;
  const comments = p.comments ?? 0;
  const shares = p.shares ?? 0;
  const date = fmtDate(typeof p.published_date === 'string' ? p.published_date : null);
  const preview = truncate(typeof p.content_preview === 'string' ? p.content_preview : '', 80);
  const stats = `er=${er}  ${likes}❤  ${comments}💬  ${shares}🔁`;
  console.log(`  ${platform}  ${dim(date)}  ${yellow(stats)}`);
  console.log(`    ${preview || dim('(no preview available)')}`);
}
