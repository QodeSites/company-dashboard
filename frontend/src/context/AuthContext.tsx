"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { loginRequest } from "@/lib/msal/config";

interface User {
  email: string;
  name: string;
  microsoft_id: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => void;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Cookie utilities
const setAuthCookie = (token: string) => {
  // Set cookie with 2 hour expiry (matches JWT expiry)
  const expires = new Date(Date.now() + 2 * 60 * 60 * 1000).toUTCString();
  document.cookie = `auth_token=${token}; path=/; expires=${expires}; SameSite=Lax`;
};

const removeAuthCookie = () => {
  document.cookie = "auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
};

const getAuthCookie = (): string | null => {
  const match = document.cookie.match(/(?:^|; )auth_token=([^;]*)/);
  return match ? match[1] : null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const { instance, inProgress } = useMsal();
  const isMsalAuthenticated = useIsAuthenticated();

  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if we have a valid app token
  const validateAndSetUser = useCallback(async () => {
    const token = getAuthCookie();
    if (!token) {
      setUser(null);
      return false;
    }

    try {
      const response = await fetch("/api/auth/validate-token", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        return true;
      } else {
        // Token is invalid, clear it
        removeAuthCookie();
        setUser(null);
        return false;
      }
    } catch (err) {
      console.error("Token validation error:", err);
      removeAuthCookie();
      setUser(null);
      return false;
    }
  }, []);

  // Exchange Microsoft token for app token
  const exchangeMicrosoftToken = useCallback(async () => {
    try {
      const accounts = instance.getAllAccounts();
      if (accounts.length === 0) {
        return false;
      }

      // Get Microsoft access token silently
      const tokenResponse = await instance.acquireTokenSilent({
        account: accounts[0],
        scopes: loginRequest.scopes,
      });

      // Exchange for app token
      const response = await fetch("/api/auth/microsoft-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          microsoft_token: tokenResponse.accessToken,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setAuthCookie(data.access_token);
        setUser(data.user);
        setError(null);
        return true;
      } else {
        setError(data.detail || "Authentication failed");
        // Sign out from MSAL if not allowed
        await instance.logoutPopup({ account: accounts[0] });
        return false;
      }
    } catch (err) {
      console.error("Token exchange error:", err);
      setError(err instanceof Error ? err.message : "Authentication failed");
      return false;
    }
  }, [instance]);

  // Initialize auth state
  useEffect(() => {
    const initAuth = async () => {
      if (inProgress !== InteractionStatus.None) {
        return; // Wait for MSAL to finish
      }

      setIsLoading(true);

      // First, check if we have a valid app token
      const hasValidToken = await validateAndSetUser();

      if (!hasValidToken && isMsalAuthenticated) {
        // We're signed in with Microsoft but don't have an app token
        // Exchange the Microsoft token for an app token
        await exchangeMicrosoftToken();
      }

      setIsLoading(false);
    };

    initAuth();
  }, [
    inProgress,
    isMsalAuthenticated,
    validateAndSetUser,
    exchangeMicrosoftToken,
  ]);

  // Login with Microsoft
  const login = useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      // Trigger redirect to Microsoft login
      await instance.loginRedirect(loginRequest);
    } catch (err) {
      console.error("Login error:", err);
      setError(err instanceof Error ? err.message : "Login failed");
      setIsLoading(false);
    }
  }, [instance]);

  // Logout
  const logout = useCallback(() => {
    // Clear app token
    removeAuthCookie();
    setUser(null);

    // Sign out from Microsoft
    const accounts = instance.getAllAccounts();
    if (accounts.length > 0) {
      instance.logoutRedirect({
        account: accounts[0],
        postLogoutRedirectUri: window.location.origin + "/login",
      });
    } else {
      // Just redirect to login if no Microsoft account
      window.location.href = "/login";
    }
  }, [instance]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        error,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
