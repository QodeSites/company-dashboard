// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Helper function to detect and handle different date formats
function normalizeDate(dateString: string): string | null {
  if (!dateString) return null;

  // Remove any quotes or whitespace
  const cleanDate = dateString.replace(/['"]/g, '').trim();

  // Try different date formats
  const formats = [
    // ISO format (YYYY-MM-DD)
    /^(\d{4})-(\d{2})-(\d{2})$/,
    // US format (MM/DD/YYYY)
    /^(\d{2})\/(\d{2})\/(\d{4})$/,
    // Alternative format (DD/MM/YYYY)
    /^(\d{2})\/(\d{2})\/(\d{4})$/,
    // Alternative dash format (MM-DD-YYYY)
    /^(\d{2})-(\d{2})-(\d{4})$/
  ];

  // Try ISO format first (most common in databases)
  const isoMatch = cleanDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return cleanDate; // Already in correct format
  }

  // Try to parse as a date and convert to YYYY-MM-DD
  const date = new Date(cleanDate);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }

  return null;
}

// Helper function to create flexible date comparison
function createDateFilter(columnName: string, startDate: string | null, endDate: string | null): string[] {
  const conditions: string[] = [];

  if (startDate) {
    conditions.push(`(
      ${columnName}::text >= '${startDate}' OR 
      ${columnName}::date >= '${startDate}'::date OR
      DATE(${columnName}) >= DATE('${startDate}')
    )`);
  }

  if (endDate) {
    conditions.push(`(
      ${columnName}::text <= '${endDate}' OR 
      ${columnName}::date <= '${endDate}'::date OR
      DATE(${columnName}) <= DATE('${endDate}')
    )`);
  }

  return conditions;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const qcode = url.searchParams.get("qcode");
  const page = parseInt(url.searchParams.get("page") || "1");
  const pageSize = parseInt(url.searchParams.get("pageSize") || "25");
  const search = url.searchParams.get("search")?.toLowerCase() || "";
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const isChartRequest = url.searchParams.get("chart") === "true";
  console.log("isChartRequest", isChartRequest);

  if (!qcode) {
    return NextResponse.json({ message: "Missing qcode" }, { status: 400 });
  }

  // Validate qcode to prevent SQL injection
  if (!/^[a-zA-Z0-9_]+$/.test(qcode)) {
    return NextResponse.json({ message: "Invalid qcode format" }, { status: 400 });
  }

  const tableName = `master_sheet`; // Use static table name

  try {
    // Detect date format in the master_sheet table
    let dateFormat = 'unknown';
    let sampleDate = '';

    try {
      const sampleQuery = await prisma.$queryRawUnsafe<any[]>(`
        SELECT date::text as date_text
        FROM ${tableName} 
        WHERE date IS NOT NULL AND qcode = '${qcode}'
        LIMIT 1
      `);

      if (sampleQuery.length > 0) {
        sampleDate = sampleQuery[0].date_text || sampleQuery[0].date;

        if (typeof sampleDate === 'string') {
          if (sampleDate.match(/^\d{4}-\d{2}-\d{2}/)) {
            dateFormat = 'YYYY-MM-DD';
          } else if (sampleDate.match(/^\d{2}\/\d{2}\/\d{4}/)) {
            dateFormat = 'MM/DD/YYYY or DD/MM/YYYY';
          }
        }
      }
    } catch (err) {
      console.warn('Could not detect date format:', err);
    }

    // Normalize input dates
    const normalizedStart = start ? normalizeDate(start) : null;
    const normalizedEnd = end ? normalizeDate(end) : null;

    if (start && !normalizedStart) {
      return NextResponse.json({
        message: "Invalid start date format. Please use YYYY-MM-DD format.",
        detectedFormat: dateFormat,
        sampleDate: sampleDate
      }, { status: 400 });
    }

    if (end && !normalizedEnd) {
      return NextResponse.json({
        message: "Invalid end date format. Please use YYYY-MM-DD format.",
        detectedFormat: dateFormat,
        sampleDate: sampleDate
      }, { status: 400 });
    }

    // Validate date range
    if (normalizedStart && normalizedEnd) {
      if (new Date(normalizedStart) > new Date(normalizedEnd)) {
        return NextResponse.json({
          message: "Start date cannot be after end date."
        }, { status: 400 });
      }
    }

    // Build WHERE clause
    const whereConditions: string[] = [`qcode = '${qcode.replace(/'/g, "''")}'`];

    if (search) {
      whereConditions.push(`LOWER(system_tag) LIKE '%${search.replace(/'/g, "''")}%'`);
    }

    // Add flexible date filters
    const dateFilters = createDateFilter('date', normalizedStart, normalizedEnd);
    whereConditions.push(...dateFilters);

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

    // Validate pagination
    const allowedPageSizes = [25, 50, 100, 150];
    if (page < 1 || pageSize < 1 || !allowedPageSizes.includes(pageSize)) {
      return NextResponse.json({
        message: `Invalid pageSize. Allowed values are: ${allowedPageSizes.join(", ")}`
      }, { status: 400 });
    }

    const offset = (page - 1) * pageSize;
    const limitClause = isChartRequest ? "" : `LIMIT ${pageSize} OFFSET ${offset}`;

    // Check if table exists
    const tableExists = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = '${tableName.toLowerCase()}'
      ) as exists
    `);

    if (!tableExists[0]?.exists) {
      return NextResponse.json({
        data: [],
        total: 0,
        message: `Master sheet table does not exist`,
        debug: {
          tableName,
          dateFormat,
          sampleDate
        }
      });
    }

    // Check if any records exist for the given qcode
    const qcodeExists = await prisma.$queryRawUnsafe<{ count: number }[]>(`
      SELECT COUNT(*)::int as count 
      FROM ${tableName} 
      WHERE qcode = '${qcode.replace(/'/g, "''")}'
    `);

    if (qcodeExists[0]?.count === 0) {
      return NextResponse.json({
        data: [],
        total: 0,
        message: `No data found for qcode ${qcode} in master_sheet`,
        debug: {
          tableName,
          dateFormat,
          sampleDate
        }
      });
    }

    // Fetch data with flexible date handling
    const data = await prisma.$queryRawUnsafe(`
      SELECT 
        id,
        CASE 
          WHEN date::text ~ '^\\d{4}-\\d{2}-\\d{2}' THEN date::text
          ELSE TO_CHAR(date::date, 'YYYY-MM-DD')
        END as date,
        system_tag,
        nav,
        pnl,
        drawdown,
        portfolio_value,
        capital_in_out,
        prev_nav,
        daily_p_l,
        exposure_value,
        prev_portfolio_value,
        prev_exposure_value,
        prev_pnl
      FROM ${tableName}
      ${whereClause}
      ORDER BY date ${isChartRequest ? "ASC" : "DESC"}, id ${isChartRequest ? "ASC" : "DESC"}
      ${limitClause}
    `);

    // Get total count
    const total = isChartRequest
      ? [{ count: data.length }]
      : await prisma.$queryRawUnsafe<{ count: number }[]>(`
      SELECT COUNT(*)::int as count FROM ${tableName} ${whereClause}
    `);

    return NextResponse.json({
      data: Array.isArray(data) ? data : [],
      total: total[0]?.count || 0,
      debug: {
        dateFormat,
        sampleDate,
        normalizedStart,
        normalizedEnd,
        whereClause,
        tableName
      },
      filters: {
        search: search || null,
        startDate: normalizedStart,
        endDate: normalizedEnd
      }
    });

  } catch (err: unknown) {
    console.error("Master sheet API error:", err);

    if (err instanceof Error) {
      if (err.message.includes('relation') && err.message.includes('does not exist')) {
        return NextResponse.json({
          data: [],
          total: 0,
          message: `Master sheet table does not exist`
        });
      }
    }

    const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
    return NextResponse.json({
      error: errorMessage,
      message: "Failed to fetch master sheet data"
    }, { status: 500 });
  }
}