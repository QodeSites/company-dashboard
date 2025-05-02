import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const qcode = url.searchParams.get("qcode");
  const page = parseInt(url.searchParams.get("page") || "1");
  const pageSize = parseInt(url.searchParams.get("pageSize") || "25");
  const search = url.searchParams.get("search")?.toLowerCase() || "";
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  if (!qcode) {
    return NextResponse.json({ message: "Missing qcode" }, { status: 400 });
  }

  const tableName = `master_sheet_${qcode.toLowerCase()}`;

  try {
    const where = [];
    if (search) where.push(`LOWER(system_tag) LIKE '%${search}%'`);
    if (start) where.push(`date >= '${start}'`);
    if (end) where.push(`date <= '${end}'`);
    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const offset = (page - 1) * pageSize;

    const data = await prisma.$queryRawUnsafe(`
      SELECT * FROM ${tableName}
      ${whereClause}
      ORDER BY date DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `);

    const total = await prisma.$queryRawUnsafe<{ count: number }[]>(`
      SELECT COUNT(*)::int as count FROM ${tableName} ${whereClause}
    `);

    return NextResponse.json({
      data,
      total: total[0]?.count || 0,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
