import { Page } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const COOKIES_PATH = path.resolve(__dirname, "../cookies.json");
const MAX_PER_DAY = Number(process.env.MAX_PER_DAY);
const MAX_PER_HOUR = Number(process.env.MAX_PER_HOUR);

// Signals that there is NO session (Instagram login screen).
// Instagram uses name="email" for the user and name="pass" for the password,
// inside a <form id="login_form">. Older variants are covered too.
const LOGGED_OUT_SELECTOR =
    'form#login_form, form#loginForm, input[name="pass"], input[name="password"], input[name="email"][autocomplete~="username"], input[name="username"]';

async function isLoggedIn(page: Page): Promise<boolean> {
    // If Instagram redirected us to the login page, the session is invalid.
    if (/\/accounts\/login/i.test(page.url())) return false;

    // If the login form shows up, we are not logged in.
    try {
        await page
            .locator(LOGGED_OUT_SELECTOR)
            .first()
            .waitFor({ state: "visible", timeout: 4000 });
        return false;
    } catch {
        return true;
    }
}

// Loads cookies, opens the home page and makes sure the session is active.
// If it is not, it asks for a manual login and saves fresh cookies.
async function ensureSession(page: Page) {
    const context = page.context();

    // 1) Load saved cookies (if any) before validating the session.
    if (fs.existsSync(COOKIES_PATH)) {
        const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, "utf-8"));
        await context.addCookies(cookies);
    }

    // 2) Open the home page and check whether the session is REALLY active.
    await page.goto("https://www.instagram.com/", {
        waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2000);

    if (!(await isLoggedIn(page))) {
        logger.warn(
            "❌ Expired cookies or no session. Please log in manually in the open window..."
        );

        // Wait for the user to complete the login: the form disappears and we
        // leave /accounts/login.
        await page.waitForFunction(
            (selector) =>
                !document.querySelector(selector) &&
                !location.pathname.startsWith("/accounts/login"),
            LOGGED_OUT_SELECTOR,
            { timeout: 180000 }
        );
        await page.waitForTimeout(3000);

        // Re-validate the session before saving the cookies.
        if (!(await isLoggedIn(page))) {
            throw new Error("No valid session detected after manual login.");
        }

        const cookies = await context.cookies();
        fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
        logger.info("💾 New cookies saved to cookies.json");
    } else {
        logger.info("✅ Valid session (cookies still active).");
    }
}

async function openInstagramWithCookies(page: Page, username: string) {
    const profileUrl = `https://www.instagram.com/${username}/`;

    await ensureSession(page);

    await page.goto(profileUrl);

    await Promise.race([
        page.waitForURL(
            new RegExp(`^https://www\\.instagram\\.com/${username}/?$`),
            { timeout: 120000 }
        ),
        page.waitForRequest(
            (req) =>
                req.method() === "GET" &&
                (/\/api\/v1\/web\/get_profile_pic_props\/[^/]+\/?$/i.test(
                    req.url()
                ) ||
                    /\/api\/v1\/web\/fxcal\/ig_sso_users\/?$/i.test(
                        req.url()
                    ) ||
                    new RegExp(
                        `^https://instagram\\.[^/]+/${username}/?$`,
                        "i"
                    ).test(req.url())),
            { timeout: 120000 }
        ),
    ]);

    logger.info("✅ Profile loaded");

    await page.waitForTimeout(1000);
}

async function scrollToBottom(page: Page) {
    const table = page.locator(
        "body > div.x1n2onr6.xzkaem6 > div:nth-child(2) > div > div > div.x9f619.x1n2onr6.x1ja2u2z > div > div.x1uvtmcs.x4k7w5x.x1h91t0o.x1beo9mf.xaigb6o.x12ejxvf.x3igimt.xarpa2k.xedcshv.x1lytzrv.x1t2pt76.x7ja8zs.x1n2onr6.x1qrby5j.x1jfb8zj > div > div > div > div > div.x7r02ix.x15fl9t6.x1yw9sn2.x1evh3fb.x4giqqa.xb88tzc.xw2csxc.x1odjw0f.x5fp0pe > div > div > div.x6nl9eh.x1a5l9x9.x7vuprf.x1mg3h75.x1lliihq.x1iyjqo2.xs83m0k.xz65tgg.x1rife3k.x1n2onr6"
    );
    let iter = 0;
    while (true) {
        iter++;
        await table.press("End");

        // Loading spinner: match both Spanish and English Instagram UIs.
        const spinners = await page.$$(
            'svg[aria-label="Cargando..."], svg[aria-label="Loading..."]'
        );
        if (spinners.length === 0) {
            logger.info("✅ Reached end of scroll");
            await page.waitForTimeout(5000);
            break;
        }
        await page.waitForTimeout(250);
    }
}

async function extractAndWriteUsernames(page: Page, fileName: string) {
    const usernames = await page.$$eval(
        'div div div div div div div div div span div a div div span[dir="auto"]',
        (spans) =>
            spans
                .map((span) => span.textContent?.trim())
                .filter(Boolean)
                .slice(10)
    );

    const outputPath = path.resolve("data", fileName);
    fs.mkdirSync("data", { recursive: true });
    fs.writeFileSync(outputPath, usernames.join("\n"), "utf-8");

    logger.info(`✅ Saved ${usernames.length} users to ${outputPath}`);
    return usernames;
}

export async function getFollowing(page: Page, username: string) {
    await openInstagramWithCookies(page, username);

    await page.waitForSelector(`a[href="/${username}/following/"]`, {
        timeout: 30000,
    });

    await page.click(`a[href="/${username}/following/"]`);

    await scrollToBottom(page);

    await extractAndWriteUsernames(page, "following.txt");
}

export async function getFollowers(page: Page, username: string) {
    await openInstagramWithCookies(page, username);

    await page.waitForSelector(`a[href="/${username}/followers/"]`, {
        timeout: 30000,
    });

    await page.click(`a[href="/${username}/followers/"]`);

    await scrollToBottom(page);

    await extractAndWriteUsernames(page, "followers.txt");
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
            .readFileSync(path.resolve("data", "following.txt"), "utf-8")
            .split("\n")
            .filter(Boolean)
    );
    const followers = new Set(
        fs
            .readFileSync(path.resolve("data", "followers.txt"), "utf-8")
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

async function unfollowUser(userName: string, page: Page, retries = 1) {
    const followingButton = "button._aswp";
    const leftButton = page.locator("button._aswp div div._ap3a").first();
    const unfollowButton =
        "div.html-div.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl.x9f619.xjbqb8w.x78zum5.x15mokao.x1ga7v0g.x16uus16.xbiv7yw.x1uhb9sk.x1plvlek.xryxfnj.x1iyjqo2.x2lwn1j.xeuugli.xdt5ytf.xqjyukv.x1cy8zhl.x1oa3qoh.x1nhvcw1";

    logger.info(`Starting unfollow for: ${userName}`);

    await openInstagramWithCookies(page, userName);

    logger.info(`Waiting for the left button...`);

    try {
        await page.waitForSelector(followingButton);
    } catch (err) {
        const unavailableText =
            (await page
                .locator("span.x4zkp8e")
                .textContent()
                .catch(() => null)) ?? "";
        // Matches both Spanish and English Instagram UIs.
        if (/no está disponible|isn't available|not available/i.test(unavailableText)) {
            logger.warn(`❌ The page for ${userName} is not available.`);
            return false;
        }
        throw err;
    }

    // Follow state from the button label, tolerant to Instagram's UI language:
    // "Siguiendo"/"Following" (and requested states) vs "Seguir"/"Follow".
    const leftText = ((await leftButton.textContent()) ?? "").trim();
    const isFollowing = /^(siguiendo|following|solicitado|requested)/i.test(leftText);
    if (!isFollowing) {
        logger.warn(`❌ You don't follow ${userName}`);
        return false;
    }

    await page.click(followingButton);

    logger.info(`Waiting for the unfollow button...`);

    await page.waitForSelector(unfollowButton);
    await page.locator(unfollowButton).last().click();

    logger.info(`Waiting for unfollow confirmation...`);
    await page.waitForRequest(
        (request) =>
            request.method() === "POST" &&
            request.url() === "https://www.instagram.com/graphql/query",
        { timeout: 180000 }
    ); // timeout

    await page.waitForTimeout(10000);
    const afterText = ((await leftButton.textContent()) ?? "").trim();
    const unfollowed = /^(seguir|follow)/i.test(afterText);

    if (!unfollowed && retries > 0) {
        logger.warn(`❌ Could not unfollow ${userName}, retrying...`);
        return unfollowUser(userName, page, retries - 1);
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

    const header = lines[0];

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
        const unfollowed = await unfollowUser(user, page);

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

    await ensureSession(page);

    const context = page.context();
    const AHEAD = 3; // profiles preloaded ahead (in background tabs)

    const pagesByIndex = new Map<number, Page>();
    let cursor = 0;
    let busy = false;
    let finished = false;

    let resolveDone: () => void = () => {};
    const done = new Promise<void>((r) => (resolveDone = r));

    async function loadProfile(p: Page, username: string) {
        await p
            .goto(`https://www.instagram.com/${username}/`, {
                waitUntil: "domcontentloaded",
            })
            .catch(() => {});
    }

    async function ensureLoaded(i: number) {
        if (i < 0 || i >= users.length || pagesByIndex.has(i)) return;
        const user = users[i] as string;
        const p = await context.newPage();
        pagesByIndex.set(i, p);
        await loadProfile(p, user);
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
    await loadProfile(page, users[0] as string);
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
