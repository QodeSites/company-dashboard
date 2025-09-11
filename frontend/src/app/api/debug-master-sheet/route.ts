// app/api/debug-master-sheet/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const qcode = searchParams.get('qcode');

  if (!qcode) {
    return NextResponse.json(
      { error: 'qcode parameter is required' },
      { status: 400 }
    );
  }

  try {
    // Check data in master_sheet_test
    const testData = await prisma.master_sheet_test.findMany({
      where: { qcode: qcode },
      take: 5, // Just get first 5 records
      orderBy: { date: 'desc' }
    });

    // Check data in pms_master_sheet
    const pmsData = await prisma.pms_master_sheet.findMany({
      where: { account_code: qcode },
      take: 5, // Just get first 5 records
      orderBy: { report_date: 'desc' }
    });

    // Count total records in both tables
    const testCount = await prisma.master_sheet_test.count({
      where: { qcode: qcode }
    });

    const pmsCount = await prisma.pms_master_sheet.count({
      where: { account_code: qcode }
    });

    // Check if there are any records with similar qcode patterns
    const similarPmsRecords = await prisma.pms_master_sheet.findMany({
      where: {
        account_code: {
          contains: qcode.substring(0, 6) // Check for similar patterns
        }
      },
      select: {
        account_code: true,
        client_name: true
      },
      distinct: ['account_code'],
      take: 10
    });

    return NextResponse.json({
      qcode,
      testData: {
        count: testCount,
        sample: testData
      },
      pmsData: {
        count: pmsCount,
        sample: pmsData
      },
      similarPmsRecords,
      debug: {
        message: `Checking data for qcode: ${qcode}`,
        testTableHasData: testCount > 0,
        pmsTableHasData: pmsCount > 0,
        lastTestRecord: testData.length > 0 ? testData[0] : null,
        lastPmsRecord: pmsData.length > 0 ? pmsData[0] : null
      }
    });

  } catch (error) {
    console.error('Debug API error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}