import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";

/**
 * GET /api/auth/validate-token
 *
 * Validate the JWT token from Authorization header or cookie.
 * Returns user info if valid, 401 if invalid.
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
        { valid: false, error: "No token provided" },
        { status: 401 }
      );
    }

    // Verify the token
    const payload = verifyToken(token);

    if (!payload) {
      return NextResponse.json(
        { valid: false, error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    // Return user info
    return NextResponse.json({
      valid: true,
      user: {
        email: payload.email,
        name: payload.name,
        microsoft_id: payload.microsoft_id,
      },
    });
  } catch (error) {
    console.error("Token validation error:", error);
    return NextResponse.json(
      { valid: false, error: "Token validation failed" },
      { status: 500 }
    );
  }
}
