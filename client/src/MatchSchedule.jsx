import { useEffect, useState } from "react";

export default function MatchSchedule() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock API call for now
    fetch("/api/matches")
      .then((res) => res.json())
      .then((data) => {
        setMatches(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching matches:", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <p>Loading match schedule...</p>;
  }

  return (
    <div className="container">
      <h2>Match Schedule</h2>
      {matches.length === 0 ? (
        <p>No matches scheduled yet.</p>
      ) : (
        <table className="schedule-table">
          <thead>
            <tr>
              <th>Match</th>
              <th>Teams</th>
              <th>Date</th>
              <th>Time</th>
              <th>Court</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((match, idx) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td>
                  {match.teamA} vs {match.teamB}
                </td>
                <td>{match.date}</td>
                <td>{match.time}</td>
                <td>{match.court}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}