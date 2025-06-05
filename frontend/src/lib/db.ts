import { Pool, QueryResult } from "pg";
import { types as pgTypes } from "pg";

// Factory function to create a database connection pool
export const createDbPool = (database: string) => {
  // Create a connection pool with the provided database name
  const pool = new Pool({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database, // Use the provided database name
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT ? parseInt(process.env.PG_PORT) : 5432,
  });

  // Set timezone to UTC on connect
  pool.on("connect", (client) => {
    client.query('SET timezone = "UTC"');
  });

  // Ensure DATE fields are returned as strings
  pgTypes.setTypeParser(pgTypes.builtins.DATE, (val: string) => val);

  // Custom query function with type support
  const query = async <T = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> => {
    const start = Date.now();
    const res = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    console.log("executed query", { text, duration, rows: res.rowCount });
    return res;
  };

  // Return both the pool and query function
  return { pool, query };
};