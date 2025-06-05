// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const { qcode, startDate, endDate } = await req.json();

    if (!qcode) {
      return NextResponse.json({ message: "Missing qcode" }, { status: 400 });
    }

    // Sanitize qcode to prevent SQL injection
    if (!/^[a-z0-9_]+$/.test(qcode.toLowerCase())) {
      return NextResponse.json({ message: "Invalid qcode format" }, { status: 400 });
    }

    // Validate date range
    if (!startDate || !endDate) {
      return NextResponse.json({ message: "Both startDate and endDate are required" }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return NextResponse.json({ message: "Invalid date format. Use YYYY-MM-DD." }, { status: 400 });
    }
    if (new Date(startDate) > new Date(endDate)) {
      return NextResponse.json({ message: "startDate cannot be after endDate" }, { status: 400 });
    }

    const tableName = `master_sheet_${qcode.toLowerCase()}`;

    // Check if table exists using Prisma's queryRaw
    const result = await prisma.$queryRaw<{ exists: boolean }[]>(
      Prisma.sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = ${tableName}
        ) as "exists"
      `
    );

    const tableExists = result[0]?.exists;

    if (!tableExists) {
      return NextResponse.json({ message: `Table ${tableName} does not exist` }, { status: 400 });
    }

    // Convert string dates to Date objects for proper parameter handling
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);

    // Delete records for the specified date range
    const deletedCount = await prisma.$executeRaw(
      Prisma.sql`
        DELETE FROM ${Prisma.raw(tableName)}
        WHERE date >= ${startDateObj} AND date <= ${endDateObj}
      `
    );

    console.log(`Deleted ${deletedCount} rows for date range: ${startDate} to ${endDate}`);

    return NextResponse.json({
      message: `Deleted ${deletedCount} rows successfully`,
      deletedCount,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("Delete Records Error:", err);
    const errorDetails = err instanceof Error && "code" in err ? `Error Code: ${(err as any).code}` : undefined;
    return NextResponse.json(
      { message: errorMessage, error: errorMessage, details: errorDetails },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}