"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}

interface ToastProps {
  toasts: Toast[];
  removeToast: (id: string) => void;
}

export function Toast({ toasts, removeToast }: ToastProps) {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "flex flex-col p-4 rounded-md shadow-lg max-w-xs animate-slide-in-right",
            toast.variant === "destructive"
              ? "bg-red-600 text-white"
              : "bg-green-600 text-white",
            "transition-all duration-300"
          )}
        >
          <div className="font-semibold">{toast.title}</div>
          {toast.description && (
            <div className="text-sm">{toast.description}</div>
          )}
          <button
            className="ml-auto text-xs opacity-75 hover:opacity-100"
            onClick={() => removeToast(toast.id)}
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (toast: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { ...toast, id }]);

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return { toast: addToast, toasts, removeToast };
}