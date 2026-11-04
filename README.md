# unfollow-ig

Scrapes your Instagram followers and following lists, computes who you follow
that doesn't follow you back ("unfollowers"), and lets you unfollow them —
either in bulk or one by one through an interactive review mode.

It drives a real Chromium browser with Playwright and reuses your logged-in
session via saved cookies. There is no use of unofficial private APIs for the
unfollow action itself; it clicks the actual Instagram UI.

## Requirements

- Node.js >= 18
- A Chromium browser for Playwright (installed with `npx playwright install chromium`)
- An Instagram account (you log in manually the first time)

## Install

```bash
git clone https://github.com/NicolasPazz/unfollowers-ig.git
cd unfollowers-ig
npm install
npx playwright install chromium
```

Create a `.env` file in the project root:

```env
IG_USERNAME=your_instagram_username   # required
MAX_PER_DAY=50                         # optional: max unfollows per day
MAX_PER_HOUR=10                        # optional: max unfollows per hour
STOP_USERNAME=                         # optional: stop the bulk unfollow when this user is reached
```

Only `IG_USERNAME` is required; the app throws on startup if it is missing.

## Run

```bash
npm run dev
```

This runs `src/main.ts` through the `ts-node/esm` loader and shows an
interactive menu:

```
1) Get followers
2) Get following
3) Get unfollowers
4) Run 1, 2 and 3
5) Unfollow the unfollowers
6) Review unfollowers (Unfollow / Keep, Tinder-style)
```

Enter the number and press Enter. A Chromium window opens; leave it open while
the task runs.

### First run / login

On the first run (or whenever your session is no longer valid) the app detects
that you are logged out and prints a prompt. Log in manually in the Chromium
window. Once you reach the logged-in home feed, the session cookies are saved to
`cookies.json` and reused on subsequent runs.

Session validity is verified by actually loading Instagram and checking for the
login form — not by trusting the cookie's local expiry date, which Instagram can
invalidate server-side at any time.

## Typical workflow

1. **Option 4** — scrape followers + following and build the unfollowers CSV.
2. **Option 6** — review each unfollower and decide who to keep.
3. **Option 5** — unfollow everyone still marked `true`.

## Menu options

| Option | Action | Output |
| --- | --- | --- |
| 1 | Scrape accounts that follow you | `data/followers.txt` |
| 2 | Scrape accounts you follow | `data/following.txt` |
| 3 | Compute unfollowers (`following` − `followers`) | `data/unfollowers.csv` |
| 4 | Run 1, 2 and 3 in sequence | all of the above |
| 5 | Bulk unfollow every row marked `true` | updates CSV, appends `data/unfollowed.txt` |
| 6 | Review profiles one by one and set the flag | updates CSV |

### Option 3 — unfollowers CSV

`data/unfollowers.csv` uses `;` as the separator and has the header
`marcado;usuario;url`:

```
marcado;usuario;url
true;some_user;https://www.instagram.com/some_user/
```

- `marcado` is the boolean deciding whether the user will be unfollowed.
- **New rows are added with `marcado=true` by default** (everyone is an unfollow
  candidate until you decide otherwise).
- Re-running option 3 only appends users not already present, so manual or
  reviewed edits are preserved.

### Option 5 — bulk unfollow

Processes every row with `marcado=true`, in order. For each user it:

1. Opens the profile and confirms you are actually following them.
2. Clicks "Following" → "Unfollow" and waits for the request to confirm.
3. Removes the row from the CSV and appends the username to
   `data/unfollowed.txt`.
4. Waits a randomized delay derived from `MAX_PER_DAY` / `MAX_PER_HOUR` before
   the next one.

If `STOP_USERNAME` is set, the loop stops after processing that user.

### Option 6 — interactive review (Tinder-style)

Shows the **real Instagram profile** of each user marked `true`, one at a time,
so you can scroll the grid and open photos, reels and stories normally. A
floating bar sits on top of the page with:

- progress (`3 / 20`) and the current `@username`
- **Unfollow** — keep the row marked `true`
- **Keep** — set the row to `false` (whitelist, you stay following)
- **Quit** — end the review

Keyboard shortcuts: `←` / `U` = Unfollow, `→` / `K` = Keep, `Esc` = Quit.

Each decision is written to the CSV immediately. Advancing is near-instant: the
current profile and the next few are preloaded in background tabs, and the next
one is brought to the front once it is already loaded.

After reviewing, run **option 5** to actually unfollow everyone still marked
`true`.

## How it works

- **Playwright + Chromium** (`headless: false`) drives a visible browser.
- The browser context is created with `bypassCSP: true` because Instagram's
  Content Security Policy forbids `unsafe-eval`, which would otherwise break
  `page.waitForFunction` and `page.$$eval`.
- Session cookies are stored in `cookies.json`.
- Logging uses Winston (Buenos Aires timezone) to the console and to `app.log`.

## Generated files

| Path | Description |
| --- | --- |
| `cookies.json` | Saved Instagram session cookies |
| `data/followers.txt` | Accounts that follow you |
| `data/following.txt` | Accounts you follow |
| `data/unfollowers.csv` | Unfollow candidates (`marcado;usuario;url`) |
| `data/unfollowed.txt` | Users already unfollowed (append log) |
| `app.log` | Runtime log |

## Notes and limitations

- **Session reset.** If you switch accounts or the session expires in a way the
  app can't recover, delete `cookies.json` and log in again.
- **Instagram markup.** Scraping and the unfollow click rely on Instagram's
  (obfuscated, frequently changing) CSS classes and DOM structure. If a run
  fails to find an element, the selectors in `src/pages/selectors.ts` likely
  need updating.
- **Rate limits.** Unfollowing too fast can trigger action blocks. Set
  `MAX_PER_DAY` / `MAX_PER_HOUR` conservatively.
- **Multiple tabs.** Review mode opens a few background tabs at once to preload
  profiles.
- Use at your own risk; automating Instagram may violate its Terms of Service.

## Project structure

```
src/
  main.ts                Interactive menu and browser setup
  config.ts              Paths and settings read from .env
  utils.ts               Scraping, unfollow and review logic
  logger.ts              Winston logger
  pages/
    instagramPage.ts     Page object: session checks and UI actions
    selectors.ts         CSS selectors and UI texts
data/                    Generated lists and CSV
```

## Scripts

- `npm run dev` — run the interactive app via `ts-node/esm`.
