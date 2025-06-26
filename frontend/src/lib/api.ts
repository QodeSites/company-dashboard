// src/lib/api.ts
export const API_BASE =
  process.env.NODE_ENV === "production"
    ? "https://reporting-backend.qodeinvest.com"
    : "http://127.0.0.1:8080";
