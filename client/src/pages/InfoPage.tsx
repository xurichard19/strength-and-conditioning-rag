import type { Page } from "../routing"
import linkedinLogo from "../assets/linkedinlogo.png"
import { ArrowDown, ArrowRight } from "lucide-react"

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
        title: "About Arcel",
        sections: [
            {
                heading: "Purpose",
                body: "Arcel helps hybrid athletes explore research-backed training insights across strength, endurance, conditioning, and recovery.",
            },
            {
                heading: "How it works",
                body: "The app retrieves relevant training references, reranks them for fit, and uses them to generate practical educational guidance.",
            },
        ],
    },
    terms: {
        eyebrow: "Legal",
        title: "Terms of Service",
        sections: [
            {
                heading: "Acceptance of terms",
                body: "Placeholder copy. By using Arcel, users agree to follow these terms and any additional policies referenced here.",
            },
            {
                heading: "Accounts and subscriptions",
                body: "Placeholder copy. Users are responsible for their accounts, payment information, subscription choices, and cancellation requests.",
            },
            {
                heading: "Limitations",
                body: "Placeholder copy. Arcel is provided as-is, without guarantees of availability, accuracy, performance outcomes, or fitness results.",
            },
        ],
    },
    privacy: {
        eyebrow: "Legal",
        title: "Privacy Policy",
        sections: [
            {
                heading: "Information collected",
                body: "Placeholder copy. Arcel may collect account information, authentication data, prompts, generated outputs, usage data, and billing-related information.",
            },
            {
                heading: "Service providers",
                body: "Placeholder copy. Arcel may use third-party providers for authentication, hosting, payments, analytics, AI generation, and document retrieval.",
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
                body: "Arcel provides educational training information for hybrid athletes and does not provide medical advice, diagnosis, or treatment.",
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
                body: "Placeholder copy. Arcel aims to provide a usable experience for people with diverse access needs.",
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
        name: "richard xu",
        body: "AI/Cloud/Backend",
        linkedinUrl: "https://www.linkedin.com/in/richardrxu/",
    },
    {
        name: "dimitrios mahairas",
        body: "Cloud/DevOps/FullStack",
        linkedinUrl: "https://www.linkedin.com/in/dimitrios-mahairas/",
    },
    {
        name: "aaron jiang",
        body: "UI/UX/PM",
        linkedinUrl: "https://www.linkedin.com/in/aaron-jiang-7a10242a2/",
    }
]

const architectureSteps = [
    { label: "Client", detail: "React + Vite on Vercel" },
    { label: "Edge", detail: "Cloud Load Balancing + Cloud Armor" },
    { label: "API", detail: "FastAPI on Cloud Run" },
    { label: "Retrieval", detail: "Chroma search + Cohere reranking" },
    { label: "Generation", detail: "OpenAI grounded response" },
]

const technologyGroups = [
    {
        heading: "Application",
        body: "React, TypeScript, Vite, Tailwind CSS, and FastAPI",
    },
    {
        heading: "AI and data",
        body: "OpenAI, Chroma Cloud, Cohere, Supabase, and Google Cloud Storage",
    },
    {
        heading: "Infrastructure",
        body: "Vercel, Google Cloud Run, Cloud Load Balancing, Cloud Armor, and Sentry",
    },
]

export function InfoPage({ page }: InfoPageProps) {
    const content = pageContent[page]

    return (
        <main className="app-page max-w-5xl">
            <header className="mb-8">
                <p className="page-eyebrow">
                    {content.eyebrow}
                </p>
                <h1 className="page-title">
                    {content.title}
                </h1>
            </header>

            <div className="grid gap-4">
                {content.sections.map((section) => (
                    <section
                        key={section.heading}
                        className="panel p-5"
                    >
                        <h2 className="m-0 text-lg font-semibold text-[var(--text-h)]">{section.heading}</h2>
                        <p className="m-0 mt-3 leading-7">{section.body}</p>
                    </section>
                ))}
            </div>

            {page === "about" && (
                <>
                    <section className="mt-6">
                        <div className="mb-4 flex items-center gap-3 text-sm font-semibold uppercase text-[var(--text)]">
                            <span className="h-px flex-1 bg-[var(--border)]" />
                            <span>Team</span>
                            <span className="h-px flex-1 bg-[var(--border)]" />
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            {teamIntroductions.map((person) => (
                                <article
                                    key={person.name}
                                className="panel p-5"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <h2 className="m-0 text-lg font-semibold text-[var(--text-h)]">{person.name}</h2>
                                        <a
                                            href={person.linkedinUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            aria-label={`${person.name} on LinkedIn`}
                                            title={`${person.name} on LinkedIn`}
                                            className="group grid h-8 w-8 shrink-0 place-items-center rounded-sm no-underline focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--accent-bg)]"
                                        >
                                            <span className="block h-6 w-6 overflow-hidden rounded-[20%] transition group-hover:opacity-80">
                                                <img
                                                    src={linkedinLogo}
                                                    alt=""
                                                    className="h-[2.027rem] w-[1.875rem] max-w-none -translate-x-[0.1875rem] -translate-y-[0.324rem]"
                                                />
                                            </span>
                                        </a>
                                    </div>
                                    <p className="m-0 mt-3 leading-7">{person.body}</p>
                                </article>
                            ))}
                        </div>
                    </section>

                    <section className="mt-6" aria-labelledby="technology-heading">
                        <div className="mb-4 flex items-center gap-3 text-sm font-semibold uppercase text-[var(--text)]">
                            <span className="h-px flex-1 bg-[var(--border)]" />
                            <span>Technology</span>
                            <span className="h-px flex-1 bg-[var(--border)]" />
                        </div>

                        <div className="panel p-5 sm:p-6">
                            <div className="max-w-3xl">
                                <h2 id="technology-heading" className="m-0 text-xl font-semibold text-[var(--text-h)]">
                                    From question to evidence-backed answer
                                </h2>
                                <p className="m-0 mt-3 leading-7">
                                    Arcel uses a two-stage retrieval pipeline to find and rerank relevant research before generating a practical response.
                                </p>
                            </div>

                            <figure className="m-0 mt-6" aria-label="Arcel application architecture">
                                <div className="grid items-stretch gap-2 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr]">
                                    {architectureSteps.map((step, index) => (
                                        <div key={step.label} className="contents">
                                            <div className="flex min-h-24 flex-col justify-between border border-[var(--border)] bg-[var(--surface-muted)] p-4">
                                                <span className="text-xs font-semibold uppercase text-[var(--accent)]">
                                                    {step.label}
                                                </span>
                                                <span className="mt-3 text-sm font-semibold leading-5 text-[var(--text-h)]">
                                                    {step.detail}
                                                </span>
                                            </div>
                                            {index < architectureSteps.length - 1 && (
                                                <span className="grid min-h-7 place-items-center text-xl text-[var(--text)]" aria-hidden="true">
                                                    <ArrowDown className="lg:hidden" size={18} />
                                                    <ArrowRight className="hidden lg:block" size={18} />
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                <figcaption className="mt-4 border-l-2 border-[var(--accent)] pl-4 text-sm leading-6">
                                    Supabase provides authentication and application data, Google Cloud Storage supplies source documents for offline indexing, and Sentry monitors errors and performance.
                                </figcaption>
                            </figure>

                            <div className="mt-6 grid border-t border-[var(--border)] pt-5 sm:grid-cols-3">
                                {technologyGroups.map((group) => (
                                    <div
                                        key={group.heading}
                                        className="border-b border-[var(--border)] py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:px-5 sm:py-0 sm:first:pl-0 sm:last:border-r-0 sm:last:pr-0"
                                    >
                                        <h3 className="m-0 text-sm font-semibold text-[var(--text-h)]">{group.heading}</h3>
                                        <p className="m-0 mt-2 text-sm leading-6">{group.body}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                </>
            )}
        </main>
    )
}
