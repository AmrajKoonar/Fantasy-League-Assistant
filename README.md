# Fantasy League Assistant

A Discord bot that lets your server view Sleeper fantasy football league information with slash commands. One Discord server can link **multiple Sleeper leagues** (e.g. Division 1–4 and a Money League), and members link their Sleeper account **once** to use commands like `/roster` across every league in the server.

Built on the official, free, read-only [Sleeper API](https://docs.sleeper.com/) — no Sleeper credentials required, ever.

## Features

- **Multi-league servers** — link any number of Sleeper leagues to one Discord server, each with a short nickname (`division1`, `moneyleague`, ...).
- **One-time account linking** — users run `/link_sleeper` once; the bot finds their team in any linked league.
- **Roster & team auto-detection** — `/roster`, `/team`, `/record`, `/matchup_detail`, and the fun commands figure out which linked league you're in.
- **Standings, matchups, transactions** — live league data with clean Discord embeds.
- **League insights** — managers, waiver order, FAAB usage, detailed settings/scoring, bot-calculated power rankings, and fun league records.
- **Weekly recaps** — highest/lowest scores, biggest blowout, closest matchup, benchwarmer of the week.
- **Draft tools** — draft order, results by round, and traded picks.
- **Discord-only trade offers** — propose, accept, decline, and counter trades with buttons and modals (never submitted to Sleeper).
- **Manual reminders** — owner-only draft and waivers reminders that ping only linked members in the league.
- **Trending players & player search** — powered by a locally cached copy of Sleeper's player database.
- **Autocomplete** — the `league` option suggests only the leagues linked to _your_ server.
- **Built-in caching** — Sleeper responses are cached in memory so the bot stays well under Sleeper's 1000 calls/minute limit.

## Tech stack

- [Node.js](https://nodejs.org/) 18.17+ (uses the built-in `fetch`)
- [TypeScript](https://www.typescriptlang.org/) (strict mode)
- [discord.js v14](https://discordjs.guide/)
- [Supabase Postgres](https://supabase.com/docs) via [`@supabase/supabase-js`](https://supabase.com/docs/reference/javascript/introduction)
- `dotenv`, `tsx` (dev runner), ESLint + Prettier

## Project structure

```
src/
  index.ts              # Bot entrypoint + interaction router (commands, buttons, modals)
  deploy-commands.ts    # Slash command registration script
  config/env.ts         # Env loading + validation
  commands/             # One file per slash command + index.ts registry
  interactions/         # Button & modal handlers (trade offers)
  services/             # Sleeper API client, caches, league resolver, domain logic
  db/                   # Supabase client + repositories
  utils/                # Embeds, errors, formatting, permissions, logger
  types/                # Sleeper, database, and command types
supabase/schema.sql     # Database schema
```

## Setup

### 1. Prerequisites

- Node.js 18.17 or newer (`node --version`)
- npm
- A [Discord](https://discord.com/developers/applications) account that **owns** the target server
- A free [Supabase](https://supabase.com/) account

### 2. Install

```bash
git clone <this repo>
cd Fantasy-League-Assistant
npm install
```

### 3. Create the Discord application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**. Name it "Fantasy League Assistant".
2. Under **General Information**, copy the **Application ID** — this is `DISCORD_CLIENT_ID`.
3. Go to **Bot**:
   - Click **Reset Token**, copy the token — this is `DISCORD_TOKEN`. Keep it secret.
   - No privileged gateway intents are required (the bot only uses slash commands).
4. Go to **Installation** (or OAuth2 → URL Generator):
   - Scopes: `bot` and `applications.commands`.
   - Bot permissions: **Send Messages** and **Embed Links** are enough.
   - Open the generated invite URL and add the bot to your server.
5. In Discord, enable **Developer Mode** (User Settings → Advanced), then right-click your server icon → **Copy Server ID** — this is `DISCORD_GUILD_ID`.

### 4. Create the Supabase project

1. Create a new project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Open **SQL Editor**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates the `linked_users`, `guild_leagues`, and `trade_offers` tables. Re-running it is safe (`create table if not exists`), so existing servers can apply the `trade_offers` addition the same way.
3. In **Project Settings → API**, copy:
   - **Project URL** — this is `SUPABASE_URL`.
   - **`service_role` secret key** — this is `SUPABASE_SERVICE_ROLE_KEY`. This key bypasses row security; it must only ever live on the server running the bot.

### 5. Configure environment variables

```bash
cp .env.example .env   # or copy manually on Windows
```

Fill in `.env`:

```env
DISCORD_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-application-id
DISCORD_GUILD_ID=your-server-id
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NODE_ENV=development
```

Never commit `.env`. The bot validates these on startup and exits with a clear message if any are missing.

### 6. Deploy slash commands

```bash
npm run deploy:commands
```

This registers all commands to the guild in `DISCORD_GUILD_ID` (instant). To register globally later (takes up to an hour to propagate):

```bash
npm run deploy:commands -- --global
```

### 7. Run the bot

```bash
npm run dev      # development with auto-reload
```

For production:

```bash
npm run build
npm start
```

## Deployment on Render

Deploy this bot as a **Render Background Worker**, not a Web Service. The bot maintains a long-running Discord gateway connection and does not receive HTTP traffic, so it does not need Express or an HTTP port. Render runs `npm run build` followed by `npm start`, which keeps the bot online without a local VS Code terminal.

> Render's current documentation says its free instance type is not available for Background Workers. The included [`render.yaml`](render.yaml) uses the `starter` plan. Check current pricing before creating the service.

Quick deployment:

1. Commit the changes, push the repository to GitHub, open a pull request into `main`, and merge after the build passes.
2. In the [Render Dashboard](https://dashboard.render.com/), create a **Background Worker** and connect the GitHub repository, or create a Blueprint from `render.yaml`.
3. Use:
   - Name: `fantasy-league-assistant`
   - Runtime: Node
   - Build command: `npm ci && npm run build`
   - Start command: `npm start`
4. Add `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `NODE_ENV=production` as Render environment variables.
5. Set `SUPABASE_URL` to `https://your-project-ref.supabase.co` — never append `/rest/v1/`.
6. Deploy commands locally with `npm run deploy:commands` if command names or options changed.
7. Deploy the worker and confirm the Render logs show the startup message and `Logged in as <bot tag>`.
8. Test `/ping` in Discord, then stop any local `npm run dev` terminal.

Never run the local bot and Render worker at the same time with the same Discord token. Two copies can cause duplicate replies, expired interactions, and confusing logs.

Render can auto-deploy whenever changes are pushed or merged into its connected branch. Confirm which branch the service watches: production normally watches `main`, while a temporary test deployment can watch `FB.render.deploy.v1`.

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the complete dashboard/Blueprint checklist, command deployment guidance, log verification, security notes, plan limitations, graceful shutdown behavior, and troubleshooting for missing commands, duplicate replies, crashes, and Supabase failures.

## Command list

Run `/help` in Discord for the same overview, grouped and searchable. Options in `[brackets]` are optional; most league commands fall back to the server default league.

### General

| Command         | Description                               | Visibility |
| --------------- | ----------------------------------------- | ---------- |
| `/ping`         | Health check with latency                 | Public     |
| `/help`         | Grouped overview of every command         | Ephemeral  |
| `/current_week` | Current NFL season, week, and season type | Public     |

### Account

| Command                         | Description                                       | Visibility |
| ------------------------------- | ------------------------------------------------- | ---------- |
| `/link_sleeper username:<name>` | Link your Discord account to your Sleeper account | Ephemeral  |
| `/me`                           | Show your linked Sleeper account                  | Ephemeral  |
| `/my_leagues`                   | Your Sleeper leagues and which are linked here    | Ephemeral  |

### League management (server owner only)

| Command                                      | Description                          | Visibility |
| -------------------------------------------- | ------------------------------------ | ---------- |
| `/add_league league_id:<id> nickname:<name>` | Link a Sleeper league to this server | Ephemeral  |
| `/remove_league nickname:<name>`             | Remove a linked league               | Ephemeral  |
| `/set_default_league nickname:<name>`        | Set the server's default league      | Ephemeral  |

### League info

| Command                     | Description                              | Visibility |
| --------------------------- | ---------------------------------------- | ---------- |
| `/leagues`                  | List all leagues linked to this server   | Public     |
| `/league_info [league]`     | Core settings, scoring, roster positions | Public     |
| `/league_settings [league]` | Detailed league settings                 | Public     |
| `/scoring [league]`         | Scoring settings breakdown               | Public     |
| `/managers [league]`        | All managers (with commissioner marker)  | Public     |
| `/standings [league]`       | Standings by wins, then points for       | Public     |
| `/power_rankings [league]`  | **Bot-calculated** power rankings        | Public     |
| `/league_records [league]`  | Fun league records and extremes          | Public     |

### Matchups

| Command                                  | Description                      | Visibility |
| ---------------------------------------- | -------------------------------- | ---------- |
| `/matchups [league] [week]`              | Weekly matchups and scores       | Public     |
| `/matchup_detail [league] [week] [user]` | One manager's matchup for a week | Public     |
| `/weekly_recap [league] [week]`          | Fun recap of a week              | Public     |
| `/biggest_blowout [league] [week]`       | Largest win margin of a week     | Public     |
| `/closest_matchup [league] [week]`       | Closest matchup of a week        | Public     |

### Teams

| Command                   | Description                        | Visibility |
| ------------------------- | ---------------------------------- | ---------- |
| `/roster [league] [user]` | Starters, bench, IR, taxi          | Public     |
| `/team [league] [user]`   | Team profile (no full roster)      | Public     |
| `/record [league] [user]` | Record and point totals            | Public     |
| `/moves [league]`         | Total roster moves by team         | Public     |
| `/faab [league]`          | FAAB (waiver budget) usage by team | Public     |
| `/waiver_order [league]`  | Waiver priority order              | Public     |

### Draft

| Command                               | Description                   | Visibility |
| ------------------------------------- | ----------------------------- | ---------- |
| `/draft [league] [round]`             | Draft info and picks by round | Public     |
| `/draft_order [league]`               | Draft pick order              | Public     |
| `/draft_results [league] [round]`     | Draft picks by round          | Public     |
| `/traded_picks [league]`              | Traded draft picks            | Public     |
| `/playoff_bracket [league] [bracket]` | Winners/losers bracket        | Public     |

### Transactions & trades

| Command                                                        | Description                                | Visibility                      |
| -------------------------------------------------------------- | ------------------------------------------ | ------------------------------- |
| `/transactions [league] [week]`                                | Latest trades/waivers/FA moves             | Public                          |
| `/trade_history [league] [week]`                               | Completed Sleeper trades                   | Public                          |
| `/waiver_history [league] [week]`                              | Waiver and free-agent activity             | Public                          |
| `/trade user:<@user> send:<...> receive:<...> [league] [note]` | **Discord-only** trade proposal            | Public offer / ephemeral errors |
| `/counteroffer trade_id:<id> [send] [receive] [note]`          | Counter an existing trade offer            | Public offer / ephemeral errors |
| `/trade_history_local [league] [user]`                         | Discord-only trade offers made via the bot | Public                          |

### Players

| Command                                      | Description                        | Visibility |
| -------------------------------------------- | ---------------------------------- | ---------- |
| `/player name:<name>`                        | Search the Sleeper player database | Public     |
| `/trending type:<add\|drop> [hours] [limit]` | Trending adds/drops across Sleeper | Public     |

### Reminders (server owner only)

| Command                                       | Description                                    | Visibility |
| --------------------------------------------- | ---------------------------------------------- | ---------- |
| `/draftreminder [league] [minutes] [message]` | Ping linked members about the draft (manual)   | Public     |
| `/waiversreminder [league] [message]`         | Ping linked members to submit waivers (manual) | Public     |

### Fun

| Command                        | Description                    | Visibility |
| ------------------------------ | ------------------------------ | ---------- |
| `/luck_rating [league] [user]` | How lucky a team has been      | Public     |
| `/panic_meter [league] [user]` | Playful panic level for a team | Public     |
| `/benchwarmer [league] [week]` | Highest bench score of a week  | Public     |
| `/random_team [league]`        | Randomly pick a team           | Public     |
| `/trash_talk [league] [user]`  | Light, harmless fantasy joke   | Public     |

Examples:

```
/link_sleeper username:myUsername
/roster
/team league:division1 user:@Friend
/power_rankings league:division2
/weekly_recap league:moneyleague week:5
/trade user:@Gurkirat send:"Justin Jefferson + $10 FAAB" receive:"Bijan Robinson"
/counteroffer trade_id:<uuid> send:"James Cook" receive:"Tee Higgins"
/draftreminder league:division1 minutes:15
/trending type:add hours:48 limit:15
/player name:jefferson
```

## Discord-only trade offers

`/trade` creates a **social trade proposal inside Discord** — it is never submitted to Sleeper (the Sleeper API is read-only, so the bot cannot and will not execute real trades, waiver claims, or draft picks). The flow:

1. The sender runs `/trade user:@them send:"..." receive:"..." [league] [note]`.
2. The bot resolves the league (explicit `league`, or the single league the two managers share; if they share several, it asks you to pick one).
3. It validates the assets against each manager's **real Sleeper roster**: the `send` players must be on your roster and the `receive` players on theirs. FAAB (e.g. `$10 FAAB`) is accepted as text and never blocks the offer. Ambiguous or unknown player names produce a friendly ephemeral error.
4. A public offer message pings the target with **Accept / Decline / Counteroffer** buttons.
5. Only the target manager can respond. Accept/Decline update the message; Counteroffer opens a prefilled modal (or use `/counteroffer trade_id:<id>`) that flips the sides and sends a new offer back to the original sender.
6. Offers are stored in the `trade_offers` table with statuses `pending`, `accepted`, `declined`, `countered`, `expired`, `cancelled`. `/trade_history_local` lists them.

**If both managers agree, complete the actual trade manually in Sleeper.**

## Reminders (manual in V1)

`/draftreminder` and `/waiversreminder` are **manual, server-owner-only** commands — there is no background scheduler. When run, they immediately ping **only the linked Discord members who are actually in the selected league** (never `@everyone`/`@here`, never members who haven't linked). Long mention lists are chunked across follow-up messages.

- `/draftreminder` shows the draft status and, when Sleeper provides one, the draft start time and countdown. If no start time is available it still sends the reminder and says so.
- `/waiversreminder` shows the current NFL week and waiver settings. Sleeper does not expose a reliable per-league waiver deadline, so the bot never invents one.

## League autocomplete

Every league-specific command's `league` option offers autocomplete that lists **only the leagues linked to the current server** (with the default marked) — never a user's other personal Sleeper leagues.

## Multi-league server setup (V1 flow)

**Server owner:**

1. Add the bot to the Discord server (invite link from step 3 above).
2. Find each Sleeper league's ID. Open the league in the Sleeper web app — the ID is the long number in the URL: `https://sleeper.com/leagues/<league_id>/...`
3. Link the leagues:

```
/add_league league_id:<id> nickname:division1
/add_league league_id:<id> nickname:division2
/add_league league_id:<id> nickname:division3
/add_league league_id:<id> nickname:division4
/add_league league_id:<id> nickname:moneyleague
```

4. Optionally set a default (the first league added is the default automatically):

```
/set_default_league nickname:division1
```

**Normal user:**

1. Link once: `/link_sleeper username:<sleeper username>`
2. Use commands: `/roster`, `/standings league:division2`, `/matchups league:moneyleague`, ...

Nicknames are normalized for lookup: "Division 1" → `division1`, "Money League" → `moneyleague`. Users can type either form.

## How roster auto-detection works

When someone runs `/roster` without a league:

1. The bot looks up their linked Sleeper user ID in Supabase.
2. It fetches rosters (cached for 2 minutes) for **every league linked to this Discord server** — never the user's other personal Sleeper leagues.
3. If exactly one linked league contains a roster owned (or co-owned) by that Sleeper ID, the bot shows that roster.
4. If multiple leagues match, the bot asks the user to pick one (e.g. `/roster league:division1` or `/roster league:moneyleague`).
5. If none match, it explains that the linked Sleeper account isn't in any server-linked league.

The same auto-detection powers `/team`, `/record`, `/matchup_detail`, `/luck_rating`, `/panic_meter`, and `/trash_talk` (each accepting an optional `user`).

## League selection for other commands

League-level commands that are not user-specific (`/league_info`, `/league_settings`, `/scoring`, `/managers`, `/standings`, `/power_rankings`, `/league_records`, `/matchups`, `/weekly_recap`, `/biggest_blowout`, `/closest_matchup`, `/moves`, `/faab`, `/waiver_order`, `/draft*`, `/traded_picks`, `/playoff_bracket`, `/transactions`, `/trade_history`, `/waiver_history`, `/benchwarmer`, `/random_team`, reminders) resolve the league in this order:

1. The `league` option, if provided.
2. The server's default league.
3. The only linked league, if exactly one exists.
4. Otherwise, the bot asks the user to choose.

## Caching

All Sleeper calls go through `src/services/sleeperApi.ts` with in-memory caching:

| Data                                | TTL        |
| ----------------------------------- | ---------- |
| Players database (~5 MB)            | 24 hours   |
| League users                        | 10 minutes |
| Brackets, drafts, traded picks      | 10 minutes |
| League info, trending, user leagues | 5 minutes  |
| Rosters, transactions               | 2 minutes  |
| NFL state                           | 1 minute   |
| Matchups                            | 30 seconds |

## Sleeper API references

- Docs: https://docs.sleeper.com/
- Base URL: `https://api.sleeper.app/v1`
- The API is free, read-only, requires no token, and is limited to 1000 calls/minute. This bot never attempts to modify Sleeper data.

## Known limitations

- In-memory cache only: restarting the bot clears caches (the players database is re-downloaded on first use).
- Single-process design; running multiple bot instances would each keep their own cache.
- Standings tiebreakers use wins → points for → losses; Sleeper's own playoff seeding rules may differ.
- Team names come from Sleeper user metadata; teams without a custom name fall back to the owner's display name.
- **Trade offers are Discord-only.** The bot never submits trades, waiver claims, or draft picks to Sleeper — the API is read-only. Complete agreed trades manually in Sleeper.
- **Reminders are manual (V1).** There is no scheduler; an owner runs the reminder command when they want members pinged.
- Power rankings, luck ratings, and panic meters are **bot-calculated for fun**, not official Sleeper data.
- FAAB totals are read from league settings when present; if Sleeper doesn't expose a budget the bot shows "unknown" rather than guessing.
- Benchwarmer scores require per-player points in the matchup payload; before a week is scored the command says so.
- Only NFL fantasy football is supported.

## Future feature ideas

- Scheduled/automatic weekly recap and scoreboard posts (a real background scheduler for reminders)
- Trade offer expiry and a `/cancel_trade` for senders
- Season-long records that persist across weeks
- Head-to-head history between two managers
- Web dashboard
- Yahoo Fantasy support later
- ESPN support later if safe and reliable

## Security notes

- `.env` is gitignored; only `.env.example` is committed.
- The Supabase **service role key** stays server-side only and is never logged or sent to Discord.
- The bot never asks for Sleeper passwords — the Sleeper API needs no authentication.
- No gambling, betting, payment, or money-handling features. "Money League" is just a league nickname; the bot does not track payments or dues.
- Reminders never use `@everyone`/`@here` and only mention linked members who are in the selected league.
