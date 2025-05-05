import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { account_qcode, user_icodes, access_level } = body;
    
    if (!account_qcode || !Array.isArray(user_icodes) || user_icodes.length === 0) {
      return new NextResponse("account_qcode and user_icodes[] are required", { status: 400 });
    }
    
    // Based on your schema, PooledAccountUser likely uses qcode and icode fields
    // instead of account_id and user_id
    const results = await Promise.all(
      user_icodes.map(icode =>
        prisma.pooledAccountUser.create({
          data: {
            qcode: account_qcode,  // Changed from account_id to qcode
            icode,                 // Changed from user_id to icode
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