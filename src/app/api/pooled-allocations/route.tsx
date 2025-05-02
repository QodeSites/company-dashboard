// src/app/api/pooled-allocations/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const { qcode, allocations } = await req.json();

    if (!qcode || !allocations || !Array.isArray(allocations)) {
      return NextResponse.json({ message: "Invalid input" }, { status: 400 });
    }

    const total = allocations.reduce((sum: number, a: any) => sum + parseFloat(a.amount), 0);

    const results = await Promise.all(allocations.map(async (entry: any) => {
      const percent = (parseFloat(entry.amount) / total) * 100;

      return await prisma.pooled_account_allocations.upsert({
        where: {
          qcode_icode_allocation_date: {
            qcode,
            icode: entry.icode,
            allocation_date: new Date(entry.date),
          },
        },
        update: {
          contribution_amount: parseFloat(entry.amount),
          allocation_percent: percent,
        },
        create: {
          qcode,
          icode: entry.icode,
          allocation_date: new Date(entry.date),
          contribution_amount: parseFloat(entry.amount),
          allocation_percent: percent,
        },
      });
    }));

    return NextResponse.json({ message: "Allocations updated", results });
  } catch (err) {
    console.error("POST /pooled-allocations error:", err);
    return NextResponse.json({ message: "Internal error" }, { status: 500 });
  }
}
