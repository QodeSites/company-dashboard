// src/app/api/accounts/link-account/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { source_qcode, target_qcodes, access_level } = body;

    if (!source_qcode || !Array.isArray(target_qcodes) || target_qcodes.length === 0) {
      return new NextResponse("source_qcode and target_qcodes[] are required", { status: 400 });
    }

    const createdLinks = await Promise.all(
      target_qcodes.map((target_qcode: string) =>
        prisma.accountAccess.upsert({
          where: {
            source_account_id_target_account_id: {
              source_account_id: source_qcode,
              target_account_id: target_qcode,
            },
          },
          update: {
            access_level: access_level || 'read',
          },
          create: {
            source_account_id: source_qcode,
            target_account_id: target_qcode,
            access_level: access_level || 'read',
          },
        })
      )
    );

    return NextResponse.json({ message: "Accounts linked successfully!", createdLinks });

  } catch (error) {
    console.error('POST /api/accounts/link-account error:', error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
