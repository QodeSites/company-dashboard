"use client";

import React, { useState, useEffect } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Button from "@/components/ui/button/Button";

interface Account {
  id: number;
  qcode: string;
  account_name: string;
  account_type: string;
}

interface SyncResult {
  qcode: string;
  status: 'success' | 'error' | 'skipped';
  message: string;
  recordsDeleted?: number;
  recordsInserted?: number;
  recordsProcessed: number;
}

interface SyncResponse {
  success: boolean;
  syncTimestamp: string;
  results: SyncResult[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
  };
}

interface LatestSync {
  qcode: string;
  client_name: string;
  sync_status: 'success' | 'error' | 'skipped';
  records_processed: number;
  sync_timestamp: string;
  error_message: string | null;
}

export default function EquityHoldingSyncComponent() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedQcodes, setSelectedQcodes] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<SyncResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latestSyncs, setLatestSyncs] = useState<Record<string, LatestSync>>({});

  useEffect(() => {
    fetchManagedAccounts();
    fetchLatestSyncs();
  }, []);

  const fetchManagedAccounts = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/accounts");
      if (!response.ok) throw new Error("Failed to fetch accounts");
      
      const data = await response.json();
      // Filter only managed accounts
      const managedAccounts = data.accounts.filter((acc: Account) => 
        acc.account_type.toLowerCase() === 'managed_account' || 
        acc.account_type.toLowerCase() === 'managed'
      );
      setAccounts(managedAccounts);
    } catch (err) {
      console.error("Error fetching accounts:", err);
      setError("Failed to load managed accounts");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLatestSyncs = async () => {
    try {
      const response = await fetch("/api/equity-holding-sync-history");
      if (!response.ok) throw new Error("Failed to fetch sync history");
      
      const data = await response.json();
      // Map latestSyncs to a Record for easy lookup by qcode
      const syncMap = data.latestSyncs.reduce((acc: Record<string, LatestSync>, sync: LatestSync) => {
        if (sync.sync_status === 'success') {
          acc[sync.qcode] = sync;
        }
        return acc;
      }, {});
      setLatestSyncs(syncMap);
    } catch (err) {
      console.error("Error fetching latest syncs:", err);
      setError("Failed to load sync history");
    }
  };

  const handleQcodeToggle = (qcode: string) => {
    setSelectedQcodes(prev => 
      prev.includes(qcode) 
        ? prev.filter(q => q !== qcode)
        : [...prev, qcode]
    );
  };

  const handleSelectAll = () => {
    if (selectedQcodes.length === accounts.length) {
      setSelectedQcodes([]);
    } else {
      setSelectedQcodes(accounts.map(acc => acc.qcode));
    }
  };

  const handleSync = async () => {
    if (selectedQcodes.length === 0) {
      setError("Please select at least one account to sync");
      return;
    }

    try {
      setIsSyncing(true);
      setError(null);
      setSyncResults(null);

      const response = await fetch("/api/equity-holding-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ qcodes: selectedQcodes }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Sync failed");
      }

      const results: SyncResponse = await response.json();
      setSyncResults(results);
      setSelectedQcodes([]); // Clear selection after sync
      
      // Refresh latest syncs after successful sync
      await fetchLatestSyncs();
      
      // Trigger a custom event to refresh sync history
      window.dispatchEvent(new CustomEvent('equitySyncCompleted'));
      
    } catch (err) {
      console.error("Sync error:", err);
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <ComponentCard title="Equity Holding Sync" className="p-6">
        <div className="text-center text-gray-500">Loading managed accounts...</div>
      </ComponentCard>
    );
  }

  return (
    <ComponentCard title="Equity Holding Sync" className="p-6">
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
            {error}
          </div>
        )}

        {accounts.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-400">
            No managed accounts found
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Select Accounts to Sync ({selectedQcodes.length} selected)
              </h3>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSelectAll}
                disabled={isSyncing}
              >
                {selectedQcodes.length === accounts.length ? "Deselect All" : "Select All"}
              </Button>
            </div>

            <div className="max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md p-2">
              {accounts.map((account) => {
                const lastSync = latestSyncs[account.qcode];
                return (
                  <label 
                    key={account.id} 
                    className="flex items-center space-x-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedQcodes.includes(account.qcode)}
                      onChange={() => handleQcodeToggle(account.qcode)}
                      disabled={isSyncing}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300 flex items-center space-x-2">
                      <span className="font-medium">{account.qcode}</span>
                      <span>-</span>
                      <span>{account.account_name}</span>
                      {lastSync && (
                        <>
                          <span className="text-green-500">✓</span>
                          <span className="text-xs text-gray-500">
                            ({new Date(lastSync.sync_timestamp).toLocaleString()})
                          </span>
                        </>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="flex justify-end">
              <Button
                variant="primary"
                onClick={handleSync}
                disabled={isSyncing || selectedQcodes.length === 0}
              >
                {isSyncing ? "Syncing..." : `Sync Selected (${selectedQcodes.length})`}
              </Button>
            </div>
          </>
        )}

        {syncResults && (
          <div className="mt-6 space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-md dark:bg-green-900/20 dark:border-green-800">
              <h4 className="font-medium text-green-800 dark:text-green-400">
                Sync Completed at {new Date(syncResults.syncTimestamp).toLocaleString()}
              </h4>
              <div className="mt-2 text-sm text-green-700 dark:text-green-300">
                <p>Total: {syncResults.summary.total} accounts</p>
                <p>Successful: {syncResults.summary.successful}</p>
                <p>Failed: {syncResults.summary.failed}</p>
                <p>Skipped: {syncResults.summary.skipped}</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium text-gray-800 dark:text-gray-200">Detailed Results:</h4>
              {syncResults.results.map((result, index) => (
                <div 
                  key={index}
                  className={`p-3 rounded-md border text-sm ${
                    result.status === 'success' 
                      ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300'
                      : result.status === 'error'
                      ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300'
                      : 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-300'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className="font-medium">{result.qcode}</span>
                    <span className="capitalize text-xs px-2 py-1 rounded-full bg-white/50">
                      {result.status}
                    </span>
                  </div>
                  <p className="mt-1">{result.message}</p>
                  {result.status === 'success' && (
                    <p className="mt-1 text-xs">
                      Processed: {result.recordsProcessed} records
                      {result.recordsDeleted !== undefined && ` | Deleted: ${result.recordsDeleted}`}
                      {result.recordsInserted !== undefined && ` | Inserted: ${result.recordsInserted}`}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ComponentCard>
  );
}