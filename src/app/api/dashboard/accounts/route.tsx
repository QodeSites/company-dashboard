import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const totalAccounts = await prisma.account.count();

    const pmsCount = await prisma.account.count({
      where: { account_type: "pms" },
    });

    const managedCount = await prisma.account.count({
      where: { account_type: "managed_account" },
    });

    const propCount = await prisma.account.count({
      where: { account_type: "prop" },
    });

    const recentAccounts = await prisma.account.findMany({
      orderBy: { created_at: "desc" },
      take: 3,
      select: {
        qcode: true,
        account_name: true,
      },
    });

    return NextResponse.json({
      totalAccounts,
      accountTypes: {
        pms: pmsCount,
        managed_account: managedCount,
        prop: propCount,
      },
      recentAccounts,
    });
  } catch (error) {
    console.error("Accounts dashboard error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
