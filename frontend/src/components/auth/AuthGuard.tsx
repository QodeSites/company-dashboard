"use client";

import { useEffect, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

interface AuthGuardProps {
  children: ReactNode;
}

// Routes that don't require authentication
const PUBLIC_ROUTES = ["/login"];

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated && !isPublicRoute) {
      // Not authenticated and trying to access protected route
      router.push("/login");
    } else if (isAuthenticated && isPublicRoute) {
      // Authenticated but on login page, redirect to dashboard
      router.push("/");
    }
  }, [isAuthenticated, isLoading, isPublicRoute, router]);

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">
            Checking authentication...
          </p>
        </div>
      </div>
    );
  }

  // On protected routes, don't render until authenticated
  if (!isAuthenticated && !isPublicRoute) {
    return null;
  }

  // On public routes, don't render if authenticated (will redirect)
  if (isAuthenticated && isPublicRoute) {
    return null;
  }

  return <>{children}</>;
}
