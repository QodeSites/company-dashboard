import { NextRequest, NextResponse } from "next/server";
import { generateToken } from "@/lib/auth/jwt";
import { ALLOWED_EMAIL_DOMAIN } from "@/lib/msal/config";

interface MicrosoftUserInfo {
  id: string;
  displayName: string;
  mail: string | null;
  userPrincipalName: string;
}

/**
 * POST /api/auth/microsoft-login
 *
 * Exchange a Microsoft access token for an app JWT.
 * Only allows users with @qodeinvest.com email domain.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { microsoft_token } = body;

    if (!microsoft_token) {
      return NextResponse.json(
        { success: false, detail: "Microsoft token is required" },
        { status: 400 }
      );
    }

    // Call Microsoft Graph API to verify token and get user info
    const graphResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${microsoft_token}`,
      },
    });

    if (!graphResponse.ok) {
      const errorText = await graphResponse.text();
      console.error("Microsoft Graph API error:", errorText);
      return NextResponse.json(
        { success: false, detail: "Invalid Microsoft token" },
        { status: 401 }
      );
    }

    const userInfo: MicrosoftUserInfo = await graphResponse.json();

    // Get email - prefer mail, fallback to userPrincipalName
    const email = (userInfo.mail || userInfo.userPrincipalName || "").toLowerCase();

    if (!email) {
      return NextResponse.json(
        { success: false, detail: "Could not retrieve email from Microsoft account" },
        { status: 400 }
      );
    }

    // Check if email domain is allowed
    const emailDomain = email.split("@")[1];
    if (emailDomain !== ALLOWED_EMAIL_DOMAIN) {
      console.warn(`Access denied for email domain: ${emailDomain}`);
      return NextResponse.json(
        {
          success: false,
          detail: `Access denied. Only @${ALLOWED_EMAIL_DOMAIN} accounts are allowed.`,
        },
        { status: 403 }
      );
    }

    // Generate app JWT token
    const accessToken = generateToken({
      email: email,
      name: userInfo.displayName,
      microsoft_id: userInfo.id,
    });

    // Return success response
    return NextResponse.json({
      success: true,
      access_token: accessToken,
      user: {
        email: email,
        name: userInfo.displayName,
        microsoft_id: userInfo.id,
      },
    });
  } catch (error) {
    console.error("Microsoft login error:", error);
    return NextResponse.json(
      {
        success: false,
        detail: error instanceof Error ? error.message : "Authentication failed",
      },
      { status: 500 }
    );
  }
}
