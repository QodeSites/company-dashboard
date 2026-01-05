import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const qcode = formData.get("qcode") as string;
    const file = formData.get("file") as File;
    const startDate = formData.get("startDate") as string | null;
    const endDate = formData.get("endDate") as string | null;

    if (!qcode || !file) {
      return NextResponse.json(
        { message: "Missing required fields: qcode or file" },
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
    const lines = fileContent.split("\n").filter(line => line.trim());

    if (lines.length < 2) {
      return NextResponse.json(
        { message: "CSV file must have a header row and at least one data row" },
        { status: 400 }
      );
    }

    // Parse CSV headers
    const headers = lines[0].split(",").map(h => h.trim().replace(/^\uFEFF/, "").replace(/^\u00EF\u00BB\u00BF/, ""));

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

    // Parse CSV rows and insert to database
    const insertedData: any[] = [];
    const failedRows: any[] = [];

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
        if (!row["Date"]) throw new Error("Date is required");
        if (!row["System Tag"]) throw new Error("System Tag is required");

        const date = new Date(row["Date"]);
        if (isNaN(date.getTime())) throw new Error("Invalid Date format");

        // Check if date is within range if provided
        if (startDate && endDate) {
          const start = new Date(startDate);
          const end = new Date(endDate);
          if (date < start || date > end) {
            continue; // Skip rows outside the date range
          }
        }

        // Validate and parse numeric fields
        const portfolioValue = parseFloat(row["Portfolio Value"].replace(/,/g, "")) || 0;
        const capitalInOut = parseFloat(row["Cash In/Out"].replace(/,/g, "")) || 0;
        const nav = parseFloat(row["NAV"].replace(/,/g, "")) || 0;
        const prevNav = parseFloat(row["Prev NAV"].replace(/,/g, "")) || 0;
        const pnl = parseFloat(row["PnL"].replace(/,/g, "")) || 0;
        const dailyPL = parseFloat(row["Daily P/L %"].replace(/,/g, "").replace(/%/g, "")) || 0;
        const exposureValue = parseFloat(row["Exposure Value"].replace(/,/g, "")) || 0;
        const prevPortfolioValue = parseFloat(row["Prev Portfolio Value"].replace(/,/g, "")) || 0;
        const prevExposureValue = parseFloat(row["Prev Exposure Value"].replace(/,/g, "")) || 0;
        const prevPnl = parseFloat(row["Prev Pnl"].replace(/,/g, "")) || 0;
        const drawdown = parseFloat(row["Drawdown %"].replace(/,/g, "").replace(/%/g, "")) || 0;

        // Insert to database
        await prisma.$executeRaw`
          INSERT INTO master_sheet_test (
            qcode, date, portfolio_value, capital_in_out, nav, prev_nav, pnl,
            daily_p_l, exposure_value, prev_portfolio_value, prev_exposure_value,
            prev_pnl, drawdown, system_tag
          ) VALUES (
            ${qcode}, ${date}, ${portfolioValue}, ${capitalInOut}, ${nav}, ${prevNav},
            ${pnl}, ${dailyPL}, ${exposureValue}, ${prevPortfolioValue}, ${prevExposureValue},
            ${prevPnl}, ${drawdown}, ${row["System Tag"]}
          )
        `;

        insertedData.push(row);
      } catch (error: any) {
        failedRows.push({
          rowIndex: i + 1,
          error: error.message,
          row,
          rawDate: row["Date"],
          rawSystemTag: row["System Tag"],
        });
      }
    }

    return NextResponse.json({
      message: `${insertedData.length} rows inserted, ${failedRows.length} failed`,
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
