import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const { qcodes } = await request.json();

    if (!qcodes || !Array.isArray(qcodes) || qcodes.length === 0) {
      return NextResponse.json(
        { error: 'qcodes array is required and cannot be empty' },
        { status: 400 }
      );
    }

    const syncResults = [];
    const syncTimestamp = new Date();

    // Process each qcode
    for (const qcode of qcodes) {
      let clientName = '';
      try {
        // Fetch client_name from accounts table if possible
        try {
          const account = await prisma.accounts.findFirst({
            where: { qcode: qcode },
            select: { account_name: true }
          });
          clientName = account?.account_name || '';
        } catch (error) {
          console.warn(`Could not fetch client name for qcode: ${qcode}`);
        }

        // Fetch data from master_sheet_test for this qcode
        const testData = await prisma.master_sheet_test.findMany({
          where: { qcode: qcode }
        });

        if (testData.length === 0) {
          // Log skipped result to master_sheet_sync_logs
          try {
            await prisma.master_sheet_sync_logs.create({
              data: {
                qcode,
                client_name: clientName,
                sync_status: 'skipped',
                records_deleted: 0,
                records_inserted: 0,
                records_processed: 0,
                error_message: 'No data found in master_sheet_test',
                sync_timestamp: syncTimestamp,
                created_at: syncTimestamp
              }
            });
          } catch (historyError) {
            console.error(`Failed to save sync log for ${qcode}:`, historyError);
          }

          syncResults.push({
            qcode,
            status: 'skipped',
            message: 'No data found in master_sheet_test',
            recordsProcessed: 0
          });
          continue;
        }

        // Check existing records in master_sheet for this qcode
        const existingRecords = await prisma.master_sheet.findMany({
          where: { qcode: qcode },
          select: { id: true }
        });

        console.log(`Found ${existingRecords.length} existing records for qcode: ${qcode}`);

        // Delete existing data from master_sheet for this qcode
        const deleteResult = await prisma.master_sheet.deleteMany({
          where: { qcode: qcode }
        });

        console.log(`Deleted ${deleteResult.count} records for qcode: ${qcode}`);

        // Transform and insert data into master_sheet
        const transformedData = testData.map(record => ({
          qcode: record.qcode,
          date: record.date,
          portfolio_value: record.portfolio_value,
          capital_in_out: record.capital_in_out,
          nav: record.nav,
          prev_nav: record.prev_nav,
          pnl: record.pnl,
         daily_p_l: record.portfolio_value != null && Number(record.portfolio_value) !== 0 
  ? (Number(record.pnl) / Number(record.portfolio_value) * 100) 
  : null,
          exposure_value: record.exposure_value,
          prev_portfolio_value: record.prev_portfolio_value,
          prev_exposure_value: record.prev_exposure_value,
          prev_pnl: record.prev_pnl,
          drawdown: record.drawdown,
          system_tag: record.system_tag,
          created_at: syncTimestamp
        }));

        console.log(`Preparing to insert ${transformedData.length} records for qcode: ${qcode}`);

        const insertResult = await prisma.master_sheet.createMany({
          data: transformedData
        });

        console.log(`Inserted ${insertResult.count} records for qcode: ${qcode}`);

        // Log success result to master_sheet_sync_logs
        try {
          await prisma.master_sheet_sync_logs.create({
            data: {
              qcode,
              client_name: clientName,
              sync_status: 'success',
              records_deleted: deleteResult.count,
              records_inserted: insertResult.count,
              records_processed: testData.length,
              error_message: null,
              sync_timestamp: syncTimestamp,
              created_at: syncTimestamp
            }
          });
        } catch (historyError) {
          console.error(`Failed to save sync log for ${qcode}:`, historyError);
        }

        syncResults.push({
          qcode,
          status: 'success',
          message: `Synced successfully`,
          recordsDeleted: deleteResult.count,
          recordsInserted: insertResult.count,
          recordsProcessed: testData.length
        });

      } catch (error) {
        console.error(`Error syncing qcode ${qcode}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

        // Log error result to master_sheet_sync_logs
        try {
          await prisma.master_sheet_sync_logs.create({
            data: {
              qcode,
              client_name: clientName,
              sync_status: 'error',
              records_deleted: 0,
              records_inserted: 0,
              records_processed: 0,
              error_message: errorMessage,
              sync_timestamp: syncTimestamp,
              created_at: syncTimestamp
            }
          });
        } catch (historyError) {
          console.error(`Failed to save sync log for ${qcode}:`, historyError);
        }

        syncResults.push({
          qcode,
          status: 'error',
          message: errorMessage,
          recordsProcessed: 0
        });
      }
    }

    return NextResponse.json({
      success: true,
      syncTimestamp,
      results: syncResults,
      summary: {
        total: qcodes.length,
        successful: syncResults.filter(r => r.status === 'success').length,
        failed: syncResults.filter(r => r.status === 'error').length,
        skipped: syncResults.filter(r => r.status === 'skipped').length
      }
    });

  } catch (error) {
    console.error('Master sheet sync error:', error);
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