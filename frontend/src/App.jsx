import { useState } from 'react'
import './App.css'

function App() {
    const [question, setQuestion] = useState("")
    const [response, setResponse] = useState("")

    const handleSubmit = async (e) => {
        e.preventDefault(); /* stop reload */

        const res = await fetch("http://localhost:8000/query/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ question }),
        });

        const data = await res.json();
        setResponse(data.response);
    }

    return (
        <div>
            <form onSubmit={handleSubmit}>
                <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder='ask a question'/>
                <button type='submit'>submit</button>
            </form>

            <p>{response}</p>
        </div>
    )
}

export default App