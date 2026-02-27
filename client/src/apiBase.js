// client/src/apiBase.js
const envBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

const host = window.location.hostname;

const defaultProdApi =
  host === "big-dill-pickleball.com" ||
  host === "www.big-dill-pickleball.com" ||
  host.endsWith(".up.railway.app")
    ? "https://api.big-dill-pickleball.com"
    : "";

export const API_BASE = envBase || defaultProdApi || "";
