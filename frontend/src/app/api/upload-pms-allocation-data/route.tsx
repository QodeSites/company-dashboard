// @ts-nocheck
import { NextResponse } from "next/server";
import { createDbPool } from "@/lib/db";
import { parse } from "csv-parse/sync";
import { readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import * as XLSX from "xlsx";
import { v4 as uuidv4 } from "uuid";

// Configure logging
const log = (level, message) => {
  console.log(`${new Date().toISOString()} - ${level} - ${message}`);
};

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Handle OPTIONS request for CORS preflight
export async function OPTIONS(req) {
  return NextResponse.json({}, { headers: corsHeaders });
}

/**
 * Safely parse a numeric value, handling comma-separated numbers
 * @param {any} value - Value to parse
 * @returns {number|null} - Parsed number or null
 */
function parseNumericValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  // Convert to string to safely handle all input types
  const strValue = String(value);

  // Remove commas and parse as float
  return parseFloat(strValue.replace(/,/g, '')) || null;
}

/**
 * Convert Excel file to CSV format with proper number handling
 * @param {string} filePath - Path to Excel file
 * @returns {string} - CSV content as string
 */
function convertExcelToCsv(filePath) {
  try {
    // Read the Excel file
    const workbook = XLSX.read(readFileSync(filePath), { type: "buffer" });

    // Get the first sheet
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];

    // First convert to JSON to properly handle numeric values
    const jsonData = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true, // Keep as raw numbers (important!)
      defval: "",
      blankrows: false
    });

    log("DEBUG", `First row from Excel: ${JSON.stringify(jsonData[0])}`);
    log("DEBUG", `Sample numeric data: ${JSON.stringify(jsonData.slice(1, 3))}`);

    // Convert the JSON data back to CSV manually to ensure proper number handling
    const csvContent = jsonData.map(row => {
      return row.map(cell => {
        // Handle cells that contain commas by quoting them
        if (typeof cell === 'string' && cell.includes(',')) {
          return `"${cell}"`;
        }
        // Keep numeric values as is without formatting
        return cell;
      }).join(',');
    }).join('\n');

    log("INFO", "Successfully converted Excel to CSV format");
    return csvContent;
  } catch (error) {
    log("ERROR", `Failed to convert Excel to CSV: ${error.message}`);
    throw new Error(`Excel conversion failed: ${error.message}`);
  }
}

// POST API to handle file upload and data replacement
export async function POST(req) {
  try {
    // Parse FormData to get the uploaded file, database name, and strategy_code
    const formData = await req.formData();
    const file = formData.get("file");
    const databaseName = process.env.PG_QODEPORTFOLIO_DATABASE;
    const strategyCode = formData.get("strategy_code");

    if (!databaseName) {
      log("ERROR", "No database name provided.");
      return NextResponse.json(
        { error: "Database name is required." },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!strategyCode) {
      log("ERROR", "No strategy code provided.");
      return NextResponse.json(
        { error: "Strategy code is required." },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!file || !(file instanceof File)) {
      log("ERROR", "No file uploaded or invalid file.");
      return NextResponse.json(
        { error: "No file uploaded or invalid file." },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate file type
    const fileName = file.name;
    const fileExtension = fileName.split(".").pop().toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(fileExtension)) {
      log("ERROR", `Unsupported file format: ${fileExtension}`);
      return NextResponse.json(
        { error: "Unsupported file format. Please upload a CSV or Excel file." },
        { status: 400, headers: corsHeaders }
      );
    }

    log("INFO", `Received file: ${fileName}, extension: ${fileExtension}, database: ${databaseName}, strategy: ${strategyCode}`);

    // Save the file temporarily
    const tempDir = tmpdir();
    const tempFilePath = join(tempDir, `${uuidv4()}.${fileExtension}`);
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(tempFilePath, fileBuffer);
    log("INFO", `Saved temporary file: ${tempFilePath}`);

    // Process file based on extension - convert Excel to CSV first if needed
    let fileContent;

    if (["xlsx", "xls"].includes(fileExtension)) {
      fileContent = convertExcelToCsv(tempFilePath);
      log("DEBUG", `Excel converted to CSV: first 100 chars: ${fileContent.substring(0, 100)}`);
    } else {
      fileContent = readFileSync(tempFilePath, "utf-8");
      log("DEBUG", `CSV read directly: first 100 chars: ${fileContent.substring(0, 100)}`);
    }

    // Split into lines for further processing
    const lines = fileContent.split("\n");
    const headerRow = lines[0];

    log("DEBUG", `First 5 lines of content:\n${lines.slice(0, 5).join("\n")}`);

    // Extract account IDs and names from headers
    const pattern = /(\d+)\s*-\s*([^-]+)\s*-\s*(Q[A-Z]{2,3}\d+)/g;
    const accounts = [];
    let match;
    while ((match = pattern.exec(headerRow))) {
      accounts.push({
        AccountNumber: match[1].trim(),
        ClientName: match[2].trim(),
        AccountID: match[3].trim(),
      });
    }

    if (!accounts.length) {
      log("ERROR", "No accounts found in header row.");
      return NextResponse.json(
        { error: "No accounts found in header row. Check file header format." },
        { status: 400, headers: corsHeaders }
      );
    }

    log("INFO", `Found ${accounts.length} accounts: ${JSON.stringify(accounts)}`);

    // Generate qcode mapping
    const qcodeMapping = accounts.reduce((acc, account, i) => {
      acc[account.AccountID] = `QAC${String(i + 1).padStart(4, "0")}`;
      return acc;
    }, {});
    log("INFO", `Qcode mapping: ${JSON.stringify(qcodeMapping)}`);

    // Parse CSV content
    let records;
    try {
      records = parse(fileContent, {
        skip_lines_with_error: true,
        skip_empty_lines: true,
        trim: true,
        from_line: 4,
        relax_column_count: true,
      });
    } catch (parseError) {
      log("ERROR", `CSV parsing error: ${parseError.message}`);
      const problematicLine = lines[6];
      log("DEBUG", `Problematic line (line 7): ${problematicLine}`);
      return NextResponse.json(
        { error: `CSV parsing error: ${parseError.message}` },
        { status: 400, headers: corsHeaders }
      );
    }

    // Process data
    const allData = [];
    let currentAssetClass = null;
    let currentSector = null;

    for (const [idx, row] of records.entries()) {
      const rawAstclass = row[0] || "NaN";
      if (idx < 5) {
        log("DEBUG", `Row ${idx}: Raw data = ${JSON.stringify(row)}`);
      }

      if (row[0] && row[0].trim()) {
        currentAssetClass = row[0].trim();
        log("DEBUG", `Row ${idx}: Updated AssetClass to ${currentAssetClass}`);
      }
      if (row[1] && row[1].trim()) {
        currentSector = row[1].trim();
        log("DEBUG", `Row ${idx}: Updated Sector to ${currentSector}`);
      }

      const symbolName = row[2] || "";
      const units = parseNumericValue(row[3]);
      const rate = parseNumericValue(row[4]);
      const totalPercentage = parseNumericValue(row[5]);

      if (!symbolName) {
        log("DEBUG", `Row ${idx}: Skipped due to empty SymbolName`);
        continue;
      }

      let colIdx = 6;
      let accountIdx = 0;

      while (colIdx < row.length - 1 && accountIdx < accounts.length) {
        const percentage = parseNumericValue(row[colIdx]);
        const value = parseNumericValue(row[colIdx + 1]);

        if (percentage !== null || value !== null) {
          const account = accounts[accountIdx];
          if (!currentAssetClass) {
            log("WARNING", `Row ${idx}: AssetClass is null for ${symbolName}, Account ${account.AccountID}`);
            continue;
          }

          allData.push({
            AccountID: account.AccountID,
            AccountNumber: account.AccountNumber,
            ClientName: account.ClientName,
            AssetClass: currentAssetClass,
            Sector: currentSector,
            SymbolName: symbolName,
            Units: units,
            Rate: rate,
            TotalPercentage: totalPercentage,
            Percentage: percentage,
            Value: value,
          });
        }

        colIdx += 2;
        accountIdx += 1;
      }
    }

    if (!allData.length) {
      log("ERROR", "No data generated after processing file.");
      return NextResponse.json(
        { error: "No data generated from file." },
        { status: 400, headers: corsHeaders }
      );
    }

    log("DEBUG", `First item: ${JSON.stringify(allData[0])}`);
    log("INFO", `Processed ${allData.length} data rows`);

    // Initialize database connection
    const { pool, query } = createDbPool(databaseName);

    // Replace data in the database for the specific strategy_code
    const currentDate = new Date().toISOString().split("T")[0];
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Delete data only for the specified strategy_code
      await client.query(
        "DELETE FROM public.allocation_table_pms WHERE strategy_code = $1",
        [strategyCode]
      );
      log("INFO", `Deleted existing data for strategy_code: ${strategyCode}`);

      // Insert new data
      const insertQuery = `
        INSERT INTO public.allocation_table_pms (
          date, stock_name, asset_class, sector, strategy_code, qcode,
          custodian_code, total_percent, units, rate, value, total, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `;

      for (const [idx, row] of allData.entries()) {
        if (!row.AccountID) {
          log("ERROR", `Row ${idx}: Missing AccountID in row: ${JSON.stringify(row)}`);
          continue;
        }

        if (!row.AssetClass) {
          log("ERROR", `Row ${idx}: AssetClass is null or empty for ${row.SymbolName}, skipping`);
          continue;
        }

        const qcode = qcodeMapping[row.AccountID] || "UNKNOWN";

        const data = [
          currentDate,
          row.SymbolName,
          row.AssetClass,
          row.Sector || null,
          strategyCode,
          qcode,
          row.AccountID,
          row.TotalPercentage || 0.0,
          row.Units || 0.0,
          row.Rate || 0.0,
          row.Value || 0.0,
          row.Percentage || 0.0,
          new Date(),
        ];

        await client.query(insertQuery, data);
        log("DEBUG", `Inserted row ${idx} for ${row.SymbolName}, Qcode: ${qcode}`);
      }

      await client.query("COMMIT");
      log("INFO", `Successfully inserted ${allData.length} rows for strategy_code: ${strategyCode}`);
    } catch (dbError) {
      await client.query("ROLLBACK");
      log("ERROR", `Error inserting data: ${dbError.message}`);
      return NextResponse.json(
        { error: `Database error: ${dbError.message}` },
        { status: 500, headers: corsHeaders }
      );
    } finally {
      client.release();
      await pool.end();
    }

    // Log sample data for debugging (first 10 rows)
    console.log(allData.slice(0, 10));

    return NextResponse.json(
      { message: `Successfully processed and inserted ${allData.length} rows for strategy ${strategyCode}.` },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    log("ERROR", `Error processing request: ${error.message}`);
    return NextResponse.json(
      { error: `Server error: ${error.message}` },
      { status: 500, headers: corsHeaders }
    );
  }
}