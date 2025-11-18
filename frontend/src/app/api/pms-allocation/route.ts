// GET /api/pms-allocation
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// Helper to add CORS headers
function addCorsHeaders(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", "*"); // Allows any origin
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return response;
}

export async function GET(req: NextRequest) {
  try {
    const rows = await prisma.allocation_table_pms.findMany({
      orderBy: { id: "asc" },
    });

    const response = NextResponse.json(rows);
    return addCorsHeaders(response);
  } catch (err) {
    console.error("❌ Error fetching PMS allocation:", err);
    const response = NextResponse.json(
      { message: "Server error" },
      { status: 500 }
    );
    return addCorsHeaders(response);
  }
}

// Handle preflight OPTIONS request (required for CORS)
export async function OPTIONS() {
  const response = new NextResponse(null, { status: 200 });
  return addCorsHeaders(response);
}