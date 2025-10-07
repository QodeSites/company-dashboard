"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Table, TableHeader, TableRow, TableCell, TableBody
} from "../../../components/ui/table";
import ComponentCard from "@/components/common/ComponentCard";

interface User {
  icode: string;
  user_name: string;
  email: string;
}

interface ManagedAccount {
  id: number;
  qcode: string;
  account_name: string;
  account_type: string;
  users: User[];
  email_linked: string;
  contact_number?: string;
  created_at: string;
  last_login?: string;
}

interface ClientAccessButtonProps {
  icode: string;
  userName: string;
}

function ClientAccessButton({ icode, userName }: ClientAccessButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAccessClient = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/generate-client-access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ clientId: icode }),
      });

      const data = await response.json();

      if (data.success) {
        window.open(data.accessUrl, '_blank');
      } else {
        setError(data.error || 'Failed to generate access');
      }
    } catch (err) {
      setError('Network error occurred');
      console.error('Access generation error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleAccessClient}
        disabled={loading}
        className="px-3 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm rounded-lg hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md"
      >
        {loading ? (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
            Accessing...
          </div>
        ) : (
          'Login to Dashboard'
        )}
      </button>
      {error && (
        <span className="text-red-500 text-xs">{error}</span>
      )}
    </div>
  );
}

const ManagedAccounts = () => {
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchManagedAccounts = async () => {
      try {
        const res = await fetch("/api/accounts-with-users");
        if (!res.ok) {
          throw new Error("Failed to fetch managed accounts");
        }
        const data = await res.json();

        // Filter for managed_account type and map to ManagedAccount interface
        const mappedAccounts: ManagedAccount[] = data
          .filter((account: any) => account.account_type === 'managed_account')
          .map((account: any) => ({
            id: account.account_id,
            qcode: account.qcode,
            account_name: account.account_name,
            account_type: account.account_type,
            users: account.users,
            email_linked: account.email_linked,
            contact_number: account.contact_number,
            created_at: account.created_at,
            last_login: account.last_login || undefined,
          }));

        setAccounts(mappedAccounts);
      } catch (error) {
        console.error("Error fetching managed accounts:", error);
        setError("Failed to load managed accounts");
      } finally {
        setLoading(false);
      }
    };

    fetchManagedAccounts();
  }, []);

  // Filter accounts based on search term
  const filteredAccounts = accounts.filter(account =>
    account.account_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    account.qcode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    account.email_linked.toLowerCase().includes(searchTerm.toLowerCase()) ||
    account.users.some(user =>
      user.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.icode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusBadge = (status: string) => {
    const statusColors = {
      active: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
      inactive: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400',
      suspended: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
    };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[status as keyof typeof statusColors] || statusColors.inactive}`}>
        {status || 'Unknown'}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <ComponentCard title="Managed Accounts" className="p-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Loading managed accounts...</span>
          </div>
        </ComponentCard>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <ComponentCard title="Managed Accounts" className="p-8">
          <div className="text-center text-red-600">
            <div className="text-4xl mb-4">⚠️</div>
            <p className="text-lg font-medium">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </ComponentCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Search */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Managed Accounts
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Total: {accounts.length} accounts | Filtered: {filteredAccounts.length}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Search accounts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
            <svg
              className="absolute left-3 top-2.5 h-5 w-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Main Accounts Table */}
      <ComponentCard title="All Managed Accounts" className="p-0">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
          <div className="max-w-full overflow-x-auto">
            <div className="min-w-[800px]">
              <Table>
                <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                  <TableRow>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs text-gray-500 font-medium dark:text-gray-400">
                      Client Info
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs text-gray-500 font-medium dark:text-gray-400">
                      ICode
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs text-gray-500 font-medium dark:text-gray-400">
                      Contact
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs text-gray-500 font-medium dark:text-gray-400">
                      Status
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs text-gray-500 font-medium dark:text-gray-400">
                      Last Login
                    </TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs text-gray-500 font-medium dark:text-gray-400">
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {filteredAccounts.length > 0 ? (
                    filteredAccounts.map((account) =>
                      account.users.map((user) => (
                        <TableRow key={`${account.id}-${user.icode}`} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                          <TableCell className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                                {user.user_name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="font-medium text-gray-900 dark:text-white">
                                  {user.user_name}
                                </div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                  Created: {formatDate(account.created_at)}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="px-5 py-4">
                            <div className="font-mono text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                              {user.icode}
                            </div>
                          </TableCell>
                          <TableCell className="px-5 py-4">
                            <div className="text-sm">
                              <div className="text-gray-900 dark:text-white">{user.email}</div>
                              {account.contact_number && (
                                <div className="text-gray-500 dark:text-gray-400">{account.contact_number}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="px-5 py-4">
                            {getStatusBadge(account.account_type === 'managed_account' ? 'active' : 'inactive')}
                          </TableCell>
                          <TableCell className="px-5 py-4 text-sm text-gray-700 dark:text-white/90">
                            {formatDate(account.last_login)}
                          </TableCell>
                          <TableCell className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <ClientAccessButton
                                icode={user.icode}
                                userName={user.user_name}
                              />
                              <Link
                                href={`/clients/${user.icode}`}
                                className="text-blue-600 hover:text-blue-800 text-sm font-medium hover:underline"
                              >
                                View Details
                              </Link>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )
                  ) : (
                    <TableRow>
                      <TableCell className="px-5 py-12 text-center">
                        <div className="text-gray-500 dark:text-gray-400">
                          {searchTerm ? (
                            <div>
                              <div className="text-4xl mb-4">🔍</div>
                              <p className="text-lg font-medium">No accounts found</p>
                              <p>Try adjusting your search terms</p>
                            </div>
                          ) : (
                            <div>
                              <div className="text-4xl mb-4">📋</div>
                              <p className="text-lg font-medium">No managed accounts found</p>
                              <p>Start by adding some client accounts</p>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </ComponentCard>

      {/* Quick Stats */}
      {accounts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ComponentCard className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {accounts.filter(acc => acc.account_type === 'managed_account').length}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Active Accounts</div>
              </div>
            </div>
          </ComponentCard>

          <ComponentCard className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {accounts.length}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Total Accounts</div>
              </div>
            </div>
          </ComponentCard>

          <ComponentCard className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/20 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {accounts.filter(acc => acc.last_login && new Date(acc.last_login) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Active This Week</div>
              </div>
            </div>
          </ComponentCard>
        </div>
      )}
    </div>
  );
};

export default ManagedAccounts;