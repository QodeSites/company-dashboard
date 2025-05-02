"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import { Table, TableHeader, TableRow, TableCell, TableBody } from "@/components/ui/table";
import { formatIndianCurrency } from "@/utils/currencyFormat";
import Spinner from "@/components/spinners/Spinner";

interface Allocation {
  qcode: string;
  account_name: string;
  allocation_percent: string;
  contribution_amount: string;
  allocation_date: string;
}

export default function UserDetailsPage() {
  const { icode } = useParams();
  const [user, setUser] = useState<{ icode: string; user_name: string } | null>(null);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null); // Add error state

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const [userRes, allocRes] = await Promise.all([
          fetch(`/api/users/${icode}`),
          fetch(`/api/users/${icode}/allocations`),
        ]);

        if (!userRes.ok) {
          throw new Error("Failed to fetch user data");
        }
        if (!allocRes.ok) {
          throw new Error("Failed to fetch allocations");
        }

        const userData = await userRes.json();
        const allocData = await allocRes.json();

        setUser(userData);
        setAllocations(allocData);
      } catch (error: any) {
        console.error("Failed to fetch user details:", error);
        setError(error.message || "An error occurred while loading data");
      } finally {
        setIsLoading(false);
      }
    };

    if (icode) {
      fetchDetails();
    }
  }, [icode]);

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
      <ComponentCard title={`User Details - ${user?.user_name || "Unknown User"}`}>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          ICode: {user?.icode || "N/A"}
        </p>
      </ComponentCard>

      <ComponentCard title="Pooled Account Allocations">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
          <div className="max-w-full overflow-x-auto">
            <div className="min-w-[640px]">
              <Table>
                <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                  <TableRow>
                    <TableCell
                      isHeader
                      className="px-5 py-3 text-start text-theme-xs text-gray-500 font-medium dark:text-gray-400"
                    >
                      Account
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-5 py-3 text-start text-theme-xs text-gray-500 font-medium dark:text-gray-400"
                    >
                      Date
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-5 py-3 text-start text-theme-xs text-gray-500 font-medium dark:text-gray-400"
                    >
                      Amount (₹)
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-5 py-3 text-start text-theme-xs text-gray-500 font-medium dark:text-gray-400"
                    >
                      Allocation (%)
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {allocations.length > 0 ? (
                    allocations.map((a, i) => (
                      <TableRow key={i}>
                        <TableCell className="px-5 py-4 text-theme-sm text-gray-700 dark:text-white/90">
                          {a.account_name} ({a.qcode})
                        </TableCell>
                        <TableCell className="px-5 py-4 text-theme-sm text-gray-700 dark:text-white/90">
                          {a.allocation_date}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-theme-sm text-gray-700 dark:text-white/90">
                          {formatIndianCurrency(a.contribution_amount)}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-theme-sm text-gray-700 dark:text-white/90">
                          {a.allocation_percent}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="px-5 py-4 text-center text-theme-sm text-gray-700 dark:text-white/90"
                      >
                        No allocations found.
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