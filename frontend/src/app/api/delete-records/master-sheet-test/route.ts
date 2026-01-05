import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { qcode, startDate, endDate } = body;

    if (!qcode || !startDate || !endDate) {
      return NextResponse.json(
        { message: "Missing required fields: qcode, startDate, or endDate" },
        { status: 400 }
      );
    }

    // Validate account exists
    const account = await prisma.accounts.findUnique({
      where: { qcode },
    });

    if (!account) {
      return NextResponse.json(
        { message: `Invalid qcode: ${qcode}` },
        { status: 400 }
      );
    }

    // Delete records within date range
    const result = await prisma.$executeRaw`
      DELETE FROM master_sheet_test
      WHERE qcode = ${qcode}
        AND date >= ${new Date(startDate)}
        AND date <= ${new Date(endDate)}
    `;

    return NextResponse.json({
      message: `Successfully deleted ${result} records for qcode ${qcode} between ${startDate} and ${endDate}`,
      deletedCount: result,
    });

  } catch (error: any) {
    console.error("Error deleting records:", error);
    return NextResponse.json(
      {
        message: `Deletion failed: ${error.message}`,
        error: error.message
      },
      { status: 500 }
    );
  }
}
