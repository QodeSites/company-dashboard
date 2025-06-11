import { NextRequest, NextResponse } from 'next/server';

interface TransactionRecord {
  'Client name'?: string;
  'WS Account code'?: string;
  'WS ACCOUNT CODE'?: string;
  'Tran Desc'?: string;
  'TRANDATE'?: string;
  'SETDATE'?: string;
  'SET DATE'?: string;
  'QTY'?: number | string;
}

interface AUMRecord {
  'CLIENTNAME'?: string;
  'CLIENTID'?: string;
  'ACCOUNTCODE'?: string;
  'VALUEDATE'?: string;
  'AUM'?: number | string;
}

interface CalculationResult {
  nav: number;
  totalPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  consolidated: ConsolidatedRecord[];
  cumulativeReturn: number;
  annualizedReturn: number;
}

interface ConsolidatedRecord {
  clientName: string;
  accountCode: string;
  date: string;
  portfolioValue: number;
  cashInOut: number;
  nav: number;
  prevNav: number;
  pnl: number;
  pnlPercent: number;
  exposureValue: number;
  prevPortfolioValue: number;
  prevExposureValue: number;
  prevPnl: number;
  drawdownPercent: number;
  systemTag: string;
  periodReturn: number;
  cumulativeReturn: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transactionData, aumData, accountCode } = body;

    // Validate input data
    if (!transactionData || !aumData || !accountCode) {
      return NextResponse.json(
        { error: 'Missing required data: transactionData, aumData, and accountCode are required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(transactionData) || !Array.isArray(aumData)) {
      return NextResponse.json(
        { error: 'transactionData and aumData must be arrays' },
        { status: 400 }
      );
    }

    // Filter data for selected account code
    const clientTransactions = transactionData.filter((row: TransactionRecord) =>
      (row['WS Account code'] || row['WS ACCOUNT CODE'])?.toString().trim() === accountCode
    );

    const clientAum = aumData.filter((row: AUMRecord) =>
      row['ACCOUNTCODE']?.toString().trim() === accountCode
    );

    if (clientTransactions.length === 0 && clientAum.length === 0) {
      return NextResponse.json(
        { error: `No data found for account code: ${accountCode}` },
        { status: 404 }
      );
    }

    // Get client name for display
    const clientName = clientAum.length > 0 
      ? clientAum[0]['CLIENTNAME'] 
      : (clientTransactions.length > 0 
          ? clientTransactions[0]['Client name']?.split(' - ')[0] 
          : 'Unknown');

    console.log(`Processing ${clientTransactions.length} transactions and ${clientAum.length} AUM records for ${clientName} (${accountCode})`);

    // Calculate metrics
    const results = processClientData(clientTransactions, clientAum, clientName || 'Unknown');

    return NextResponse.json({
      success: true,
      data: results,
      clientName,
      accountCode,
      recordsProcessed: {
        transactions: clientTransactions.length,
        aum: clientAum.length
      }
    });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error processing the data' },
      { status: 500 }
    );
  }
}

function processClientData(
  transactions: TransactionRecord[], 
  aum: AUMRecord[], 
  clientName: string
): CalculationResult {
  // Get all unique dates from both datasets
  const transactionDates = transactions
    .map(t => t['TRANDATE'] || t['SETDATE'] || t['SET DATE'])
    .filter(d => d) as string[];
  
  const aumDates = aum
    .map(a => a['VALUEDATE'])
    .filter(d => d) as string[];
  
  const allDates = [...new Set([...transactionDates, ...aumDates])].sort((a, b) => {
    const dateA = new Date(a.split('/').reverse().join('-'));
    const dateB = new Date(b.split('/').reverse().join('-'));
    return dateA.getTime() - dateB.getTime();
  });

  console.log('=== TWRR NAV CALCULATION DEBUG START ===');
  console.log('All dates (sorted ascending):', allDates);

  // Find the first Corpus Deposits date
  const corpusDeposits = transactions.filter(t => {
    const tranDesc = (t['Tran Desc'] || '').toString().trim();
    return tranDesc === 'Corpus Deposits';
  });

  const firstCorpusDate = corpusDeposits.length > 0 
    ? corpusDeposits.reduce((earliest, current) => {
        const currentDate = new Date((current['SETDATE'] || current['SET DATE'] || '').split('/').reverse().join('-'));
        const earliestDate = new Date((earliest['SETDATE'] || earliest['SET DATE'] || '').split('/').reverse().join('-'));
        return currentDate < earliestDate ? current : earliest;
      })['SETDATE'] || corpusDeposits[0]['SET DATE']
    : null;

  // If no Corpus Deposits, use earliest AUM date
  const startDate = firstCorpusDate || (aum.length > 0 
    ? aum.reduce((earliest, current) => {
        const currentDate = new Date((current['VALUEDATE'] || '').split('/').reverse().join('-'));
        const earliestDate = new Date((earliest['VALUEDATE'] || '').split('/').reverse().join('-'));
        return currentDate < earliestDate ? current : earliest;
      })['VALUEDATE']
    : allDates[0]);

  const initialNav = 100;

  console.log('🚀 TWRR NAV Calculation Start Date:', startDate);
  console.log('🚀 Initial NAV:', initialNav);
  console.log('🚀 Total Corpus Deposits found:', corpusDeposits.length);

  // Calculate realized and unrealized P&L
  let totalRealizedPnl = 0;
  let totalUnrealizedPnl = 0;

  // Get latest AUM for unrealized P&L calculation
  const latestAum = aum.length > 0 
    ? aum.reduce((latest, current) => {
        const currentDate = new Date((current['VALUEDATE'] || '').split('/').reverse().join('-'));
        const latestDate = new Date((latest['VALUEDATE'] || '').split('/').reverse().join('-'));
        return currentDate > latestDate ? current : latest;
      })
    : null;

  const currentPortfolioValue = latestAum ? parseFloat((latestAum['AUM'] || 0).toString()) : 0;

  // TWRR Calculation: Build periods and calculate sub-period returns
  let cumulativeReturn = 1.0;
  let previousNav = initialNav;

  // Generate consolidated report with TWRR NAV calculation
  const consolidatedReport: ConsolidatedRecord[] = allDates.map((date, index) => {
    console.log(`\n📅 === TWRR DATE ${index + 1}/${allDates.length}: ${date} ===`);

    const dateAum = aum.find(a => a['VALUEDATE'] === date);
    console.log('📊 AUM Record for date:', dateAum ? 'Found' : 'Not Found');

    // Client Name and Account Code
    const reportClientName = dateAum ? dateAum['CLIENTNAME'] || clientName : clientName;
    const accountCode = dateAum ? dateAum['ACCOUNTCODE'] || 'N/A' : 'N/A';
    console.log('👤 Client:', reportClientName, '| Account:', accountCode);

    // Portfolio Value (PV) from AUM
    const portfolioValue = dateAum ? parseFloat((dateAum['AUM'] || 0).toString()) : 0;
    console.log('💰 Portfolio Value:', portfolioValue);

    // Get previous portfolio value
    const prevIndex = index > 0 ? index - 1 : index;
    const prevDate = allDates[prevIndex];
    const prevAum = aum.find(a => a['VALUEDATE'] === prevDate);
    const prevPortfolioValue = prevAum ? parseFloat((prevAum['AUM'] || 0).toString()) : 0;

    console.log('📋 Previous Date:', prevDate, '| Previous PV:', prevPortfolioValue);

    // Cash flows for this date
    const accountCodeFromAum = dateAum ? dateAum['ACCOUNTCODE'] : null;
    const dayCorpusDeposits = transactions.filter(t => {
      const tranDesc = (t['Tran Desc'] || '').toString().trim();
      const setDate = t['SETDATE'] || t['SET DATE'];
      const wsAccountCode = t['WS Account code'] || t['WS ACCOUNT CODE'];

      return tranDesc === 'Corpus Deposits' &&
        setDate === date &&
        (accountCodeFromAum ? wsAccountCode === accountCodeFromAum : true);
    });

    const cashFlow = dayCorpusDeposits.reduce((sum, t) => {
      const qty = parseFloat((t['QTY'] || 0).toString());
      return sum + qty;
    }, 0);

    console.log('💸 Cash Flow today:', cashFlow, '| Transactions found:', dayCorpusDeposits.length);

    // TWRR Calculation for this period
    let periodReturn = 1.0;
    let currentNav = previousNav;

    if (index === 0) {
      currentNav = initialNav;
      console.log('🎯 First period - NAV set to initial value:', currentNav);
    } else {
      const beginningValue = prevPortfolioValue;
      const endingValue = portfolioValue;

      console.log('🧮 TWRR Period Return Calculation:');
      console.log('   📊 Beginning Value (Previous PV):', beginningValue);
      console.log('   💰 Cash Flow:', cashFlow);
      console.log('   📊 Ending Value (Current PV):', endingValue);

      if (beginningValue + cashFlow > 0) {
        periodReturn = endingValue / (beginningValue + cashFlow);
        console.log(`   ✅ Period Return = ${endingValue} / (${beginningValue} + ${cashFlow}) = ${periodReturn.toFixed(6)}`);
      } else {
        periodReturn = 1.0;
        console.log('   ⚠️ Invalid denominator - using period return of 1.0');
      }

      cumulativeReturn *= periodReturn;
      console.log('   📈 Cumulative Return:', cumulativeReturn.toFixed(6));

      currentNav = initialNav * cumulativeReturn;
      console.log(`   ✅ NAV = Initial NAV × Cumulative Return = ${initialNav} × ${cumulativeReturn.toFixed(6)} = ${currentNav.toFixed(4)}`);
    }

    // P&L calculation
    const pnl = portfolioValue - prevPortfolioValue - cashFlow;
    const pnlPercent = prevPortfolioValue > 0 ? (pnl / prevPortfolioValue * 100) : 0;

    console.log('📈 P&L Calculation:');
    console.log(`   💰 PnL = ${portfolioValue} - ${prevPortfolioValue} - ${cashFlow} = ${pnl}`);
    console.log(`   📊 PnL % = ${pnlPercent.toFixed(2)}%`);

    // Drawdown calculation
    const peakPortfolioValue = Math.max(...allDates.slice(0, index + 1).map(d => {
      const aumRecord = aum.find(a => a['VALUEDATE'] === d);
      return aumRecord ? parseFloat((aumRecord['AUM'] || 0).toString()) : 0;
    }));
    const drawdownPercent = peakPortfolioValue > 0 ? ((peakPortfolioValue - portfolioValue) / peakPortfolioValue * 100) : 0;

    console.log('📉 Drawdown: Peak =', peakPortfolioValue, '| Current =', portfolioValue, '| DD% =', drawdownPercent.toFixed(2) + '%');

    // System Tag
    const systemTag = dateAum && dateAum['CLIENTID'] 
      ? dateAum['CLIENTID'].toString().slice(0, 3).toUpperCase() 
      : 'N/A';

    console.log('🏷️ System Tag:', systemTag);
    console.log('✅ Final TWRR NAV for', date + ':', currentNav.toFixed(4));

    const record: ConsolidatedRecord = {
      clientName: reportClientName,
      accountCode: accountCode,
      date,
      portfolioValue,
      cashInOut: cashFlow,
      nav: currentNav,
      prevNav: previousNav,
      pnl,
      pnlPercent,
      exposureValue: portfolioValue,
      prevPortfolioValue,
      prevExposureValue: prevPortfolioValue,
      prevPnl: index > 0 ? (prevPortfolioValue - (index > 1 ? parseFloat(((aum.find(a => a['VALUEDATE'] === allDates[index - 2]) || {})['AUM'] || 0).toString()) : 0)) : 0,
      drawdownPercent,
      systemTag,
      periodReturn,
      cumulativeReturn
    };

    previousNav = currentNav;
    return record;
  });

  // Calculate total corpus deposits for final summary
  const totalCorpusDeposits = transactions.filter(t => {
    const tranDesc = (t['Tran Desc'] || '').toString().trim();
    const setDate = t['SETDATE'] || t['SET DATE'];
    return tranDesc === 'Corpus Deposits' && 
      setDate && 
      new Date(setDate.split('/').reverse().join('-')) >= new Date((startDate || '').split('/').reverse().join('-'));
  }).reduce((sum, t) => {
    const qty = parseFloat((t['QTY'] || 0).toString());
    return sum + qty;
  }, 0);

  const finalNav = initialNav * cumulativeReturn;
  const totalPnL = currentPortfolioValue - totalCorpusDeposits;
  totalUnrealizedPnl = totalPnL;

  console.log('\n🎯 === FINAL TWRR NAV CALCULATION SUMMARY ===');
  console.log('📊 Latest Portfolio Value:', currentPortfolioValue);
  console.log('💰 Total Corpus Deposits (from start date):', totalCorpusDeposits);
  console.log('🔄 Final Cumulative Return:', cumulativeReturn.toFixed(6));
  console.log('🧮 Final TWRR NAV:', finalNav.toFixed(4));
  console.log('📈 Total P&L:', totalPnL);
  console.log('=== TWRR NAV CALCULATION DEBUG END ===\n');

  return {
    nav: finalNav,
    totalPnl: totalRealizedPnl + totalUnrealizedPnl,
    realizedPnl: totalRealizedPnl,
    unrealizedPnl: totalUnrealizedPnl,
    consolidated: consolidatedReport,
    cumulativeReturn: cumulativeReturn,
    annualizedReturn: (Math.pow(cumulativeReturn, 365 / allDates.length) - 1) * 100
  };
}