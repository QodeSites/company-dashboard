//@ts-nocheck
"use client";

import React, { useState, useEffect } from 'react';
import FileInput from "@/components/form/input/FileInput";

interface CustodianCode {
  custodian_code: string;
  created_at: string;
}

interface PmsAccount {
  qcode: string;
  account_name: string;
  broker: string;
  account_custodian_codes: CustodianCode[];
}

interface TWRRResult {
  nav: number;
  totalPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  cumulativeReturn: number;
  annualizedReturn: number;
  consolidated: ConsolidatedRecord[];
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

interface ProcessingResult {
  accountCode: string;
  clientName: string;
  success: boolean;
  data?: TWRRResult;
  error?: string;
  recordsProcessed?: {
    transactions: number;
    aum: number;
  };
}

interface ApiResponse {
  message: string;
  results: ProcessingResult[];
  total_accounts_processed: number;
  successful_accounts: number;
  failed_accounts: number;
}

const UploadPmsData: React.FC = () => {
  const [pmsAccounts, setPmsAccounts] = useState<PmsAccount[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [transactionFile, setTransactionFile] = useState<File | null>(null);
  const [aumFile, setAumFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [processingResults, setProcessingResults] = useState<ProcessingResult[]>([]);
  const [showResults, setShowResults] = useState<boolean>(false);

  // Fetch PMS accounts on component mount
  useEffect(() => {
    const fetchPmsAccounts = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/accounts?account_type=pms');
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to fetch PMS accounts');
        }
        const data = await response.json();
        setPmsAccounts(data.accounts || []);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
        setError(errorMessage);
        console.error('Error fetching PMS accounts:', errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchPmsAccounts();
  }, []);

  // Handle file input changes
  const handleTransactionFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setTransactionFile(file);
  };

  const handleAumFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setAumFile(file);
  };

  // Parse CSV file to JSON
  const parseCSVFile = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const csvData = event.target?.result as string;
          const lines = csvData.split('\n').filter(line => line.trim());
          
          if (lines.length < 2) {
            reject(new Error('CSV file must have at least a header and one data row'));
            return;
          }

          const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
          const data = lines.slice(1).map(line => {
            const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
            const row: any = {};
            headers.forEach((header, index) => {
              row[header] = values[index] || '';
              // Try to convert to number if it looks like a number
              if (!isNaN(Number(row[header])) && row[header] !== '') {
                row[header] = Number(row[header]);
              }
            });
            return row;
          });

          resolve(data);
        } catch (error) {
          reject(new Error('Failed to parse CSV file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

  // Get unique account codes from the data
  const getUniqueAccountCodes = (transactionData: any[], aumData: any[]): string[] => {
    const accountCodes = new Set<string>();
    
    // From transaction data
    transactionData.forEach(row => {
      const accountCode = row['WS Account code'] || row['WS ACCOUNT CODE'];
      if (accountCode) {
        accountCodes.add(accountCode.toString().trim());
      }
    });

    // From AUM data
    aumData.forEach(row => {
      const accountCode = row['ACCOUNTCODE'];
      if (accountCode) {
        accountCodes.add(accountCode.toString().trim());
      }
    });

    return Array.from(accountCodes);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!transactionFile || !aumFile) {
      alert('Please upload both Transaction and AUM reports.');
      return;
    }

    setSubmitting(true);
    setProcessingResults([]);
    setShowResults(false);

    try {
      // Parse both CSV files
      const [transactionData, aumData] = await Promise.all([
        parseCSVFile(transactionFile),
        parseCSVFile(aumFile)
      ]);

      console.log('Transaction data parsed:', transactionData.length, 'records');
      console.log('AUM data parsed:', aumData.length, 'records');

      // Get unique account codes from the data
      const accountCodes = getUniqueAccountCodes(transactionData, aumData);
      console.log('Found account codes:', accountCodes);

      if (accountCodes.length === 0) {
        throw new Error('No valid account codes found in the uploaded files');
      }

      // Process each account code
      const results: ProcessingResult[] = [];
      let successCount = 0;
      let failCount = 0;

      for (const accountCode of accountCodes) {
        try {
          console.log(`Processing account: ${accountCode}`);
          
          const response = await fetch('/api/fetch-pms-mastersheet', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              transactionData,
              aumData,
              accountCode
            })
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to calculate TWRR');
          }

          const result = await response.json();
          
          results.push({
            accountCode,
            clientName: result.clientName,
            success: true,
            data: result.data,
            recordsProcessed: result.recordsProcessed
          });
          
          successCount++;
          console.log(`✅ Successfully processed ${accountCode}: ${result.clientName}`);
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          results.push({
            accountCode,
            clientName: 'Unknown',
            success: false,
            error: errorMessage
          });
          
          failCount++;
          console.error(`❌ Failed to process ${accountCode}:`, errorMessage);
        }
      }

      setProcessingResults(results);
      setShowResults(true);

      // Show summary alert
      alert(
        `✅ Processing Complete!\n` +
        `Total Accounts: ${accountCodes.length}\n` +
        `Successful: ${successCount}\n` +
        `Failed: ${failCount}`
      );

      // Reset form
      setTransactionFile(null);
      setAumFile(null);
      const transactionInput = document.getElementById('transactionFile') as HTMLInputElement;
      const aumInput = document.getElementById('aumFile') as HTMLInputElement;
      if (transactionInput) transactionInput.value = '';
      if (aumInput) aumInput.value = '';

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      console.error('Error processing reports:', errorMessage);
      alert(`❌ Error processing reports: ${errorMessage}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Export results to CSV
  const exportResultsToCSV = () => {
    const successfulResults = processingResults.filter(r => r.success && r.data);
    
    if (successfulResults.length === 0) {
      alert('No successful results to export');
      return;
    }

    const headers = [
      'Account Code', 'Client Name', 'NAV', 'Total PnL', 'Realized PnL', 
      'Unrealized PnL', 'Cumulative Return %', 'Annualized Return %',
      'Transactions Processed', 'AUM Records Processed'
    ];

    const csvContent = [
      headers.join(','),
      ...successfulResults.map(result => [
        result.accountCode,
        `"${result.clientName}"`,
        result.data!.nav.toFixed(4),
        result.data!.totalPnl.toFixed(2),
        result.data!.realizedPnl.toFixed(2),
        result.data!.unrealizedPnl.toFixed(2),
        ((result.data!.cumulativeReturn - 1) * 100).toFixed(2),
        result.data!.annualizedReturn.toFixed(2),
        result.recordsProcessed?.transactions || 0,
        result.recordsProcessed?.aum || 0
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `twrr_summary_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  return (
    <div className="max-w-7xl mx-auto mt-10 p-6 rounded-xl border shadow bg-white dark:bg-gray-800">
      {/* PMS Accounts Section */}
      <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">
        PMS Accounts
      </h2>
      {loading && (
        <p className="text-gray-600 dark:text-gray-300">Loading PMS accounts...</p>
      )}
      {error && (
        <p className="text-red-500 dark:text-red-400">❌ {error}</p>
      )}
      {!loading && !error && pmsAccounts.length === 0 && (
        <p className="text-gray-600 dark:text-gray-300">No PMS accounts found.</p>
      )}
      {!loading && !error && pmsAccounts.length > 0 && (
        <div className="mb-6">
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            All accounts found in the uploaded reports will be processed automatically.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-gray-200 dark:bg-gray-700">
                  <th className="p-3 font-semibold text-gray-800 dark:text-white border-b border-gray-300 dark:border-gray-600">
                    Account Name
                  </th>
                  <th className="p-3 font-semibold text-gray-800 dark:text-white border-b border-gray-300 dark:border-gray-600">
                    QCode
                  </th>
                  <th className="p-3 font-semibold text-gray-800 dark:text-white border-b border-gray-300 dark:border-gray-600">
                    Broker
                  </th>
                  <th className="p-3 font-semibold text-gray-800 dark:text-white border-b border-gray-300 dark:border-gray-600">
                    Custodian Codes
                  </th>
                </tr>
              </thead>
              <tbody>
                {pmsAccounts.map((account) => (
                  <tr
                    key={account.qcode}
                    className="hover:bg-gray-100 dark:hover:bg-gray-600 border-b border-gray-300 dark:border-gray-600"
                  >
                    <td className="p-3 text-gray-800 dark:text-white">
                      {account.account_name}
                    </td>
                    <td className="p-3 text-gray-800 dark:text-white">
                      {account.qcode}
                    </td>
                    <td className="p-3 text-gray-800 dark:text-white">
                      {account.broker}
                    </td>
                    <td className="p-3 text-gray-600 dark:text-gray-300">
                      {account.account_custodian_codes.length > 0 ? (
                        <ul className="list-disc pl-5">
                          {account.account_custodian_codes.map((code, index) => (
                            <li key={index}>
                              {code.custodian_code} (Created: {new Date(code.created_at).toLocaleDateString()})
                            </li>
                          ))}
                        </ul>
                      ) : (
                        'None'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* File Upload Section */}
      <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">
        Upload Transaction Report
      </h2>
      <FileInput
        id="transactionFile"
        onChange={handleTransactionFileChange}
        disabled={submitting}
      />

      <h2 className="text-xl font-semibold mt-10 mb-4 text-gray-800 dark:text-white">
        Upload AUM Report
      </h2>
      <FileInput
        id="aumFile"
        onChange={handleAumFileChange}
        disabled={submitting}
      />

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || (!transactionFile || !aumFile)}
        className={`mt-6 px-6 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center`}
      >
        {submitting ? (
          <>
            <svg
              className="animate-spin h-5 w-5 mr-2 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            Processing TWRR Calculations...
          </>
        ) : (
          "Process TWRR Calculations"
        )}
      </button>

      {/* Results Section */}
      {showResults && processingResults.length > 0 && (
        <div className="mt-10">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
              TWRR Calculation Results
            </h2>
            <button
              onClick={exportResultsToCSV}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Export to CSV
            </button>
          </div>

          {/* Summary Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-100 dark:bg-blue-900 p-4 rounded-lg">
              <h3 className="font-semibold text-blue-800 dark:text-blue-200">Total Accounts</h3>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                {processingResults.length}
              </p>
            </div>
            <div className="bg-green-100 dark:bg-green-900 p-4 rounded-lg">
              <h3 className="font-semibold text-green-800 dark:text-green-200">Successful</h3>
              <p className="text-2xl font-bold text-green-900 dark:text-green-100">
                {processingResults.filter(r => r.success).length}
              </p>
            </div>
            <div className="bg-red-100 dark:bg-red-900 p-4 rounded-lg">
              <h3 className="font-semibold text-red-800 dark:text-red-200">Failed</h3>
              <p className="text-2xl font-bold text-red-900 dark:text-red-100">
                {processingResults.filter(r => !r.success).length}
              </p>
            </div>
          </div>

          {/* Results Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-gray-200 dark:bg-gray-700">
                  <th className="p-3 font-semibold text-gray-800 dark:text-white border-b">Status</th>
                  <th className="p-3 font-semibold text-gray-800 dark:text-white border-b">Account Code</th>
                  <th className="p-3 font-semibold text-gray-800 dark:text-white border-b">Client Name</th>
                  <th className="p-3 font-semibold text-gray-800 dark:text-white border-b">NAV</th>
                  <th className="p-3 font-semibold text-gray-800 dark:text-white border-b">Total P&L</th>
                  <th className="p-3 font-semibold text-gray-800 dark:text-white border-b">Cumulative Return</th>
                  <th className="p-3 font-semibold text-gray-800 dark:text-white border-b">Annualized Return</th>
                  <th className="p-3 font-semibold text-gray-800 dark:text-white border-b">Records Processed</th>
                </tr>
              </thead>
              <tbody>
                {processingResults.map((result, index) => (
                  <tr
                    key={index}
                    className={`border-b border-gray-300 dark:border-gray-600 ${
                      result.success 
                        ? 'bg-green-50 dark:bg-green-900/20' 
                        : 'bg-red-50 dark:bg-red-900/20'
                    }`}
                  >
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        result.success 
                          ? 'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-200' 
                          : 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-200'
                      }`}>
                        {result.success ? '✅ Success' : '❌ Failed'}
                      </span>
                    </td>
                    <td className="p-3 text-gray-800 dark:text-white font-mono">
                      {result.accountCode}
                    </td>
                    <td className="p-3 text-gray-800 dark:text-white">
                      {result.clientName}
                    </td>
                    <td className="p-3 text-gray-800 dark:text-white">
                      {result.success && result.data ? result.data.nav.toFixed(4) : '-'}
                    </td>
                    <td className="p-3">
                      {result.success && result.data ? (
                        <span className={result.data.totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {formatCurrency(result.data.totalPnl)}
                        </span>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                    <td className="p-3">
                      {result.success && result.data ? (
                        <span className={result.data.cumulativeReturn >= 1 ? 'text-green-600' : 'text-red-600'}>
                          {((result.data.cumulativeReturn - 1) * 100).toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                    <td className="p-3">
                      {result.success && result.data ? (
                        <span className={result.data.annualizedReturn >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {result.data.annualizedReturn.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                    <td className="p-3 text-gray-600 dark:text-gray-300">
                      {result.success && result.recordsProcessed ? (
                        <div className="text-xs">
                          <div>Transactions: {result.recordsProcessed.transactions}</div>
                          <div>AUM: {result.recordsProcessed.aum}</div>
                        </div>
                      ) : (
                        result.error ? (
                          <span className="text-red-600 text-xs">{result.error}</span>
                        ) : '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadPmsData;