import { useState } from "react"
import "./App.css"
import { AppNav } from "./components/AppNav"
import { ChatPage } from "./pages/ChatPage"
import { HomePage } from "./pages/HomePage"
import { PlanPage } from "./pages/PlanPage"
import type { Page } from "./types"

function App() {
    const [currentPage, setCurrentPage] = useState<Page>("home")

    return (
        <div className="min-h-screen bg-[var(--bg)]">
            <AppNav currentPage={currentPage} onNavigate={setCurrentPage} />
            {currentPage === "home" && <HomePage onNavigate={setCurrentPage} />}
            {currentPage === "chat" && <ChatPage />}
            {currentPage === "plan" && <PlanPage />}
        </div>
    )
}

export default App
