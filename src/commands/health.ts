import type { ProfileCredentials } from '../credentials.js';
import { callTool } from '../api.js';
import { bold, cyan, dim, fmtDate, green, platformBadge, printError, red, yellow } from '../format.js';

export interface HealthFlags {
  lookback?: number;
  lookahead?: number;
  platform?: string;
  json?: boolean;
}

export async function healthCommand(
  creds: ProfileCredentials,
  profileName: string,
  flags: HealthFlags,
): Promise<number> {
  const params: Record<string, unknown> = {};
  if (typeof flags.lookback === 'number') params.lookback_days = flags.lookback;
  if (typeof flags.lookahead === 'number') params.lookahead_days = flags.lookahead;
  if (flags.platform) params.platforms = [flags.platform];

  try {
    const result = await callTool(creds, 'get_calendar_health', params, { profileName });
    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    const overall = String(result.health || 'unknown');
    const overallBadge =
      overall === 'pass' ? green('● pass') : overall === 'warn' ? yellow('● warn') : red('● fail');

    console.log(bold('Calendar health: ') + overallBadge);
    const summary = (result.summary || {}) as Record<string, number | null>;
    console.log(
      dim(
        `  stale_drafts=${summary.stale_drafts ?? 0}  unapproved_scheduled=${summary.unapproved_scheduled ?? 0}  clusters=${summary.clusters ?? 0}  gaps=${summary.gaps ?? 0}`,
      ),
    );
    if (summary.cadence_drift_pct !== null && summary.cadence_drift_pct !== undefined) {
      const drift = summary.cadence_drift_pct;
      const driftLabel = drift > 0 ? cyan(`+${drift}%`) : drift < 0 ? yellow(`${drift}%`) : dim('±0%');
      console.log(dim('  cadence_drift_vs_prev_window: ') + driftLabel);
    }

    const clusters = Array.isArray(result.clusters) ? (result.clusters as Array<Record<string, unknown>>) : [];
    if (clusters.length > 0) {
      console.log();
      console.log(bold('Clusters (3+ posts in 4h):'));
      for (const c of clusters) {
        const ids = Array.isArray(c.post_ids) ? (c.post_ids as string[]) : [];
        console.log(
          `  ${platformBadge(String(c.platform || ''))}  ${fmtDate(typeof c.window_start === 'string' ? c.window_start : null)}  → ${ids.length} posts`,
        );
      }
    }

    const gaps = Array.isArray(result.gaps) ? (result.gaps as Array<Record<string, unknown>>) : [];
    if (gaps.length > 0) {
      console.log();
      console.log(bold('Gaps (>72h):'));
      for (const g of gaps) {
        console.log(
          `  ${platformBadge(String(g.platform || ''))}  ${fmtDate(typeof g.from === 'string' ? g.from : null)} → ${fmtDate(typeof g.to === 'string' ? g.to : null)}  (${g.gap_hours}h)`,
        );
      }
    }

    const stale = Array.isArray(result.stale_drafts) ? (result.stale_drafts as Array<Record<string, unknown>>) : [];
    if (stale.length > 0) {
      console.log();
      console.log(bold('Stale drafts (>14d):'));
      for (const s of stale) {
        console.log(`  ${dim(String(s.id || ''))}  ${platformBadge(String(s.platform || ''))}  ${s.age_days}d old`);
      }
    }

    return 0;
  } catch (err) {
    printError(err instanceof Error ? err.message : 'Failed to fetch calendar health.');
    return 1;
  }
}
