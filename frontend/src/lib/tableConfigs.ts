export const tableConfigs: Record<string, { requiredColumns: string[]; dateField: string; model: string }> = {
  master_sheet: {
    requiredColumns: [
      'Date', 'Portfolio Value', 'Capital In Out', 'NAV', 'Prev NAV', 'PnL',
      'Daily P L', 'Exposure Value', 'Prev Portfolio Value',
      'Prev Exposure Value', 'Prev Pnl', 'Drawdown', 'System Tag',
    ],
    dateField: 'date',
    model: 'master_sheet',
  },
  tradebook: {
    requiredColumns: [
      'Timestamp Entry', 'System Tag Entry', 'Action Entry', 'Symbol Entry',
      'Price Entry', 'Qty Entry', 'Contract Value Entry',
      'Timestamp Exit', 'System Tag Exit', 'Action Exit', 'Symbol Exit',
      'Price Exit', 'Qty Exit', 'Contract Value Exit', 'Pnl Amount',
      'Pnl Amount Settlement', 'Status',
    ],
    dateField: 'timestamp_entry',
    model: 'tradebook',
  },
  slippage: {
    requiredColumns: ['Date', 'Account', 'System Tag', 'Capital In Out', 'Status'],
    dateField: 'date',
    model: 'slippage',
  },
  mutual_fund_holding: {
    requiredColumns: [
      'Date', 'Trade Type', 'Symbol', 'ISIN', 'Quantity', 'Price',
      'Broker', 'Debt Equity', 'Collateral', 'Sub Category', 'Status',
    ],
    dateField: 'date',
    model: 'mutual_fund_holding',
  },
  gold_tradebook: {
    requiredColumns: [
      'Date', 'Trade Type', 'Symbol', 'Expiry', 'Exchange', 'Quantity',
      'Lotsize', 'No of Lots', 'Price', 'Exposure', 'Status',
    ],
    dateField: 'date',
    model: 'gold_tradebook',
  },
  liquidbees_tradebook: {
    requiredColumns: [
      'Date', 'Trade Type', 'Symbol', 'Exchange', 'Quantity', 'Price',
      'Broker', 'Debt Equity', 'Collateral', 'Sub Category', 'Status',
    ],
    dateField: 'date',
    model: 'liquidbees_tradebook',
  },
};