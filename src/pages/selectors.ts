// ===========================================================================
//  Single source of truth for everything that depends on Instagram's markup.
//
//  Instagram ships obfuscated, frequently-changing CSS classes. When a run
//  stops finding an element, this is the ONLY file that should need updating.
// ===========================================================================

export const SELECTORS = {
    // Logged-out signal: the login screen. Instagram uses name="email" for the
    // user field and name="pass" for the password, inside <form id="login_form">.
    // Older variants (username / loginForm) are covered too.
    loggedOut:
        'form#login_form, form#loginForm, input[name="pass"], input[name="password"], input[name="email"][autocomplete~="username"], input[name="username"]',

    // Profile list links (URL-based, independent of the UI language).
    followersLink: (username: string) => `a[href="/${username}/followers/"]`,
    followingLink: (username: string) => `a[href="/${username}/following/"]`,

    // Scroll container of the followers/following modal. Very brittle: this is
    // the first thing to re-check if the list stops scrolling to the end.
    listScrollContainer:
        "body > div.x1n2onr6.xzkaem6 > div:nth-child(2) > div > div > div.x9f619.x1n2onr6.x1ja2u2z > div > div.x1uvtmcs.x4k7w5x.x1h91t0o.x1beo9mf.xaigb6o.x12ejxvf.x3igimt.xarpa2k.xedcshv.x1lytzrv.x1t2pt76.x7ja8zs.x1n2onr6.x1qrby5j.x1jfb8zj > div > div > div > div > div.x7r02ix.x15fl9t6.x1yw9sn2.x1evh3fb.x4giqqa.xb88tzc.xw2csxc.x1odjw0f.x5fp0pe > div > div > div.x6nl9eh.x1a5l9x9.x7vuprf.x1mg3h75.x1lliihq.x1iyjqo2.xs83m0k.xz65tgg.x1rife3k.x1n2onr6",

    // Username text nodes inside the list modal.
    listUsernameSpans:
        'div div div div div div div div div span div a div div span[dir="auto"]',

    // Loading spinner shown while the list is still fetching more rows.
    // aria-label is localized, so match both Spanish and English UIs.
    loadingSpinner:
        'svg[aria-label="Cargando..."], svg[aria-label="Loading..."]',

    // Follow / unfollow controls on a profile page.
    followButton: "button._aswp",
    followButtonLabel: "button._aswp div div._ap3a",
    unfollowConfirm:
        "div.html-div.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl.x9f619.xjbqb8w.x78zum5.x15mokao.x1ga7v0g.x16uus16.xbiv7yw.x1uhb9sk.x1plvlek.xryxfnj.x1iyjqo2.x2lwn1j.xeuugli.xdt5ytf.xqjyukv.x1cy8zhl.x1oa3qoh.x1nhvcw1",

    // Container of the "page not available" message.
    unavailableText: "span.x4zkp8e",
} as const;

// Text matchers for Instagram's own labels/messages, tolerant to the UI
// language (Spanish / English) so detection works without the user noticing.
export const TEXT = {
    following: /^(siguiendo|following|solicitado|requested)/i,
    notFollowing: /^(seguir|follow)/i,
    unavailable: /no está disponible|isn't available|not available/i,
} as const;

// Instagram endpoints the automation relies on.
export const IG = {
    home: "https://www.instagram.com/",
    profile: (username: string) => `https://www.instagram.com/${username}/`,
    graphql: "https://www.instagram.com/graphql/query",
} as const;
