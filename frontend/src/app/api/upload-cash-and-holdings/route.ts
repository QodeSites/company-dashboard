// @ts-nocheck
import { NextResponse } from "next/server";
import { createDbPool } from "@/lib/db";

// Configure logging
const log = (level: string, message: string) => {
  console.log(`${new Date().toISOString()} - ${level} - ${message}`);
};

export async function POST(req: Request) {
  try {
    // Get database name from environment variable or request body
    let databaseName = process.env.PG_DATABASE;
    const body = await req.json();
    const { cash = [], holdings = [], database } = body;

    // Override databaseName if provided in the request body
    if (database) {
      databaseName = database;
    }

    if (!databaseName) {
      log("ERROR", "No database name provided.");
      return NextResponse.json({ error: "Database name is required." }, { status: 400 });
    }

    log("INFO", `Processing request for database: ${databaseName}`);

    // Initialize database connection
    const { pool, query } = createDbPool(databaseName);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // --- CASH ---
      if (cash.length > 0) {
        await client.query("DELETE FROM pms_clients_tracker.managed_portfolio_master");
        log("INFO", "Deleted all data from managed_portfolio_master");

        for (const row of cash) {
          await client.query(
            `INSERT INTO pms_clients_tracker.managed_portfolio_master (
              account_code, scheme, current_portfolio_value, total_profit, returns
            ) VALUES ($1, $2, $3, $4, $5)`,
            [
              row.accountCode,
              row.scheme,
              row.capitalInOut,
              row.dividend,
              row.xirr,
            ]
          );
          log("DEBUG", `Inserted cash row for account_code: ${row.accountCode}`);
        }
      } else {
        log("INFO", "No cash data provided, skipping managed_portfolio_master operations");
      }

      // --- HOLDINGS ---
      if (holdings.length > 0) {
        await client.query("DELETE FROM pms_clients_tracker.managed_accounts_holdings");
        log("INFO", "Deleted all data from managed_accounts_holdings");

        for (const row of holdings) {
          const entryDate = new Date(row.entry_date).toISOString().split("T")[0];

          await client.query(
            `INSERT INTO pms_clients_tracker.managed_accounts_holdings (
              entry_date, "o/c", stock, qty, buy_price, sell_price,
              account, account_code, type, scheme, id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              entryDate,
              row.oc,
              row.stock,
              row.qty,
              row.buy_price,
              row.sell_price,
              row.account,
              row.account_code,
              row.type,
              row.scheme,
              row.id,
            ]
          );
          log("DEBUG", `Inserted holdings row for stock: ${row.stock}, account_code: ${row.account_code}`);
        }
      } else {
        log("INFO", "No holdings data provided, skipping managed_accounts_holdings operations");
      }

      await client.query("COMMIT");
      log("INFO", "Successfully committed database operations");
    } catch (dbError) {
      await client.query("ROLLBACK");
      log("ERROR", `Database error: ${dbError.message}`);
      return NextResponse.json({ error: `Database error: ${dbError.message}` }, { status: 500 });
    } finally {
      client.release();
      await pool.end();
      log("INFO", "Closed database connection pool");
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    log("ERROR", `Error processing request: ${error.message}`);
    return NextResponse.json({ error: `Server error: ${error.message}` }, { status: 500 });
  }
}



export async function GET(req: Request) {
  try {
    // Get database name from environment variable or query parameter
    let databaseName = process.env.PG_DATABASE;
    const url = new URL(req.url);
    const database = url.searchParams.get("database");

    // Override databaseName if provided in the query parameter
    if (database) {
      databaseName = database;
    }

    if (!databaseName) {
      log("ERROR", "No database name provided for GET request.");
      return NextResponse.json({ error: "Database name is required." }, { status: 400 });
    }

    log("INFO", `Processing GET request for database: ${databaseName}`);

    // Initialize database connection
    const { pool, query } = createDbPool(databaseName);
    const client = await pool.connect();

    try {
      // Execute the query from the previous request
      const result = await client.query(`
        SELECT 
          date, 
          account_code, 
          scheme, 
          capital_in_out, 
          dividend, 
          id,
          CASE 
            WHEN capital_in_out <> 0 OR dividend <> 0 THEN 'Active'
            ELSE 'Inactive'
          END AS active_inactive
        FROM pms_clients_tracker.managed_accounts_cash_in_out
      `);

      log("INFO", `Fetched ${result.rowCount} records from managed_accounts_cash_in_out`);

      return NextResponse.json({
        success: true,
        data: result.rows,
      });
    } catch (dbError) {
      log("ERROR", `Database error in GET request: ${dbError.message}`);
      return NextResponse.json({ error: `Database error: ${dbError.message}` }, { status: 500 });
    } finally {
      client.release();
      await pool.end();
      log("INFO", "Closed database connection pool for GET request");
    }
  } catch (error) {
    log("ERROR", `Error processing GET request: ${error.message}`);
    return NextResponse.json({ error: `Server error: ${error.message}` }, { status: 500 });
  }
}



export async function PUT(req: Request) {
  try {
    // Get database name from environment variable or request body
    let databaseName = process.env.PG_DATABASE;
    const body = await req.json();
    const { cashInOut = [], database } = body;

    // Override databaseName if provided in the request body
    if (database) {
      databaseName = database;
    }

    if (!databaseName) {
      log("ERROR", "No database name provided for PUT request.");
      return NextResponse.json({ error: "Database name is required." }, { status: 400 });
    }

    if (cashInOut.length === 0) {
      log("ERROR", "No cash in/out data provided for update.");
      return NextResponse.json({ error: "Cash in/out data is required." }, { status: 400 });
    }

    log("INFO", `Processing PUT request for database: ${databaseName}`);

    // Initialize database connection
    const { pool, query } = createDbPool(databaseName);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Update each row in managed_accounts_cash_in_out
      for (const row of cashInOut) {
        await client.query(
          `UPDATE pms_clients_tracker.managed_accounts_cash_in_out
           SET date = $1, account_code = $2, scheme = $3, capital_in_out = $4, dividend = $5, active_inactive = $6
           WHERE id = $7`,
          [
            row.date,
            row.account_code,
            row.scheme,
            row.capital_in_out,
            row.dividend,
            row.active_inactive,
            row.id,
          ]
        );
        log("DEBUG", `Updated cash in/out row for id: ${row.id}`);
      }

      await client.query("COMMIT");
      log("INFO", "Successfully committed database updates");
    } catch (dbError) {
      await client.query("ROLLBACK");
      log("ERROR", `Database error in PUT request: ${dbError.message}`);
      return NextResponse.json({ error: `Database error: ${dbError.message}` }, { status: 500 });
    } finally {
      client.release();
      await pool.end();
      log("INFO", "Closed database connection pool for PUT request");
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    log("ERROR", `Error processing PUT request: ${error.message}`);
    return NextResponse.json({ error: `Server error: ${error.message}` }, { status: 500 });
  }
}