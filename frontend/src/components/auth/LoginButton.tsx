"use client";

import { useAuth } from "@/context/AuthContext";

interface LoginButtonProps {
  className?: string;
}

export function LoginButton({ className = "" }: LoginButtonProps) {
  const { login, isLoading } = useAuth();

  return (
    <button
      onClick={login}
      disabled={isLoading}
      className={`
        flex items-center justify-center gap-3
        px-6 py-3
        bg-white dark:bg-gray-800
        border border-gray-300 dark:border-gray-600
        rounded-lg
        font-medium text-gray-700 dark:text-gray-200
        hover:bg-gray-50 dark:hover:bg-gray-700
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-colors duration-200
        ${className}
      `}
    >
      {/* Microsoft Logo */}
      <svg
        width="21"
        height="21"
        viewBox="0 0 21 21"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="1" y="1" width="9" height="9" fill="#F25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
        <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
        <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
      </svg>

      <span>{isLoading ? "Signing in..." : "Sign in with Microsoft"}</span>
    </button>
  );
}
