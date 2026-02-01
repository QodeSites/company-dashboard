"use client";

import { useAuth } from "@/context/AuthContext";

interface LogoutButtonProps {
  className?: string;
  variant?: "button" | "link";
}

export function LogoutButton({
  className = "",
  variant = "button",
}: LogoutButtonProps) {
  const { logout } = useAuth();

  if (variant === "link") {
    return (
      <button
        onClick={logout}
        className={`
          text-gray-600 dark:text-gray-400
          hover:text-gray-900 dark:hover:text-gray-200
          underline-offset-2 hover:underline
          transition-colors duration-200
          ${className}
        `}
      >
        Sign out
      </button>
    );
  }

  return (
    <button
      onClick={logout}
      className={`
        px-4 py-2
        bg-gray-100 dark:bg-gray-700
        text-gray-700 dark:text-gray-200
        rounded-lg
        hover:bg-gray-200 dark:hover:bg-gray-600
        focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2
        transition-colors duration-200
        ${className}
      `}
    >
      Sign out
    </button>
  );
}
