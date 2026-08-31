# Warmup

**Book your Cult.fit classes before they fill up.**

Browse the Cult.fit fitness schedule, book (or waitlist) a class in one tap, and
save a set of rules — preferred centers, workouts, times, per-weekday variations —
so the app can rank the best matching slot for you each day.

> Warmup is an independent, open-source project. **It is not affiliated with,
> endorsed by, or sponsored by Cure.fit.** "Cult.fit" is used here only to
> describe what the app talks to.

## What it does

| Screen | |
|---|---|
| **Schedule** | Day tabs, all classes grouped by time, live seat and waitlist counts, one-tap book. A **Best match** ribbon ranks the bookable slots that fit your rules and explains why — it never books on its own. |
| **Rules** | Visual editor for your default preference, named profiles, and per-weekday `skip` / profile assignment. Export/import the whole thing as JSON. |
| **Explore** | Every center in your selected city, grouped by locality, with a copy-the-id shortcut for building rules. |
| **History** | A local log of every booking, waitlist join, dry run and failure. |

There is an app-wide **Dry run** toggle: it runs the full ranking and booking
path but stops before the actual request, so you can tune rules without spending
a real booking.

## How your Cult.fit session is handled

Cult.fit's API blocks cross-origin browser calls, so Warmup ships a tiny
**stateless proxy** (`src/app/api/cult/[...path]/route.ts`). Your session:

- is stored **only in your browser's `localStorage`**, never in a database;
- is sent only to Warmup's own proxy, in the `X-Cult-Session` header;
- is forwarded upstream to `www.cult.fit` and **never stored or logged** by the
  server.

The proxy only forwards a fixed allowlist of Cult endpoints and applies
best-effort per-IP rate limiting.

### Connecting an account

Two methods, chosen on the **Connect** screen:

1. **Phone & OTP** — renders Cult.fit's own reCAPTCHA v2 widget (their public
   site key) and calls their real `loginPhoneSendOtp` / `loginPhoneVerifyOtp`
   endpoints through the proxy. You solve a genuine Google captcha; nothing is
   bypassed. This depends on Cult not domain-locking their site key — if it stops
   working, set `NEXT_PUBLIC_ENABLE_OTP_LOGIN=false` and use method 2.
2. **Paste session** — on a desktop browser, log in to cult.fit, open DevTools →
   Network, and "Copy as cURL" any `api/` request. Paste it in; Warmup keeps only
   the `at` / `st` session tokens.

Cult sessions expire after a while. When they do, any screen will send you back to
**Connect** to reconnect.

## Run it locally

```bash
pnpm install
cp .env.example .env.local   # optional — every value has a default
pnpm dev                     # http://localhost:3000
```

```bash
pnpm test        # vitest — schedule parsing + rules engine (no network)
pnpm typecheck   # tsc --noEmit
pnpm build       # production build
```

## Deploy (free)

Works on **Vercel's free Hobby tier** as-is — it's a plain Next.js app with one
Node route handler and no database. Push the repo, import it in Vercel, deploy.
Set env vars only if you want to override a default or disable OTP login.

Netlify and Cloudflare Pages also work (the proxy route needs a Node/serverless
runtime, not edge-only).

## Project layout

```
src/lib/cult/
  schedule.ts    pure parsers for the classes/v2 response
  rules.ts       zod-validated preferences model + rankMatches()
  client.ts      server-side fetch-with-backoff (proxy only)
  api.ts         browser helpers -> our /api/cult proxy
  curl.ts        parse a pasted "Copy as cURL" into a session
src/lib/
  storage.ts     all localStorage (session, rules, history, settings, backup)
  hooks.ts       useSession / useRules / useSchedule / useSettings
src/app/api/cult/[...path]/route.ts   the stateless proxy
src/app/(screens)                     connect, schedule, preferences, explore, history
```

## Status / known gaps

- **Cancel a booking** is not implemented — Cult's cancel endpoint hasn't been
  captured yet. The proxy allowlist and `api.ts` have a provisional slot for it.
- **Reminders / notifications** are intentionally out of scope for now. Anything
  scheduled needs some persistence; the zero-storage option (a generated calendar
  `.ics` subscription your own phone alarms on) is the likely first addition.
- Session lifetime is not yet measured; the reconnect prompt is the safety net.

## Prior art

An earlier throwaway CLI (`cultbot/`, not part of this repo) automated the same
booking from a YAML config. Warmup's `schedule.ts` and rules engine are ports of
its pure logic; everything else is new.
