import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      account_name,
      broker,
      account_type,
      user_allocations,
      email_linked,
      contact_number,
      login_id,
      login_password,
      totp_secret,
      api_details,
      nominees,
      aadhar,
      pan,
    } = body;

    // Validate required fields
    if (!account_name || !broker || !account_type) {
      return NextResponse.json(
        { message: 'Missing required fields: account_name, broker, account_type' },
        { status: 400 }
      );
    }

    if (!['pms', 'managed_account', 'prop'].includes(account_type)) {
      return NextResponse.json(
        { message: "Invalid account_type. Must be 'pms', 'managed_account', or 'prop'" },
        { status: 400 }
      );
    }

    // Validate user allocations (required for all account types)
    if (!user_allocations || !Array.isArray(user_allocations) || user_allocations.length === 0) {
      return NextResponse.json(
        { message: 'user_allocations is required and must be a non-empty array' },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // Check if sequence exists, create if it doesn't
      const sequenceCheck = await tx.$queryRaw<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT FROM pg_sequences WHERE sequencename = 'account_qcode_seq'
        ) AS exists;
      `;
      if (!sequenceCheck[0].exists) {
        // Get max qcode value to set sequence start
        const maxQcodeResult = await tx.$queryRaw<{ max_qcode: number }[]>`
          SELECT MAX(CAST(SUBSTRING(qcode FROM 4) AS INTEGER)) AS max_qcode FROM accounts
        `;
        const maxQcode = maxQcodeResult[0].max_qcode || 0;
        const startValue = maxQcode + 1;

        await tx.$executeRawUnsafe(`
          CREATE SEQUENCE account_qcode_seq
            START WITH ${startValue}
            INCREMENT BY 1
            NO MINVALUE
            NO MAXVALUE
            CACHE 1;
        `);
      }

      // Acquire advisory lock to prevent race conditions
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(12345);`;

      // Get the next sequence value
      const sequenceResult = await tx.$queryRaw<{ nextval: number }[]>`
        SELECT nextval('account_qcode_seq') AS nextval
      `;
      const sequenceValue = sequenceResult[0].nextval;
      const newQcode = `QAC${String(sequenceValue).padStart(5, '0')}`;

      // Create the account
      const account = await tx.account.create({
        data: {
          account_name,
          broker,
          account_type,
          email_linked,
          contact_number,
          login_id,
          login_password,
          totp_secret,
          api_details,
          nominees,
          aadhar,
          pan,
          qcode: newQcode,
          account_id: randomUUID(),
        },
      });

      // Create master sheet table
      const tableName = `master_sheet_${newQcode.toLowerCase()}`;
      await tx.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id SERIAL PRIMARY KEY,
          qcode VARCHAR(20) NOT NULL,
          date DATE NOT NULL,
          portfolio_value NUMERIC(20,4),
          capital_in_out NUMERIC(20,4),
          nav NUMERIC(20,4),
          prev_nav NUMERIC(20,4),
          pnl NUMERIC(20,4),
          daily_p_l NUMERIC(20,4),
          exposure_value NUMERIC(20,4),
          prev_portfolio_value NUMERIC(20,4),
          prev_exposure_value NUMERIC(20,4),
          prev_pnl NUMERIC(20,4),
          drawdown NUMERIC(20,4),
          system_tag VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Handle user allocations for all account types
      const totalAmount = user_allocations.reduce(
        (sum: number, u: any) => sum + parseFloat(u.amount || 0),
        0
      );

      for (const alloc of user_allocations) {
        const { icode, date, amount, access_level } = alloc;

        if (!icode || !date || !amount || !access_level) {
          throw new Error('Each allocation must have icode, date, amount, and access_level');
        }

        const allocationAmount = parseFloat(amount);
        if (isNaN(allocationAmount)) {
          throw new Error(`Invalid amount for user ${icode}`);
        }

        // Verify user exists
        const user = await tx.user.findUnique({ where: { icode } });
        if (!user) {
          throw new Error(`User with icode ${icode} does not exist`);
        }

        // Create pooled account user mapping
        await tx.pooledAccountUser.create({
          data: {
            qcode: newQcode,
            icode,
            access_level: access_level || 'read',
          },
        });

        // Create or update allocation (merged from pooled-allocations)
        const allocationPercent = totalAmount !== 0 ? (allocationAmount / totalAmount) * 100 : 0;
        await tx.pooled_account_allocations.upsert({
          where: {
            qcode_icode_allocation_date: {
              qcode: newQcode,
              icode,
              allocation_date: new Date(date),
            },
          },
          update: {
            contribution_amount: allocationAmount,
            allocation_percent: allocationPercent,
          },
          create: {
            qcode: newQcode,
            icode,
            allocation_date: new Date(date),
            contribution_amount: allocationAmount,
            allocation_percent: allocationPercent,
          },
        });
      }

      return account;
    });

    return NextResponse.json({ message: 'Account created with master sheet and allocations!', account: result });
  } catch (error: any) {
    console.error('POST /api/accounts error:', error);
    return NextResponse.json({ message: `❌ Error creating account: ${error.message}` }, { status: 500 });
  }
}


// ========== Fetch All Accounts ==========
export async function GET() {
  try {
    const accounts = await prisma.account.findMany({
      select: {
        qcode: true,
        account_name: true,
        account_type: true,
      },
      orderBy: {
        created_at: "desc",
      },
    });

    return NextResponse.json(accounts);
  } catch (error) {
    console.error('GET /api/accounts error:', error);
    return NextResponse.json({ message: "Error fetching accounts" }, { status: 500 });
  }
}

// ========== Delete an Account ==========
export async function DELETE(req: NextRequest) {
  try {
    const { qcode } = await req.json();

    // Validate required field
    if (!qcode) {
      return NextResponse.json(
        { message: "Missing required field: qcode" },
        { status: 400 }
      );
    }

    // Check if account exists
    const account = await prisma.account.findUnique({
      where: { qcode },
      select: { qcode: true, account_type: true },
    });

    if (!account) {
      return NextResponse.json(
        { message: `Account with qcode ${qcode} not found` },
        { status: 404 }
      );
    }

    // Use transaction for atomic deletion
    await prisma.$transaction(async (tx) => {
      // Drop the master sheet table
      const tableName = `master_sheet_${qcode.toLowerCase()}`;
      await tx.$executeRawUnsafe(`DROP TABLE IF EXISTS ${tableName};`);

      // Delete related AccountAccess records
      await tx.accountAccess.deleteMany({
        where: {
          OR: [
            { source_account_id: qcode },
            { target_account_id: qcode },
          ],
        },
      });

      // Delete related pooled account data for prop accounts
      if (account.account_type === 'prop') {
        await tx.pooledAccountUser.deleteMany({
          where: { qcode },
        });
        await tx.pooled_account_allocations.deleteMany({
          where: { qcode },
        });
      }

      // Delete the account
      await tx.account.delete({
        where: { qcode },
      });
    });

    return NextResponse.json({ message: `Account ${qcode} deleted successfully` });
  } catch (error: any) {
    console.error('DELETE /api/accounts error:', error);
    return NextResponse.json(
      { message: `❌ Error deleting account: ${error.message}` },
      { status: 500 }
    );
  }
}