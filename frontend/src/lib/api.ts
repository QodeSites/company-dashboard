// src/lib/api.ts
export const API_BASE =
  process.env.NODE_ENV === "production"
    ? "http://139.5.190.184:8010"
    : "http://127.0.0.1:8080";
