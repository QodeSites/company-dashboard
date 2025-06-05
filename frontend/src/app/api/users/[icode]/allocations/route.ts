// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ icode: string }> }
) {
  try {
    const { icode } = await params;
    
    const allocations = await prisma.pooled_account_allocations.findMany({
      where: { icode },
      select: {
        qcode: true,
        allocation_date: true,
        contribution_amount: true,
        allocation_percent: true,
        accounts: {
          select: {
            account_name: true,
          },
        },
      },
      orderBy: {
        allocation_date: "desc",
      },
    });

    // Transform the response to match the frontend's Allocation interface
    const formattedAllocations = allocations.map((alloc) => ({
      qcode: alloc.qcode || "",
      account_name: alloc.accounts?.account_name || "Unknown Account",
      allocation_date: alloc.allocation_date.toISOString().split("T")[0], // Format as YYYY-MM-DD
      contribution_amount: alloc.contribution_amount?.toString() || "0", // Handle null with default value
      allocation_percent: alloc.allocation_percent?.toString() || "0", // Handle null with default value
    }));

    return NextResponse.json(formattedAllocations);
  } catch (err) {
    console.error("Error fetching user allocations:", err);
    return NextResponse.json({ message: "Failed to fetch allocations" }, { status: 500 });
  }
}