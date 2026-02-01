"use client";

import { ReactNode, useEffect, useState } from "react";
import {
  MsalProvider as MsalReactProvider,
  MsalAuthenticationTemplate,
} from "@azure/msal-react";
import {
  PublicClientApplication,
  EventType,
  AuthenticationResult,
  InteractionStatus,
} from "@azure/msal-browser";
import { msalConfig } from "./config";

// Create MSAL instance
let msalInstance: PublicClientApplication | null = null;

const getMsalInstance = () => {
  if (!msalInstance && typeof window !== "undefined") {
    msalInstance = new PublicClientApplication(msalConfig);
  }
  return msalInstance;
};

interface MsalProviderProps {
  children: ReactNode;
}

export function MsalProvider({ children }: MsalProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [instance, setInstance] = useState<PublicClientApplication | null>(
    null
  );

  useEffect(() => {
    const initializeMsal = async () => {
      const msalInstance = getMsalInstance();
      if (!msalInstance) return;

      try {
        await msalInstance.initialize();

        // Handle redirect promise (if returning from Microsoft login)
        const response = await msalInstance.handleRedirectPromise();
        if (response) {
          console.log("Login redirect handled successfully");
        }

        // Set active account if one exists
        const accounts = msalInstance.getAllAccounts();
        if (accounts.length > 0) {
          msalInstance.setActiveAccount(accounts[0]);
        }

        // Listen for login events
        msalInstance.addEventCallback((event) => {
          if (
            event.eventType === EventType.LOGIN_SUCCESS &&
            event.payload
          ) {
            const payload = event.payload as AuthenticationResult;
            msalInstance.setActiveAccount(payload.account);
          }
        });

        setInstance(msalInstance);
        setIsInitialized(true);
      } catch (error) {
        console.error("MSAL initialization failed:", error);
        setIsInitialized(true); // Still set to true to show error state
      }
    };

    initializeMsal();
  }, []);

  // Show loading while MSAL initializes
  if (!isInitialized || !instance) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return <MsalReactProvider instance={instance}>{children}</MsalReactProvider>;
}

export { getMsalInstance };
