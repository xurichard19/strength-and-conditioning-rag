import type { Page } from "../types"

type InfoPageProps = {
    page: Extract<Page, "about" | "terms" | "privacy" | "disclaimer" | "accessibility">
}

const pageContent: Record<InfoPageProps["page"], {
    eyebrow: string
    title: string
    sections: Array<{
        heading: string
        body: string
    }>
}> = {
    about: {
        eyebrow: "Company",
        title: "About Shingo",
        sections: [
            {
                heading: "Purpose",
                body: "Placeholder copy. Shingo is a strength and conditioning research assistant designed to help users explore evidence-informed training ideas.",
            },
            {
                heading: "How it works",
                body: "Placeholder copy. The app may use retrieved training references and AI-generated responses to provide educational fitness information.",
            },
        ],
    },
    terms: {
        eyebrow: "Legal",
        title: "Terms of Service",
        sections: [
            {
                heading: "Acceptance of terms",
                body: "Placeholder copy. By using Shingo, users agree to follow these terms and any additional policies referenced here.",
            },
            {
                heading: "Accounts and subscriptions",
                body: "Placeholder copy. Users are responsible for their accounts, payment information, subscription choices, and cancellation requests.",
            },
            {
                heading: "Limitations",
                body: "Placeholder copy. Shingo is provided as-is, without guarantees of availability, accuracy, performance outcomes, or fitness results.",
            },
        ],
    },
    privacy: {
        eyebrow: "Legal",
        title: "Privacy Policy",
        sections: [
            {
                heading: "Information collected",
                body: "Placeholder copy. Shingo may collect account information, authentication data, prompts, generated outputs, usage data, and billing-related information.",
            },
            {
                heading: "Service providers",
                body: "Placeholder copy. Shingo may use third-party providers for authentication, hosting, payments, analytics, AI generation, and document retrieval.",
            },
            {
                heading: "User choices",
                body: "Placeholder copy. Users may request access, correction, deletion, or other privacy actions by contacting the operator.",
            },
        ],
    },
    disclaimer: {
        eyebrow: "Safety",
        title: "Fitness Disclaimer",
        sections: [
            {
                heading: "Educational information",
                body: "Placeholder copy. Shingo provides educational fitness information and does not provide medical advice, diagnosis, or treatment.",
            },
            {
                heading: "Exercise risk",
                body: "Placeholder copy. Exercise involves risk. Users should stop if they experience pain, dizziness, or unusual symptoms and should consult a qualified professional when appropriate.",
            },
            {
                heading: "No guaranteed results",
                body: "Placeholder copy. Training outcomes vary by person, context, consistency, health status, and many other factors.",
            },
        ],
    },
    accessibility: {
        eyebrow: "Policy",
        title: "Accessibility",
        sections: [
            {
                heading: "Commitment",
                body: "Placeholder copy. Shingo aims to provide a usable experience for people with diverse access needs.",
            },
            {
                heading: "Feedback",
                body: "Placeholder copy. Users who encounter accessibility issues should contact the operator with details about the issue, device, browser, and assistive technology used.",
            },
        ],
    },
}

const teamIntroductions = [
    {
        name: "rxu",
        body: "ML/Cloud/Backend",
    },
    {
        name: "dmahairas",
        body: "Cloud/DevOps/FullStack",
    },
    {
        name: "codex",
        body: "goat",
    },
]

export function InfoPage({ page }: InfoPageProps) {
    const content = pageContent[page]

    return (
        <main className="mx-auto min-h-[calc(100vh-9rem)] max-w-5xl px-4 py-8 text-left text-[var(--text)] sm:px-6 lg:px-8">
            <header className="mb-8">
                <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-h)]">
                    {content.eyebrow}
                </p>
                <h1 className="m-0 text-4xl font-semibold tracking-normal text-[var(--text-h)] sm:text-5xl">
                    {content.title}
                </h1>
            </header>

            <div className="grid gap-4">
                {content.sections.map((section) => (
                    <section
                        key={section.heading}
                        className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-5 shadow-[var(--shadow)]"
                    >
                        <h2 className="m-0 text-lg font-semibold text-[var(--text-h)]">{section.heading}</h2>
                        <p className="m-0 mt-3 leading-7">{section.body}</p>
                    </section>
                ))}
            </div>

            {page === "about" && (
                <section className="mt-6">
                    <div className="mb-4 flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text)]">
                        <span className="h-px flex-1 bg-[var(--border)]" />
                        <span>Team</span>
                        <span className="h-px flex-1 bg-[var(--border)]" />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        {teamIntroductions.map((person) => (
                            <article
                                key={person.name}
                                className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-5 shadow-[var(--shadow)]"
                            >
                                <h2 className="m-0 text-lg font-semibold text-[var(--text-h)]">{person.name}</h2>
                                <p className="m-0 mt-3 leading-7">{person.body}</p>
                            </article>
                        ))}
                    </div>
                </section>
            )}
        </main>
    )
}
