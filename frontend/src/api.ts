// Backend base URL — set VITE_API_BASE in Vercel env vars to your Railway URL
// e.g. https://ringside-backend.up.railway.app
// Falls back to '' (same origin) for local dev
declare const __API_BASE__: string;
export const API_BASE: string =
  typeof __API_BASE__ !== 'undefined' ? __API_BASE__ : '';
