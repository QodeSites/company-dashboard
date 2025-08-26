


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
      custodian_codes,
      zerodha_details, // New field for Zerodha specific data
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

    // Validate custodian codes for PMS accounts
    if (account_type === 'pms') {
      if (!custodian_codes || !Array.isArray(custodian_codes) || custodian_codes.length === 0) {
        return NextResponse.json(
          { message: 'custodian_codes is required and must be a non-empty array for PMS accounts' },
          { status: 400 }
        );
      }
      // Ensure all codes are non-empty strings
      const validCodes = custodian_codes.filter((code: any) => typeof code === 'string' && code.trim() !== '');
      if (validCodes.length === 0) {
        return NextResponse.json(
          { message: 'At least one valid, non-empty custodian code is required for PMS accounts' },
          { status: 400 }
        );
      }
    }

    // Validate Zerodha details for Managed Account + Zerodha combination
    if (account_type === 'managed_account' && broker === 'zerodha') {
      if (!zerodha_details) {
        return NextResponse.json(
          { message: 'Zerodha details are required for Managed Account with Zerodha broker' },
          { status: 400 }
        );
      }

      const { account_id, aadhar: zerodha_aadhar, pan: zerodha_pan, email, password } = zerodha_details;

      if (!account_id || !zerodha_aadhar || !zerodha_pan || !email ) {
        return NextResponse.json(
          { message: 'All Zerodha details are required: account_id, aadhar, pan, email, password' },
          { status: 400 }
        );
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json(
          { message: 'Invalid email format for Zerodha email' },
          { status: 400 }
        );
      }

      // Basic PAN validation (format: ABCDE1234F)
      const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
      if (!panRegex.test(zerodha_pan)) {
        return NextResponse.json(
          { message: 'Invalid PAN format. Expected format: ABCDE1234F' },
          { status: 400 }
        );
      }

      // Basic Aadhar validation (12 digits)
      const aadharRegex = /^[0-9]{12}$/;
      if (!aadharRegex.test(zerodha_aadhar.replace(/\s/g, ''))) {
        return NextResponse.json(
          { message: 'Invalid Aadhar format. Expected 12 digits' },
          { status: 400 }
        );
      }
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

      // Prepare account data with Zerodha details if applicable
      let accountData: any = {
        account_name,
        broker,
        account_type,
        email_linked: email_linked || (zerodha_details?.email || null),
        contact_number,
        login_id: login_id || (zerodha_details?.account_id || null),
        login_password: login_password || (zerodha_details?.password || null),
        totp_secret,
        nominees,
        aadhar: aadhar || (zerodha_details?.aadhar || null),
        pan: pan || (zerodha_details?.pan || null),
        remarks,
        qcode: newQcode,
        account_id: randomUUID(),
      };

      // For Zerodha managed accounts, store additional details in api_details JSON field
      if (account_type === 'managed_account' && broker === 'zerodha' && zerodha_details) {
        accountData.api_details = {
          ...api_details,
          zerodha_account_id: zerodha_details.account_id,
          zerodha_email: zerodha_details.email,
          zerodha_aadhar: zerodha_details.aadhar,
          zerodha_pan: zerodha_details.pan,
          account_type: 'managed_account_zerodha',
          broker_specific_data: {
            login_credentials: {
              account_id: zerodha_details.account_id,
              // password: zerodha_details.password,
            },
            verification_docs: {
              aadhar: zerodha_details.aadhar,
              pan: zerodha_details.pan,
              email: zerodha_details.email,
            }
          }
        };
      }

      // Create the account
      const account = await tx.accounts.create({
        data: accountData,
      });

      // Handle custodian codes for PMS accounts
      if (account_type === 'pms' && custodian_codes) {
        for (const code of custodian_codes) {
          const trimmedCode = code.trim();
          if (trimmedCode) {
            await tx.account_custodian_codes.create({
              data: {
                qcode: newQcode,
                custodian_code: trimmedCode,
              },
            });
          }
        }
      }

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
        if (!icode) {
          throw new Error('Each allocation must have icode');
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
              allocation_date: new Date(),
            },
          },
          update: {
            contribution_amount: allocationAmount,
            allocation_percent: allocationPercent,
          },
          create: {
            qcode: newQcode,
            icode,
            allocation_date: new Date(),
            contribution_amount: allocationAmount,
            allocation_percent: allocationPercent,
          },
        });
      }

      return account;
    });

    return NextResponse.json({ 
      message: 'Account created with allocations and custodian codes!', 
      account: result,
      zerodha_details_stored: account_type === 'managed_account' && broker === 'zerodha' ? true : false
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('POST /api/accounts error:', errorMessage);
    return NextResponse.json({ message: `❌ Error creating account: ${errorMessage}` }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    // Extract parameters from query
    const { searchParams } = new URL(req.url);
    const accountType = searchParams.get('account_type');
    const qcode = searchParams.get('qcode');

    // If qcode is provided, fetch single account
    if (qcode) {
      const account = await prisma.accounts.findUnique({
        where: { qcode },
        include: {
          account_custodian_codes: {
            select: {
              custodian_code: true,
              created_at: true,
            },
          },
        },
      });

      if (!account) {
        return NextResponse.json(
          { message: `Account with qcode ${qcode} not found` },
          { status: 404 }
        );
      }

      return NextResponse.json({ account });
    }

    // Validate account_type if provided
    if (accountType && !['pms', 'managed_account', 'prop'].includes(accountType)) {
      return NextResponse.json(
        { message: "Invalid account_type. Must be 'pms', 'managed_account', or 'prop'" },
        { status: 400 }
      );
    }

    // Build the where clause based on account_type
    const whereClause = accountType ? { account_type: accountType } : {};

    // Fetch accounts with related custodian codes
    const accounts = await prisma.accounts.findMany({
      where: whereClause,
      select: {
        qcode: true,
        account_name: true,
        account_type: true,
        broker: true,
        email_linked: true,
        contact_number: true,
        login_id: true,
        totp_secret: true,
        api_details: true,
        nominees: true,
        aadhar: true,
        pan: true,
        remarks: true,
        account_id: true,
        created_at: true,
        account_custodian_codes: {
          select: {
            custodian_code: true,
            created_at: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    if (!accounts.length) {
      return NextResponse.json(
        { message: `No accounts found${accountType ? ` for type ${accountType}` : ''}` },
        { status: 404 }
      );
    }

    return NextResponse.json({ accounts });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('GET /api/accounts error:', errorMessage);
    return NextResponse.json({ message: `❌ Error fetching accounts: ${errorMessage}` }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { qcode, ...updateData } = body;

    // Validate required field
    if (!qcode) {
      return NextResponse.json({ message: 'Missing required field: qcode' }, { status: 400 });
    }

    // Check if account exists
    const existingAccount = await prisma.accounts.findUnique({
      where: { qcode },
    });

    if (!existingAccount) {
      return NextResponse.json({ message: `Account with qcode ${qcode} not found` }, { status: 404 });
    }

    // Filter out fields that shouldn't be updated directly or are relation fields
    const {
      id,
      account_id,
      created_at,
      account_custodian_codes, // Remove this as it's a relation field
      ...filteredUpdateData
    } = updateData;

    // Update the account with filtered data
    const updatedAccount = await prisma.accounts.update({
      where: { qcode },
      data: filteredUpdateData,
      include: {
        account_custodian_codes: {
          select: {
            custodian_code: true,
            created_at: true,
          },
        },
      },
    });

    return NextResponse.json({ 
      message: 'Account updated successfully', 
      account: updatedAccount 
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('PUT /api/accounts error:', errorMessage);
    return NextResponse.json({ message: `❌ Error updating account: ${errorMessage}` }, { status: 500 });
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

      // Delete related pooled account data for ALL account types
      await tx.pooled_account_users.deleteMany({
        where: { qcode },
      });

      // Delete related pooled account allocations
      await tx.pooled_account_allocations.deleteMany({
        where: { qcode },
      });

      // Delete related account custodian codes
      await tx.account_custodian_codes.deleteMany({
        where: { qcode },
      });

      // Delete related records from other tables referencing accounts.qcode
      await tx.capital_in_out.deleteMany({ where: { qcode } });
      await tx.equity_holding.deleteMany({ where: { qcode } });
      await tx.gold_tradebook.deleteMany({ where: { qcode } });
      await tx.liquidbees_tradebook.deleteMany({ where: { qcode } });
      await tx.mutual_fund_holding.deleteMany({ where: { qcode } });
      await tx.slippage.deleteMany({ where: { qcode } });
      await tx.tradebook.deleteMany({ where: { qcode } });

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