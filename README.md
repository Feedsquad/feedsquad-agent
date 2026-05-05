# @feedsquad/cli

> Voice-match, draft, schedule, and publish social posts in your calibrated brand voice — from your terminal, or from any AI agent that can run a shell command.

```bash
npm install -g @feedsquad/cli
feedsquad login
feedsquad voice-match "the new pricing is live. lmk what you think"
```

---

## voice-match — the command this CLI exists for

Most AI tools sound the same. Generic AI voice has a tell — vague concrete, certain abstract, no friction. Your voice has friction. `voice-match` keeps it.

It takes any text — a draft, an email, an old post, scratch notes from a call — and rewrites it in your calibrated brand voice from your FeedSquad account. The voice context lives server-side. You pass only the text.

**Before:**

```
$ feedsquad voice-match "we shipped voice-match today. its rly cool. \
the AI voice is so generic and now it sounds like me"
```

**After** (output for an operator with a calibrated voice):

```
── voice-matched ──
We shipped voice-match today. Generic AI voice has a tell — every post
sounds like every other post. This one sounds like the person writing
it. That's the whole bet.
```

The wedge is that **the voice context is invisible to the agent calling this command**. An LLM running `feedsquad voice-match "..."` doesn't need to be told who you are, how you write, or what your audience cares about. The server knows. The output sounds like you.

This is the unique-to-FeedSquad agent primitive — no other social-publishing CLI ships it today.

---

## What this is for

FeedSquad is for **solo founders and small marketing teams who want their AI agents to write in their voice, not generic AI voice.**

Specifically:

- You already use Claude Code, Cowork, OpenClaw, or another AI agent runtime
- You publish to LinkedIn, X, Threads, or Instagram
- You want the agent to draft and schedule on your behalf, but in *your* voice
- You'd rather review-and-approve than auto-publish — agents propose, you commit
- You're allergic to AI tools that turn every post into the same five-paragraph LinkedIn essay

**It's not for:**

- Agencies cross-posting hundreds of accounts (use Hootsuite or Sprout)
- Teams that don't care about voice consistency (any scheduler works)
- Auto-publishing pipelines without human review (we deliberately don't do this)

---

## Install

```bash
npm install -g @feedsquad/cli
# or
pnpm add -g @feedsquad/cli
# or
bun add -g @feedsquad/cli
```

Requires **Node 20+**. Zero runtime dependencies — built on Node built-ins (`fetch`, `parseArgs`, `crypto`, `http`). No npm tree to audit.

---

## Quick start

```bash
# 1. Authenticate once — opens your browser for OAuth 2.1 PKCE
feedsquad login

# 2. Rewrite any text in your brand voice
feedsquad voice-match "i think we should ship the cli today"

# 3. Generate a calibrated post from an idea, schedule it
feedsquad post draft "the one thing about hiring nobody tells you" \
  --platform linkedin --schedule 2026-05-12T09:00:00Z
```

Run `feedsquad help` for the full command list.

---

## Commands

Every command supports `--profile <name>` for multi-account use, `--api-base <url>` for self-hosted, and `--json` for machine-readable output where applicable.

### voice-match

Rewrite any text in your calibrated brand voice.

```
$ feedsquad voice-match "thinking about why most AI marketing posts fail. \
they all sound the same"

── voice-matched ──
Most AI marketing posts fail for the same reason: they all sound the
same. Generic AI voice has a tell — vague concrete, certain abstract,
no friction. The question worth asking is whether your tools can
preserve yours.
```

Optional flags:

```bash
feedsquad voice-match "<text>" --angle "make it shorter and more direct"
feedsquad voice-match "<text>" --as twitter   # short-form rewrite
feedsquad voice-match "<text>" --json         # raw response
```

### post draft

Generate a calibrated draft from an idea. Two-call flow under the hood (calibrate → save) — invisible to you.

```
$ feedsquad post draft "the one thing about hiring nobody tells you" \
  --platform linkedin --schedule 2026-05-12T09:00:00Z

✓ Draft created: pst_8f3a92b1
  Post scheduled for 2026-05-12T09:00:00Z. Approve it to publish at the scheduled time.
  Voice-calibrated. To skip generation and store literal text, pass --literal.
```

Pass `--literal` to skip generation and store text verbatim. Or use the explicit `post create` shortcut:

```bash
feedsquad post create -c "literal polished text" -s 2026-05-12T09:00:00Z -i linkedin
```

### post list

Show your calendar (concise format).

```
$ feedsquad post list --status scheduled --limit 5

ID            Platform  Status        Scheduled         Preview
────────────  ────────  ────────────  ────────────────  ────────────────────────────────
pst_8f3a92b1  in        ◐ scheduled   2026-05-12 09:00  The one thing about hiring no…
pst_4c0e1d23  𝕏         ◐ scheduled   2026-05-12 14:00  Generic AI voice has a tell. …
pst_9a1b3f48  in        ◐ scheduled   2026-05-13 09:00  We shipped voice-match toda…
```

Filter by `--platform`, `--status`, `--from`, `--to`, `--limit`. Pass `--json` for raw output.

### post show

Single-post detail with optional analytics + history expansions.

```
$ feedsquad post show pst_8f3a92b1 --include analytics,history

ID:       pst_8f3a92b1
Platform: in
Status:   ◐ scheduled
Schedule: 2026-05-12 09:00

The one thing about hiring nobody tells you...
[full post content]

Analytics:
{ "likes": 84, "comments": 12, "shares": 3, "engagement_rate": 4.2 }

Publishing history:
{ "publishing_status": "idle", "publication_attempts": 0 }
```

### post approve

Approve a draft for scheduled publishing (requires confirmation unless `--yes`).

```
$ feedsquad post approve pst_8f3a92b1
! Approve post pst_8f3a92b1 for scheduled publishing? [y/N] y
✓ Approved post pst_8f3a92b1.
  Post approved. Will publish on 5/12/2026.
```

### post publish

Publish immediately (asks to confirm — destructive, goes live).

```
$ feedsquad post publish pst_8f3a92b1
! Publish post pst_8f3a92b1 to its target platform now? [y/N] y
✓ Published to linkedin.
  URL: https://www.linkedin.com/feed/update/urn:li:share:7194...
```

The publish flow is **idempotent server-side** — retries replay the cached response instead of double-posting. Safe to call from agent loops.

Pass `--dry-run` to validate without going live.

### post delete

Delete a draft (asks to confirm).

```
$ feedsquad post delete pst_8f3a92b1 --yes
✓ Deleted post pst_8f3a92b1.
```

### post adapt

Take one draft, get platform-tuned versions for each platform in one call. Returns adaptations only — does not save.

```
$ feedsquad post adapt "we shipped voice-match today" \
  --platforms linkedin,twitter,threads

── 𝕏 twitter (84 chars) ──
We shipped voice-match today. Generic AI voice has a tell. This one
sounds like you.

── in linkedin (412 chars) ──
We shipped voice-match today.

Generic AI voice has a tell — every post...

── @ threads (188 chars) ──
We shipped voice-match today. Generic AI voice has a tell — every post
sounds like every other post. This one sounds like you. What's a tool
you wish kept your voice?
```

Per-platform constraints (length, hashtag style, link handling, threading) are applied automatically. Brand voice context applied to all of them.

### calendar

Calendar overview with status summary.

```
$ feedsquad calendar

Calendar  (12 posts)
  3 drafts  ·  2 pending  ·  5 scheduled  ·  2 published

ID            Plat  Status        Scheduled         Preview
────────────  ────  ────────────  ────────────────  ────────────────────────────────
pst_8f3a92b1  in    ◐ scheduled   2026-05-12 09:00  The one thing about hiring no…
...
```

### health

Calendar-health audit — clusters, gaps, stale drafts, cadence drift. Call this before approving a campaign or scheduling a heavy week.

```
$ feedsquad health

Calendar health: ● warn
  stale_drafts=2  unapproved_scheduled=0  clusters=1  gaps=2
  cadence_drift_vs_prev_window: -18%

Clusters (3+ posts in 4h):
  in  2026-05-14 09:00  → 4 posts

Gaps (>72h):
  in  2026-05-15 17:00 → 2026-05-19 10:00  (89.0h)
  𝕏   2026-05-12 14:00 → 2026-05-16 09:00  (91.0h)

Stale drafts (>14d):
  pst_3c1a82f4  in    21d old
  pst_7e9b2104  𝕏     17d old
```

### insights / analytics

Performance insights with an LLM "what worked / next angle" summary.

```
$ feedsquad analytics last7d

Performance insights  all · last 7d · 8 posts

Top performers
  in  2026-05-04 09:00  er=6.40  240❤  31💬  9🔁
    The one thing about hiring nobody tells you. After 18 months of...
  𝕏   2026-05-03 14:00  er=4.10  118❤  22💬  14🔁
    Generic AI voice has a tell. Every post sounds like every other...

Underperformers
  in  2026-05-06 09:00  er=0.80  12❤  1💬  0🔁
    Excited to announce our latest product update! 🚀 We've been wo...

What worked
  Both top posts open with a contrarian observation, not an
  announcement. The hiring post and the AI-voice post share a pattern:
  state the unobvious thing in line one, defend it in lines 2–3.

Next angle
  Write the post that finishes the sentence "The thing nobody tells
  you about <X> is..." — for X, use the topic that's been most on
  your mind this week.
```

`feedsquad analytics last7d` is shorthand for `feedsquad insights --lookback 7`. Also: `last30d`.

### context show

Show what your FeedSquad account knows about you. Brand-context sections (story / voice / brand / brain / people / momentum) populate as you complete onboarding.

```
$ feedsquad context show

Context
  Brand-context sections (story / voice / brand / brain / people / momentum)
  populate as you complete onboarding. v0.1 of this command shows
  account state below; per-section views land as each section is wired
  through to the API.

Account state
  tier:              pro
  linkedin:          connected
  posts/month:       8 / unlimited
```

### Auth

```bash
feedsquad login                       # OAuth 2.1 PKCE — opens browser
feedsquad logout                      # Remove this profile's credentials
feedsquad whoami                      # Show profile + scopes + caller-id
feedsquad auth login|logout|status    # Aliases for the above
```

### Campaigns

```bash
feedsquad campaign create --name "<n>" \
  [--theme] [--platform] [--posts-per-week] [--weeks]
feedsquad campaign approve <id>       # Approve all  [--yes]
feedsquad campaign cancel <id>        # Cancel + delete unpublished  [--yes]
```

Campaign posts are created as drafts requiring approval. The CLI deliberately does **not** auto-approve. You stay in the loop.

---

## Use from Claude Code / Cowork / OpenClaw

This package ships a [`SKILL.md`](./SKILL.md) and a [`claude-plugin.json`](./claude-plugin.json) so any Claude-compatible agent runtime can install the skill in one command:

```bash
# In Claude Code
/plugin install feedsquad
```

The skill description leads with **voice-match** and tells the agent when to invoke each command. Read [`SKILL.md`](./SKILL.md) for the full agent-facing documentation.

The Anthropic Plugin Directory listing lives at <https://claude.com/plugins/feedsquad> *(submission in progress)*.

---

## How it works

```
┌─────────────────────┐
│ feedsquad CLI       │
│ (this package)      │
└──────────┬──────────┘
           │ POST /api/mcp/action
           │ Authorization: Bearer <jwt>
           │ X-MCP-Client-Name: feedsquad-cli
           │ X-MCP-Caller-Id: <stable per-install UUID>
           ▼
┌─────────────────────┐
│ FeedSquad MCP       │
│ /api/mcp/*          │
│ + service modules   │ ──→ LinkedIn / X / Threads
└─────────────────────┘
```

- **Auth**: OAuth 2.1 + PKCE against `/api/oauth/mcp/{authorize,token}`. No client secret. Tokens stored at `$XDG_CONFIG_HOME/feedsquad/credentials` (mode 0600). Auto-refresh 30s before expiry.
- **Caller identity**: every request carries `X-MCP-Caller-Id` so server-side audit logs distinguish CLI usage from Claude Desktop, ChatGPT, and other clients hitting the same account.
- **Idempotency**: the publish flow is idempotent server-side via a publishing-status state machine. Retries replay the cached response — safe to call from agent loops without double-posting.
- **Recovery hints**: every error response carries a structured `recovery_hint` field naming the next tool to call. Agents can self-recover without bothering you.

---

## Profiles

Switch between accounts with `--profile`:

```bash
feedsquad --profile work login           # authenticate the 'work' profile
feedsquad --profile personal login       # and a 'personal' profile
feedsquad --profile work post list       # list calendar for 'work'
```

Profiles share the credentials file. `whoami` shows the active profile and lists the others.

---

## Self-hosted / staging

```bash
export FEEDSQUAD_API_BASE=https://staging.example.com
feedsquad login
```

Or per-call: `feedsquad --api-base https://localhost:3000 calendar`.

---

## Development

```bash
git clone https://github.com/Feedsquad/feedsquad-agent.git
cd feedsquad-agent
pnpm install
pnpm build
node ./dist/cli.js help
```

Issues and pull requests welcome at <https://github.com/Feedsquad/feedsquad-agent/issues>.

---

## License

MIT © FeedSquad — see [LICENSE](./LICENSE).
