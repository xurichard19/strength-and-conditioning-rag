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
                shingo
            </h1>
            <form onSubmit={handleSubmit} className='flex flex-col gap-2'>
                <input 
                    value={question} 
                    onChange={(e) => setQuestion(e.target.value)} 
                    placeholder='ask a question'
                    className='border p-2'
                />
                <button type='submit' className='bg-blue-500 text-white p-2 rounded hover:bg-blue-600 transition'>submit</button>
            </form>
            <p>{response}</p>
            {/*<div className='grid grid-cols-3 gap-4'>
                {
                    response.map((item, idx) => (
                        <div key={idx} className='p-4 break-words'>
                            {item}
                        </div>
                    ))
                }
            </div>*/}
        </div>
    )
}

export default App