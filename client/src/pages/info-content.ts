import type { InfoPageName } from '../routing'
import { legalContent, type InfoContent } from './legal-content'

export const pageContent: Record<InfoPageName, InfoContent> = {
    about: {
        eyebrow: "Company",
        title: "About Arcel",
        sections: [
            {
                heading: "Research behind the recommendations",
                body: "We’re building Arcel for people who combine strength training with conditioning or another sport. Its planning tools shape workouts and set targets around your goals, experience, equipment, and sport commitments. Relevant research and web evidence inform the plan alongside the model’s general knowledge.",
            },
            {
                heading: "A program that carries forward",
                body: "Completing onboarding starts your first three-week plan. Weekly refreshes add the next week of training, while the Plans overview shows your coverage, weekly session counts, and next refresh. Generation runs in the background, so an accepted plan update can continue after you leave the app.",
            },
            {
                heading: "Room for the week to change",
                body: "Adding or removing a sports session prompts a review of upcoming workouts. Redoing onboarding applies your new preferences within the existing plan window. These adjustments keep the current horizon and refresh cadence in place. Handling missed workouts, recovery changes, and recorded performance is future work.",
            },
            {
                heading: "A clear record of plan changes",
                body: "The timeline records plan updates, their reasons, and their status. Open an entry to inspect the affected workouts before and after the change, including exercises and set targets. Your general chat stays separate: use Quick or Deep responses for training questions, review sources when evidence is used, and return to saved conversations.",
            },
        ],
    },
    ...legalContent,
}

export const teamIntroductions = [
    {
        name: "rick xu",
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

export const technologyGroups = [
    {
        heading: "Mobile experience",
        body: "Expo, React Native, TypeScript, and Expo Router. Rubik typography, native haptics, and Reanimated motion.",
    },
    {
        heading: "API and workflows",
        body: "Python and FastAPI, with LangGraph coordinating chat and workout planning. OpenAI models generate responses using retrieved evidence.",
    },
    {
        heading: "Research and retrieval",
        body: "Chroma Cloud indexes research, and Tavily supplies web search results. Source documents are stored in Google Cloud Storage.",
    },
    {
        heading: "Accounts and data",
        body: "Supabase Authentication and Postgres support accounts, profiles, onboarding, conversations, and training data.",
    },
    {
        heading: "Cloud and delivery",
        body: "Cloud Scheduler discovers due refreshes, Cloud Tasks delivers planning jobs, and private Cloud Run workers process them. Supabase keeps job status and published plans. GitHub Actions builds and deploys the services.",
    },
    {
        heading: "Web and observability",
        body: "React, TypeScript, and Vite power this public website. LangSmith traces AI workflows, while Sentry monitors backend errors and performance.",
    },
]
