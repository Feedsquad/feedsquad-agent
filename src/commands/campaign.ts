/**
 * `feedsquad campaign <subcommand>` — wraps create_campaign / confirm_campaign.
 *   create  -> create_campaign
 *   approve -> confirm_campaign(approve_all)
 *   cancel  -> confirm_campaign(cancel_all)
 *
 * Note: create_campaign generates posts as drafts requiring approval.
 * The CLI doesn't auto-approve — that's a separate step so the user
 * keeps a review gate.
 *
 * TODO: Add `--type momentum --url <url>` path; requires a new MCP
 * tool like `create_momentum_campaign(url, brand_voice)` on the API
 * side. Deferred until the server tool exists; don't fake it.
 */

import type { ProfileCredentials } from '../credentials.js';
import { callTool } from '../api.js';
import { confirm, dim, bold, printError, printSuccess, yellow } from '../format.js';

interface CampaignCtx {
  creds: ProfileCredentials;
  profileName: string;
}

interface CreateFlags {
  name: string;
  theme?: string;
  platform?: string;
  postsPerWeek?: number;
  durationWeeks?: number;
  description?: string;
}

export async function campaignCreate(ctx: CampaignCtx, flags: CreateFlags): Promise<number> {
  if (!flags.name) {
    printError('Missing campaign name.', 'Usage: feedsquad campaign create --name "<name>" [--theme] [--platform] [--posts-per-week] [--weeks]');
    return 2;
  }
  const params: Record<string, unknown> = {
    name: flags.name,
    platform: flags.platform || 'linkedin',
  };
  if (flags.theme) params.theme = flags.theme;
  if (flags.description) params.description = flags.description;
  if (typeof flags.postsPerWeek === 'number') params.postsPerWeek = flags.postsPerWeek;
  if (typeof flags.durationWeeks === 'number') params.durationWeeks = flags.durationWeeks;

  try {
    const result = await callTool(ctx.creds, 'create_campaign', params, { profileName: ctx.profileName });
    if (result.success === false) {
      printError(typeof result.message === 'string' ? result.message : 'Failed to create campaign.');
      return 1;
    }
    const campaign = (result.campaign || {}) as Record<string, unknown>;
    const id = campaign.id || result.campaign_id;
    printSuccess(`Campaign created: ${bold(String(id || '?'))}`);
    if (typeof result.message === 'string') console.log(dim(`  ${result.message}`));
    console.log(dim(`  Approve with: feedsquad campaign approve ${id}`));
    return 0;
  } catch (err) {
    printError(err instanceof Error ? err.message : 'Failed to create campaign.');
    return 1;
  }
}

interface ConfirmFlags {
  yes?: boolean;
}

export async function campaignApprove(ctx: CampaignCtx, campaignId: string, flags: ConfirmFlags): Promise<number> {
  return runConfirm(ctx, campaignId, 'approve_all', flags, 'Approve all posts in');
}

export async function campaignCancel(ctx: CampaignCtx, campaignId: string, flags: ConfirmFlags): Promise<number> {
  return runConfirm(ctx, campaignId, 'cancel_all', flags, 'Cancel all posts in');
}

async function runConfirm(
  ctx: CampaignCtx,
  campaignId: string,
  action: 'approve_all' | 'cancel_all',
  flags: ConfirmFlags,
  verbPhrase: string,
): Promise<number> {
  if (!campaignId) {
    printError('Missing campaign id.', `Usage: feedsquad campaign ${action === 'approve_all' ? 'approve' : 'cancel'} <campaign-id>`);
    return 2;
  }
  if (!flags.yes) {
    const ok = await confirm(`${yellow('!')} ${verbPhrase} campaign ${bold(campaignId)}?`, false);
    if (!ok) {
      console.log(dim('  Cancelled.'));
      return 130;
    }
  }
  try {
    const result = await callTool(
      ctx.creds,
      'confirm_campaign',
      { campaign_id: campaignId, action },
      { profileName: ctx.profileName },
    );
    if (result.success === false) {
      printError(typeof result.message === 'string' ? result.message : `${action} failed.`);
      return 1;
    }
    printSuccess(typeof result.message === 'string' ? result.message : `${action} OK.`);
    return 0;
  } catch (err) {
    printError(err instanceof Error ? err.message : `Failed to ${action} campaign.`);
    return 1;
  }
}
