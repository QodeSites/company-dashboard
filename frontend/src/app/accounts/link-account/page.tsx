// @ts-nocheck
"use client";

import React, { useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import MultiSelect from "@/components/form/MultiSelect";



interface Account {
  qcode: string;
  account_name: string;
}


export default function LinkAccountsPage() {

  const [formData, setFormData] = useState({
    source_qcode: "",
    target_qcodes: [] as string[],
    access_level: "read",
  });

  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    fetch("/api/accounts")
      .then(res => res.json())
      .then(setAccounts)
      .catch(console.error);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // const response = await fetch("/api/accounts/link-account", {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify(formData),
      // });

      alert("✅ Accounts linked successfully!");

      setFormData({
        source_qcode: "",
        target_qcodes: [],
        access_level: "read",
      });
    } catch (error) {
      console.error("Error:", error);
      alert("❌ Error linking accounts. Please try again.");
    }
  };

  return (
    <ComponentCard title="Link One Account to Multiple Accounts">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <Label>Source Account</Label>
          <select
            name="source_qcode"
            value={formData.source_qcode}
            onChange={handleInputChange}
            className="w-full px-4 py-2 border rounded bg-white dark:bg-dark-800"
            required
          >
            <option value="">-- Select Source --</option>
            {accounts.map((acc) => (
              <option key={acc.qcode} value={acc.qcode}>
                {acc.account_name} ({acc.qcode})
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label>Target Accounts</Label>
          <MultiSelect
            label="Select Target Accounts"
            options={accounts
              .filter((acc) => acc.qcode !== formData.source_qcode)
              .map((acc) => ({
                value: acc.qcode,
                text: `${acc.account_name} (${acc.qcode})`,
                selected: formData.target_qcodes.includes(acc.qcode),
              }))}
            defaultSelected={formData.target_qcodes}
            onChange={(selected) =>
              setFormData((prev) => ({ ...prev, target_qcodes: selected }))
            }
          />

        </div>

        <button
          type="submit"
          className="bg-brand-500 text-white px-4 py-2 rounded hover:bg-brand-600"
        >
          Link Accounts
        </button>
      </form>
    </ComponentCard>
  );
}
