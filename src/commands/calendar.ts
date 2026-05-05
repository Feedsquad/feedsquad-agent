import type { ProfileCredentials } from '../credentials.js';
import { callTool } from '../api.js';
import { dim, bold, fmtDate, platformBadge, printError, statusBadge, table, truncate } from '../format.js';

export interface CalendarFlags {
  from?: string;
  to?: string;
  platform?: string;
  status?: string;
  limit?: number;
  json?: boolean;
}

export async function calendarCommand(
  creds: ProfileCredentials,
  profileName: string,
  flags: CalendarFlags,
): Promise<number> {
  const params: Record<string, unknown> = { response_format: 'concise' };
  if (flags.from) params.start_date = flags.from;
  if (flags.to) params.end_date = flags.to;
  if (flags.platform) params.platforms = [flags.platform];
  if (flags.status) params.statuses = [flags.status];
  if (typeof flags.limit === 'number') params.limit = flags.limit;

  try {
    const result = await callTool(creds, 'get_calendar', params, { profileName });
    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    const posts = Array.isArray(result.posts) ? (result.posts as Array<Record<string, unknown>>) : [];
    const summary = (result.summary || {}) as Record<string, number>;

    console.log(bold('Calendar') + dim(`  (${posts.length} posts)`));
    if (Object.keys(summary).length > 0) {
      const parts = [
        `${summary.drafts ?? 0} drafts`,
        `${summary.pending_approval ?? 0} pending`,
        `${summary.approved ?? 0} scheduled`,
        `${summary.published ?? 0} published`,
      ];
      console.log(dim(`  ${parts.join('  ·  ')}`));
    }
    console.log();
    if (posts.length === 0) {
      console.log(dim('  (no posts in this window)'));
      return 0;
    }
    const rows = posts.map((p) => ({
      ID: truncate(String(p.id || ''), 12),
      Plat: platformBadge(typeof p.platform === 'string' ? p.platform : ''),
      Status: statusBadge(typeof p.status === 'string' ? p.status : ''),
      Scheduled: fmtDate(typeof p.scheduled_date === 'string' ? p.scheduled_date : null),
      Preview: truncate(typeof p.preview === 'string' ? p.preview : '', 60),
    }));
    console.log(table(rows, ['ID', 'Plat', 'Status', 'Scheduled', 'Preview']));
    return 0;
  } catch (err) {
    printError(err instanceof Error ? err.message : 'Failed to fetch calendar.');
    return 1;
  }
}
