type SettingsPageProps = {
    userEmail?: string | null
}

export function SettingsPage({ userEmail }: SettingsPageProps) {
    return (
        <main className="mx-auto min-h-[calc(100vh-4.25rem)] max-w-5xl px-4 py-8 text-left text-[var(--text)] sm:px-6 lg:px-8">
            <header className="mb-8">
                <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-h)]">
                    Account
                </p>
                <h1 className="m-0 text-4xl font-semibold tracking-normal text-[var(--text-h)] sm:text-5xl">
                    Settings
                </h1>
            </header>

            <section className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-5 shadow-[var(--shadow)]">
                <h2 className="m-0 text-lg font-semibold text-[var(--text-h)]">Profile</h2>
                <dl className="mt-4 grid gap-3 text-sm">
                    <div>
                        <dt className="font-semibold text-[var(--text-h)]">Email</dt>
                        <dd className="m-0 mt-1 text-[var(--text)]">{userEmail ?? "No email available"}</dd>
                    </div>
                </dl>
            </section>
        </main>
    )
}
