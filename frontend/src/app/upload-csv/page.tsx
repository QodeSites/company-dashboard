// @ts-nocheck
"use client"

import FileInput from "@/components/form/input/FileInput";
import React, { useState, useMemo } from "react";
import * as XLSX from "xlsx";

interface RowData {
  accountCode: string;
  scheme: string;
  capitalInOut: number;
  dividend: number;
  xirr: number;
}

interface HoldingRow {
  entry_date: string;
  oc: string;
  stock: string;
  qty: number;
  buy_price: number;
  sell_price: number;
  account: string;
  account_code: string;
  type: string;
  scheme: string;
  id: number;
}

interface CashInOutRow {
  date: string;
  account_code: string;
  scheme: string;
  capital_in_out: number;
  dividend: number;
  id: number;
  active_inactive: string;
}

const UploadCashHoldings = () => {
  const [cashRows, setCashRows] = useState<RowData[]>([]);
  const [holdingsRows, setHoldingsRows] = useState<HoldingRow[]>([]);
  const [cashInOutRows, setCashInOutRows] = useState<CashInOutRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [message, setMessage] = useState("");
  // State for filters
  const [selectedAccountCodes, setSelectedAccountCodes] = useState<string[]>([]);
  const [selectedSchemes, setSelectedSchemes] = useState<string[]>([]);
  // State for bulk edit
  const [bulkActiveInactive, setBulkActiveInactive] = useState<"Active" | "Inactive" | "">("");

  const handleCashUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<any>(sheet);

    const formatted = json.map((row: any) => ({
      accountCode: row["Account Number"],
      scheme: row["Name"],
      capitalInOut: parseFloat(row["CV"]) || 0,
      dividend: parseFloat(row["TP"]) || 0,
      xirr: parseFloat(row["XIRR"]) || 0,
    }));

    setCashRows(formatted);
    setMessage("✅ Cash file parsed successfully.");
  };

  const handleHoldingsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<any>(sheet);

    const formatted = json.map((row: any) => ({
      entry_date: new Date(row["entry_date"]).toISOString().split("T")[0],
      oc: row["o/c"],
      stock: row["stock"],
      qty: parseFloat(row["qty"]) || 0,
      buy_price: parseFloat(row["buy_price"]) || 0,
      sell_price: parseFloat(row["sell_price"]) || 0,
      account: row["account"],
      account_code: row["account_code"],
      type: row["type"],
      scheme: row["scheme"],
      id: parseInt(row["id"]) || null,
    }));

    setHoldingsRows(formatted);
    setMessage("✅ Holdings file parsed successfully.");
  };

  const handleCashEdit = (i: number, key: keyof RowData, value: string) => {
    const updated = [...cashRows];
    updated[i][key] = parseFloat(value) || 0;
    setCashRows(updated);
  };

  const handleCashInOutEdit = (i: number, key: keyof CashInOutRow, value: string) => {
    const updated = [...cashInOutRows];
    if (key === "capital_in_out" || key === "dividend" || key === "id") {
      updated[i][key] = parseFloat(value) || 0;
    } else {
      updated[i][key] = value;
    }
    setCashInOutRows(updated);
  };

  const handleFetchCashInOut = async () => {
    setFetching(true);
    setMessage("");

    try {
      const res = await fetch("/api/upload-cash-and-holdings");
      const result = await res.json();

      if (res.ok) {
        setCashInOutRows(result.data);
        setMessage("✅ Cash in/out data fetched successfully.");
      } else {
        setMessage(`❌ Error: ${result.error}`);
      }
    } catch {
      setMessage("❌ Server error while fetching data.");
    } finally {
      setFetching(false);
    }
  };

  const handleSubmit = async () => {
    setUploading(true);
    setMessage("");

    const body = {
      cash: cashRows,
      holdings: holdingsRows,
    };

    try {
      const res = await fetch("/api/upload-cash-and-holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const result = await res.json();
      setMessage(res.ok ? "✅ Data uploaded successfully." : `❌ Error: ${result.error}`);
    } catch {
      setMessage("❌ Server error.");
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateCashInOut = async () => {
    setUploading(true);
    setMessage("");

    try {
      const res = await fetch("/api/upload-cash-and-holdings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cashInOut: cashInOutRows }),
      });

      const result = await res.json();
      setMessage(res.ok ? "✅ Cash in/out data updated successfully." : `❌ Error: ${result.error}`);
    } catch {
      setMessage("❌ Server error while updating data.");
    } finally {
      setUploading(false);
    }
  };

  // Compute unique account codes and schemes for dropdowns
  const accountCodes = useMemo(() => {
    const codes = new Set(cashInOutRows.map((row) => row.account_code));
    return Array.from(codes).sort();
  }, [cashInOutRows]);

  const schemes = useMemo(() => {
    const schemeSet = new Set(cashInOutRows.map((row) => row.scheme));
    return Array.from(schemeSet).sort();
  }, [cashInOutRows]);

  // Filter cashInOutRows based on selected filters
  const filteredCashInOutRows = useMemo(() => {
    return cashInOutRows.filter((row) => {
      const matchesAccountCode =
        selectedAccountCodes.length === 0 || selectedAccountCodes.includes(row.account_code);
      const matchesScheme = selectedSchemes.length === 0 || selectedSchemes.includes(row.scheme);
      return matchesAccountCode && matchesScheme;
    });
  }, [cashInOutRows, selectedAccountCodes, selectedSchemes]);

  // Handle bulk edit
  const handleBulkEdit = () => {
    if (!bulkActiveInactive) {
      setMessage("❌ Please select Active or Inactive for bulk edit.");
      return;
    }

    const updatedRows = cashInOutRows.map((row) => {
      const matchesAccountCode =
        selectedAccountCodes.length === 0 || selectedAccountCodes.includes(row.account_code);
      const matchesScheme = selectedSchemes.length === 0 || selectedSchemes.includes(row.scheme);
      if (matchesAccountCode && matchesScheme) {
        return { ...row, active_inactive: bulkActiveInactive };
      }
      return row;
    });

    setCashInOutRows(updatedRows);
    setMessage(`✅ Bulk updated active_inactive to ${bulkActiveInactive}.`);
    setBulkActiveInactive("");
  };

  return (
    <div className="max-w-6xl mx-auto mt-10 p-6 rounded-xl border shadow bg-white dark:bg-gray-800">
      <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">
        Upload Cash Summary File
      </h2>
      <FileInput onChange={handleCashUpload} />

      <h2 className="text-xl font-semibold mt-10 mb-4 text-gray-800 dark:text-white">
        Upload Holdings File
      </h2>
      <FileInput onChange={handleHoldingsUpload} />

      <h2 className="text-xl font-semibold mt-10 mb-4 text-gray-800 dark:text-white">
        View/Edit Cash In/Out Data
      </h2>
      <button
        onClick={handleFetchCashInOut}
        disabled={fetching}
        className="mb-4 px-6 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-400"
      >
        {fetching ? "Fetching..." : "Fetch Cash In/Out Data"}
      </button>

      {cashInOutRows.length > 0 && (
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                Filter by Account Code
              </label>
              <select
                multiple
                value={selectedAccountCodes}
                onChange={(e) =>
                  setSelectedAccountCodes(
                    Array.from(e.target.selectedOptions, (option) => option.value)
                  )
                }
                className="w-full p-2 border rounded-lg bg-white dark:bg-gray-700 dark:text-white"
              >
                {accountCodes.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                Filter by Scheme
              </label>
              <select
                multiple
                value={selectedSchemes}
                onChange={(e) =>
                  setSelectedSchemes(
                    Array.from(e.target.selectedOptions, (option) => option.value)
                  )
                }
                className="w-full p-2 border rounded-lg bg-white dark:bg-gray-700 dark:text-white"
              >
                {schemes.map((scheme) => (
                  <option key={scheme} value={scheme}>
                    {scheme}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-4 mb-4">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Bulk Edit Active/Inactive
            </label>
            <select
              value={bulkActiveInactive}
              onChange={(e) =>
                setBulkActiveInactive(e.target.value as "Active" | "Inactive" | "")
              }
              className="p-2 border rounded-lg bg-white dark:bg-gray-700 dark:text-white"
            >
              <option value="">Select</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
            <button
              onClick={handleBulkEdit}
              disabled={!bulkActiveInactive}
              className="px-4 py-2 rounded-lg bg-yellow-600 text-white hover:bg-yellow-700 disabled:bg-gray-400"
            >
              Apply Bulk Edit
            </button>
          </div>
        </div>
      )}

      {message && <p className="mt-4 text-sm">{message}</p>}

      {cashRows.length > 0 && (
        <>
          <h3 className="mt-8 mb-2 font-medium text-gray-700 dark:text-white">
            Cash Summary (Editable)
          </h3>
          <div className="overflow-auto border rounded-lg">
            <table className="w-full table-auto text-sm text-gray-700 dark:text-gray-200">
              <thead className="bg-gray-100 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-2 border">Account Code</th>
                  <th className="px-4 py-2 border">Scheme</th>
                  <th className="px-4 py-2 border">CV</th>
                  <th className="px-4 py-2 border">Dividend</th>
                  <th className="px-4 py-2 border">XIRR</th>
                </tr>
              </thead>
              <tbody>
                {cashRows.map((row, i) => (
                  <tr key={i} className="bg-white dark:bg-gray-900">
                    <td className="border px-4 py-2">{row.accountCode}</td>
                    <td className="border px-4 py-2">{row.scheme}</td>
                    <td className="border px-4 py-2">
                      <input
                        type="number"
                        value={row.capitalInOut}
                        onChange={(e) => handleCashEdit(i, "capitalInOut", e.target.value)}
                        className="w-full bg-transparent border-b focus:outline-none"
                      />
                    </td>
                    <td className="border px-4 py-2">
                      <input
                        type="number"
                        value={row.dividend}
                        onChange={(e) => handleCashEdit(i, "dividend", e.target.value)}
                        className="w-full bg-transparent border-b focus:outline-none"
                      />
                    </td>
                    <td className="border px-4 py-2">
                      <input
                        type="number"
                        value={row.xirr}
                        onChange={(e) => handleCashEdit(i, "xirr", e.target.value)}
                        className="w-full bg-transparent border-b focus:outline-none"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {holdingsRows.length > 0 && (
        <>
          <h3 className="mt-10 mb-2 font-medium text-gray-700 dark:text-white">
            Holdings Preview
          </h3>
          <div className="overflow-auto border rounded-lg max-h-96">
            <table className="w-full table-auto text-sm text-gray-700 dark:text-gray-200">
              <thead className="bg-gray-100 dark:bg-gray-700">
                <tr>
                  {Object.keys(holdingsRows[0]).map((col) => (
                    <th key={col} className="px-2 py-1 border">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {holdingsRows.map((row, i) => (
                  <tr key={i} className="bg-white dark:bg-gray-900">
                    {Object.values(row).map((val, j) => (
                      <td key={j} className="border px-2 py-1 whitespace-nowrap">{val}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {cashInOutRows.length > 0 && (
        <>
          <h3 className="mt-10 mb-2 font-medium text-gray-700 dark:text-white">
            Cash In/Out Data (Editable)
          </h3>
          <div className="overflow-auto border rounded-lg">
            <table className="w-full table-auto text-sm text-gray-700 dark:text-gray-200">
              <thead className="bg-gray-100 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-2 border">Date</th>
                  <th className="px-4 py-2 border">Account Code</th>
                  <th className="px-4 py-2 border">Scheme</th>
                  <th className="px-4 py-2 border">Capital In/Out</th>
                  <th className="px-4 py-2 border">Dividend</th>
                  <th className="px-4 py-2 border">ID</th>
                  <th className="px-4 py-2 border">Active/Inactive</th>
                </tr>
              </thead>
              <tbody>
                {filteredCashInOutRows.map((row) => (
                  <tr key={row.id} className="bg-white dark:bg-gray-900">
                    <td className="border px-4 py-2">
                      <input
                        type="date"
                        value={row.date}
                        onChange={(e) =>
                          handleCashInOutEdit(
                            cashInOutRows.findIndex((r) => r.id === row.id),
                            "date",
                            e.target.value
                          )
                        }
                        className="w-full bg-transparent border-b focus:outline-none"
                      />
                    </td>
                    <td className="border px-4 py-2">
                      <input
                        type="text"
                        value={row.account_code}
                        onChange={(e) =>
                          handleCashInOutEdit(
                            cashInOutRows.findIndex((r) => r.id === row.id),
                            "account_code",
                            e.target.value
                          )
                        }
                        className="w-full bg-transparent border-b focus:outline-none"
                      />
                    </td>
                    <td className="border px-4 py-2">
                      <input
                        type="text"
                        value={row.scheme}
                        onChange={(e) =>
                          handleCashInOutEdit(
                            cashInOutRows.findIndex((r) => r.id === row.id),
                            "scheme",
                            e.target.value
                          )
                        }
                        className="w-full bg-transparent border-b focus:outline-none"
                      />
                    </td>
                    <td className="border px-4 py-2">
                      <input
                        type="number"
                        value={row.capital_in_out}
                        onChange={(e) =>
                          handleCashInOutEdit(
                            cashInOutRows.findIndex((r) => r.id === row.id),
                            "capital_in_out",
                            e.target.value
                          )
                        }
                        className="w-full bg-transparent border-b focus:outline-none"
                      />
                    </td>
                    <td className="border px-4 py-2">
                      <input
                        type="number"
                        value={row.dividend}
                        onChange={(e) =>
                          handleCashInOutEdit(
                            cashInOutRows.findIndex((r) => r.id === row.id),
                            "dividend",
                            e.target.value
                          )
                        }
                        className="w-full bg-transparent border-b focus:outline-none"
                      />
                    </td>
                    <td className="border px-4 py-2">
                      <input
                        type="number"
                        value={row.id}
                        onChange={(e) =>
                          handleCashInOutEdit(
                            cashInOutRows.findIndex((r) => r.id === row.id),
                            "id",
                            e.target.value
                          )
                        }
                        className="w-full bg-transparent border-b focus:outline-none"
                      />
                    </td>
                    <td className="border px-4 py-2">
                      <select
                        value={row.active_inactive}
                        onChange={(e) =>
                          handleCashInOutEdit(
                            cashInOutRows.findIndex((r) => r.id === row.id),
                            "active_inactive",
                            e.target.value
                          )
                        }
                        className="w-full bg-transparent border-b focus:outline-none"
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={handleUpdateCashInOut}
            disabled={uploading}
            className="mt-6 px-6 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400"
          >
            {uploading ? "Updating..." : "Update Cash In/Out Data"}
          </button>
        </>
      )}

      {(cashRows.length > 0 || holdingsRows.length > 0) && (
        <button
          onClick={handleSubmit}
          disabled={uploading}
          className="mt-6 px-6 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400"
        >
          {uploading ? "Submitting..." : "Submit Both to DB"}
        </button>
      )}
    </div>
  );
};

export default UploadCashHoldings;