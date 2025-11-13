import { useState } from "react";

function CreateTournament() {
  const [formData, setFormData] = useState({
    name: "",
    date: "",
    location: "",
    format: "round robin",
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        alert("Tournament created!");
        setFormData({
          name: "",
          date: "",
          location: "",
          format: "round robin",
        });
      } else {
        alert("Error creating tournament");
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="container">
      <h2>Create Tournament</h2>
      <form onSubmit={handleSubmit}>
        <label>
          Name:
          <input
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
          />
        </label>
        <label>
          Date:
          <input
            type="date"
            name="date"
            value={formData.date}
            onChange={handleChange}
            required
          />
        </label>
        <label>
          Location:
          <input
            name="location"
            value={formData.location}
            onChange={handleChange}
            required
          />
        </label>
        <label>
          Format:
          <select name="format" value={formData.format} onChange={handleChange}>
            <option value="round robin">Round Robin</option>
            <option value="single elimination">Single Elimination</option>
          </select>
        </label>
        <button type="submit" className="form-submit">
          Create
        </button>
      </form>
    </div>
  );
}

export default CreateTournament;
