import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ icode: string }> } // Update type to reflect Promise
) {
  const { icode } = await params; // Await params to resolve icode

  try {
    const user = await prisma.user.findUnique({
      where: { icode },
      select: {
        icode: true,
        user_name: true,
        email: true,
        pooled_account_users: {
          select: {
            qcode: true,
            accounts: {
              select: {
                qcode: true,
                account_name: true,
                broker: true,
              },
            },
          },
        },
        pooled_account_allocations: {
          select: {
            qcode: true,
            allocation_date: true,
            contribution_amount: true,
            allocation_percent: true,
          },
          orderBy: {
            allocation_date: "desc",
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (err) {
    console.error("GET /api/users/[icode] error:", err);
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}