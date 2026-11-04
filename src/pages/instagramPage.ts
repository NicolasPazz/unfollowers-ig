import { Page } from "playwright";
import fs from "fs";
import { logger } from "../logger.ts";
import { COOKIES_PATH } from "../config.ts";
import { SELECTORS, TEXT, IG } from "./selectors.ts";

// Page Object that wraps a Playwright Page and encapsulates every interaction
// with Instagram. All Instagram-specific selectors/URLs live in selectors.ts,
// so UI changes only require editing that file, not the business logic.
export class InstagramPage {
    constructor(public readonly page: Page) {}

    // -------------------------------------------------------------- session

    private async isLoggedIn(): Promise<boolean> {
        // If Instagram redirected us to the login page, the session is invalid.
        if (/\/accounts\/login/i.test(this.page.url())) return false;

        // If the login form shows up, we are not logged in.
        try {
            await this.page
                .locator(SELECTORS.loggedOut)
                .first()
                .waitFor({ state: "visible", timeout: 4000 });
            return false;
        } catch {
            return true;
        }
    }

    // Loads cookies, opens the home page and makes sure the session is active.
    // If it is not, asks for a manual login and saves fresh cookies.
    async ensureSession(): Promise<void> {
        const context = this.page.context();

        if (fs.existsSync(COOKIES_PATH)) {
            const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, "utf-8"));
            await context.addCookies(cookies);
        }

        await this.page.goto(IG.home, { waitUntil: "domcontentloaded" });
        await this.page.waitForTimeout(2000);

        if (await this.isLoggedIn()) {
            logger.info("✅ Valid session (cookies still active).");
            return;
        }

        logger.warn(
            "❌ Expired cookies or no session. Please log in manually in the open window..."
        );

        // Wait until the login form disappears and we leave /accounts/login.
        await this.page.waitForFunction(
            (selector) =>
                !document.querySelector(selector) &&
                !location.pathname.startsWith("/accounts/login"),
            SELECTORS.loggedOut,
            { timeout: 180000 }
        );
        await this.page.waitForTimeout(3000);

        if (!(await this.isLoggedIn())) {
            throw new Error("No valid session detected after manual login.");
        }

        const cookies = await context.cookies();
        fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
        logger.info("💾 New cookies saved to cookies.json");
    }

    // -------------------------------------------------------------- navigation

    // Ensures the session, then opens the profile and waits for it to load.
    async openProfile(username: string): Promise<void> {
        await this.ensureSession();
        await this.gotoProfile(username);

        await Promise.race([
            this.page.waitForURL(
                new RegExp(`^https://www\\.instagram\\.com/${username}/?$`),
                { timeout: 120000 }
            ),
            this.page.waitForRequest(
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
        await this.page.waitForTimeout(1000);
    }

    // Plain navigation to a profile (no waits). Used for background preloading.
    async gotoProfile(username: string): Promise<void> {
        await this.page
            .goto(IG.profile(username), { waitUntil: "domcontentloaded" })
            .catch(() => {});
    }

    // -------------------------------------------------------------- lists

    async openFollowersList(username: string): Promise<void> {
        await this.openProfile(username);
        await this.page.waitForSelector(SELECTORS.followersLink(username), {
            timeout: 30000,
        });
        await this.page.click(SELECTORS.followersLink(username));
        await this.scrollListToBottom();
    }

    async openFollowingList(username: string): Promise<void> {
        await this.openProfile(username);
        await this.page.waitForSelector(SELECTORS.followingLink(username), {
            timeout: 30000,
        });
        await this.page.click(SELECTORS.followingLink(username));
        await this.scrollListToBottom();
    }

    private async scrollListToBottom(): Promise<void> {
        const list = this.page.locator(SELECTORS.listScrollContainer);
        while (true) {
            await list.press("End");
            const spinners = await this.page.$$(SELECTORS.loadingSpinner);
            if (spinners.length === 0) {
                logger.info("✅ Reached end of scroll");
                await this.page.waitForTimeout(5000);
                break;
            }
            await this.page.waitForTimeout(250);
        }
    }

    // Reads the usernames currently rendered in the open list modal.
    async extractListUsernames(): Promise<string[]> {
        const usernames = await this.page.$$eval(
            SELECTORS.listUsernameSpans,
            (spans) =>
                spans
                    .map((span) => span.textContent?.trim())
                    .filter(Boolean)
                    .slice(10)
        );
        return usernames as string[];
    }

    // -------------------------------------------------------------- unfollow

    async waitForFollowButton(): Promise<void> {
        await this.page.waitForSelector(SELECTORS.followButton);
    }

    async isProfileUnavailable(): Promise<boolean> {
        const text =
            (await this.page
                .locator(SELECTORS.unavailableText)
                .textContent()
                .catch(() => null)) ?? "";
        return TEXT.unavailable.test(text);
    }

    // Current label of the follow button ("Following"/"Siguiendo", etc.).
    async followButtonLabel(): Promise<string> {
        return (
            (await this.page
                .locator(SELECTORS.followButtonLabel)
                .first()
                .textContent()) ?? ""
        ).trim();
    }

    async isFollowing(): Promise<boolean> {
        return TEXT.following.test(await this.followButtonLabel());
    }

    // Opens the follow-button menu and confirms the unfollow action.
    async clickUnfollow(): Promise<void> {
        await this.page.click(SELECTORS.followButton);
        await this.page.waitForSelector(SELECTORS.unfollowConfirm);
        await this.page.locator(SELECTORS.unfollowConfirm).last().click();
    }

    // Waits for the GraphQL mutation that Instagram fires on unfollow.
    async waitUnfollowRequest(): Promise<void> {
        await this.page.waitForRequest(
            (request) =>
                request.method() === "POST" &&
                request.url() === IG.graphql,
            { timeout: 180000 }
        );
    }

    async wasUnfollowed(): Promise<boolean> {
        return TEXT.notFollowing.test(await this.followButtonLabel());
    }
}
