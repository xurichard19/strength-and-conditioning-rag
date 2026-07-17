export const infoPages = ["about", "terms", "privacy", "disclaimer", "accessibility"] as const

export type InfoPageName = (typeof infoPages)[number]

const pagePaths = {
    home: "/home",
    onboarding: "/onboarding",
    today: "/today",
    chat: "/chat",
    plan: "/plan",
    calendar: "/calendar",
    settings: "/settings",
    saved: "/saved",
    activity: "/activity",
    help: "/help",
    about: "/about",
    terms: "/terms",
    privacy: "/privacy",
    disclaimer: "/disclaimer",
    accessibility: "/accessibility",
} as const

export type Page = keyof typeof pagePaths

const pathPages = new Map<string, Page>(
    Object.entries(pagePaths).map(([page, path]) => [path, page as Page]),
)

export function getPathForPage(page: Page) {
    return pagePaths[page]
}

export function getPageFromPath(pathname: string): Page {
    if (pathname === "/") return "home"

    return pathPages.get(pathname.replace(/\/$/, "")) ?? "home"
}

export function isInfoPage(page: Page): page is InfoPageName {
    return infoPages.includes(page as InfoPageName)
}
