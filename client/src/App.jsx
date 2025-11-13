import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./App.css";

function App() {
  const [message, setMessage] = useState("Loading...");
  const navigate = useNavigate();

  useEffect(() => {
    fetch("/api/message")
      .then((res) => res.json())
      .then((data) => setMessage(data.text))
      .catch(() => setMessage("Error connecting to backend"));
  }, []);

  return (
    <div className="app-container">
      <h1>Big Dill Pickleball</h1>

      <div className="button-row">
        <button onClick={() => navigate("/tournaments/new")}>
          Add Tournament
        </button>
        <button onClick={() => navigate("/players")}>View Players</button>
        <button onClick={() => navigate("/matches")}>Match Schedule</button>
      </div>
    </div>
  );
}

export default App;
