import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [message, setMessage] = useState('Loading...')

  useEffect(() => {
    fetch('/api/message')
      .then(res => res.json())
      .then(data => setMessage(data.text))
      .catch(() => setMessage('Error connecting to backend'))
  }, [])

  return (
    <div className="app-container">
      <h1> Big Dill Pickleball</h1>
      <p>{message}</p>

      <div className="button-row">
        <button>Add Tournament</button>
        <button>View Players</button>
        <button>Match Schedule</button>
      </div>
    </div>
  )
}

export default App