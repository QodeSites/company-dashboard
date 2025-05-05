import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface Allocation {
  icode: string;
  date: string;
  amount: string | number;
}

interface PooledAllocationsRequestBody {
  qcode: string;
  allocations: Allocation[];
}

export async function POST(req: NextRequest) {
  try {
    const { qcode, allocations }: PooledAllocationsRequestBody = await req.json();

    if (!qcode || !allocations || !Array.isArray(allocations)) {
      return NextResponse.json({ message: 'Invalid input' }, { status: 400 });
    }

    const total = allocations.reduce(
      (sum: number, a: Allocation) => sum + parseFloat(a.amount.toString() || '0'),
      0
    );

    const results = await Promise.all(
      allocations.map(async (entry: Allocation) => {
        const percent = (parseFloat(entry.amount.toString()) / total) * 100;

        return await prisma.pooled_account_allocations.upsert({
          where: {
            qcode_icode_allocation_date: {
              qcode,
              icode: entry.icode,
              allocation_date: new Date(entry.date),
            },
          },
          update: {
            contribution_amount: parseFloat(entry.amount.toString()),
            allocation_percent: percent,
          },
          create: {
            qcode,
            icode: entry.icode,
            allocation_date: new Date(entry.date),
            contribution_amount: parseFloat(entry.amount.toString()),
            allocation_percent: percent,
          },
        });
      })
    );

    return NextResponse.json({ message: 'Allocations updated', results });
  } catch (err) {
    console.error('POST /pooled-allocations error:', err);
    return NextResponse.json({ message: 'Internal error' }, { status: 500 });
  }
}