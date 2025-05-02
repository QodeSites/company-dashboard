"use client";

import React, { useEffect, useState } from "react";
import InputField from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import DatePicker from "../form/date-picker";
import { formatIndianCurrency, parseIndianCurrency } from "@/utils/currencyFormat";

export default function PooledAllocationsForm() {
  const [accounts, setAccounts] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [entries, setEntries] = useState([{ icode: "", date: "", amount: "" }]);

  useEffect(() => {
    const fetchAll = async () => {
      const [accRes, userRes] = await Promise.all([
        fetch("/api/accounts"),
        fetch("/api/users"),
      ]);
      setAccounts(await accRes.json());
      setUsers(await userRes.json());
    };
    fetchAll();
  }, []);

  const handleChange = (index: number, field: string, value: string) => {
    const updated = [...entries];
    if (field === "amount") {
      updated[index][field] = parseIndianCurrency(value);
    } else {
      updated[index][field] = value;
    }
    setEntries(updated);
  };

  const addRow = () => {
    setEntries([...entries, { icode: "", date: "", amount: "" }]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasEmptyAmount = entries.some((e) => !e.amount);
    if (hasEmptyAmount) {
      alert("Please fill in all amount fields.");
      return;
    }

    const payload = {
      qcode: selectedAccount,
      allocations: entries.map((e) => ({
        icode: e.icode,
        date: e.date,
        amount: e.amount,
      })),
    };

    const res = await fetch("/api/pooled-allocations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    alert(json.message || "Success");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <Label>Select Account</Label>
        <select
          className="w-full h-11 px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50"
          value={selectedAccount}
          onChange={(e) => setSelectedAccount(e.target.value)}
        >
          <option value="">-- Select --</option>
          {accounts
          .filter((acc:any) => acc.account_type === "prop")
          .map((acc: any) => (
            <option key={acc.qcode} value={acc.qcode}>
              {acc.account_name} ({acc.qcode})
            </option>
          ))}
        </select>
      </div>

      {entries.map((entry, index) => (
        <div
          key={index}
          className="grid grid-cols-3 items-center gap-4" // Changed to items-center
        >
          <div className="flex flex-col">
            <Label>User*</Label>
            <select
              className="w-full h-11 px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50"
              value={entry.icode}
              required
              onChange={(e) => handleChange(index, "icode", e.target.value)}
            >
              <option value="">-- Select User --</option>
              {users.map((u: any) => (
                <option key={u.icode} value={u.icode}>
                  {u.user_name} ({u.icode})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <DatePicker
              label="Date"
              value={entry.date}
              onChange={(date) => {
                const formatted = date
                  ? new Date(date).toISOString().split("T")[0]
                  : "";
                handleChange(index, "date", formatted);
              }}
              id={`allocationDate-${index}`}
              className="w-full h-11 px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50"
            />
          </div>
          <div className="flex flex-col">
            <Label>Amount*</Label>
            <InputField
              type="text"
              placeholder="Amount (₹)"
              value={formatIndianCurrency(entry.amount)}
              onChange={(e) => handleChange(index, "amount", e.target.value)}
              required={true}
              error={entry.amount === ""}
              className="w-full h-11 px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50"
            />
          </div>
        </div>
      ))}

      <div className="flex items-center space-x-4">
        <button
          type="button"
          onClick={addRow}
          className="text-sm text-blue-600 hover:underline"
        >
          + Add another entry
        </button>
        <button
          type="submit"
          className="bg-brand-500 text-white px-4 py-2 rounded-lg hover:bg-brand-600"
        >
          Submit Allocations
        </button>
      </div>
    </form>
  );
}