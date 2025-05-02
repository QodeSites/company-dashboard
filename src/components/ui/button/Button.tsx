import React, { ReactNode } from "react";

interface ButtonProps {
  children: ReactNode; // Button text or content
  size?: "xs" | "sm" | "md" | "lg" | "xl"; // Button size
  variant?: "primary" | "secondary" | "tertiary" | "outline" | "ghost" | "link" | "danger" | "success" | "warning"; // Button variant
  startIcon?: ReactNode; // Icon before the text
  endIcon?: ReactNode; // Icon after the text
  onClick?: () => void; // Click handler
  disabled?: boolean; // Disabled state
  className?: string; // Additional classes
  fullWidth?: boolean; // Full width button
  rounded?: "none" | "sm" | "md" | "lg" | "full"; // Border radius options
  isLoading?: boolean; // Loading state
  loadingText?: string; // Text to show when loading
  type?: "button" | "submit" | "reset"; // Button type
}

const Button: React.FC<ButtonProps> = ({
  children,
  size = "md",
  variant = "primary",
  startIcon,
  endIcon,
  onClick,
  className = "",
  disabled = false,
  fullWidth = false,
  rounded = "lg",
  isLoading = false,
  loadingText,
  type = "button",
}) => {
  // Size Classes
  const sizeClasses = {
    xs: "px-2.5 py-1.5 text-xs",
    sm: "px-4 py-2 text-sm",
    md: "px-5 py-3 text-sm",
    lg: "px-6 py-3.5 text-base",
    xl: "px-7 py-4 text-lg",
  };

  // Rounded Classes
  const roundedClasses = {
    none: "rounded-none",
    sm: "rounded",
    md: "rounded-md",
    lg: "rounded-lg",
    full: "rounded-full",
  };

  // Variant Classes
  const variantClasses = {
    primary:
      "bg-brand-500 text-white shadow-theme-xs hover:bg-brand-600 disabled:bg-brand-300 focus:ring-4 focus:ring-brand-100 dark:focus:ring-brand-800",
    secondary:
      "bg-gray-600 text-white shadow-theme-xs hover:bg-gray-700 disabled:bg-gray-400 focus:ring-4 focus:ring-gray-100 dark:focus:ring-gray-800",
    tertiary:
      "bg-gray-100 text-gray-900 hover:bg-gray-200 disabled:bg-gray-50 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 dark:disabled:bg-gray-800",
    outline:
      "bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.03] dark:hover:text-gray-300",
    ghost:
      "bg-transparent text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800",
    link:
      "bg-transparent text-brand-500 hover:underline p-0 hover:bg-transparent shadow-none dark:text-brand-400",
    danger:
      "bg-red-500 text-white shadow-theme-xs hover:bg-red-600 disabled:bg-red-300 focus:ring-4 focus:ring-red-100 dark:focus:ring-red-800",
    success:
      "bg-green-500 text-white shadow-theme-xs hover:bg-green-600 disabled:bg-green-300 focus:ring-4 focus:ring-green-100 dark:focus:ring-green-800",
    warning:
      "bg-yellow-500 text-white shadow-theme-xs hover:bg-yellow-600 disabled:bg-yellow-300 focus:ring-4 focus:ring-yellow-100 dark:focus:ring-yellow-800",
  };

  // Loading spinner component
  const LoadingSpinner = () => (
    <svg 
      className="animate-spin h-4 w-4 text-current" 
      xmlns="http://www.w3.org/2000/svg" 
      fill="none" 
      viewBox="0 0 24 24"
    >
      <circle 
        className="opacity-25" 
        cx="12" 
        cy="12" 
        r="10" 
        stroke="currentColor" 
        strokeWidth="4"
      ></circle>
      <path 
        className="opacity-75" 
        fill="currentColor" 
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  );

  // Determine content based on loading state
  const buttonContent = isLoading ? (
    <>
      <LoadingSpinner />
      <span>{loadingText || children}</span>
    </>
  ) : (
    <>
      {startIcon && <span className="flex items-center">{startIcon}</span>}
      {children}
      {endIcon && <span className="flex items-center">{endIcon}</span>}
    </>
  );

  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center font-medium gap-2 transition ${className} ${
        sizeClasses[size]
      } ${variantClasses[variant]} ${roundedClasses[rounded]} ${
        disabled || isLoading ? "cursor-not-allowed opacity-50" : ""
      } ${fullWidth ? "w-full" : ""}`}
      onClick={onClick}
      disabled={disabled || isLoading}
    >
      {buttonContent}
    </button>
  );
};

export default Button;