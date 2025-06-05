// @ts-nocheck
"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Breadcrumb from "@/components/breadcrumb/breadcrumb";
import Spinner from "@/components/spinners/Spinner";
import PropsAndManagedAccount from "@/components/PropsAndManagedAccount";
import PmsAccount from "@/components/PmsAccount";

interface Account {
  qcode: string;
  account_type: "pms" | "prop" | "managed_account";
  account_name: string;
  // Add other relevant fields
}

export default function AccountDetailsPage() {
  const params = useParams();
  const qcode = Array.isArray(params.qcode) ? params.qcode[0] : params.qcode;
  const [account, setAccount] = useState<Account | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!qcode) {
      setError("qcode is required");
      setIsLoading(false);
      return;
    }

    const fetchAccountDetails = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const res = await fetch("/api/accounts");
        if (!res.ok) {
          throw new Error("Failed to fetch account details");
        }
        const accounts: Account[] = await res.json();
        const found = accounts.find(acc => acc.qcode === qcode)!
        setAccount({
          ...found,
          // map API’s snake_case → your camelCase interface
          accountType: found.account_type as "pms" | "prop" | "managed_account",
          account_name: found.account_name,  // (unchanged)
          // …any other fields you want to map
        });
        if (!found) {
          throw new Error(`Account with qcode ${qcode} not found`);
        }
        setAccount(found);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
        console.error("Error fetching account details:", errorMessage);
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAccountDetails();
  }, [qcode]);

  console.log("Account Details Page Rendered", { qcode, account, isLoading, error });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner />
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="text-center text-red-600 dark:text-red-400">
        {error || "Failed to load account details"}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 bg-gray-50 dark:bg-gray-900 rounded-xl">
      <Breadcrumb
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Accounts", href: "/accounts" },
          { label: qcode },
        ]}
      />
      <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Account: {qcode}</h1>
      {account.account_type === "pms" ? (
        <PmsAccount qcode={qcode} />
      ) : (
        <PropsAndManagedAccount qcode={qcode} />
      )}
    </div>
  );
}