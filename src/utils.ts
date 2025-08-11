import { Page } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COOKIES_PATH = path.resolve(__dirname, "../../cookies.json");

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
    const apiUrl = `https://www.instagram.com/api/v1/web/get_profile_pic_props/${username}/`;

    const context = page.context();
    if (hayCookiesValidas()) {
        const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, "utf-8"));
        await context.addCookies(cookies);
        console.log("🔁 Cookies cargadas.");
    }

    await page.goto(profileUrl);

    await page.waitForRequest(
        (request) => request.method() === "GET" && request.url() === apiUrl,
        { timeout: 180000 }
    );
    console.log("✅ Petición al perfil detectada.");

    if (!hayCookiesValidas()) {
        const cookies = await context.cookies();
        fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
        console.log("💾 Cookies guardadas en cookies.json");
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
            console.log("✅ No hay más spinners. Fin del scroll.");
            await page.waitForTimeout(5000);
            break;
        }
        await page.waitForTimeout(250);
    }
    console.debug(
        `Iteraciones totales: ${iter}`
    );
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

	console.debug(`Usernames extraídos:`, usernames);

	const outputPath = path.resolve("data", fileName);
	fs.mkdirSync("data", { recursive: true });
	fs.writeFileSync(outputPath, usernames.join("\n"), "utf-8");

	console.log(`✅ Se guardaron ${usernames.length} usuarios en ${outputPath}`);
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

export async function getUnfollowers(page: Page) {
    // obtener seguidores de followers.txt

    const followers = fs.readFileSync(path.resolve("data", "followers.txt"), "utf-8").split("\n");

    // obtener seguidos de following.txt
    const following = fs.readFileSync(path.resolve("data", "following.txt"), "utf-8").split("\n");

    // obtener unfollowers de la diferencia entre seguidores y seguidos
    const unfollowers = followers.filter((user) => !following.includes(user));

    // escribirlo en unfollowers.txt (si ya existe sobreescribirlo)
    const outputPath = path.resolve("data", "unfollowers.txt");
    fs.mkdirSync("data", { recursive: true });
    fs.writeFileSync(outputPath, unfollowers.join("\n"), "utf-8");

    console.log(`✅ Se guardaron ${unfollowers.length} unfollowers en ${outputPath}`);
}