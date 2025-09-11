import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const qcode = searchParams.get('qcode');
  const limit = parseInt(searchParams.get('limit') || '50');
  
  try {
    let whereClause = {};
    if (qcode) {
      whereClause = { qcode };
    }

    // Get sync history with pagination
    const syncHistory = await prisma.master_sheet_sync_logs.findMany({
      where: whereClause,
      orderBy: {
        sync_timestamp: 'desc'
      },
      take: limit,
      select: {
        id: true,
        qcode: true,
        client_name: true,
        sync_status: true,
        records_deleted: true,
        records_inserted: true,
        records_processed: true,
        error_message: true,
        sync_timestamp: true
      }
    });

    // Get latest sync status for each qcode
    const latestSyncs = await prisma.master_sheet_sync_logs.groupBy({
      by: ['qcode'],
      _max: {
        sync_timestamp: true
      },
      where: whereClause
    });

    // Get the actual latest records
    const latestSyncRecords = await Promise.all(
      latestSyncs.map(async (sync) => {
        return await prisma.master_sheet_sync_logs.findFirst({
          where: {
            qcode: sync.qcode,
            sync_timestamp: sync._max.sync_timestamp!
          },
          select: {
            qcode: true,
            client_name: true,
            sync_status: true,
            records_processed: true,
            sync_timestamp: true,
            error_message: true
          }
        });
      })
    );

    // Get summary statistics
    const summaryStats = await prisma.master_sheet_sync_logs.groupBy({
      by: ['sync_status'],
      _count: {
        sync_status: true
      },
      where: {
        sync_timestamp: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      }
    });

    return NextResponse.json({
      syncHistory,
      latestSyncs: latestSyncRecords.filter(Boolean),
      summary: {
        last24Hours: summaryStats.reduce((acc, stat) => {
          acc[stat.sync_status] = stat._count.sync_status;
          return acc;
        }, {} as Record<string, number>)
      }
    });

  } catch (error) {
    console.error('Sync history API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch sync history',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}