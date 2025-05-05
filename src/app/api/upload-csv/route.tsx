import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { PrismaClient, Prisma } from "@prisma/client";

// Centralized utility for converting stream to string
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

// Utility for safe parsing of float values
const safeParseFloat = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = parseFloat(value as string);
  return isNaN(parsed) ? null : parsed;
};

// Required columns for the master sheet
const requiredColumns = [
  "Date",
  "Portfolio Value",
  "Cash In/Out",
  "NAV",
  "Prev NAV",
  "PnL",
  "Daily P/L %",
  "Exposure Value",
  "Prev Portfolio Value",
  "Prev Exposure Value",
  "Prev Pnl",
  "Drawdown %",
  "System Tag",
];

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const startTime = Date.now();
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const qcode = formData.get("qcode")?.toString().toLowerCase();
    const startDate = formData.get("startDate")?.toString();
    const endDate = formData.get("endDate")?.toString();

    // Validate inputs
    if (!file || !qcode) {
      return NextResponse.json({ message: "Missing file or qcode" }, { status: 400 });
    }

    // Sanitize qcode to prevent SQL injection
    if (!/^[a-z0-9_]+$/.test(qcode)) {
      return NextResponse.json({ message: "Invalid qcode format" }, { status: 400 });
    }

    // Validate date range if provided
    let startDateObj: Date | null = null;
    let endDateObj: Date | null = null;
    if (startDate || endDate) {
      if (!startDate || !endDate) {
        return NextResponse.json({ message: "Both startDate and endDate are required" }, { status: 400 });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        return NextResponse.json({ message: "Invalid date format. Use YYYY-MM-DD." }, { status: 400 });
      }
      startDateObj = new Date(startDate);
      endDateObj = new Date(endDate);
      if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
        return NextResponse.json({ message: "Invalid date values" }, { status: 400 });
      }
      if (startDateObj > endDateObj) {
        return NextResponse.json({ message: "startDate cannot be after endDate" }, { status: 400 });
      }
    }

    const tableName = `master_sheet_${qcode}`;

    // Check if table exists
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

    console.log("Total Records:", records.length);

    if (records.length === 0) {
      return NextResponse.json({ message: "CSV file is empty or has no valid rows" }, { status: 400 });
    }

    const columnNames = Object.keys(records[0]);
    console.log("CSV Columns:", columnNames);

    // Validate required columns
    const missingColumns = requiredColumns.filter((col) => !columnNames.includes(col));
    if (missingColumns.length > 0) {
      return NextResponse.json(
        { message: `Missing required columns: ${missingColumns.join(", ")}` },
        { status: 400 }
      );
    }

    let successCount = 0;
    const failedRows: { rowIndex: number; row: Record<string, unknown>; error: string }[] = [];

    // Validate date range if provided
    if (startDateObj && endDateObj) {
      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        const rowDate = row["Date"] ? new Date(row["Date"]) : null;
        if (!rowDate || isNaN(rowDate.getTime()) || rowDate < startDateObj || rowDate > endDateObj) {
          failedRows.push({
            rowIndex: i + 1,
            row: Object.entries(row).reduce((acc: Record<string, unknown>, [key, value]) => {
              acc[key] = value; // Avoid truncating for better debugging
              return acc;
            }, {}),
            error: `Date ${row["Date"]} is invalid or outside the range: ${startDate} to ${endDate}`,
          });
        }
      }
      if (failedRows.length === records.length) {
        return NextResponse.json(
          {
            message: "No valid rows found for the specified date range",
            totalRows: records.length,
            columnNames,
            failedRows: failedRows.slice(0, 10),
          },
          { status: 400 }
        );
      }
    }

    // Process rows in batches
    const batchSize = 500;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const batchStart = Date.now();
      console.log(`Processing batch ${i / batchSize + 1} (${batch.length} rows)`);

      const values: unknown[] = [];
      const placeholders: string[] = [];

      for (const [index, row] of batch.entries()) {
        try {
          let parsedDate: Date | null = null;
          if (row["Date"]) {
            parsedDate = new Date(row["Date"]);
            if (isNaN(parsedDate.getTime())) {
              throw new Error(`Invalid date format: ${row["Date"]}`);
            }
          }

          const systemTagKey = Object.keys(row).find(
            (key) =>
              key === "System Tag" ||
              key.replace(/^\uFEFF/, "").replace(/^\u00EF\u00BB\u00BF/, "").trim() === "System Tag"
          );

          if (!parsedDate) {
            throw new Error("Missing required field: Date");
          }

          if (!systemTagKey || row[systemTagKey] === undefined || row[systemTagKey] === null || row[systemTagKey] === "") {
            throw new Error("Missing required field: System Tag");
          }

          const rowValues = [
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
            row[systemTagKey],
          ];

          // Add values and placeholder for bulk insert
          values.push(...rowValues);
          placeholders.push(
            `($${values.length - 13 + 1}, $${values.length - 12 + 1}, $${values.length - 11 + 1}, $${values.length - 10 + 1}, $${values.length - 9 + 1}, $${values.length - 8 + 1}, $${values.length - 7 + 1}, $${values.length - 6 + 1}, $${values.length - 5 + 1}, $${values.length - 4 + 1}, $${values.length - 3 + 1}, $${values.length - 2 + 1}, $${values.length - 1 + 1}, $${values.length})`
          );
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : "Unknown error";
          failedRows.push({
            rowIndex: i + index + 1,
            row: Object.entries(row).reduce((acc: Record<string, unknown>, [key, value]) => {
              acc[key] = value; // Avoid truncating for better debugging
              return acc;
            }, {}),
            error: errorMessage,
          });
        }
      }

      // Execute bulk insert
      if (placeholders.length > 0) {
        try {
          const insertQuery = Prisma.sql`
            INSERT INTO ${Prisma.raw(tableName)} (
              qcode, date, portfolio_value, capital_in_out, nav, prev_nav, pnl, daily_p_l,
              exposure_value, prev_portfolio_value, prev_exposure_value, prev_pnl, drawdown, system_tag
            ) VALUES ${Prisma.raw(placeholders.join(", "))}
          `;
          await prisma.$executeRaw(insertQuery, ...values);
          successCount += placeholders.length;
        } catch (err: unknown) {
          console.error("Bulk insert failed:", err);
          // Fallback to individual inserts
          for (const [index, row] of batch.entries()) {
            try {
              const parsedDate = row["Date"] ? new Date(row["Date"]) : null;
              const systemTagKey = Object.keys(row).find(
                (key) =>
                  key === "System Tag" ||
                  key.replace(/^\uFEFF/, "").replace(/^\u00EF\u00BB\u00BF/, "").trim() === "System Tag"
              );

              if (!parsedDate || isNaN(parsedDate.getTime())) {
                throw new Error("Missing or invalid required field: Date");
              }
              if (!systemTagKey || !row[systemTagKey]) {
                throw new Error("Missing or invalid required field: System Tag");
              }

              const rowValues = [
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
                row[systemTagKey],
              ];

              await prisma.$executeRaw(
                Prisma.sql`
                  INSERT INTO ${Prisma.raw(tableName)} (
                    qcode, date, portfolio_value, capital_in_out, nav, prev_nav, pnl, daily_p_l,
                    exposure_value, prev_portfolio_value, prev_exposure_value, prev_pnl, drawdown, system_tag
                  ) VALUES (
                    ${rowValues[0]}, ${rowValues[1]}, ${rowValues[2]}, ${rowValues[3]}, ${rowValues[4]}, 
                    ${rowValues[5]}, ${rowValues[6]}, ${rowValues[7]}, ${rowValues[8]}, ${rowValues[9]}, 
                    ${rowValues[10]}, ${rowValues[11]}, ${rowValues[12]}, ${rowValues[13]}
                  )
                `
              );
              successCount++;
            } catch (err: unknown) {
              const errorMessage = err instanceof Error ? err.message : "Unknown error";
              failedRows.push({
                rowIndex: i + index + 1,
                row: Object.entries(row).reduce((acc: Record<string, unknown>, [key, value]) => {
                  acc[key] = value;
                  return acc;
                }, {}),
                error: errorMessage,
              });
            }
          }
        }
      }

      console.log(`Batch ${i / batchSize + 1} Duration:`, Date.now() - batchStart, "ms");
    }

    const totalDuration = Date.now() - startTime;
    console.log("Total Operation Duration:", totalDuration, "ms");

    return NextResponse.json({
      message: `${successCount} rows inserted, ${failedRows.length} failed`,
      totalRows: records.length,
      insertedRows: successCount,
      columnNames,
      firstError: failedRows.length ? failedRows[0] : null,
      failedRows: failedRows.length ? failedRows.slice(0, 10) : [],
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("CSV Upload Error:", err);
    const errorDetails =
      err instanceof Error && "code" in err && typeof (err as any).code === "string"
        ? `Error Code: ${(err as any).code}`
        : undefined;
    return NextResponse.json(
      { message: "Upload failed", error: errorMessage, details: errorDetails },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}