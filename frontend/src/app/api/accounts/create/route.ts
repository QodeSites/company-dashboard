// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const { account_name, broker, account_type, user_allocations } = await req.json();
    
    if (!account_name || !broker || !account_type) {
      return NextResponse.json({ message: "Missing required fields: account_name, broker, account_type" }, { status: 400 });
    }
    
    if (!['pms', 'managed_account', 'prop'].includes(account_type)) {
      return NextResponse.json({ message: "Invalid account_type. Must be 'pms', 'managed_account', or 'prop'" }, { status: 400 });
    }
    
    // Generate unique IDs
    const timestamp = Date.now().toString().slice(-6);
    const randomDigits = Math.floor(100 + Math.random() * 900).toString();
    const qcode = `QAC${timestamp}${randomDigits}`;
    const account_id = `ACC-${randomUUID().slice(0, 8)}`;
    
    if (account_type === 'prop') {
      if (!user_allocations || !Array.isArray(user_allocations) || user_allocations.length === 0) {
        return NextResponse.json({ message: "user_allocations is required for prop accounts and must be a non-empty array" }, { status: 400 });
      }
      
      // Create pooled account
      const newAccount = await prisma.account.create({
        data: {
          qcode,
          account_id,
          account_name,
          broker,
          account_type,
        },
      });
      
      // Insert user mappings and allocations
      const totalAmount = user_allocations.reduce((sum, u) => sum + parseFloat(u.amount), 0);
      
      for (const user of user_allocations) {
        const { icode, date, amount } = user;
        
        if (!icode || !amount || !date) {
          return NextResponse.json({ message: "Each user must have icode, amount, and date" }, { status: 400 });
        }
        
        // Generate a unique user_id
        const user_id = `USR-${randomUUID().slice(0, 8)}`;
        
        // Find or create the user
        await prisma.clients.upsert({
          where: { icode },
          update: {},
          create: { 
            icode, 
            user_id,
            user_name: user.user_name || icode, 
            email: `${icode}@placeholder.com`, 
            contact_number: "0000000000" 
          },
        });
        
        // Create pooled account user relationship
        await prisma.pooledAccountUser.upsert({
          where: { qcode_icode: { qcode, icode } },
          update: {},
          create: { qcode, icode, access_level: 'read' },
        });
        
        // Create allocation record
        const allocationAmount = parseFloat(amount);
        if (isNaN(allocationAmount)) {
          return NextResponse.json({ message: `Invalid amount for user ${icode}` }, { status: 400 });
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
        account_id,
        account_name,
        broker,
        account_type,
      },
    });
    
    return NextResponse.json({
      message: "✅ Account created successfully!",
      account: newAccount,
    });
    
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
    console.error("POST /api/accounts/create error:", err);
    return NextResponse.json({ message: "❌ Server error", error: errorMessage }, { status: 500 });
  }
}