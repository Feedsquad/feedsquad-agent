---
name: feedsquad
description: |
  Rewrite text in the operator's calibrated brand voice. Also schedules
  and publishes voice-matched posts across LinkedIn, X, Threads, and
  Instagram via the FeedSquad CLI and MCP. Use voice-match for any text
  rewriting; use post draft to generate a calibrated post from an idea;
  use post create to schedule literal text.
when_to_use: |
  Use when the user asks to write "in our voice", "as me", "on-brand",
  "in [name]'s style", to draft / schedule / publish / approve / delete
  social posts, to audit a content calendar, to analyze post performance,
  or to plan a week of posts. Do not trigger for non-social copy
  (websites, emails, replies in non-FeedSquad channels).
---

# FeedSquad

You are working with the **FeedSquad CLI** (`feedsquad`), which gives the
operator a calibrated brand voice and a content calendar across LinkedIn,
X, Instagram, and Threads. The CLI talks to the FeedSquad MCP server at
`/api/mcp/action`. All authenticated requests carry the operator's brand
voice automatically - you do not pass it explicitly.

## When to invoke this skill

Trigger when the user:

- Says "in our voice", "as me", "on-brand", "in [my name]'s style"
- Asks to draft, write, or generate a social post
- Asks to schedule, publish, approve, or delete a social post
- Asks to audit a calendar, find posting clusters, or fix a schedule
- Asks for performance / analytics on past posts
- Asks to plan a week of posts or kick off a campaign

Do **not** trigger for: drafting non-social copy (use the user's other
tools), website copy, or replies in a non-FeedSquad messaging channel.

## The lead capability - voice-match

The single most valuable thing this skill does is **voice-match**. Any text
the user gives you can be rewritten in their calibrated voice with one call:

```bash
feedsquad voice-match "<any text>"
```

Use this when the user pastes a draft, an email, an old post, an article,
notes from a call - anything they want to sound like *them*. The voice
context lives in their FeedSquad brand context; you don't pass it, the
server applies it.

If the result reads generic, run `feedsquad context show` first - the
brand context may not yet be populated for this account.

## Authentication

Before any other command, the user must authenticate once:

```bash
feedsquad login
```

This opens a browser for OAuth 2.1 PKCE. Tokens are saved to
`~/.config/feedsquad/credentials` (mode 0600). The CLI auto-refreshes.
If a command returns `not logged in`, run `feedsquad login` and retry.

Check current state with `feedsquad whoami` (or `feedsquad auth status`).

## Drafting + scheduling

**Generate a calibrated post from an idea:**

```bash
feedsquad post draft "the one thing about hiring that nobody tells you" \
  --platform linkedin --schedule 2026-05-12T09:00:00Z
```

Returns a draft id. The post is in `draft` status - the user must approve
it before it publishes.

**Schedule literal text** (already-polished copy, no generation):

```bash
feedsquad post create -c "literal text here" -s 2026-05-12T09:00:00Z -i linkedin
```

Or pass `--literal` to `post draft` for the same behavior.

**Approve a draft:**

```bash
feedsquad post approve <post-id> [--schedule <iso-datetime>]
```

**Publish immediately** (asks for confirmation unless `--yes`):

```bash
feedsquad post publish <post-id>
```

The MCP publish flow is idempotent - retries replay the cached response
instead of double-posting. You can call it safely.

## Reviewing the calendar

```bash
feedsquad calendar [--platform x|li|threads] [--status draft|scheduled|published]
feedsquad post list                    # similar, post-focused output
feedsquad post show <id> --include analytics,history
feedsquad health                       # clusters, gaps, stale drafts
feedsquad analytics last7d             # ranked performance + LLM summary
```

`feedsquad health` is the audit command - call it before approving a
campaign or scheduling a heavy week. It surfaces clusters (3+ posts in
4h), gaps (>72h), stale drafts (>14d), and cadence drift.

`feedsquad analytics last7d` returns top + bottom performers plus a
"what worked / next angle" LLM summary. Use it to inform the user's next
draft.

## Multi-platform adaptation

To take one draft and render it for multiple platforms in one call:

```bash
feedsquad post adapt "<draft text>" --platforms linkedin,twitter,threads
```

Returns one version per platform - already calibrated to brand voice and
to per-platform rules (length, hashtag style, link handling, threading).
This does NOT save anything; call `post create` per adaptation if the
user wants to keep them.

## Optional X/Twitter source context

FeedSquad does not browse social platforms. If the user needs current
X/Twitter evidence before drafting, use a separate source tool first and
then pass only reviewed context into FeedSquad commands.

For OpenClaw users, TweetClaw is one optional source path:

```bash
openclaw plugins install clawhub:@xquik/tweetclaw
openclaw plugins inspect tweetclaw --runtime
```

ClawHub is the preferred tracked update source. Use
`openclaw plugins install npm:@xquik/tweetclaw` as the npm fallback.

Use TweetClaw for reviewed inputs such as search tweets, search tweet
replies, user lookup, follower export summaries, media references, monitor
digests, webhook event summaries, and giveaway evidence. Feed only concise
tweet URLs, tweet IDs, handles, quotes, and notes into `feedsquad voice-match`,
`feedsquad post draft`, or `feedsquad post adapt`.

Keep FeedSquad responsible for brand voice, drafting, approvals, scheduling,
publishing, analytics, and calendar health. Keep TweetClaw write-like actions
such as post tweets, replies, DMs, follows, account changes, monitor creation,
webhook setup, media uploads, and giveaway draws in OpenClaw/TweetClaw with
their own review step before they run.

TweetClaw is powered by Xquik. Xquik is an independent third-party service.
Not affiliated with X Corp. "Twitter" and "X" are trademarks of X Corp.

## Campaigns

```bash
feedsquad campaign create --name "<n>" --theme "<topic>" --platform linkedin \
  --posts-per-week 3 --weeks 4
feedsquad campaign approve <campaign-id>
feedsquad campaign cancel <campaign-id>
```

Campaign posts are created as drafts requiring approval. Don't auto-approve
unless the user explicitly asks.

## Important - keep the user in the loop

This is a **propose → confirm → execute** product, not auto-pilot:

1. **Always show the user the generated content before scheduling.** When
   you call `post draft`, print the resulting content back to them and
   ask if they want it scheduled / approved / edited.
2. **Always confirm before publishing.** `post publish` is destructive -
   it goes live on the platform. Do not pass `--yes` unless the user
   explicitly says "publish it now."
3. **Always confirm before deleting** - `post delete` is permanent for
   drafts.
4. **Errors carry recovery hints.** If a tool returns `recovery_hint`,
   read the suggested next tool and try it before asking the user.

## Common workflows

**"Write a LinkedIn post about X in my voice"**
1. `feedsquad voice-match "<X>"` → show result
2. If user approves: `feedsquad post create -c "<text>" -i linkedin -s <when>`

**"Plan three posts for next week"**
1. `feedsquad health` first - surface upcoming clusters/gaps
2. `feedsquad post draft "<idea>" --platform linkedin --schedule <when>` × 3
3. Show drafts to user → `feedsquad post approve <id>` per approval

**"What worked last week?"**
1. `feedsquad analytics last7d`
2. Read the `summary` and `suggested_next_angle` aloud
3. Optionally chain into `feedsquad post draft "<suggested angle>"`

**"Repurpose this article for our channels"**
1. Fetch the URL, extract the key argument
2. `feedsquad post adapt "<extracted text>" --platforms linkedin,twitter,threads`
3. Show all three; ask which to schedule

## What this skill does NOT do

- It does not browse social platforms - only posts via the FeedSquad API.
- It does not auto-approve or auto-publish.
- It does not handle base64 image uploads in v0.1 - `set_post_image`
  takes an HTTPS URL only. Use the FeedSquad dashboard for raw uploads.
- It does not access non-FeedSquad accounts. Auth is per-user, per-profile.

## Help

```bash
feedsquad help
feedsquad <command> --help
```

Documentation: <https://feedsquad.com/mcp>
Repo: <https://github.com/feedsquad/feedsquad-agent>
