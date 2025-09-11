// @ts-nocheck
"use client";

import React, { useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Breadcrumb from "@/components/breadcrumb/breadcrumb";
import Spinner from "@/components/spinners/Spinner";
import AccountsTable from "@/components/accounts/AccountsTable";
import MasterSheetSyncComponent from "@/components/accounts/MasterSheetSync";
import EquityHoldingSyncComponent from "@/components/accounts/EquityHoldingSync";
import MutualFundHoldingSyncComponent from "@/components/accounts/MutualFundHoldingSync";

type AccountDashboardData = {
  totalAccounts: number;
  accountTypes: {
    pms: number;
    managed_account: number;
    prop: number;
  };
  recentAccounts: { qcode: string; account_name: string }[];
};

export default function AccountsDashboard() {
  const [data, setData] = useState<AccountDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'master' | 'equity' | 'mutual_fund'>('overview');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const [accountsRes, dashboardRes] = await Promise.all([
          fetch("/api/accounts"),
          fetch("/api/dashboard/accounts"),
        ]);

        if (!accountsRes.ok) {
          throw new Error("Failed to fetch accounts");
        }
        if (!dashboardRes.ok) {
          throw new Error("Failed to fetch dashboard data");
        }

        const dashboardData = await dashboardRes.json();

        setData(dashboardData);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
        console.error("Error fetching data:", errorMessage);
        setError(errorMessage || "An error occurred while loading data");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-600 dark:text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Accounts", href: "/accounts" },
        ]}
      />

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'overview'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            Dashboard Overview
          </button>
          <button
            onClick={() => setActiveTab('master')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'master'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            Master Sheet Sync
          </button>
          <button
            onClick={() => setActiveTab('equity')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'equity'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            Equity Holding Sync
          </button>
          <button
            onClick={() => setActiveTab('mutual_fund')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'mutual_fund'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            Mutual Fund Holding Sync
          </button>
        </nav>
      </div>

      {activeTab === 'overview' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {data && (
              <>
                <ComponentCard
                  title="Total Accounts"
                  className="flex flex-col p-6"
                >
                  <p className="text-2xl font-semibold text-gray-800 dark:text-white">
                    {data.totalAccounts}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    PMS + Managed + Prop
                  </p>
                </ComponentCard>

                <ComponentCard
                  title="Account Type Breakdown"
                  className="flex flex-col p-6"
                >
                  <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-2 mt-2">
                    <li>PMS: {data.accountTypes.pms}</li>
                    <li>Managed: {data.accountTypes.managed_account}</li>
                    <li>Prop: {data.accountTypes.prop}</li>
                  </ul>
                </ComponentCard>

                <ComponentCard
                  title="Recent Accounts"
                  className="flex flex-col p-6"
                >
                  <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-2 mt-2">
                    {data.recentAccounts.length > 0 ? (
                      data.recentAccounts.map((acc) => (
                        <li key={acc.qcode} className="flex items-center gap-2">
                          <span className="font-medium">{acc.qcode}</span> - {acc.account_name}
                        </li>
                      ))
                    ) : (
                      <li className="text-gray-500 dark:text-gray-400">
                        No recent accounts
                      </li>
                    )}
                  </ul>
                </ComponentCard>
              </>
            )}
          </div>

          <AccountsTable />
        </>
      ) : activeTab === 'master' ? (
        <MasterSheetSyncComponent />
      ) : activeTab === 'equity' ? (
        <EquityHoldingSyncComponent />
      ) : (
        <MutualFundHoldingSyncComponent />
      )}
    </div>
  );
}