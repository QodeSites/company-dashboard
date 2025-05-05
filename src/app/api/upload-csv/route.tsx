import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File;
  const qcode = formData.get("qcode")?.toString().toLowerCase();
  const startDate = formData.get("startDate")?.toString();
  const endDate = formData.get("endDate")?.toString();

  if (!file || !qcode) {
    return NextResponse.json({ message: "Missing file or qcode" }, { status: 400 });
  }

  // Sanitize qcode to prevent SQL injection
  if (!/^[a-z0-9_]+$/.test(qcode)) {
    return NextResponse.json({ message: "Invalid qcode format" }, { status: 400 });
  }

  // Validate date range if provided
  if (startDate || endDate) {
    if (!startDate || !endDate) {
      return NextResponse.json({ message: "Both startDate and endDate are required" }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return NextResponse.json({ message: "Invalid date format. Use YYYY-MM-DD." }, { status: 400 });
    }
    if (new Date(startDate) > new Date(endDate)) {
      return NextResponse.json({ message: "startDate cannot be after endDate" }, { status: 400 });
    }
  }

  const tableName = `master_sheet_${qcode}`;

  try {
    // Verify table existence
    const tableExists = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = '${tableName}'
      )`
    );

    if (!tableExists[0].exists) {
      return NextResponse.json({ message: `Table ${tableName} does not exist` }, { status: 400 });
    }

    // Get CSV content
    const csvText = await streamToString(file.stream());
    const csvLines = csvText.split("\n");
    const csvPreview = csvLines.slice(0, 2).join("\n");
    console.log("CSV Preview:", csvPreview);

    // Parse CSV
    const records = parse(csvText, {
      columns: (header) =>
        header.map((column: string) =>
          column.replace(/^\uFEFF/, "").replace(/^\u00EF\u00BB\u00BF/, "").trim()
        ),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true,
    });

    if (records.length === 0) {
      return NextResponse.json({ message: "CSV file is empty or has no valid rows" }, { status: 400 });
    }

    const columnNames = Object.keys(records[0]);
    console.log("CSV Columns:", columnNames);

    let successCount = 0;
    const failedRows: { rowIndex: number; row: Record<string, unknown>; error: string }[] = [];

    // Optional: Validate CSV dates are within the specified range
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const rowDate = row["Date"] ? new Date(row["Date"]) : null;
        if (!rowDate || rowDate < start || rowDate > end) {
          failedRows.push({
            rowIndex: i + 1,
            row: Object.entries(row).reduce((acc: Record<string, unknown>, [key, value]) => {
              acc[key] = typeof value === "string" && value.length > 50 ? value.substring(0, 50) + "..." : value;
              return acc;
            }, {}),
            error: `Date ${row["Date"]} is outside the specified range: ${startDate} to ${endDate}`,
          });
        }
      }
      if (failedRows.length === records.length) {
        return NextResponse.json({
          message: "No valid rows found for the specified date range",
          totalRows: records.length,
          columnNames,
          failedRows,
        }, { status: 400 });
      }
    }

    // Process each row
    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      try {
        let parsedDate: Date | null = null;
        if (row["Date"]) {
          parsedDate = new Date(row["Date"]);
          if (isNaN(parsedDate.getTime())) {
            throw new Error(`Invalid date format: ${row["Date"]}`);
          }
        }

        const safeParseFloat = (value: unknown): number | null => {
          if (value === undefined || value === null || value === "") return null;
          const parsed = parseFloat(value as string);
          return isNaN(parsed) ? null : parsed;
        };

        const values = [
          qcode,
          parsedDate,
          safeParseFloat(row["Portfolio Value"]),
          safeParseFloat(row["Cash In/Out"]),
          safeParseFloat(row["NAV"]),
          safeParseFloat(row["Prev NAV"]),
          safeParseFloat(row["PnL"]),
          safeParseFloat(row["Daily P/L %"]),
          safeParseFloat(row["Exposure Value"]),
          safeParseFloat(row["Prev Portfolio Value"]),
          safeParseFloat(row["Prev Exposure Value"]),
          safeParseFloat(row["Prev Pnl"]),
          safeParseFloat(row["Drawdown %"]),
          (() => {
            const systemTagKey = Object.keys(row).find(
              (key) =>
                key === "System Tag" ||
                key.replace(/^\uFEFF/, "").replace(/^\u00EF\u00BB\u00BF/, "").trim() === "System Tag"
            );
            return systemTagKey ? row[systemTagKey] : null;
          })(),
        ];

        if (!parsedDate) {
          throw new Error("Missing required field: Date");
        }

        const systemTagKey = Object.keys(row).find(
          (key) =>
            key === "System Tag" ||
            key.replace(/^\uFEFF/, "").replace(/^\u00EF\u00BB\u00BF/, "").trim() === "System Tag"
        );

        if (!systemTagKey || row[systemTagKey] === undefined || row[systemTagKey] === null || row[systemTagKey] === "") {
          throw new Error("Missing required field: System Tag");
        }

        const insertQuery = `
          INSERT INTO ${tableName} (
            qcode, date, portfolio_value, capital_in_out, nav, prev_nav, pnl, daily_p_l,
            exposure_value, prev_portfolio_value, prev_exposure_value, prev_pnl, drawdown, system_tag
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
          )
        `;

        await prisma.$executeRawUnsafe(
          insertQuery,
          values[0],
          values[1],
          values[2],
          values[3],
          values[4],
          values[5],
          values[6],
          values[7],
          values[8],
          values[9],
          values[10],
          values[11],
          values[12],
          values[13]
        );

        successCount++;
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
        failedRows.push({
          rowIndex: i + 1,
          row: Object.entries(row).reduce((acc: Record<string, unknown>, [key, value]) => {
            acc[key] = typeof value === "string" && value.length > 50 ? value.substring(0, 50) + "..." : value;
            return acc;
          }, {}),
          error: errorMessage,
        });
      }
    }

    return NextResponse.json({
      message: `${successCount} rows inserted, ${failedRows.length} failed`,
      totalRows: records.length,
      columnNames,
      firstError: failedRows.length ? failedRows[0] : null,
      failedRows: failedRows.length ? failedRows.slice(0, 10) : [],
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("CSV Upload Error:", err);
    const errorDetails =
      err instanceof Error && "code" in err && typeof err.code === "string" ? `Error Code: ${err.code}` : undefined;
    return NextResponse.json(
      { message: "Upload failed", error: errorMessage, details: errorDetails },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}