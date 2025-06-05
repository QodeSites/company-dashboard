// src/app/users/page.tsx

// @ts-nocheck
"use client";

import React, { useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import { Table, TableHeader, TableRow, TableCell, TableBody } from "@/components/ui/table";
import Link from "next/link";
import Spinner from "@/components/spinners/Spinner";
import Button from "@/components/ui/button/Button";

type UsersDashboardData = {
  totalUsers: number;
  activeAllocations: number;
  recentUsers: { icode: string; user_name: string }[];
};

interface User {
  icode: string;
  user_name: string;
  email?: string;
}

export default function UsersDashboard() {
  const [data, setData] = useState<UsersDashboardData | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingIcode, setDeletingIcode] = useState<string | null>(null); // Track deleting user

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const [usersRes, dashboardRes] = await Promise.all([
          fetch("/api/users"),
          fetch("/api/dashboard/users"),
        ]);

        if (!usersRes.ok) throw new Error("Failed to fetch users");
        if (!dashboardRes.ok) throw new Error("Failed to fetch dashboard data");

        const usersData = await usersRes.json();
        const dashboardData = await dashboardRes.json();

        setUsers(usersData);
        setData(dashboardData);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
        console.error("Error fetching data:", err);
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleDelete = async (icode: string) => {
    if (!confirm(`Are you sure you want to delete user with ICode ${icode}?`)) return;

    try {
      setDeletingIcode(icode);
      setError(null);

      const response = await fetch(`/api/users/${icode}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete user");
      }

      // Remove the deleted user from the state
      setUsers((prevUsers) => prevUsers.filter((user) => user.icode !== icode));
      
      // Update dashboard data if necessary
      if (data) {
        setData({
          ...data,
          totalUsers: data.totalUsers - 1,
          recentUsers: data.recentUsers.filter((user) => user.icode !== icode),
        });
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
      console.error("Error deleting user:", err);
      setError(errorMessage);
    } finally {
      setDeletingIcode(null);
    }
  };

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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {data && (
          <>
            <ComponentCard title="Total Users" className="flex flex-col p-6">
              <p className="text-2xl font-semibold text-gray-800 dark:text-white">
                {data.totalUsers}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Individual + Pooled
              </p>
            </ComponentCard>

            <ComponentCard title="Active Allocations" className="flex flex-col p-6">
              <p className="text-2xl font-semibold text-gray-800 dark:text-white">
                {data.activeAllocations}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Pooled user mappings
              </p>
            </ComponentCard>

            <ComponentCard title="Recent Users" className="flex flex-col p-6">
              <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-2 mt-2">
                {data.recentUsers.length > 0 ? (
                  data.recentUsers.map((user) => (
                    <li key={user.icode} className="flex items-center gap-2">
                      <span className="font-medium">{user.icode}</span> - {user.user_name}
                    </li>
                  ))
                ) : (
                  <li className="text-gray-500 dark:text-gray-400">No recent users</li>
                )}
              </ul>
            </ComponentCard>
          </>
        )}
      </div>

      <ComponentCard title="All Users" className="p-0">
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
                      ICode
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-5 py-3 text-start text-theme-xs text-gray-500 font-medium dark:text-gray-400"
                    >
                      Name
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-5 py-3 text-start text-theme-xs text-gray-500 font-medium dark:text-gray-400"
                    >
                      Email
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-5 py-3 text-start text-theme-xs text-gray-500 font-medium dark:text-gray-400"
                    >
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {users.length > 0 ? (
                    users.map((user) => (
                      <TableRow key={user.icode}>
                        <TableCell className="px-5 py-4 text-theme-sm text-gray-700 dark:text-white/90">
                          {user.icode}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-theme-sm text-gray-700 dark:text-white/90">
                          {user.user_name}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-theme-sm text-gray-700 dark:text-white/90">
                          {user.email || "-"}
                        </TableCell>
                        <TableCell className="px-3 py-2 flex items-center gap-2">
                          <Link
                            href={`/users/${user.icode}`}
                            className=" bg-blue-400 p-2 text-white rounded-xl hover:underline text-sm"
                          >
                            View Details
                          </Link>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDelete(user.icode)}
                            disabled={deletingIcode === user.icode}
                          >
                            {deletingIcode === user.icode ? "Deleting..." : "Delete"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell className="px-5 py-4 text-center text-theme-sm text-gray-700 dark:text-white/90">
                        No users found.
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