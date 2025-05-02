"use client";

import React, { useState, useEffect } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import InputField from "@/components/form/input/InputField";
import Select from "@/components/form/Select";
import DatePicker from "@/components/form/date-picker";

interface UserAllocation {
  icode: string;
  date: string;
  amount: string;
  access_level: string;
}

interface User {
  icode: string;
  user_name: string;
}

interface FormData {
  account_name: string;
  broker: string;
  account_type: string;
}

export default function CreateAccountPage() {
  const [formData, setFormData] = useState<FormData>({
    account_name: "",
    broker: "",
    account_type: "",
  });

  const [users, setUsers] = useState<UserAllocation[]>([
    { icode: "", date: "", amount: "", access_level: "read" },
  ]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/users")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch users");
        return res.json();
      })
      .then((data) => setAllUsers(data || []))
      .catch((err) => {
        console.error("Error fetching users:", err);
        alert("❌ Failed to load users. Please try again.");
      });
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSelectAccountType = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      account_type: value,
      broker: "",
    }));
  };

  const handleSelectBroker = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      broker: value,
    }));
  };

  const handleUserChange = (index: number, field: string, value: string) => {
    const updated = [...users];
    updated[index][field as keyof UserAllocation] = value;
    setUsers(updated);
  };

  const addUserRow = () => {
    setUsers([...users, { icode: "", date: "", amount: "", access_level: "read" }]);
  };

  // Updated validateForm function with debug logging
  const validateForm = (): boolean => {
    if (!formData.account_name) {
      alert("Account Name is required.");
      return false;
    }
    if (!formData.account_type) {
      alert("Account Type is required.");
      return false;
    }
    if (!formData.broker) {
      alert("Broker is required.");
      return false;
    }
    for (const [index, user] of users.entries()) {
      console.log(`Validating user ${index + 1}:`, user); // Debug
      if (!user.icode) {
        alert(`User selection is required for allocation ${index + 1}.`);
        return false;
      }
      if (!user.date) {
        alert(`Date is required for allocation ${index + 1}.`);
        return false;
      }
      const amount = parseFloat(user.amount);
      if (!user.amount || isNaN(amount)) {
        alert(`Valid amount is required for allocation ${index + 1}.`);
        return false;
      }
      if (!user.access_level) {
        alert(`Access level is required for allocation ${index + 1}.`);
        return false;
      }
    }
    return true;
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);

    const payload = { ...formData, user_allocations: users };

    try {
      const response = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(text);
        } catch {
          throw new Error(`Server returned non-JSON response: ${text.slice(0, 100)}...`);
        }
        throw new Error(errorData.message || `Request failed with status ${response.status}`);
      }

      const result = await response.json();
      alert(`✅ Account Created Successfully! New Code: ${result.account.qcode}`);

      setFormData({ account_name: "", broker: "", account_type: "" });
      setUsers([{ icode: "", date: "", amount: "", access_level: "read" }]);
    } catch (error: any) {
      console.error("Error creating account:", error);
      alert(`❌ Error creating account: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const brokerOptions =
    formData.account_type === "pms"
      ? [
        { value: "zerodha", label: "Zerodha" },
        { value: "emkay", label: "Emkay" },
      ]
      : formData.account_type === "managed_account" || formData.account_type === "prop"
        ? [
          { value: "zerodha", label: "Zerodha" },
          { value: "jainam", label: "Jainam" },
          { value: "marwadi", label: "Marwadi" },
          { value: "sre", label: "SRE" },
        ]
        : [];

  return (
    <ComponentCard title="Create New Account">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <Label>Account Name</Label>
          <InputField
            type="text"
            name="account_name"
            value={formData.account_name}
            onChange={handleChange}
            placeholder="Enter Account Name"
            disabled={isSubmitting}
          />
        </div>

        <div className="relative">
          <Label>Account Type</Label>
          <Select
            options={[
              { value: "pms", label: "PMS" },
              { value: "managed_account", label: "Managed Account" },
              { value: "prop", label: "Prop Account" },
            ]}
            placeholder="Select Account Type"
            onChange={handleSelectAccountType}
            value={formData.account_type}
            className="dark:bg-dark-900"
            disabled={isSubmitting}
          />
        </div>

        {formData.account_type && (
          <div className="relative">
            <Label>Broker</Label>
            <Select
              options={brokerOptions}
              placeholder="Select Broker"
              onChange={handleSelectBroker}
              value={formData.broker}
              className="dark:bg-dark-900"
              disabled={isSubmitting}
            />
          </div>
        )}

        <div className="space-y-4">
          <Label>Add Users and Allocations</Label>
          {users.map((entry, index) => (
            <div key={index} className="space-y-4 border p-4 rounded-lg">
              <div className="grid grid-cols-4 gap-4 items-end">
                <div>
                  <Label>User</Label>
                  <select
                    className="w-full border affect border px-3 py-2 rounded text-sm"
                    value={entry.icode}
                    onChange={(e) => handleUserChange(index, "icode", e.target.value)}
                    disabled={isSubmitting}
                  >
                    <option value="">-- Select User --</option>
                    {allUsers.map((u) => (
                      <option key={u.icode} value={u.icode}>
                        {u.user_name} ({u.icode})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Date</Label>
                  <DatePicker
                    value={entry.date ? new Date(entry.date) : null}
                    onChange={(date) => {
                      const formatted = date ? new Date(date).toISOString().split("T")[0] : "";
                      console.log(`Setting date for allocation ${index + 1}:`, formatted); // Debug
                      handleUserChange(index, "date", formatted);
                    }}
                    id={`allocationDate-${index}`}
                    className="w-full h-11 px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <Label>Amount (₹)</Label>
                  <input
                    type="number"
                    placeholder="Amount"
                    value={entry.amount}
                    onChange={(e) => handleUserChange(index, "amount", e.target.value)}
                    className="w-full border px-3 py-2 rounded text-sm"
                    step="0.01"
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <Label>Access Level</Label>
                  <select
                    className="w-full border px-3 py-2 rounded text-sm"
                    value={entry.access_level}
                    onChange={(e) => handleUserChange(index, "access_level", e.target.value)}
                    disabled={isSubmitting}
                  >
                    <option value="read">Read</option>
                    <option value="write">Write</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addUserRow}
            className="text-sm text-blue-600 hover:underline"
            disabled={isSubmitting}
          >
            + Add another user
          </button>
        </div>

        <button
          type="submit"
          className={`bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium flex items-center justify-center ${isSubmitting ? "opacity-50 cursor-not-allowed" : "hover:bg-blue-700"
            }`}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
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
              Creating...
            </>
          ) : (
            "Create Account"
          )}
        </button>
      </form>
    </ComponentCard>
  );
}