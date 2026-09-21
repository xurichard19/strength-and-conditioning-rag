import type { InfoPageName } from '../routing'
import { legalContent, type InfoContent } from './legal-content'

export const pageContent: Record<InfoPageName, InfoContent> = {
    about: {
        eyebrow: "Company",
        title: "About Arcel",
        sections: [
            {
                heading: "Research behind the recommendations",
                body: "We’re building Arcel for people who combine strength training with conditioning or another sport. Its planning tools shape workouts and set targets around your goals, experience, and other commitments. The AI draws on more than 300 openly licensed papers and live web search alongside its general knowledge.",
            },
            {
                heading: "A program that carries forward",
                body: "Each session should have a place in the weeks ahead. We’re designing the calendar to add upcoming workouts regularly, with exercises and targets you can follow and record. You’ll be able to continue toward your goal as the plan develops, without rebuilding your program from scratch.",
            },
            {
                heading: "Room for the week to change",
                body: "When you miss a session or sleep poorly, the next workout may need to change. We’re developing adjustments that consider those changes alongside your performance and sport schedule, while keeping the longer plan in view. In chat, you’ll be able to explain what’s changed and ask about the recommendations.",
            },
            {
                heading: "A clear record of your training",
                body: "Completed workouts are part of your training history. The plan is designed to preserve their original targets and the results you recorded, even as future sessions change. You should also be able to see which upcoming workouts were adjusted and why.",
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
        body: "Docker on Google Cloud Run, behind Cloud Load Balancing and Cloud Armor. GitHub Actions builds images in Artifact Registry and deploys the backend.",
    },
    {
        heading: "Web and observability",
        body: "React, TypeScript, and Vite power this public website. LangSmith traces AI workflows, while Sentry monitors backend errors and performance.",
    },
]
