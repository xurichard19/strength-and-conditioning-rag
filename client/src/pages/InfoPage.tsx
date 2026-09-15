import type { Page } from "../routing"
import { architectureSteps, pageContent, teamIntroductions, technologyGroups } from "./info-content"
import linkedinLogo from "../assets/linkedinlogo.png"
import { ArrowDown, ArrowRight } from "lucide-react"

type InfoPageProps = {
    page: Extract<Page, "about" | "terms" | "privacy" | "disclaimer" | "accessibility">
}

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
                                    Arcel uses LangGraph to coordinate evidence gathering and response generation while keeping each step observable and independently maintainable.
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
                                    The search agent combines research from Chroma Cloud with current web results from Tavily and can use Cohere to rerank research when helpful. LangSmith traces workflow, model, and tool activity, while Sentry monitors application errors and API performance.
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
