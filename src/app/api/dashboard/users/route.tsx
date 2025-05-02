import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const totalUsers = await prisma.user.count();

    const activeAllocations = await prisma.pooledAccountUser.count();

    const recentUsers = await prisma.user.findMany({
      orderBy: { created_at: "desc" },
      take: 3,
      select: {
        icode: true,
        user_name: true,
      },
    });

    return NextResponse.json({
      totalUsers,
      activeAllocations,
      recentUsers,
    });
  } catch (error) {
    console.error("Users dashboard error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
