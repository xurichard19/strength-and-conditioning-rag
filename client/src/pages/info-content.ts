import type { InfoPageName } from '../routing'

export const pageContent: Record<InfoPageName, {
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
                heading: "Research-backed programming",
                body: "Arcel is being built to turn relevant research into structured strength and conditioning for hybrid athletes: scheduled workouts, exercises, and set targets shaped around your profile, goals, and sport commitments. Our AI draws on more than 300 openly licensed papers and live web search—not just its general knowledge.",
            },
            {
                heading: "A rolling plan, not a static template",
                body: "Your calendar should keep moving forward without restarting your program from scratch. Rolling programming is designed to regularly extend your upcoming training, with concrete sessions to follow and targets to record. The aim is continuity toward your goal, with room for the plan to evolve.",
            },
            {
                heading: "Adapt what’s ahead",
                body: "Poor sleep, a missed workout, changing performance, or an added sport session can change what training makes sense next. Arcel is being designed to use those signals to adjust affected upcoming workouts without resetting the regular planning rhythm. Chat will help you understand recommendations and communicate changes.",
            },
            {
                heading: "Keep the work you’ve done",
                body: "What you were prescribed and what you actually did both matter. The rolling design keeps completed workouts and recorded results intact as future sessions change. Planning history is intended to show what changed and why, so an evolving program doesn’t mean losing your training record.",
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

export const teamIntroductions = [
    {
        name: "richard xu",
        body: "AI/Cloud/Backend/DevOps",
        linkedinUrl: "https://www.linkedin.com/in/richardrxu/",
    },
    {
        name: "dimitrios mahairas",
        body: "Cloud/DevOps/FullStack",
        linkedinUrl: "https://www.linkedin.com/in/dimitrios-mahairas/",
    },
    {
        name: "aaron jiang",
        body: "PM/UI/UX",
        linkedinUrl: "https://www.linkedin.com/in/aaron-jiang-7a10242a2/",
    }
]

export const architectureSteps = [
    { label: "Mobile", detail: "Expo + React Native" },
    { label: "Edge", detail: "Cloud Load Balancing + Cloud Armor" },
    { label: "API", detail: "FastAPI on Cloud Run" },
    { label: "Workflow", detail: "LangGraph orchestration" },
    { label: "Search", detail: "LangChain + source tools (Chroma/Tavily/Cohere)" },
]

export const technologyGroups = [
    {
        heading: "Mobile experience",
        body: "Expo, React Native, TypeScript, and Expo Router. Rubik typography, native haptics, and Reanimated motion.",
    },
    {
        heading: "API and workflows",
        body: "Python and FastAPI, with LangGraph coordinating chat and workout planning. LangChain agents gather evidence; OpenAI models generate responses.",
    },
    {
        heading: "Research and retrieval",
        body: "Chroma Cloud indexes research, Tavily searches the web, and Cohere reranks research results. Source documents are stored in Google Cloud Storage.",
    },
    {
        heading: "Accounts and data",
        body: "Supabase Authentication and Postgres support accounts, profiles, onboarding, conversations, and training data.",
    },
    {
        heading: "Cloud and delivery",
        body: "Docker on Google Cloud Run, behind Cloud Load Balancing and Cloud Armor. GitHub Actions builds images in Artifact Registry and deploys the backend.",
    },
    {
        heading: "Web and observability",
        body: "React, TypeScript, and Vite power this public website. LangSmith traces AI workflows, while Sentry monitors backend errors and performance.",
    },
]
