import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const latestSyncs = await prisma.holding_sync_logs.findMany({
      where: {
        sync_type: 'equity'
      },
      orderBy: {
        sync_timestamp: 'desc'
      },
      take: 100, // Limit to recent syncs
      select: {
        qcode: true,
        client_name: true,
        sync_status: true,
        records_processed: true,
        sync_timestamp: true,
        error_message: true
      }
    });

    return NextResponse.json({
      success: true,
      latestSyncs
    });
  } catch (error) {
    console.error('Error fetching equity holding sync history:', error);
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