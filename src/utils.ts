import { Page } from "playwright";
import fs from "fs";
import path from "path";
import { logger } from "./logger.ts";
import { InstagramPage } from "./pages/instagramPage.ts";
import { MAX_PER_DAY, MAX_PER_HOUR } from "./config.ts";

// ---------------------------------------------------------------------------
//  Scraping: followers / following / unfollowers
// ---------------------------------------------------------------------------

function writeUsernames(fileName: string, usernames: string[]): void {
    const outputPath = path.resolve("data", fileName);
    fs.mkdirSync("data", { recursive: true });
    fs.writeFileSync(outputPath, usernames.join("\n"), "utf-8");
    logger.info(`✅ Saved ${usernames.length} users to ${outputPath}`);
}

export async function getFollowing(page: Page, username: string) {
    const ig = new InstagramPage(page);
    await ig.openFollowingList(username);
    writeUsernames("following.txt", await ig.extractListUsernames());
}

export async function getFollowers(page: Page, username: string) {
    const ig = new InstagramPage(page);
    await ig.openFollowersList(username);
    writeUsernames("followers.txt", await ig.extractListUsernames());
}

export async function getUnfollowers() {
    const followingPath = path.resolve("data", "following.txt");
    const followersPath = path.resolve("data", "followers.txt");
    if (!fs.existsSync(followingPath) || !fs.existsSync(followersPath)) {
        logger.error(
            "❌ following.txt and followers.txt must exist. Run the corresponding options first."
        );
        return;
    }

    const following = new Set(
        fs
            .readFileSync(followingPath, "utf-8")
            .split("\n")
            .filter(Boolean)
    );
    const followers = new Set(
        fs
            .readFileSync(followersPath, "utf-8")
            .split("\n")
            .filter(Boolean)
    );
    const unfollowers = [...following].filter((user) => !followers.has(user));

    const unfollowersCsvPath = path.resolve("data", "unfollowers.csv");
    fs.mkdirSync("data", { recursive: true });

    let existingUsernames = new Set<string>();
    if (fs.existsSync(unfollowersCsvPath)) {
        const lines = fs
            .readFileSync(unfollowersCsvPath, "utf-8")
            .split(/\r?\n/)
            .filter(Boolean);
        for (const line of lines.slice(1)) {
            const cols = line.split(";");
            if (cols[1]) existingUsernames.add(cols[1]);
        }
    }

    const newRows = [];
    for (const user of unfollowers) {
        if (!existingUsernames.has(user)) {
            const url = `https://www.instagram.com/${user}/`;
            // New rows default to "true" (everyone is an unfollow candidate).
            newRows.push(["true", user, url]);
        }
    }

    let writeHeader = !fs.existsSync(unfollowersCsvPath);
    const csvLines = newRows.map((row) => row.join(";"));
    if (csvLines.length > 0) {
        // CSV columns: marcado;usuario;url  (flag;username;url)
        const toWrite =
            (writeHeader ? "marcado;usuario;url\n" : "") +
            csvLines.join("\n") +
            "\n";
        fs.appendFileSync(unfollowersCsvPath, toWrite, "utf-8");
        logger.info(
            `✅ Added ${newRows.length} new unfollowers to ${unfollowersCsvPath}`
        );
    } else {
        logger.info("❌ No new unfollowers to add.");
    }
}

// ---------------------------------------------------------------------------
//  Bulk unfollow
// ---------------------------------------------------------------------------

async function unfollowUser(
    userName: string,
    ig: InstagramPage,
    retries = 1
): Promise<boolean> {
    logger.info(`Starting unfollow for: ${userName}`);

    await ig.openProfile(userName);

    logger.info(`Waiting for the left button...`);

    try {
        await ig.waitForFollowButton();
    } catch (err) {
        if (await ig.isProfileUnavailable()) {
            logger.warn(`❌ The page for ${userName} is not available.`);
            return false;
        }
        throw err;
    }

    if (!(await ig.isFollowing())) {
        logger.warn(`❌ You don't follow ${userName}`);
        return false;
    }

    logger.info(`Waiting for the unfollow button...`);
    await ig.clickUnfollow();

    logger.info(`Waiting for unfollow confirmation...`);
    await ig.waitUnfollowRequest();

    await ig.page.waitForTimeout(10000);
    const unfollowed = await ig.wasUnfollowed();

    if (!unfollowed && retries > 0) {
        logger.warn(`❌ Could not unfollow ${userName}, retrying...`);
        return unfollowUser(userName, ig, retries - 1);
    } else if (unfollowed) {
        logger.info(`✅ Unfollowed ${userName}`);
        return true;
    }

    logger.error(`❌ Could not unfollow ${userName} after one retry`);
    return false;
}

function getRandomSleepMs() {
    let sleepDay = MAX_PER_DAY > 0 ? (24 * 60 * 60 * 1000) / MAX_PER_DAY : 0;
    let sleepHour = MAX_PER_HOUR > 0 ? (60 * 60 * 1000) / MAX_PER_HOUR : 0;

    const min = Math.min(sleepHour, sleepDay);
    const max = Math.max(sleepHour, sleepDay);

    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function unfollow(page: Page) {
    const stopUserName = process.env.STOP_USERNAME;
    const ig = new InstagramPage(page);

    const csvPath = path.resolve("data", "unfollowers.csv");
    if (!fs.existsSync(csvPath)) {
        logger.error(
            "❌ data/unfollowers.csv does not exist. Generate it with getUnfollowers()."
        );
        return;
    }

    const lines = fs
        .readFileSync(csvPath, "utf-8")
        .split(/\r?\n/)
        .filter(Boolean);
    if (lines.length <= 1) {
        logger.error("❌ The CSV has no data rows (header only or empty).");
        return;
    }

    const dataLines = lines.slice(1);

    const usersToUnfollow = dataLines
        .map((line) => line.split(";"))
        .filter(
            (cols) =>
                cols.length >= 2 &&
                cols[0] !== undefined &&
                cols[1] !== undefined
        )
        .map(
            (cols) =>
                [
                    cols[0]?.trim().toLowerCase() ?? "false",
                    cols[1] ?? "error",
                ] as const
        )
        .filter(([marked, user]) => marked === "true" && user)
        .map(([, user]) => user);
    logger.info(`🔎 Marked for unfollow: ${usersToUnfollow.join(", ")}`);

    const unfollowedPath = path.resolve("data", "unfollowed.txt");
    if (!fs.existsSync(unfollowedPath))
        fs.writeFileSync(unfollowedPath, "", "utf-8");

    for (const user of usersToUnfollow) {
        const unfollowed = await unfollowUser(user, ig);

        const cur = fs
            .readFileSync(csvPath, "utf-8")
            .split(/\r?\n/)
            .filter(Boolean);
        const [curHeader, ...curData] = cur;

        const updatedLines = curData.filter((row) => {
            const cols = row.split(";");
            return cols[1] !== user;
        });

        fs.writeFileSync(
            csvPath,
            [curHeader, ...updatedLines].join("\n") + "\n",
            "utf-8"
        );

        fs.appendFileSync(unfollowedPath, user + "\n", "utf-8");

        logger.info(`Unfollow process finished for: ${user}`);

        if (user === stopUserName) {
            logger.info(`🛑 Stopping unfollow at ${stopUserName}`);
            break;
        }

        if (unfollowed) {
            const sleepMs = getRandomSleepMs();
            if (sleepMs > 0) {
                logger.info(
                    `⏳ Waiting ${(sleepMs / 60000).toFixed(2)} minutes...`
                );
                await page.waitForTimeout(sleepMs);
            }
        }
    }

    logger.info("✅ Unfollow process finished for all users.");
}

// ===========================================================================
//  REVIEW MODE (Tinder-style): Unfollow / Keep (whitelist)
// ===========================================================================

// Users marked "true" in the CSV (the unfollow candidates).
function getMarkedUsers(csvPath: string): string[] {
    const lines = fs
        .readFileSync(csvPath, "utf-8")
        .split(/\r?\n/)
        .filter(Boolean);
    return lines
        .slice(1)
        .map((l) => l.split(";"))
        .filter((c) => (c[0]?.trim().toLowerCase() ?? "") === "true" && c[1])
        .map((c) => c[1] as string);
}

// Changes a user's "marcado" flag in the CSV.
function updateMarcado(csvPath: string, username: string, unfollow: boolean) {
    const lines = fs
        .readFileSync(csvPath, "utf-8")
        .split(/\r?\n/)
        .filter(Boolean);
    if (lines.length === 0) return;
    const header = lines[0];
    const data = lines.slice(1).map((line) => {
        const cols = line.split(";");
        if (cols[1] === username) cols[0] = unfollow ? "true" : "false";
        return cols.join(";");
    });
    fs.writeFileSync(csvPath, [header, ...data].join("\n") + "\n", "utf-8");
}

export async function reviewUnfollowers(page: Page) {
    const csvPath = path.resolve("data", "unfollowers.csv");
    if (!fs.existsSync(csvPath)) {
        logger.error(
            "❌ data/unfollowers.csv does not exist. Generate it with option 3 first."
        );
        return;
    }

    const users = getMarkedUsers(csvPath);
    if (users.length === 0) {
        logger.info("✅ No unfollowers marked for review.");
        return;
    }
    logger.info(
        `🧭 Reviewing ${users.length} real profiles (Unfollow / Keep).`
    );

    await new InstagramPage(page).ensureSession();

    const context = page.context();
    const AHEAD = 3; // profiles preloaded ahead (in background tabs)

    const pagesByIndex = new Map<number, Page>();
    let cursor = 0;
    let busy = false;
    let finished = false;

    let resolveDone: () => void = () => {};
    const done = new Promise<void>((r) => (resolveDone = r));

    async function ensureLoaded(i: number) {
        if (i < 0 || i >= users.length || pagesByIndex.has(i)) return;
        const user = users[i] as string;
        const p = await context.newPage();
        pagesByIndex.set(i, p);
        await new InstagramPage(p).gotoProfile(user);
        await p
            .evaluate(injectBar, {
                username: user,
                index: i,
                total: users.length,
            })
            .catch(() => {});
    }

    async function preloadWindow() {
        for (let i = cursor; i <= cursor + AHEAD; i++) await ensureLoaded(i);
    }

    async function finishReview() {
        if (finished) return;
        finished = true;
        logger.info("🏁 Review finished.");
        resolveDone();
    }

    // Page -> Node bridge: each floating bar calls __igReview.
    await context.exposeFunction(
        "__igReview",
        async (action: string, username: string) => {
            if (finished || busy) return;
            busy = true;
            try {
                if (action === "quit") {
                    await finishReview();
                    return;
                }
                const unfollow = action === "unfollow";
                updateMarcado(csvPath, username, unfollow);
                logger.info(
                    `${
                        unfollow ? "🚫 Unfollow" : "✅ Keep (whitelist)"
                    }: ${username} (${cursor + 1}/${users.length})`
                );

                const prev = pagesByIndex.get(cursor);
                pagesByIndex.delete(cursor);
                if (prev) prev.close().catch(() => {});

                cursor++;
                if (cursor >= users.length) {
                    await finishReview();
                    return;
                }
                await preloadWindow();
                const cur = pagesByIndex.get(cursor);
                if (cur) await cur.bringToFront().catch(() => {});
            } finally {
                busy = false;
            }
        }
    );

    // The first profile uses the main tab; the next ones are preloaded.
    pagesByIndex.set(0, page);
    await new InstagramPage(page).gotoProfile(users[0] as string);
    await page
        .evaluate(injectBar, {
            username: users[0] as string,
            index: 0,
            total: users.length,
        })
        .catch(() => {});
    await preloadWindow();
    await page.bringToFront().catch(() => {});

    await done;

    // Close any preload tabs still open.
    for (const [, p] of pagesByIndex) {
        if (p !== page) await p.close().catch(() => {});
    }
}

// Code that runs INSIDE each tab: adds a floating bar with the
// Unfollow / Keep / Quit buttons on top of the real profile.
// It does not cover the content: you can scroll the grid and open photos,
// reels and stories normally. Only the bar captures clicks (pointer-events).
function injectBar(arg: { username: string; index: number; total: number }) {
    const w = window as any;
    const username = arg.username;
    if (document.getElementById("__ig_review_bar")) return;

    const bar = document.createElement("div");
    bar.id = "__ig_review_bar";
    bar.setAttribute(
        "style",
        [
            "position:fixed",
            "left:0",
            "right:0",
            "bottom:0",
            "z-index:2147483647",
            "display:flex",
            "justify-content:center",
            "pointer-events:none",
            "padding:14px",
            "font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif",
        ].join(";")
    );
    bar.innerHTML =
        '<div style="pointer-events:auto;display:flex;align-items:center;gap:10px;background:rgba(10,10,15,.92);border:1px solid #2a2a35;border-radius:16px;padding:10px 14px;box-shadow:0 10px 40px rgba(0,0,0,.55)">' +
        '<span style="color:#aaa;font-size:13px;min-width:54px">' +
        (arg.index + 1) +
        " / " +
        arg.total +
        "</span>" +
        '<span style="color:#fff;font-size:13px;font-weight:700;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">@' +
        username +
        "</span>" +
        '<button id="__ig_unfollow" style="border:none;border-radius:12px;background:#e0245e;color:#fff;font-size:14px;font-weight:700;padding:10px 14px;cursor:pointer">✖ Unfollow</button>' +
        '<button id="__ig_keep" style="border:none;border-radius:12px;background:#17bf63;color:#fff;font-size:14px;font-weight:700;padding:10px 14px;cursor:pointer">✓ Keep</button>' +
        '<button id="__ig_quit" style="border:1px solid #333;border-radius:12px;background:#1b1b22;color:#aaa;font-size:13px;padding:10px 12px;cursor:pointer">Quit</button>' +
        "</div>";
    document.body.appendChild(bar);

    const call = (action: string) => {
        try {
            w.__igReview(action, username);
        } catch (e) {}
    };
    (bar.querySelector("#__ig_unfollow") as HTMLElement).addEventListener(
        "click",
        () => call("unfollow")
    );
    (bar.querySelector("#__ig_keep") as HTMLElement).addEventListener(
        "click",
        () => call("keep")
    );
    (bar.querySelector("#__ig_quit") as HTMLElement).addEventListener(
        "click",
        () => call("quit")
    );

    if (!w.__igKeyBound) {
        w.__igKeyBound = true;
        window.addEventListener(
            "keydown",
            (e: any) => {
                if (!document.getElementById("__ig_review_bar")) return;
                if (e.key === "ArrowLeft" || e.key === "u" || e.key === "U") {
                    e.preventDefault();
                    call("unfollow");
                } else if (
                    e.key === "ArrowRight" ||
                    e.key === "k" ||
                    e.key === "K"
                ) {
                    e.preventDefault();
                    call("keep");
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    call("quit");
                }
            },
            true
        );
    }
}
