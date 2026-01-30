"use client";

import { useAuth } from "@/context/AuthContext";
import { LoginButton } from "@/components/auth/LoginButton";
import { ALLOWED_EMAIL_DOMAIN } from "@/lib/msal/config";

export default function LoginPage() {
  const { error, isLoading } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="max-w-md w-full">
        {/* Login Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          {/* Logo/Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Qode Client Dashboard
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Sign in with your organization account
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Login Button */}
          <LoginButton className="w-full" />

          {/* Help text */}
          <p className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
            Only @{ALLOWED_EMAIL_DOMAIN} accounts are allowed
          </p>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
          Need help? Contact your administrator
        </p>
      </div>
    </div>
  );
}
