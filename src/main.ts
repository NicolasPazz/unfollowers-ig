import "dotenv/config";
import readline from "readline";
import fs from "fs";
import { chromium } from "playwright";
import {
    getFollowers,
    getFollowing,
    getUnfollowers,
    unfollow,
    COOKIES_PATH,
} from "./utils.ts";

const userName = process.env.IG_USERNAME;
if (!userName) throw new Error("IG_USERNAME no definido en .env");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function preguntar(): Promise<string> {
    return new Promise((resolve) => {
        console.log(`\n¿Qué acción querés ejecutar?\n`);
        console.log(`1) Obtener followers`);
        console.log(`2) Obtener following`);
        console.log(`3) Obtener unfollowers`);
        console.log(`4) Ejecutar 1, 2 y 3`);
        console.log(`5) Hacer unfollow a los unfollowers`);

        rl.question("Elegí una opción (1-5): ", (respuesta) => {
            resolve(respuesta.trim());
        });
    });
}

(async () => {
    const opcion = await preguntar();

    rl.close();

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    if (fs.existsSync(COOKIES_PATH)) {
        const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, "utf-8"));
        await context.addCookies(cookies);
        console.log("✅ Cookies cargadas correctamente");
    }
    await page.goto("https://www.instagram.com/");
    await page.waitForTimeout(5000);
    console.log("✅ Home cargado correctamente");

    switch (opcion) {
        case "1":
            await getFollowers(page, userName);
            break;
        case "2":
            await getFollowing(page, userName);
            break;
        case "3":
            await getUnfollowers();
            break;
        case "4":
            await getFollowers(page, userName);
            await getFollowing(page, userName);
            await getUnfollowers();
            break;
        case "5":
            await unfollow(page);
            break;
        default:
            console.log("❌ Opción no válida. Terminando...");
            break;
    }

    await browser.close();
})();
