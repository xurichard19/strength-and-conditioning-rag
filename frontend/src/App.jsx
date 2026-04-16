import { useState } from 'react'
import './App.css'

function App() {
    const [question, setQuestion] = useState("")
    const [response, setResponse] = useState([])

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
            <h1 className="text-3xl font-bold underline">
                query
            </h1>
            <form onSubmit={handleSubmit}>
                <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder='ask a question'/>
                <button type='submit'>submit</button>
            </form>

            <div className='grid grid-cols-3 gap-4'>
                {
                    response.map(item => (
                        <div key={item} className='p-4'>
                            {item}
                        </div>
                    ))
                }
            </div>
        </div>
    )
}

export default App