import { Page } from "playwright";
import { expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COOKIES_PATH = path.resolve(__dirname, "../../cookies.json");
const MAX_PER_DAY = Number(process.env.MAX_PER_DAY);
const MAX_PER_HOUR = Number(process.env.MAX_PER_HOUR);

function hayCookiesValidas() {
    if (!fs.existsSync(COOKIES_PATH)) return false;
    try {
        const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, "utf-8"));
        return (
            Array.isArray(cookies) &&
            cookies.some((c: any) => c.name === "sessionid" && c.value)
        );
    } catch {
        return false;
    }
}

async function openInstagramWithCookies(page: Page, username: string) {
    const profileUrl = `https://www.instagram.com/${username}/`;

    const context = page.context();
    if (hayCookiesValidas()) {
        const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, "utf-8"));
        await context.addCookies(cookies);
        logger.info("🔁 Cookies cargadas");
    }

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

    logger.info("✅ Perfil cargado");

    if (!hayCookiesValidas()) {
        const cookies = await context.cookies();
        fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
        logger.info("💾 Cookies guardadas en cookies.json");
    }

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

        const spinners = await page.$$('svg[aria-label="Cargando..."]');
        if (spinners.length === 0) {
            logger.info("✅ Fin del scroll");
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

    logger.info(
        `✅ Se guardaron ${usernames.length} usuarios en ${outputPath}`
    );
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
            "❌ Deben existir los archivos following.txt y followers.txt. Ejecuta primero las funciones correspondientes."
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
            newRows.push(["true", user, url]);
        }
    }

    let writeHeader = !fs.existsSync(unfollowersCsvPath);
    const csvLines = newRows.map((row) => row.join(";"));
    if (csvLines.length > 0) {
        const toWrite =
            (writeHeader ? "marcado;usuario;url\n" : "") +
            csvLines.join("\n") +
            "\n";
        fs.appendFileSync(unfollowersCsvPath, toWrite, "utf-8");
        logger.info(
            `✅ Se agregaron ${newRows.length} unfollowers nuevos a ${unfollowersCsvPath}`
        );
    } else {
        logger.info("❌ No hay nuevos unfollowers para agregar.");
    }
}

async function unfollowUser(userName: string, page: Page) {
    const followingButton = "button._aswp";
    const leftButton = page.locator("button._aswp div div._ap3a").first();
    const unfollowButton =
        "div.html-div.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl.x9f619.xjbqb8w.x78zum5.x15mokao.x1ga7v0g.x16uus16.xbiv7yw.x1uhb9sk.x1plvlek.xryxfnj.x1iyjqo2.x2lwn1j.xeuugli.xdt5ytf.xqjyukv.x1cy8zhl.x1oa3qoh.x1nhvcw1";

    logger.info(`Iniciando unfollow para: ${userName}`);

    await openInstagramWithCookies(page, userName);

    logger.info(`Esperando botón izquierdo...`);

    await page.waitForSelector(followingButton);
    const siguiendo = (await leftButton.textContent()) == "Siguiendo";
    if (siguiendo) {
        await page.click(followingButton);

        logger.info(`Esperando botón de unfollow...`);

        await page.waitForSelector(unfollowButton);
        await page.locator(unfollowButton).last().click();

        logger.info(`Esperando confirmación de unfollow...`);
        await page.waitForRequest(
            (request) =>
                request.method() === "POST" &&
                request.url() === "https://www.instagram.com/graphql/query",
            { timeout: 180000 }
        );
        await page.waitForTimeout(10000);
        expect(await leftButton.textContent()).toContain("Seguir");

        logger.info(`✅ Unfollowed ${userName}`);
        return true;
    } else {
        expect(await leftButton.textContent()).toContain("Seguir");
        logger.error(`❌ No seguis a ${userName}`);
        return false;
    }
}

function getRandomSleepMs() {
    let sleepDay = MAX_PER_DAY > 0 ? (24 * 60 * 60 * 1000) / MAX_PER_DAY : 0;
    let sleepHour = MAX_PER_HOUR > 0 ? (60 * 60 * 1000) / MAX_PER_HOUR : 0;

    const min = Math.min(sleepHour, sleepDay);
    const max = Math.max(sleepHour, sleepDay);

    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function unfollow(page: Page) {
    const csvPath = path.resolve("data", "unfollowers.csv");
    if (!fs.existsSync(csvPath)) {
        logger.error(
            "❌ No existe data/unfollowers.csv. Generá el archivo con getUnfollowers()."
        );
        return;
    }

    const lines = fs
        .readFileSync(csvPath, "utf-8")
        .split(/\r?\n/)
        .filter(Boolean);
    if (lines.length <= 1) {
        logger.error(
            "❌ El CSV no tiene filas de datos (solo header o vacío)."
        );
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
    logger.info(`🔎 Marcados para unfollow:`, usersToUnfollow);

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

        logger.info(`Proceso de unfollow finalizado para: ${user}`);

        if (unfollowed) {
            const sleepMs = getRandomSleepMs();
            if (sleepMs > 0) {
                logger.info(
                    `⏳ Esperando ${(sleepMs / 60000).toFixed(2)} minutos...`
                );
                await page.waitForTimeout(sleepMs);
            }
        }
    }
}
