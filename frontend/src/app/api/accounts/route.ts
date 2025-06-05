// @ts-nocheck
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
      remarks = 'NA',
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
          SELECT FROM pg_sequences WHERE sequencename = 'qcode_seq'
        ) AS exists;
      `;
      if (!sequenceCheck[0].exists) {
        const maxQcodeResult = await tx.$queryRaw<{ max_qcode: number }[]>`
          SELECT MAX(CAST(SUBSTRING(qcode FROM 4) AS INTEGER)) AS max_qcode FROM accounts
        `;
        const maxQcode = maxQcodeResult[0].max_qcode || 0;
        const startValue = maxQcode + 1;

        await tx.$executeRawUnsafe(`
          CREATE SEQUENCE qcode_seq
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
        SELECT nextval('qcode_seq') AS nextval
      `;
      const sequenceValue = sequenceResult[0].nextval;
      const newQcode = `QAC${String(sequenceValue).padStart(5, '0')}`;

      // Create the account
      const account = await tx.accounts.create({
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
          remarks,
          qcode: newQcode,
          account_id: randomUUID(),
        },
      });

      // Create master sheet table
      await tx.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS master_sheet (
          id SERIAL PRIMARY KEY,
          qcode VARCHAR(20) NOT NULL,
          date DATE NOT NULL,
          portfolio_value DECIMAL(20,4),
          capital_in_out DECIMAL(20,4),
          nav DECIMAL(20,4),
          prev_nav DECIMAL(20,4),
          pnl DECIMAL(20,4),
          daily_p_l DECIMAL(20,4),
          exposure_value DECIMAL(20,4),
          prev_portfolio_value DECIMAL(20,4),
          prev_exposure_value DECIMAL(20,4),
          prev_pnl DECIMAL(20,4),
          drawdown DECIMAL(20,4),
          system_tag VARCHAR(50),
          created_at DATE DEFAULT CURRENT_DATE
        );
      `);

      // Handle user allocations
      interface UserAllocation {
        icode: string;
        date: string;
        amount?: string | number;
        access_level?: string;
      }

      // Calculate total amount for prop accounts
      let totalAmount = 0;
      if (account_type === 'prop') {
        totalAmount = user_allocations.reduce(
          (sum: number, u: UserAllocation) => sum + parseFloat(u.amount?.toString() || '0'),
          0
        );
      }

      for (const alloc of user_allocations) {
        const { icode, date, amount, access_level } = alloc;

        // Validate allocation fields
        if (!icode || !date) {
          throw new Error('Each allocation must have icode and date');
        }

        // Additional validation for prop accounts
        if (account_type === 'prop') {
          if (!amount || !access_level) {
            throw new Error(
              `Amount and access_level are required for prop account allocations (user ${icode})`
            );
          }
          const allocationAmount = parseFloat(amount.toString());
          if (isNaN(allocationAmount)) {
            throw new Error(`Invalid amount for user ${icode}`);
          }
        }

        // Verify user exists
        const user = await tx.clients.findUnique({ where: { icode } });
        if (!user) {
          throw new Error(`User with icode ${icode} does not exist`);
        }

        // Create pooled account user mapping
        await tx.pooled_account_users.create({
          data: {
            qcode: newQcode,
            icode,
            access_level: account_type === 'prop' ? access_level! : 'read',
          },
        });

        // Create or update allocation
        const allocationAmount = account_type === 'prop' ? parseFloat(amount!.toString()) : 0;
        const allocationPercent =
          account_type === 'prop' && totalAmount !== 0 ? (allocationAmount / totalAmount) * 100 : 0;

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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('POST /api/accounts error:', errorMessage);
    return NextResponse.json({ message: `❌ Error creating account: ${errorMessage}` }, { status: 500 });
  }
}

export async function GET() {
  try {
    const accounts = await prisma.accounts.findMany({
      select: {
        qcode: true,
        account_name: true,
        account_type: true,
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    return NextResponse.json(accounts);
  } catch (error) {
    console.error('GET /api/accounts error:', error);
    return NextResponse.json({ message: 'Error fetching accounts' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { qcode } = await req.json();

    // Validate required field
    if (!qcode) {
      return NextResponse.json({ message: 'Missing required field: qcode' }, { status: 400 });
    }

    // Check if account exists
    const account = await prisma.accounts.findUnique({
      where: { qcode },
      select: { qcode: true, account_type: true },
    });

    if (!account) {
      return NextResponse.json({ message: `Account with qcode ${qcode} not found` }, { status: 404 });
    }

    // Use transaction for atomic deletion
    await prisma.$transaction(async (tx) => {
      // Delete related master sheet records
      await tx.master_sheet.deleteMany({
        where: { qcode },
      });

      // Delete related account_access records
      await tx.account_access.deleteMany({
        where: {
          OR: [{ source_account_id: qcode }, { target_account_id: qcode }],
        },
      });

      // Delete related pooled account data for prop accounts
      if (account.account_type === 'prop') {
        await tx.pooled_account_users.deleteMany({
          where: { qcode },
        });
        await tx.pooled_account_allocations.deleteMany({
          where: { qcode },
        });
      }

      // Delete the account
      await tx.accounts.delete({
        where: { qcode },
      });
    });

    return NextResponse.json({ message: `Account ${qcode} deleted successfully` });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('DELETE /api/accounts error:', errorMessage);
    return NextResponse.json({ message: `❌ Error deleting account: ${errorMessage}` }, { status: 500 });
  }
}