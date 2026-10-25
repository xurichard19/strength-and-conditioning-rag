export const infoPages = ["about", "terms", "privacy", "health-privacy", "disclaimer", "accessibility"] as const

export type InfoPageName = (typeof infoPages)[number]

const pagePaths = {
    home: "/",
    about: "/about",
    terms: "/terms",
    privacy: "/privacy",
    "health-privacy": "/health-privacy",
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
    return pathPages.get(pathname.replace(/\/$/, "")) ?? "home"
}

export function isInfoPage(page: Page): page is InfoPageName {
    return infoPages.includes(page as InfoPageName)
}
