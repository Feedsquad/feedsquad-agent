/**
 * `feedsquad post <subcommand>` — wraps the MCP post-management tools.
 *   draft    -> create_post
 *   list     -> get_calendar (concise format)
 *   show     -> get_post (with optional --include analytics,history)
 *   publish  -> publish_post (with confirm prompt unless --yes)
 *   delete   -> delete_post (with confirm prompt unless --yes)
 *   adapt    -> adapt_for_platform
 */

import type { ProfileCredentials } from '../credentials.js';
import { callTool } from '../api.js';
import { confirm, dim, bold, fmtDate, platformBadge, printError, printSuccess, statusBadge, table, truncate, yellow } from '../format.js';

interface PostCtx {
  creds: ProfileCredentials;
  profileName: string;
}

interface DraftFlags {
  platform?: string;
  schedule?: string;
  title?: string;
  dryRun?: boolean;
  /**
   * Skip LLM generation. Treat the input as the literal post content
   * and call create_post directly. Mirrors the `post create` shortcut
   * for users who already have polished text.
   */
  literal?: boolean;
}

/**
 * `feedsquad post draft "<idea>"` — generate a calibrated post from an
 * idea. Two-call flow per the Week-1 plan:
 *
 *   1. adapt_for_platform({draft: idea, platforms: [platform]}) → calibrated text
 *   2. create_post({content: calibrated, platform, ...}) → draft row
 *
 * The two-call shape is invisible to the user — they get one command,
 * one draft. If performance becomes an issue we collapse both calls
 * server-side via a new generate_post MCP tool. For v0.1, two calls
 * trade a ~1s round-trip for zero new MCP surface.
 *
 * Pass --literal to skip generation and store the input verbatim
 * (the original create_post behavior, useful for already-polished text).
 */
export async function postDraft(ctx: PostCtx, ideaOrContent: string, flags: DraftFlags): Promise<number> {
  if (!ideaOrContent || ideaOrContent.trim().length === 0) {
    printError(
      'Missing post idea.',
      'Usage: feedsquad post draft "<idea or text>" [--platform x|li|threads] [--literal]',
    );
    return 2;
  }

  const platform = flags.platform || 'linkedin';
  let content = ideaOrContent;

  if (!flags.literal) {
    // Generation path: ask the server to calibrate the idea against the
    // operator's brand voice, then create a draft from the result.
    try {
      const adapted = await callTool(
        ctx.creds,
        'adapt_for_platform',
        { draft: ideaOrContent, platforms: [platform] },
        { profileName: ctx.profileName },
      );
      const adaptations = Array.isArray(adapted.adaptations)
        ? (adapted.adaptations as Array<Record<string, unknown>>)
        : [];
      const first = adaptations[0];
      if (!first || first.error) {
        printError(
          typeof first?.message === 'string' ? first.message : 'Failed to generate calibrated draft.',
        );
        return 1;
      }
      content = typeof first.content === 'string' ? first.content : ideaOrContent;
    } catch (err) {
      printError(err instanceof Error ? err.message : 'Failed to generate draft.');
      return 1;
    }
  }

  // Step 2: create the draft row.
  const params: Record<string, unknown> = { content, platform };
  if (flags.schedule) params.scheduled_date = flags.schedule;
  if (flags.title) params.title = flags.title;
  if (flags.dryRun) params.dry_run = true;

  try {
    const result = await callTool(ctx.creds, 'create_post', params, { profileName: ctx.profileName });
    const dryRun = result.dry_run === true;
    if (dryRun) {
      const would = (result.would_create || {}) as Record<string, unknown>;
      printSuccess(`Dry run OK — would create ${would.platform || flags.platform} post (${would.char_count} chars).`);
      if (!flags.literal) console.log(dim('  (content was generated via voice-calibrated adapt_for_platform)'));
    } else {
      const draftId = (result.draft_id || (result.post as Record<string, unknown> | undefined)?.id) as string | undefined;
      printSuccess(`Draft created: ${bold(draftId || '(no id)')}`);
      const message = result.message;
      if (typeof message === 'string') console.log(dim(`  ${message}`));
      if (!flags.literal) {
        console.log(dim('  Voice-calibrated. To skip generation and store literal text, pass --literal.'));
      }
    }
    return 0;
  } catch (err) {
    printError(err instanceof Error ? err.message : 'Failed to create draft.');
    return 1;
  }
}

interface ListFlags {
  platform?: string;
  status?: string;
  limit?: number;
  json?: boolean;
}

export async function postList(ctx: PostCtx, flags: ListFlags): Promise<number> {
  const params: Record<string, unknown> = { response_format: 'concise' };
  if (flags.platform) params.platforms = [flags.platform];
  if (flags.status) params.statuses = [flags.status];
  if (typeof flags.limit === 'number') params.limit = flags.limit;

  try {
    const result = await callTool(ctx.creds, 'get_calendar', params, { profileName: ctx.profileName });
    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    const posts = Array.isArray(result.posts) ? (result.posts as Array<Record<string, unknown>>) : [];
    if (posts.length === 0) {
      console.log(dim('No posts in calendar.'));
      return 0;
    }
    const rows = posts.map((p) => ({
      ID: truncate(String(p.id || ''), 12),
      Platform: platformBadge(typeof p.platform === 'string' ? p.platform : ''),
      Status: statusBadge(typeof p.status === 'string' ? p.status : ''),
      Scheduled: fmtDate(typeof p.scheduled_date === 'string' ? p.scheduled_date : null),
      Preview: truncate(typeof p.preview === 'string' ? p.preview : '', 60),
    }));
    console.log(table(rows, ['ID', 'Platform', 'Status', 'Scheduled', 'Preview']));
    if (typeof result.next_cursor === 'string' && result.next_cursor) {
      console.log(dim(`\n  more available — pass --limit higher or use the API directly with cursor=${truncate(result.next_cursor, 16)}`));
    }
    return 0;
  } catch (err) {
    printError(err instanceof Error ? err.message : 'Failed to list calendar.');
    return 1;
  }
}

interface ShowFlags {
  include?: string[];
  json?: boolean;
}

export async function postShow(ctx: PostCtx, postId: string, flags: ShowFlags): Promise<number> {
  if (!postId) {
    printError('Missing post id.', 'Usage: feedsquad post show <id>');
    return 2;
  }
  const params: Record<string, unknown> = {
    post_id: postId,
    response_format: 'detailed',
  };
  if (flags.include && flags.include.length > 0) params.include = flags.include;

  try {
    const result = await callTool(ctx.creds, 'get_post', params, { profileName: ctx.profileName });
    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    const post = (result.post || {}) as Record<string, unknown>;
    console.log(bold('ID:       ') + (post.id || postId));
    console.log(bold('Platform: ') + platformBadge(typeof post.platform === 'string' ? post.platform : ''));
    console.log(bold('Status:   ') + statusBadge(typeof post.status === 'string' ? post.status : ''));
    if (post.scheduled_date) console.log(bold('Schedule: ') + fmtDate(post.scheduled_date as string));
    if (post.published_date) console.log(bold('Posted:   ') + fmtDate(post.published_date as string));
    if (post.platform_url) console.log(bold('Live URL: ') + (post.platform_url as string));
    console.log();
    console.log(post.content || dim('(no content)'));
    if (result.analytics) {
      console.log();
      console.log(bold('Analytics:'));
      console.log(JSON.stringify(result.analytics, null, 2));
    }
    if (result.publishing_history) {
      console.log();
      console.log(bold('Publishing history:'));
      console.log(JSON.stringify(result.publishing_history, null, 2));
    }
    return 0;
  } catch (err) {
    printError(err instanceof Error ? err.message : 'Failed to show post.');
    return 1;
  }
}

interface MutateFlags {
  yes?: boolean;
  dryRun?: boolean;
}

export async function postPublish(ctx: PostCtx, postId: string, flags: MutateFlags): Promise<number> {
  if (!postId) {
    printError('Missing post id.', 'Usage: feedsquad post publish <id>');
    return 2;
  }
  if (!flags.yes && !flags.dryRun) {
    const ok = await confirm(`${yellow('!')} Publish post ${bold(postId)} to its target platform now?`, false);
    if (!ok) {
      console.log(dim('  Cancelled.'));
      return 130;
    }
  }
  const params: Record<string, unknown> = { post_id: postId };
  if (flags.dryRun) params.dry_run = true;
  try {
    const result = await callTool(ctx.creds, 'publish_post', params, { profileName: ctx.profileName });
    if (result.dry_run) {
      const would = (result.would_publish || {}) as Record<string, unknown>;
      printSuccess(`Dry run OK — would publish to ${would.platform_label || would.platform}.`);
      return 0;
    }
    if (result.already_published) {
      printSuccess(`Already published. ${result.platform_url ? bold(String(result.platform_url)) : ''}`);
      return 0;
    }
    if (result.success) {
      printSuccess(`Published to ${result.platform || '?'}.`);
      if (result.platform_url) console.log(dim(`  URL: ${result.platform_url}`));
      return 0;
    }
    printError(typeof result.message === 'string' ? result.message : 'Publish failed.');
    return 1;
  } catch (err) {
    printError(err instanceof Error ? err.message : 'Failed to publish.');
    return 1;
  }
}

export async function postDelete(ctx: PostCtx, postId: string, flags: MutateFlags): Promise<number> {
  if (!postId) {
    printError('Missing post id.', 'Usage: feedsquad post delete <id>');
    return 2;
  }
  if (!flags.yes && !flags.dryRun) {
    const ok = await confirm(`${yellow('!')} Delete post ${bold(postId)}?`, false);
    if (!ok) {
      console.log(dim('  Cancelled.'));
      return 130;
    }
  }
  const params: Record<string, unknown> = { post_id: postId };
  if (flags.dryRun) params.dry_run = true;
  try {
    const result = await callTool(ctx.creds, 'delete_post', params, { profileName: ctx.profileName });
    if (result.dry_run) {
      printSuccess('Dry run OK — would delete.');
      return 0;
    }
    if (result.success === false) {
      printError(typeof result.message === 'string' ? result.message : 'Delete failed.');
      return 1;
    }
    printSuccess(`Deleted post ${postId}.`);
    return 0;
  } catch (err) {
    printError(err instanceof Error ? err.message : 'Failed to delete post.');
    return 1;
  }
}

interface AdaptFlags {
  platforms: string[];
  angle?: string;
  json?: boolean;
}

interface ApproveFlags {
  yes?: boolean;
  schedule?: string;
}

export async function postApprove(ctx: PostCtx, postId: string, flags: ApproveFlags): Promise<number> {
  if (!postId) {
    printError('Missing post id.', 'Usage: feedsquad post approve <id> [--schedule <iso-datetime>]');
    return 2;
  }
  if (!flags.yes) {
    const ok = await confirm(
      `${yellow('!')} Approve post ${bold(postId)} for scheduled publishing?`,
      false,
    );
    if (!ok) {
      console.log(dim('  Cancelled.'));
      return 130;
    }
  }
  const params: Record<string, unknown> = {
    draft_id: postId,
    action: 'approve',
  };
  if (flags.schedule) params.scheduled_date = flags.schedule;

  try {
    const result = await callTool(ctx.creds, 'confirm_post', params, { profileName: ctx.profileName });
    if (result.success === false) {
      printError(typeof result.message === 'string' ? result.message : 'Approval failed.');
      return 1;
    }
    printSuccess(`Approved post ${postId}.`);
    if (typeof result.message === 'string') console.log(dim(`  ${result.message}`));
    return 0;
  } catch (err) {
    printError(err instanceof Error ? err.message : 'Failed to approve post.');
    return 1;
  }
}

export async function postAdapt(ctx: PostCtx, draft: string, flags: AdaptFlags): Promise<number> {
  if (!draft || draft.trim().length === 0) {
    printError('Missing draft text.', 'Usage: feedsquad post adapt "<draft>" --platforms linkedin,twitter,threads');
    return 2;
  }
  if (!flags.platforms || flags.platforms.length === 0) {
    printError('Missing --platforms.', 'Example: --platforms linkedin,twitter,threads');
    return 2;
  }
  const params: Record<string, unknown> = {
    draft,
    platforms: flags.platforms,
  };
  if (flags.angle) params.angle = flags.angle;
  try {
    const result = await callTool(ctx.creds, 'adapt_for_platform', params, { profileName: ctx.profileName });
    if (flags.json) {
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }
    const adaptations = Array.isArray(result.adaptations) ? (result.adaptations as Array<Record<string, unknown>>) : [];
    if (adaptations.length === 0) {
      printError('No adaptations returned.');
      return 1;
    }
    for (const a of adaptations) {
      console.log();
      console.log(bold(`── ${platformBadge(typeof a.platform === 'string' ? a.platform : '')} ${a.platform || '?'} (${a.char_count || '?'} chars) ──`));
      if (a.warning) console.log(yellow(`  ⚠ ${a.warning}`));
      console.log(a.content || dim('(no content)'));
    }
    return 0;
  } catch (err) {
    printError(err instanceof Error ? err.message : 'Failed to adapt draft.');
    return 1;
  }
}
