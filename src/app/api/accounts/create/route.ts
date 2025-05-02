import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const { account_name, broker, account_type, user_allocations } = await req.json();

    if (!account_name || !broker || !account_type) {
      return NextResponse.json({ message: "Missing required fields: account_name, broker, account_type" }, { status: 400 });
    }

    if (!['pms', 'managed_account', 'prop'].includes(account_type)) {
      return NextResponse.json({ message: "Invalid account_type. Must be 'pms', 'managed_account', or 'prop'" }, { status: 400 });
    }

    // Generate a unique qcode
    const timestamp = Date.now().toString().slice(-6);
    const randomDigits = Math.floor(100 + Math.random() * 900).toString();
    const qcode = `QAC${timestamp}${randomDigits}`;

    if (account_type === 'prop') {
      if (!user_allocations || !Array.isArray(user_allocations) || user_allocations.length === 0) {
        return NextResponse.json({ message: "user_allocations is required for prop accounts and must be a non-empty array" }, { status: 400 });
      }

      // Transform user_allocations
      const users = user_allocations.map((alloc: { icode: string; date: string; amount: string }) => ({
        icode: alloc.icode,
        user_name: alloc.icode, // Placeholder
        allocation_inr: alloc.amount,
        date: alloc.date,
      }));

      // Create pooled account
      const newAccount = await prisma.account.create({
        data: {
          qcode,
          account_name,
          broker,
          account_type,
        },
      });

      // Insert user mappings and allocations
      const totalAmount = users.reduce((sum: number, u: any) => sum + parseFloat(u.allocation_inr), 0);

      for (const user of users) {
        const { icode, user_name, allocation_inr, date } = user;

        if (!icode || !allocation_inr || !date) {
          return NextResponse.json({ message: "Each user must have icode, allocation_inr, and date" }, { status: 400 });
        }

        await prisma.user.upsert({
          where: { icode },
          update: {},
          create: { icode, user_name: user_name || icode, email: `${icode}@placeholder.com`, contact_number: "0000000000" },
        });

        await prisma.pooledAccountUser.upsert({
          where: { qcode_icode: { qcode, icode } },
          update: {},
          create: { qcode, icode, access_level: 'read' },
        });

        const allocationAmount = parseFloat(allocation_inr);
        if (isNaN(allocationAmount)) {
          return NextResponse.json({ message: `Invalid allocation_inr for user ${icode}` }, { status: 400 });
        }
        const allocationPercent = (allocationAmount / totalAmount) * 100;

        await prisma.pooled_account_allocations.create({
          data: {
            qcode,
            icode,
            allocation_date: new Date(date),
            contribution_amount: allocationAmount,
            allocation_percent: allocationPercent,
          },
        });
      }

      return NextResponse.json({
        message: "✅ Pooled account and allocations created successfully!",
        account: newAccount,
      });
    }

    // For pms or managed_account
    const newAccount = await prisma.account.create({
      data: {
        qcode,
        account_name,
        broker,
        account_type,
      },
    });

    return NextResponse.json({
      message: "✅ Account created successfully!",
      account: newAccount,
    });

  } catch (err: any) {
    console.error("POST /api/accounts/create error:", err);
    return NextResponse.json({ message: "❌ Server error", error: err.message }, { status: 500 });
  }
}