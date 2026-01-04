import { NextRequest, NextResponse } from "next/server";

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

    // Parse CSV rows
    const data: any[] = [];
    const failedRows: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(",").map(v => v.trim());
      const row: any = {};

      headers.forEach((header, index) => {
        row[header] = values[index] || "";
      });

      // Basic validation
      try {
        if (!row["Symbol"]) throw new Error("Symbol is required");
        if (!row["Quantity"]) throw new Error("Quantity is required");
        if (!row["Avg Price"]) throw new Error("Avg Price is required");

        // Validate numeric fields
        const quantity = parseInt(row["Quantity"]);
        if (isNaN(quantity)) throw new Error("Invalid Quantity");

        const avgPrice = parseFloat(row["Avg Price"].replace(/,/g, ""));
        if (isNaN(avgPrice)) throw new Error("Invalid Avg Price");

        data.push({
          qcode,
          date,
          symbol: row["Symbol"],
          mastersheet_tag: row["Mastersheet Tag"],
          exchange: row["Exchange"],
          quantity,
          avg_price: avgPrice,
          broker: row["Broker"],
          debt_equity: row["Debt/Equity"],
          sub_category: row["Sub Category"],
          ltp: parseFloat(row["LTP"].replace(/,/g, "")) || 0,
          buy_value: parseFloat(row["Buy Value"].replace(/,/g, "")) || 0,
          value_as_of_today: parseFloat(row["Value as of Today"].replace(/,/g, "")) || 0,
          pnl_amount: parseFloat(row["PNL Amount"].replace(/,/g, "")) || 0,
          percent_pnl: row["% PNL"] && !["inf", "-inf"].includes(row["% PNL"].toLowerCase())
            ? parseFloat(row["% PNL"].replace(/,/g, "").replace(/%/g, ""))
            : null,
        });
      } catch (error: any) {
        failedRows.push({
          rowIndex: i + 1,
          error: error.message,
          row,
        });
      }
    }

    // Forward to backend API
    const backendUrl = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
    const backendFormData = new FormData();
    backendFormData.append("qcode", qcode);
    backendFormData.append("date", date);
    backendFormData.append("file", file);

    const backendResponse = await fetch(`${backendUrl}/api/upload/equity-holding-test/`, {
      method: "POST",
      body: backendFormData,
    });

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json().catch(() => ({}));
      return NextResponse.json(
        {
          message: errorData.detail || "Upload failed",
          totalRows: data.length + failedRows.length,
          insertedRows: 0,
          failedRows,
          columnNames: headers,
        },
        { status: backendResponse.status }
      );
    }

    const result = await backendResponse.json();

    return NextResponse.json({
      message: result.message || `${data.length} rows processed successfully`,
      totalRows: result.total_rows || data.length + failedRows.length,
      insertedRows: result.inserted_rows || data.length,
      failedRows: result.failed_rows || failedRows,
      columnNames: result.column_names || headers,
      firstError: result.first_error || (failedRows.length > 0 ? failedRows[0] : null),
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

export const config = {
  api: {
    bodyParser: false,
  },
};
