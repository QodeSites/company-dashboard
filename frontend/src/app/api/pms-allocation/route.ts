// GET /api/pms-allocation
import { prisma } from "@/lib/prisma";
// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const rows = await prisma.allocation_table_pms.findMany({
      orderBy: { id: "asc" },
    });

    return NextResponse.json(rows);
  } catch (err) {
    console.error("❌ Error fetching PMS allocation:", err);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
