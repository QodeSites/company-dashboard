// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Table, TableHeader, TableRow, TableCell, TableBody
} from "../ui/table";
import ComponentCard from "../common/ComponentCard";
import Button from "../ui/button/Button";

interface Account {
  id: number;
  qcode: string;
  account_name: string;
  account_type: string;
  users: { icode: string; user_name: string; email: string }[];
  linked_accounts: { qcode: string; account_name: string; account_type: string }[];
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
        // Open portfolio in new tab
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
    <div className="flex flex-col gap-2">
      {/* <button
        onClick={handleAccessClient}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Generating Access...' : 'View Portfolio'}
      </button>
      {error && (
        <span className="text-red-500 text-sm">{error}</span>
      )} */}
    </div>
  );
}

export default function AccountsTable() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<string>("all");

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const res = await fetch("/api/accounts-with-users");
        if (!res.ok) {
          throw new Error("Failed to fetch accounts");
        }
        const data = await res.json();
        setAccounts(data);
      } catch (error) {
        console.error("Error fetching accounts:", error);
        alert("Error: Failed to load accounts");
      }
    };
    fetchAccounts();
  }, []);

  // Filter accounts based on selected type
  const filteredAccounts = accounts.filter((acc) => {
    if (selectedFilter === "all") return true;
    return acc.account_type.toLowerCase() === selectedFilter.toLowerCase();
  });

  const handleDelete = async (qcode: string) => {
    if (!confirm(`Are you sure you want to delete account ${qcode}? This action cannot be undone.`)) {
      return;
    }

    setIsDeleting(qcode);
    try {
      const response = await fetch("/api/accounts", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ qcode }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete account");
      }

      // Remove the deleted account from state
      setAccounts(accounts.filter((acc) => acc.qcode !== qcode));

      alert(`Success: Account ${qcode} deleted successfully`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    
      console.error("Error deleting account:", error);
      alert(`Error: ${errorMessage || "An error occurred while deleting the account"}`);
    } finally {
      setIsDeleting(null);
    }
  };

  // Flatten linked accounts for the "All Accounts Mapping" table
  const allLinkedAccounts = accounts.flatMap(acc => acc.linked_accounts);

  return (
    <div className="space-y-6">
      {/* Filter Buttons */}
      <div className="flex gap-3 flex-wrap">
        <Button
          variant={selectedFilter === "all" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setSelectedFilter("all")}
        >
          All Accounts ({accounts.length})
        </Button>
        <Button
          variant={selectedFilter === "managed_account" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setSelectedFilter("managed_account")}
        >
          Managed Accounts ({accounts.filter(a => a.account_type.toLowerCase() === "managed_account").length})
        </Button>
        <Button
          variant={selectedFilter === "prop" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setSelectedFilter("prop")}
        >
          Prop ({accounts.filter(a => a.account_type.toLowerCase() === "prop").length})
        </Button>
        <Button
          variant={selectedFilter === "pms" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setSelectedFilter("pms")}
        >
          PMS ({accounts.filter(a => a.account_type.toLowerCase() === "pms").length})
        </Button>
      </div>

      {/* Main Accounts Table */}
      <ComponentCard title="All Accounts" className="p-0">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
          <div className="max-w-full overflow-x-auto">
            <div className="min-w-[640px]">
              <Table>
                <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                  <TableRow>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs text-gray-500 font-medium dark:text-gray-400">Account</TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs text-gray-500 font-medium dark:text-gray-400">QCode</TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs text-gray-500 font-medium dark:text-gray-400">Type</TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs text-gray-500 font-medium dark:text-gray-400">Users</TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs text-gray-500 font-medium dark:text-gray-400">Action</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {filteredAccounts.map((acc) => (
                    <TableRow key={acc.id}>
                      <TableCell className="px-5 py-4 text-theme-sm text-gray-700 dark:text-white/90">{acc.account_name}</TableCell>
                      <TableCell className="px-5 py-4 text-theme-sm text-gray-700 dark:text-white/90">{acc.qcode}</TableCell>
                      <TableCell className="px-5 py-4 text-theme-sm text-gray-700 dark:text-white/90">{acc.account_type}</TableCell>
                      <TableCell className="px-5 py-4 text-theme-sm text-gray-700 dark:text-white/90">
                        <ul className="flex flex-wrap gap-2">
                          {acc.users?.map((u) => (
                            <li key={u.icode} className="flex items-center gap-2">
                              <span className="bg-gray-100 px-2 py-1 rounded-full text-xs text-gray-800 dark:bg-gray-800 dark:text-white/90">
                                {u.user_name} ({u.icode})
                              </span>
                              <ClientAccessButton icode={u.icode} userName={u.user_name} />
                            </li>
                          ))}
                        </ul>
                      </TableCell>
                      <TableCell className="px-5 py-4 flex items-center gap-2">
                        <Link
                          href={`/accounts/${acc.qcode}`}
                          className="text-blue-500 hover:underline text-sm"
                        >
                          View
                        </Link>
                        <Button
                          variant="danger"
                          size="xs"
                          onClick={() => handleDelete(acc.qcode)}
                          disabled={isDeleting === acc.qcode}
                        >
                          {isDeleting === acc.qcode ? "Deleting..." : "Delete"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </ComponentCard>

      {/* Linked Accounts Table */}
      <ComponentCard title="All Accounts Mapping" className="p-0">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
          <div className="max-w-full overflow-x-auto">
            <div className="min-w-[640px]">
              <Table>
                <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                  <TableRow>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs text-gray-500 font-medium dark:text-gray-400">Account Name</TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs text-gray-500 font-medium dark:text-gray-400">QCode</TableCell>
                    <TableCell isHeader className="px-5 py-3 text-start text-theme-xs text-gray-500 font-medium dark:text-gray-400">Type</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {allLinkedAccounts.length > 0 ? (
                    allLinkedAccounts.map((linked, index) => (
                      <TableRow key={`${linked.qcode}-${index}`}>
                        <TableCell className="px-5 py-4 text-theme-sm text-gray-700 dark:text-white/90">{linked.account_name}</TableCell>
                        <TableCell className="px-5 py-4 text-theme-sm text-gray-700 dark:text-white/90">{linked.qcode}</TableCell>
                        <TableCell className="px-5 py-4 text-theme-sm text-gray-700 dark:text-white/90">{linked.account_type}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell className="px-5 py-4 text-center text-theme-sm text-gray-700 dark:text-white/90">
                        No linked accounts found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </ComponentCard>
    </div>
  );
}