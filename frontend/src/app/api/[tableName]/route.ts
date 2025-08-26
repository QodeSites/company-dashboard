// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { parse } from 'csv-parse';
import { tableConfigs } from '@/lib/tableConfigs';
import { z } from 'zod';
import { Readable } from 'stream';

// Schema for query parameters
const GetQuerySchema = z.object({
  qcode: z.string().min(1),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  chart: z.string().optional(),
});

// Schema for CSV upload
const PostBodySchema = z.instanceof(FormData);

// Validate and parse date
function parseDate(value: string, tableName: string): Date {
  const isTradebook = tableName === 'tradebook';
  const formatRegex = isTradebook ? /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/;
  if (!formatRegex.test(value)) {
    throw new Error(`Invalid date format: ${value}. Expected ${isTradebook ? 'YYYY-MM-DD HH:MM:SS' : 'YYYY-MM-DD'}`);
  }
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date;
}

// Map CSV column names to Prisma schema field names
const columnToFieldMap: Record<string, Record<string, string>> = {
  master_sheet: {
    'date': 'date',
    'portfolio value': 'portfolio_value',
    'Cash In/Out': 'capital_in_out',
    'nav': 'nav',
    'prev nav': 'prev_nav',
    'pnl': 'pnl',
    'Daily P/L %': 'daily_p_l',
    'exposure value': 'exposure_value',
    'prev portfolio value': 'prev_portfolio_value',
    'prev exposure value': 'prev_exposure_value',
    'prev pnl': 'prev_pnl',
    'drawdown': 'drawdown',
    'system tag': 'system_tag',
  },
  tradebook: {
    'timestamp entry': 'timestamp_entry',
    'system tag entry': 'system_tag_entry',
    'action entry': 'action_entry',
    'symbol entry': 'symbol_entry',
    'price entry': 'price_entry',
    'qty entry': 'qty_entry',
    'contract value entry': 'contract_value_entry',
    'timestamp exit': 'timestamp_exit',
    'system tag exit': 'system_tag_exit',
    'action exit': 'action_exit',
    'symbol exit': 'symbol_exit',
    'price exit': 'price_exit',
    'qty exit': 'qty_exit',
    'contract value exit': 'contract_value_exit',
    'pnl amount': 'pnl_amount',
    'pnl amount settlement': 'pnl_amount_settlement',
    'status': 'status',
  },
  slippage: {
    'date': 'date',
    'account': 'account',
    'system tag': 'system_tag',
    'capital in out': 'capital_in_out',
    'status': 'status',
  },
  mutual_fund_holding: {
    'date': 'date',
    'trade type': 'trade_type',
    'symbol': 'symbol',
    'isin': 'isin',
    'quantity': 'quantity',
    'price': 'price',
    'broker': 'broker',
    'debt equity': 'debt_equity',
    'collateral': 'collateral',
    'sub category': 'sub_category',
    'status': 'status',
  },
  gold_tradebook: {
    'date': 'date',
    'trade type': 'trade_type',
    'symbol': 'symbol',
    'expiry': 'expiry',
    'exchange': 'exchange',
    'quantity': 'quantity',
    'lotsize': 'lotsize',
    'no of lots': 'no_of_lots',
    'price': 'price',
    'exposure': 'exposure',
    'status': 'status',
  },
  liquidbees_tradebook: {
    'date': 'date',
    'trade type': 'trade_type',
    'symbol': 'symbol',
    'exchange': 'exchange',
    'quantity': 'quantity',
    'price': 'price',
    'broker': 'broker',
    'debt equity': 'debt_equity',
    'collateral': 'collateral',
    'sub category': 'sub_category',
    'status': 'status',
  },
  equity_holding: {
    'symbol': 'symbol',
    'mastersheet tag': 'mastersheet_tag',
    'exchange': 'exchange',
    'quantity': 'quantity',
    'avg price': 'avg_price',
    'broker': 'broker',
    'debt/equity': 'debt_equity',
    'sub category': 'sub_category',
    'ltp': 'ltp',
    'buy value': 'buy_value',
    'value as of today': 'value_as_of_today',
    'pnl amount': 'pnl_amount',
    '% pnl': 'percent_pnl',
  },
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ tableName: string }> }) {
  const { tableName } = await params;
  if (!tableConfigs[tableName]) {
    return NextResponse.json({ message: 'Invalid table name' }, { status: 400 });
  }

  try {
    const query = GetQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    const { qcode, page, pageSize, search, start, end, chart } = query;

    const model = tableConfigs[tableName].model;
    const dateField = tableConfigs[tableName].dateField;

    // Validate model exists
    if (!prisma[model]) {
      return NextResponse.json({ message: `Invalid model: ${model}` }, { status: 400 });
    }

    const where: any = { qcode };
    if (search) {
      where.system_tag = { contains: search, mode: 'insensitive' };
    }
    if (start && end) {
      where[dateField] = {
        gte: parseDate(start, tableName),
        lte: parseDate(end, tableName),
      };
    }

    const selectFields = tableConfigs[tableName].requiredColumns.reduce((acc, col) => {
      const fieldName = columnToFieldMap[tableName][col.toLowerCase()] || col.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/ /g, '_');
      acc[fieldName] = true;
      return acc;
    }, { id: true, qcode: true, [dateField]: true } as any);

    const [data, total] = await Promise.all([
      prisma[model].findMany({
        where,
        select: selectFields,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [dateField]: 'desc' },
      }),
      prisma[model].count({ where }),
    ]);

    // For chart data (master_sheet only)
    if (chart && tableName === 'master_sheet') {
      const chartData = await prisma.master_sheet.findMany({
        where,
        select: { date: true, nav: true },
        orderBy: { date: 'asc' },
      });
      return NextResponse.json({ data: chartData, total });
    }

    return NextResponse.json({ data, total });
  } catch (error) {
    console.error(`GET /api/${tableName} error:`, error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: 'Invalid query parameters', errors: error.errors }, { status: 400 });
    }
    return NextResponse.json({ message: 'Internal server error', error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ tableName: string }> }) {
  const { tableName } = await params;
  if (!tableConfigs[tableName]) {
    return NextResponse.json({ message: 'Invalid table name' }, { status: 400 });
  }

  try {
    const formData = await req.formData();
    const qcode = formData.get('qcode');
    const file = formData.get('file');
    const startDate = formData.get('startDate');
    const endDate = formData.get('endDate');

    if (!qcode || typeof qcode !== 'string') {
      return NextResponse.json({ message: 'Missing or invalid qcode' }, { status: 400 });
    }

    if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.csv')) {
      return NextResponse.json({ message: 'Invalid file: CSV required' }, { status: 400 });
    }

    const requiredColumns = tableConfigs[tableName].requiredColumns.map(col => col.toLowerCase());
    const dateField = tableConfigs[tableName].dateField;
    const model = tableConfigs[tableName].model;
    const isTradebook = tableName === 'tradebook';

    // Validate model exists
    if (!prisma[model]) {
      return NextResponse.json({ message: `Invalid model: ${model}` }, { status: 400 });
    }

    const csvText = await file.text();
    const records: any[] = [];
    const failedRows: Array<{ rowIndex: number; error: string; row: Record<string, unknown> }> = [];
    let columnNames: string[] = [];

    const parser = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });
    let rowIndex = 1;

    for await (const record of parser) {
      rowIndex++;
      const row: Record<string, string> = {};
      // Map CSV headers to schema fields
      for (const [key, value] of Object.entries(record)) {
        const normalizedKey = key.toLowerCase();
        const fieldName = columnToFieldMap[tableName][normalizedKey] || normalizedKey.replace(/[^a-z0-9 ]/g, '').replace(/ /g, '_');
        row[fieldName] = value;
      }

      // Normalize headers for validation
      const headers = Object.keys(row).map(h => h.toLowerCase());
      if (rowIndex === 2) {
        columnNames = Object.keys(record);
        const missingColumns = requiredColumns.filter(col => !headers.includes(columnToFieldMap[tableName][col] || col.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/ /g, '_')) && (tableName !== 'tradebook' || col !== 'status'));
        if (missingColumns.length) {
          return NextResponse.json({
            message: `Missing required columns: ${missingColumns.join(', ')}`,
            columnNames,
          }, { status: 400 });
        }
      }

      // Validate date
      const dateValue = row[dateField];
      try {
        if (dateValue) {
          parseDate(dateValue, tableName);
          if (startDate && endDate) {
            const rowDate = new Date(dateValue);
            const start = new Date(startDate as string);
            const end = new Date(endDate as string);
            if (rowDate < start || rowDate > end) {
              failedRows.push({ rowIndex, error: `Date ${dateValue} outside range ${startDate} to ${endDate}`, row });
              continue;
            }
          }
        }
      } catch (error) {
        failedRows.push({ rowIndex, error: `Invalid date: ${dateValue}`, row });
        continue;
      }

      // Prepare record for insertion
      const formattedRecord: any = { qcode };
      requiredColumns.forEach(col => {
        const fieldName = columnToFieldMap[tableName][col.toLowerCase()] || col.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/ /g, '_');
        const value = row[fieldName];
        if (fieldName === dateField) {
          formattedRecord[fieldName] = value ? new Date(value) : null;
        } else if (['nav', 'portfolio_value', 'capital_in_out', 'prev_nav', 'pnl', 'daily_p_l', 'exposure_value', 'prev_portfolio_value', 'prev_exposure_value', 'prev_pnl', 'drawdown', 'price_entry', 'contract_value_entry', 'price_exit', 'contract_value_exit', 'pnl_amount', 'pnl_amount_settlement', 'price', 'quantity', 'capital_in_out', 'exposure', 'total_percent', 'units', 'rate', 'value', 'total'].includes(fieldName)) {
          formattedRecord[fieldName] = value ? parseFloat(value) || null : null;
        } else if (['qty_entry', 'qty_exit', 'quantity', 'lotsize', 'no_of_lots'].includes(fieldName)) {
          formattedRecord[fieldName] = value ? parseInt(value) || null : null;
        } else {
          formattedRecord[fieldName] = value || null;
        }
      });

      records.push(formattedRecord);
    }

    if (records.length === 0 && failedRows.length === 0) {
      return NextResponse.json({ message: 'No valid rows found in CSV', columnNames }, { status: 400 });
    }

    // Batch insert
    let insertedRows = 0;
    const batchSize = 1000;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      try {
        await prisma[model].createMany({
          data: batch,
          skipDuplicates: true,
        });
        insertedRows += batch.length;
      } catch (error) {
        console.error(`Batch insert error at rows ${i + 1}-${i + batch.length}:`, error);
        batch.forEach((row, idx) => {
          failedRows.push({ rowIndex: i + idx + 2, error: 'Failed to insert row', row });
        });
      }
    }

    const firstError = failedRows[0] ? {
      error: failedRows[0].error,
      rowIndex: failedRows[0].rowIndex,
      rawDate: failedRows[0].row[dateField] || '',
      rawSystemTag: failedRows[0].row.system_tag || '',
    } : undefined;

    return NextResponse.json({
      message: `Processed ${records.length + failedRows.length} rows. Inserted ${insertedRows} rows.`,
      totalRows: records.length + failedRows.length,
      insertedRows,
      failedRows: failedRows.length > 0 ? failedRows : undefined,
      firstError,
      columnNames,
    });
  } catch (error) {
    console.error(`POST /api/${tableName} error:`, error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: 'Invalid form data', errors: error.errors }, { status: 400 });
    }
    return NextResponse.json({ message: 'Internal server error', error: (error as Error).message }, { status: 500 });
  }
}