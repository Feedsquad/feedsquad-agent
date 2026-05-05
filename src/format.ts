/**
 * Tiny terminal formatting helpers — no chalk dep.
 * ANSI is enabled when stdout is a TTY and NO_COLOR is unset
 * (per https://no-color.org and https://bixense.com/clicolors).
 */

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

const RESET = '\x1b[0m';
function wrap(code: string, s: string): string {
  if (!useColor) return s;
  return `${code}${s}${RESET}`;
}

export const dim = (s: string) => wrap('\x1b[2m', s);
export const bold = (s: string) => wrap('\x1b[1m', s);
export const red = (s: string) => wrap('\x1b[31m', s);
export const green = (s: string) => wrap('\x1b[32m', s);
export const yellow = (s: string) => wrap('\x1b[33m', s);
export const cyan = (s: string) => wrap('\x1b[36m', s);

export function statusBadge(status: string): string {
  const s = status.toLowerCase();
  if (s === 'published') return green('● published');
  if (s === 'scheduled' || s === 'approved') return cyan('◐ scheduled');
  if (s === 'ready' || s === 'pending_approval' || s === 'pending approval') return yellow('◑ pending');
  if (s === 'failed') return red('✕ failed');
  if (s === 'archived' || s === 'cancelled' || s === 'canceled') return dim('◦ archived');
  return dim(`◦ ${status}`);
}

export function platformBadge(platform: string | undefined): string {
  const p = (platform || '').toLowerCase();
  if (p === 'linkedin') return cyan('in');
  if (p === 'twitter' || p === 'x') return bold('𝕏');
  if (p === 'threads') return cyan('@');
  return dim(p || '?');
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return dim('—');
  const d = new Date(iso);
  if (isNaN(d.getTime())) return dim(iso);
  // Locale-neutral, fits agent-output style: 2026-05-05 14:33
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

/** Read a single line from stdin (TTY interactive prompt). */
export async function prompt(question: string): Promise<string> {
  process.stdout.write(question);
  return new Promise((resolve) => {
    let buf = '';
    const onData = (chunk: Buffer) => {
      const s = chunk.toString('utf-8');
      const newline = s.indexOf('\n');
      if (newline >= 0) {
        buf += s.slice(0, newline);
        process.stdin.removeListener('data', onData);
        process.stdin.pause();
        resolve(buf.trim());
      } else {
        buf += s;
      }
    };
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

export async function confirm(question: string, defaultYes = false): Promise<boolean> {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  const ans = (await prompt(`${question} ${hint} `)).toLowerCase();
  if (!ans) return defaultYes;
  return ans === 'y' || ans === 'yes';
}

/** Render a simple table, auto-sized columns, max width per column. */
export function table(rows: Array<Record<string, string>>, columns: string[], maxWidths?: Record<string, number>): string {
  if (rows.length === 0) return dim('(no rows)');
  const widths = columns.map((c) => {
    const maxLen = Math.max(c.length, ...rows.map((r) => stripAnsi(r[c] || '').length));
    const cap = maxWidths?.[c] ?? Infinity;
    return Math.min(maxLen, cap);
  });
  const header = columns.map((c, i) => bold(padOrTrunc(c, widths[i]))).join('  ');
  const sep = columns.map((_, i) => dim('─'.repeat(widths[i]))).join('  ');
  const body = rows
    .map((r) =>
      columns
        .map((c, i) => padOrTrunc(r[c] || '', widths[i]))
        .join('  '),
    )
    .join('\n');
  return `${header}\n${sep}\n${body}`;
}

function padOrTrunc(s: string, width: number): string {
  const visible = stripAnsi(s);
  if (visible.length === width) return s;
  if (visible.length > width) {
    // Trim from the visible string (lose ANSI but acceptable for narrow cells).
    return visible.slice(0, width - 1) + '…';
  }
  return s + ' '.repeat(width - visible.length);
}

function stripAnsi(s: string): string {
  // Strips CSI sequences. Sufficient for the codes we emit.
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

/** Print an error message to stderr in red (when colors are on). */
export function printError(message: string, hint?: string): void {
  console.error(`${red('✕')} ${message}`);
  if (hint) console.error(dim(`  ${hint}`));
}

/** Print a success line to stdout. */
export function printSuccess(message: string): void {
  console.log(`${green('✓')} ${message}`);
}
