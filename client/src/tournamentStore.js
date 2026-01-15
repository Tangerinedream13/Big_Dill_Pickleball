const KEY = "currentTournamentId";

export function getCurrentTournamentId() {
  return localStorage.getItem(KEY) || "";
}

export function setCurrentTournamentId(id) {
  const normalized = String(id ?? "").trim();
  if (!normalized) {
    localStorage.removeItem(KEY);
    return;
  }
  localStorage.setItem(KEY, normalized);
}

export function clearCurrentTournamentId() {
  localStorage.removeItem(KEY);
}

// optional convenience (if you need numeric)
export function getCurrentTournamentIdNumber() {
  const v = getCurrentTournamentId();
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
