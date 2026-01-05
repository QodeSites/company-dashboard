import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const qcode = formData.get("qcode") as string;
    const date = formData.get("date") as string;
    const file = formData.get("file") as File;

    if (!qcode || !date || !file) {
      return NextResponse.json(
        { message: "Missing required fields: qcode, date, or file" },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json(
        { message: "File must be a CSV" },
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

    // Read file content
    const fileContent = await file.text();
    const lines = fileContent.split(/\r?\n/).filter(line => line.trim());

    console.log(`Total lines in CSV (including header): ${lines.length}`);

    if (lines.length < 2) {
      return NextResponse.json(
        { message: "CSV file must have a header row and at least one data row" },
        { status: 400 }
      );
    }

    // Parse CSV headers
    const headers = lines[0].split(",").map(h => h.trim().replace(/^\uFEFF/, "").replace(/^\u00EF\u00BB\u00BF/, ""));

    const requiredColumns = [
      "Symbol",
      "Mastersheet Tag",
      "Exchange",
      "Quantity",
      "Avg Price",
      "Broker",
      "Debt/Equity",
      "Sub Category",
      "LTP",
      "Buy Value",
      "Value as of Today",
      "PNL Amount",
      "% PNL",
    ];

    // Check for missing columns
    const missingColumns = requiredColumns.filter(col => !headers.includes(col));
    if (missingColumns.length > 0) {
      return NextResponse.json(
        {
          message: `Missing required columns: ${missingColumns.join(", ")}`,
          columnNames: headers,
        },
        { status: 400 }
      );
    }

    // Delete all existing records for this qcode
    const deletedCount = await prisma.$executeRaw`
      DELETE FROM equity_holding_test WHERE qcode = ${qcode}
    `;

    console.log(`Deleted ${deletedCount} existing records for qcode: ${qcode}`);

    // Parse CSV rows and insert to database
    const insertedData: any[] = [];
    const failedRows: any[] = [];

    console.log(`Starting to process ${lines.length - 1} data rows`);

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(",").map(v => v.trim());
      const row: any = {};

      headers.forEach((header, index) => {
        row[header] = values[index] || "";
      });

      // Validate and insert
      try {
        if (!row["Symbol"]) throw new Error("Symbol is required");
        if (!row["Quantity"]) throw new Error("Quantity is required");
        if (!row["Avg Price"]) throw new Error("Avg Price is required");

        // Validate numeric fields
        const quantity = parseInt(row["Quantity"]);
        if (isNaN(quantity)) throw new Error("Invalid Quantity");

        const avgPrice = parseFloat(row["Avg Price"].replace(/,/g, ""));
        if (isNaN(avgPrice)) throw new Error("Invalid Avg Price");

        const ltp = parseFloat(row["LTP"].replace(/,/g, "")) || 0;
        const buyValue = parseFloat(row["Buy Value"].replace(/,/g, "")) || 0;
        const valueAsOfToday = parseFloat(row["Value as of Today"].replace(/,/g, "")) || 0;
        const pnlAmount = parseFloat(row["PNL Amount"].replace(/,/g, "")) || 0;
        const percentPnl = row["% PNL"] && !["inf", "-inf"].includes(row["% PNL"].toLowerCase())
          ? parseFloat(row["% PNL"].replace(/,/g, "").replace(/%/g, ""))
          : 0;

        // Insert to database
        await prisma.$executeRaw`
          INSERT INTO equity_holding_test (
            qcode, date, symbol, mastersheet_tag, exchange, quantity, avg_price,
            broker, debt_equity, sub_category, ltp, buy_value, value_as_of_today,
            pnl_amount, percent_pnl
          ) VALUES (
            ${qcode}, ${new Date(date)}, ${row["Symbol"]}, ${row["Mastersheet Tag"]},
            ${row["Exchange"]}, ${quantity}, ${avgPrice}, ${row["Broker"]},
            ${row["Debt/Equity"]}, ${row["Sub Category"]}, ${ltp}, ${buyValue},
            ${valueAsOfToday}, ${pnlAmount}, ${percentPnl}
          )
        `;

        insertedData.push(row);
      } catch (error: any) {
        failedRows.push({
          rowIndex: i + 1,
          error: error.message,
          row,
        });
      }
    }

    console.log(`Finished processing. Inserted: ${insertedData.length}, Failed: ${failedRows.length}`);

    return NextResponse.json({
      message: `Deleted ${deletedCount} existing records. ${insertedData.length} rows inserted, ${failedRows.length} failed`,
      deletedCount,
      totalRows: lines.length - 1,
      insertedRows: insertedData.length,
      failedRows,
      columnNames: headers,
      firstError: failedRows.length > 0 ? failedRows[0] : null,
    });

  } catch (error: any) {
    console.error("Error processing upload:", error);
    return NextResponse.json(
      {
        message: `Upload failed: ${error.message}`,
        error: error.message
      },
      { status: 500 }
    );
  }
}
