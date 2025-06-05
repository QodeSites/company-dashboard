// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { safeParseFloat } from "@/utils/safeParseFloat";

// Convert ReadableStream to string
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

export async function POST(req: NextRequest) {
  try {
    const startTime = Date.now();
    const formData = await req.formData();
    const qcode = formData.get("qcode")?.toString().toLowerCase();
    const file = formData.get("file") as File;

    // Validate inputs
    if (!qcode || !file) {
      return NextResponse.json({ message: "Missing qcode or file" }, { status: 400 });
    }

    // Sanitize qcode to prevent SQL injection
    if (!/^[a-z0-9_]+$/.test(qcode)) {
      return NextResponse.json({ message: "Invalid qcode format" }, { status: 400 });
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

    // Truncate the table in a short transaction
    await prisma.$transaction(
      async (tx) => {
        console.log("Starting TRUNCATE");
        const truncateStart = Date.now();
        await tx.$executeRaw(Prisma.sql`TRUNCATE TABLE ${Prisma.raw(tableName)}`);
        console.log("TRUNCATE Duration:", Date.now() - truncateStart, "ms");
      },
      { timeout: 5000 } // Short timeout for truncate
    );

    // Process and insert rows in batches
    const batchSize = 500;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const batchStart = Date.now();
      console.log(`Processing batch ${i / batchSize + 1} (${batch.length} rows)`);

      // Prepare values for bulk insert
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

          const safeParseFloat = (value: unknown): number | null => {
            if (value === undefined || value === null || value === "") return null;
            const parsed = parseFloat(value as string);
            return isNaN(parsed) ? null : parsed;
          };

          const systemTagKey = Object.keys(row).find(
            (key) =>
              key === "System Tag" ||
              key.replace(/^\uFEFF/, "").replace(/^\u00EF\u00BB\u00BF/, "").trim() === "System Tag"
          );

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
            systemTagKey ? row[systemTagKey] : null,
          ];

          if (!parsedDate) {
            throw new Error("Missing required field: Date");
          }

          if (!systemTagKey || row[systemTagKey] === undefined || row[systemTagKey] === null || row[systemTagKey] === "") {
            throw new Error("Missing required field: System Tag");
          }

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
              acc[key] = typeof value === "string" && value.length > 50 ? value.substring(0, 50) + "..." : value;
              return acc;
            }, {}),
            error: errorMessage,
          });
        }
      }

      // Execute bulk insert for valid rows
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
        } catch (error) {
          console.error("Bulk insert failed:", error);
          // If bulk insert fails, fall back to individual inserts
          for (const [index, row] of batch.entries()) {
            try {
              const rowValues = [
                qcode,
                row["Date"] ? new Date(row["Date"]) : null,
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
                row["System Tag"] || null,
              ];

              if (!rowValues[1]) throw new Error("Missing required field: Date");
              if (!rowValues[13]) throw new Error("Missing required field: System Tag");

              await prisma.$executeRaw(
                Prisma.sql`
                  INSERT INTO ${Prisma.raw(tableName)} (
                    qcode, date, portfolio_value, capital_in_out, nav, prev_nav, pnl, daily_p_l,
                    exposure_value, prev_portfolio_value, prev_exposure_value, prev_pnl, drawdown, system_tag
                  ) VALUES (${rowValues[0]}, ${rowValues[1]}, ${rowValues[2]}, ${rowValues[3]}, ${rowValues[4]}, 
                            ${rowValues[5]}, ${rowValues[6]}, ${rowValues[7]}, ${rowValues[8]}, ${rowValues[9]}, 
                            ${rowValues[10]}, ${rowValues[11]}, ${rowValues[12]}, ${rowValues[13]})
                `
              );
              successCount++;
            } catch (err: unknown) {
              const errorMessage = err instanceof Error ? err.message : "Unknown error";
              failedRows.push({
                rowIndex: i + index + 1,
                row: Object.entries(row).reduce((acc: Record<string, unknown>, [key, value]) => {
                  acc[key] = typeof value === "string" && value.length > 50 ? value.substring(0, 50) + "..." : value;
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

    const message = `Master sheet replaced successfully. Inserted ${successCount} rows. ${
      failedRows.length > 0 ? `${failedRows.length} rows failed to insert.` : ""
    }`;

    return NextResponse.json({
      message,
      totalRows: records.length,
      insertedRows: successCount,
      columnNames,
      firstError: failedRows.length ? failedRows[0] : null,
      failedRows: failedRows.length ? failedRows.slice(0, 10) : [],
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    console.error("POST /api/replace-master-sheet error:", error);
    return NextResponse.json(
      { message: `❌ Error replacing master sheet: ${errorMessage}` },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}