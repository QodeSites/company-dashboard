import { Configuration, LogLevel } from "@azure/msal-browser";

// MSAL configuration
export const msalConfig: Configuration = {
  auth: {
    // Azure AD Application (client) ID - provided by your teammate
    clientId: process.env.NEXT_PUBLIC_AZURE_CLIENT_ID || "",

    // Azure AD Authority URL - provided by your teammate
    // Format: https://login.microsoftonline.com/{tenant-id}
    authority: process.env.NEXT_PUBLIC_AZURE_AUTHORITY || "",

    // Redirect URI - uses current origin for flexibility
    redirectUri: typeof window !== "undefined" ? window.location.origin : "",
  },
  cache: {
    // Use localStorage for persistent sessions across tabs
    cacheLocation: "localStorage",
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return; // Don't log PII

        switch (level) {
          case LogLevel.Error:
            console.error("[MSAL]", message);
            break;
          case LogLevel.Warning:
            console.warn("[MSAL]", message);
            break;
          case LogLevel.Info:
            console.info("[MSAL]", message);
            break;
          case LogLevel.Verbose:
            console.debug("[MSAL]", message);
            break;
        }
      },
      logLevel: LogLevel.Warning,
    },
  },
};

// Login request configuration
export const loginRequest = {
  // Scopes to request - User.Read for basic profile info
  scopes: ["User.Read"],

  // Always show account picker (useful for multi-account users)
  prompt: "select_account" as const,
};

// Allowed email domain for authentication
export const ALLOWED_EMAIL_DOMAIN = "qodeinvest.com";
