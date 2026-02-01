import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";

/**
 * GET /api/auth/me
 *
 * Get current authenticated user's information.
 * Requires valid JWT token.
 */
export async function GET(request: NextRequest) {
  try {
    // Get token from Authorization header or cookie
    let token: string | null = null;

    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }

    // Fallback to cookie
    if (!token) {
      token = request.cookies.get("auth_token")?.value || null;
    }

    if (!token) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Verify the token
    const payload = verifyToken(token);

    if (!payload) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    // Return full user info
    return NextResponse.json({
      email: payload.email,
      name: payload.name,
      microsoft_id: payload.microsoft_id,
      token_expires_at: new Date(payload.exp * 1000).toISOString(),
    });
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json(
      { error: "Failed to get user info" },
      { status: 500 }
    );
  }
}
