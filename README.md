# Big Dill Pickleball 🥒🏓  
Tournament Management Software

Big Dill is a full-stack web application designed to run pickleball tournaments from registration through playoffs — all in one streamlined platform.

🌐 Live App: https://big-dill-pickleball.com/

---

## Overview

Big Dill helps organizers:

- Create tournaments
- Register players and teams
- Generate round robin schedules
- Automatically calculate standings
- Advance teams to playoffs
- Enter and validate scores
- View final placements

The goal is to make tournament management simple, structured, and stress-free.

---

## Why Big Dill?

Pickleball tournaments are often managed with:
- Spreadsheets
- Whiteboards
- Manual bracket templates
- Pen and paper

Big Dill centralizes the entire workflow into one web-based system.

---

## Tech Stack

**Frontend**
- React (Vite)
- Chakra UI
- React Router

**Backend**
- Node.js
- Express
- PostgreSQL

**Deployment**
- Railway (backend)
- Cloudflare (DNS)
- Dockerized Postgres (local development)

---

## Key Features

### Tournament Management
- Create and manage multiple tournaments
- Persistent database-backed state
- Reset and regenerate tournament phases

### Round Robin Engine
- Custom games per team
- Win-by-2 enforcement
- Score validation

### Playoffs
- Automatic semi-final generation
- Finals and third-place matches
- Placement tracking
- Edit protection once finals are confirmed

### Player & Team Management
- Add/edit/delete players
- Assign teams
- DUPR tier grouping
- Responsive UI for desktop

---

## Architecture Notes

- Tournament state is database-driven (Postgres)
- RESTful API endpoints for tournament lifecycle
- Separation of concerns between client and server
- Production build pipeline via Vite

---

##  Current Status

Active development.  

---

## Testing

Planned real-world tournament testing

---

## 📄 License

© 2026 Maria Haddon. All rights reserved.

This software and its source code may not be copied, modified, distributed, or used for commercial purposes without explicit permission.
