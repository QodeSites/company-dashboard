import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { account_qcode, user_icodes, access_level } = body;

    if (!account_qcode || !Array.isArray(user_icodes) || user_icodes.length === 0) {
      return new NextResponse("account_qcode and user_icodes[] are required", { status: 400 });
    }

    const results = await Promise.all(
      user_icodes.map(user_id =>
        prisma.pooledAccountUser.create({
          data: {
            account_id: account_qcode,
            user_id,
            access_level: access_level || 'read',
          }
        })
      )
    );

    return NextResponse.json({ message: "Users added!", results });

  } catch (error) {
    console.error('POST /api/accounts/add-user error:', error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
