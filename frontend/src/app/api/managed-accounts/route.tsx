// @ts-nocheck


// /app/api/managed-accounts/route.ts
import { NextResponse } from 'next/server';
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Fetch all clients/managed accounts
    const managedAccounts = await prisma.clients.findMany({
      select: {
        id: true,
        icode: true,
        user_name: true,
        email: true,
        phone: true,
        account_status: true,
        created_at: true,
        last_login: true,
      },
      orderBy: {
        created_at: 'desc', // Most recent first
      },
    });

    // Transform the data to match your interface
    const formattedAccounts = managedAccounts.map(account => ({
      id: account.id,
      icode: account.icode,
      user_name: account.user_name,
      email: account.email,
      phone: account.phone || '',
      account_status: account.account_status || 'active', // Default to active if not set
      created_at: account.created_at.toISOString(),
      last_login: account.last_login?.toISOString() || null,
    }));

    return NextResponse.json(formattedAccounts);

  } catch (error) {
    console.error('Error fetching managed accounts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Optional: Add filtering and search capabilities
export async function POST(request: Request) {
  try {
    
    const { search, status, limit = 100 } = await request.json();

    const whereClause: any = {};

    // Add search filter
    if (search) {
      whereClause.OR = [
        { user_name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { icode: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Add status filter
    if (status && status !== 'all') {
      whereClause.account_status = status;
    }

    const managedAccounts = await prisma.clients.findMany({
      where: whereClause,
      select: {
        id: true,
        icode: true,
        user_name: true,
        email: true,
        phone: true,
        account_status: true,
        created_at: true,
        last_login: true,
      },
      orderBy: {
        created_at: 'desc',
      },
      take: limit,
    });

    const formattedAccounts = managedAccounts.map(account => ({
      id: account.id,
      icode: account.icode,
      user_name: account.user_name,
      email: account.email,
      phone: account.phone || '',
      account_status: account.account_status || 'active',
      created_at: account.created_at.toISOString(),
      last_login: account.last_login?.toISOString() || null,
    }));

    return NextResponse.json(formattedAccounts);

  } catch (error) {
    console.error('Error fetching filtered managed accounts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}