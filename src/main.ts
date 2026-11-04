import "dotenv/config";
import readline from "readline";
import { chromium } from "playwright";
import {
    getFollowers,
    getFollowing,
    getUnfollowers,
    unfollow,
    reviewUnfollowers,
} from "./utils.ts";

const userName = process.env.IG_USERNAME;
if (!userName) throw new Error("IG_USERNAME is not defined in .env");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function ask(): Promise<string> {
    return new Promise((resolve) => {
        console.log(`\nWhich action do you want to run?\n`);
        console.log(`1) Get followers`);
        console.log(`2) Get following`);
        console.log(`3) Get unfollowers`);
        console.log(`4) Run 1, 2 and 3`);
        console.log(`5) Unfollow the unfollowers`);
        console.log(`6) Review unfollowers (Unfollow / Keep, Tinder-style)`);

        rl.question("Choose an option (1-6): ", (answer) => {
            resolve(answer.trim());
        });
    });
}

(async () => {
    const option = await ask();

    rl.close();

    const browser = await chromium.launch({ headless: false });
    // bypassCSP: Instagram enforces a Content Security Policy that forbids
    // 'unsafe-eval'. Without this, page.waitForFunction / page.$$eval fail with
    // "Refused to evaluate a string as JavaScript...".
    const context = await browser.newContext({ bypassCSP: true });
    const page = await context.newPage();
    // Cookie loading and session validation happen inside
    // openInstagramWithCookies (it checks whether the session is still active
    // and, if not, asks for a manual login and saves fresh cookies).

    switch (option) {
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
        case "6":
            await reviewUnfollowers(page);
            break;
        default:
            console.log("❌ Invalid option. Exiting...");
            break;
    }

    await browser.close();
})();
