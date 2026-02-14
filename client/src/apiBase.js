// client/src/apiBase.js
const envBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");

const host = window.location.hostname;

// When you're on your public site, default API to the api subdomain
const defaultProdApi =
  host === "big-dill-pickleball.com" ||
  host === "www.big-dill-pickleball.com" ||
  host.endsWith(".up.railway.app")
    ? "https://api.big-dill-pickleball.com"
    : "";
export const API_BASE = envBase || defaultProdApi || "";
 