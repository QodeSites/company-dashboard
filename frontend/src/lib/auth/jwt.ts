import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "";

export interface JWTPayload {
  email: string;
  name: string;
  microsoft_id: string;
  exp: number;
  iat: number;
}

/**
 * Generate a JWT token for an authenticated user
 */
export function generateToken(user: {
  email: string;
  name: string;
  microsoft_id: string;
}): string {
  const now = Math.floor(Date.now() / 1000);

  const payload: JWTPayload = {
    email: user.email,
    name: user.name,
    microsoft_id: user.microsoft_id,
    iat: now,
    exp: now + 2 * 60 * 60, // 2 hours
  };

  return jwt.sign(payload, JWT_SECRET);
}

/**
 * Verify and decode a JWT token
 * Returns null if invalid or expired
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    console.error("JWT verification failed:", error);
    return null;
  }
}

/**
 * Decode a JWT token without verification (for debugging)
 */
export function decodeToken(token: string): JWTPayload | null {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch {
    return null;
  }
}
