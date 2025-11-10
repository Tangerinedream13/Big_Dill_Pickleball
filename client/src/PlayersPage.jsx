import { useState, useEffect } from "react";

function PlayersPage() {
  const [players, setPlayers] = useState([]);
  const [name, setName] = useState("");
  const [skill, setSkill] = useState("");
  const [error, setError] = useState("");

  // Fetch all players on first render
  useEffect(() => {
    fetch("/api/players")
      .then((res) => res.json())
      .then(setPlayers)
      .catch(() => setError("Error fetching players"));
  }, []);

  // Add a new player
  const handleAddPlayer = (e) => {
    e.preventDefault();
    if (!name.trim() || !skill.trim()) return;

    fetch("/api/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, skill }),
    })
      .then((res) => res.json())
      .then((newPlayer) => {
        setPlayers([...players, newPlayer]);
        setName("");
        setSkill("");
      })
      .catch(() => setError("Error adding player"));
  };

  return (
    <div className="players-page">
      <h2>Players</h2>

      <form onSubmit={handleAddPlayer} className="player-form">
        <input
          type="text"
          placeholder="Player name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="text"
          placeholder="Skill level (e.g. 3.5)"
          value={skill}
          onChange={(e) => setSkill(e.target.value)}
        />
        <button type="submit">Add Player</button>
      </form>

      {error && <p className="error">{error}</p>}

      <ul className="player-list">
        {players.map((p) => (
          <li key={p.id}>
            {p.name} — Skill Level {p.skill}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default PlayersPage;