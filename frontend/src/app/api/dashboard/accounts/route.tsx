// @ts-nocheck
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const totalAccounts = await prisma.accounts.count();

    const pmsCount = await prisma.accounts.count({
      where: { account_type: "pms" },
    });

    const managedCount = await prisma.accounts.count({
      where: { account_type: "managed_account" },
    });

    const propCount = await prisma.accounts.count({
      where: { account_type: "prop" },
    });

    const recentAccounts = await prisma.accounts.findMany({
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
