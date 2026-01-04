// src/lib/api.ts
export const API_BASE =
  process.env.NODE_ENV === "production"
    ? "https://reporting-backend.qodeinvest.com"
    : "https://f2lxldmp-8031.inc1.devtunnels.ms";
  console.log("API_BASE:", API_BASE, "NODE_ENV:", process.env.NODE_ENV);