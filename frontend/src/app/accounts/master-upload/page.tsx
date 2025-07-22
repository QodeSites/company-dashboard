// @ts-nocheck
"use client";

import React, { useEffect, useState, useRef } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import DatePicker from "@/components/form/date-picker";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import Spinner from "@/components/spinners/Spinner";
import { API_BASE } from "@/lib/api";

interface Account {
  qcode: string;
  account_name: string;
  account_type: string;
}

interface SelectOption {
  value: string;
  label: string;
}

interface UploadResponse {
  message: string;
  totalRows?: number;
  insertedRows?: number;
  deletedCount?: number;
  failedRows?: Array<{
    rowIndex: number;
    error: string;
    row: Record<string, unknown>;
  }>;
  firstError?: {
    error: string;
    rowIndex: number;
    rawDate: string;
    rawSystemTag: string;
  };
  columnNames?: string[];
}

export default function MasterUploadPage() {
  const [accounts, setAccounts] = useState<SelectOption[]>([]);
  const [qcode, setQcode] = useState(""); // Changed from selectedQcode to qcode
  const [files, setFiles] = useState<{ master_sheet: File | null }>({ master_sheet: null });
  const [isUploading, setIsUploading] = useState<{ master_sheet: boolean }>({ master_sheet: false });
  const [isProcessing, setIsProcessing] = useState<{ master_sheet: boolean }>({ master_sheet: false });
  const [isDeleting, setIsDeleting] = useState(false); // Kept scalar for delete operation
  const [operationType, setOperationType] = useState<"upload" | "combined" | "replace" | "delete" | null>(null);
  const [operationResult, setOperationResult] = useState<{ master_sheet: UploadResponse | null }>({
    master_sheet: null,
  });
  const [csvPreviews, setCsvPreviews] = useState<{ master_sheet: string[] }>({ master_sheet: [] });
  const [filterStartDate, setFilterStartDate] = useState<{ master_sheet: string | null }>({
    master_sheet: null,
  });
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({
    master_sheet: 0, tradebook: 0, slippage: 0, mutual_fund_holding: 0, gold_tradebook: 0, liquidbees_tradebook: 0,
  });
  const [filterEndDate, setFilterEndDate] = useState<{ master_sheet: string | null }>({ master_sheet: null });
  const fileInputRefs = {
    master_sheet: useRef<HTMLInputElement | null>(null),
  };

  // const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3000"; // Define API_BASE

  const requiredColumns = [
    "Date",
    "Portfolio Value",
    "Cash In/Out",
    "NAV",
    "Prev NAV",
    "PnL",
    "Daily P/L %",
    "Exposure Value",
    "Prev Portfolio Value",
    "Prev Exposure Value",
    "Prev Pnl",
    "Drawdown %",
    "System Tag",
  ];

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/accounts`);
        if (!res.ok) {
          throw new Error(`Failed to fetch accounts: ${res.status} ${res.statusText}`);
        }
        const json: { accounts: Account[] } = await res.json();
        const accountsArray = json.accounts;
        if (!Array.isArray(accountsArray)) {
          console.warn("Received non-array accounts:", accountsArray);
          setAccounts([]);
          alert("No valid accounts found. Please try again.");
          return;
        }
        const formatted: SelectOption[] = accountsArray.map((acc: Account) => ({
          value: acc.qcode,
          label: `${acc.qcode.toUpperCase()} - ${acc.account_name} (${acc.account_type})`,
        }));
        setAccounts(formatted);
        if (formatted.length > 0) {
          setQcode(formatted[0].value);
        } else {
          setQcode("");
        }
      } catch (error) {
        console.error("Failed to fetch accounts:", error);
        alert("Failed to load accounts. Please refresh the page.");
        setAccounts([]);
      }
    };
    fetchAccounts();
  }, []);

  const validateCsvFile = (file: File): Promise<{ isValid: boolean; message: string; preview: string[] }> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        if (!text) {
          resolve({ isValid: false, message: "Empty file", preview: [] });
          return;
        }
        const lines = text.split("\n");
        if (lines.length < 2) {
          resolve({ isValid: false, message: "CSV file must have a header row and at least one data row", preview: [] });
          return;
        }
        const headers = lines[0].split(",").map((h) => h.replace(/^\uFEFF/, "").replace(/^\u00EF\u00BB\u00BF/, "").trim());
        const missingColumns = requiredColumns.filter((col) => !headers.includes(col));
        if (missingColumns.length > 0) {
          resolve({
            isValid: false,
            message: `Missing required columns: ${missingColumns.join(", ")}`,
            preview: lines.slice(0, 3),
          });
          return;
        }
        resolve({
          isValid: true,
          message: "CSV validation passed",
          preview: lines.slice(0, 3),
        });
      };
      reader.onerror = () => {
        resolve({ isValid: false, message: "Error reading file", preview: [] });
      };
      reader.readAsText(file);
    });
  };

  const validateDateRange = (context: string): boolean => {
    if (!filterStartDate.master_sheet && !filterEndDate.master_sheet) return true;
    if (!filterStartDate.master_sheet || !filterEndDate.master_sheet) {
      alert(`Both start and end dates are required for ${context}.`);
      return false;
    }
    if (new Date(filterStartDate.master_sheet) > new Date(filterEndDate.master_sheet)) {
      alert("Start date cannot be after end date.");
      return false;
    }
    return true;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    if (!selectedFile.name.toLowerCase().endsWith(".csv")) {
      alert("Please select a CSV file");
      if (e.target) e.target.value = "";
      return;
    }
    const validation = await validateCsvFile(selectedFile);
    setCsvPreviews((prev) => ({ ...prev, master_sheet: validation.preview }));
    if (!validation.isValid) {
      alert(`CSV validation failed: ${validation.message}`);
      if (e.target) e.target.value = "";
      return;
    }
    setFiles((prev) => ({ ...prev, master_sheet: selectedFile }));
    setOperationResult((prev) => ({ ...prev, master_sheet: null }));
    setUploadProgress((prev) => ({ ...prev, master_sheet: 0 }));
    setIsProcessing((prev) => ({
      ...prev, master_sheet: false
    }));
  };

  const handleUpload = async () => {
    if (!qcode || !files.master_sheet) {
      alert("Please select an account and upload a CSV file.");
      return;
    }
    if (filterStartDate.master_sheet || filterEndDate.master_sheet) {
      if (!validateDateRange("upload")) return;
    }
    setIsUploading((prev) => ({ ...prev, master_sheet: true }));
    setIsProcessing((prev) => ({ ...prev, master_sheet: false }));
    setOperationType("upload");
    setUploadProgress((prev) => ({ ...prev, master_sheet: 0 }));
    setOperationResult((prev) => ({ ...prev, master_sheet: null }));
    const formData = new FormData();
    formData.append("qcode", qcode);
    formData.append("file", files.master_sheet);
    if (filterStartDate.master_sheet && filterEndDate.master_sheet) {
      formData.append("startDate", filterStartDate.master_sheet);
      formData.append("endDate", filterEndDate.master_sheet);
    }
    try {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          setUploadProgress((prev) => ({ ...prev, master_sheet: Math.min(Math.round(percentComplete), 99) }));
        }
      });
      xhr.upload.addEventListener("load", () => {
        setIsProcessing((prev) => ({ ...prev, master_sheet: true }));
      });
      const response: UploadResponse = await new Promise((resolve, reject) => {
        xhr.open("POST", `${API_BASE}/api/upload-csv`);
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.statusText}`));
          }
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(formData);
      });
      setOperationResult((prev) => ({ ...prev, master_sheet: response }));
      if (response.totalRows === 0 || response.insertedRows === 0) {
        console.error("Upload details:", response);
        const errorMessage = response.firstError
          ? `First error: ${response.firstError.error} (Row ${response.firstError.rowIndex}, Date: ${response.firstError.rawDate}, System Tag: ${response.firstError.rawSystemTag})`
          : "Unknown error";
        alert(`⚠️ ${response.message}\n${errorMessage}\nCheck Operation Result for details on failed rows.`);
      } else {
        const message = `${response.message}${response.failedRows && response.failedRows.length > 0
          ? `\nFirst error: ${response.firstError?.error} (Row ${response.firstError?.rowIndex}, Date: ${response.firstError?.rawDate}, System Tag: ${response.firstError?.rawSystemTag})\nCheck Operation Result for details on ${response.failedRows.length} failed rows.`
          : ""
          }`;
        alert(`✅ ${message}`);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
      alert(`❌ Upload failed: ${errorMessage}`);
      console.error(err);
    } finally {
      setIsUploading((prev) => ({ ...prev, master_sheet: false }));
      setIsProcessing((prev) => ({ ...prev, master_sheet: false }));
      setOperationType(null);
      setFiles((prev) => ({ ...prev, master_sheet: null }));
      setCsvPreviews((prev) => ({ ...prev, master_sheet: [] }));
      setFilterStartDate((prev) => ({ ...prev, master_sheet: null }));
      setFilterEndDate((prev) => ({ ...prev, master_sheet: null }));
      if (fileInputRefs.master_sheet.current) fileInputRefs.master_sheet.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!qcode) {
      alert("Please select an account.");
      return;
    }
    if (!validateDateRange("deletion")) return;
    if (!filterStartDate.master_sheet || !filterEndDate.master_sheet) {
      alert("Please select a date range to delete records.");
      return;
    }
    setIsDeleting(true);
    setOperationType("delete");
    setOperationResult((prev) => ({ ...prev, master_sheet: null }));
    try {
      const res = await fetch(`${API_BASE}/api/delete-records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qcode,
          startDate: filterStartDate.master_sheet,
          endDate: filterEndDate.master_sheet,
        }),
      });
      const response: UploadResponse = await res.json();
      if (!res.ok) {
        throw new Error(response.message || "Deletion failed");
      }
      setOperationResult((prev) => ({ ...prev, op_result: response }));
      alert(`✅ ${response.message}`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
      alert(`❌ Deletion failed: ${errorMessage}`);
      console.error(err);
    } finally {
      setIsDeleting(false);
      setOperationType(null);
      setFilterStartDate((prev) => ({ ...prev, master_sheet: null }));
      setFilterEndDate((prev) => ({ ...prev, master_sheet: null }));
    }
  };

  const handleCombinedOperation = async () => {
    if (!qcode || !files.master_sheet) {
      alert("Please select an account and upload a CSV file.");
      return;
    }
    if (!validateDateRange("deletion and upload")) return;
    if (!filterStartDate.master_sheet || !filterEndDate.master_sheet) {
      alert("Please select a date range for deletion and upload.");
      return;
    }
    setIsUploading((prev) => ({ ...prev, master_sheet: true }));
    setIsProcessing((prev) => ({ ...prev, master_sheet: true }));
    setOperationType("combined");
    setUploadProgress((prev) => ({ ...prev, master_sheet: 0 }));
    setOperationResult((prev) => ({ ...prev, master_sheet: null }));
    try {
      const deleteRes = await fetch(`${API_BASE}/api/delete-records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qcode,
          startDate: filterStartDate.master_sheet,
          endDate: filterEndDate.master_sheet,
        }),
      });
      const deleteResponse: UploadResponse = await deleteRes.json();
      if (!deleteRes.ok) {
        throw new Error(deleteResponse.message || "Deletion failed");
      }
      const formData = new FormData();
      formData.append("qcode", qcode);
      formData.append("file", files.master_sheet);
      formData.append("startDate", filterStartDate.master_sheet);
      formData.append("endDate", filterEndDate.master_sheet);
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          setUploadProgress((prev) => ({ ...prev, master_sheet: Math.min(Math.round(percentComplete), 99) }));
        }
      });
      xhr.upload.addEventListener("load", () => {
        setIsProcessing((prev) => ({ ...prev, master_sheet: true }));
      });
      const uploadResponse: UploadResponse = await new Promise((resolve, reject) => {
        xhr.open("POST", `${API_BASE}/api/upload-csv`);
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.statusText}`));
          }
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(formData);
      });
      setOperationResult((prev) => ({
        ...prev,
        master_sheet: {
          message: `${deleteResponse.message}. ${uploadResponse.message}`,
          deletedCount: deleteResponse.deletedCount,
          totalRows: uploadResponse.totalRows,
          columnNames: uploadResponse.columnNames,
          firstError: uploadResponse.firstError,
          failedRows: uploadResponse.failedRows,
        },
      }));
      const message = `${deleteResponse.message}. ${uploadResponse.message}${uploadResponse.failedRows && uploadResponse.failedRows.length > 0
        ? `\nFirst error: ${uploadResponse.firstError?.error} (Row ${uploadResponse.firstError?.rowIndex}, Date: ${uploadResponse.firstError?.rawDate}, System Tag: ${uploadResponse.firstError?.rawSystemTag})\nCheck Operation Result for details on ${uploadResponse.failedRows.length} failed rows.`
        : ""
        }`;
      alert(`✅ ${message}`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
      alert(`❌ Operation failed: ${errorMessage}`);
      console.error(err);
    } finally {
      setIsUploading((prev) => ({ ...prev, master_sheet: false }));
      setIsProcessing((prev) => ({ ...prev, master_sheet: false }));
      setOperationType(null);
      setFiles((prev) => ({ ...prev, master_sheet: null }));
      setCsvPreviews((prev) => ({ ...prev, master_sheet: [] }));
      setFilterStartDate((prev) => ({ ...prev, master_sheet: null }));
      setFilterEndDate((prev) => ({ ...prev, master_sheet: null }));
      if (fileInputRefs.master_sheet.current) fileInputRefs.master_sheet.current.value = "";
    }
  };

  // Mock fetchTableData and fetchChartData (replace with actual implementations if available)
  const fetchTableData = async (type: string) => {
    console.log(`Fetching table data for ${type}`);
    // Implement actual logic to fetch table data
  };

  const fetchChartData = async () => {
    console.log("Fetching chart data");
    // Implement actual logic to fetch chart data
  };

  const handleReplaceMasterSheet = async () => {
    const file = files.master_sheet;
    if (!file) {
      alert("Please select a CSV file to upload for master_sheet.");
      return;
    }
    if (
      !confirm(
        "This will DELETE ALL existing data for this qcode in the master sheet and replace it with the new CSV data. This action cannot be undone. Are you sure you want to proceed?"
      )
    ) {
      return;
    }
    setIsUploading((prev) => ({ ...prev, master_sheet: true }));
    setIsProcessing((prev) => ({ ...prev, master_sheet: false }));
    setOperationType("replace");
    setUploadProgress((prev) => ({ ...prev, master_sheet: 0 }));
    setOperationResult((prev) => ({ ...prev, master_sheet: null }));
    const formData = new FormData();
    formData.append("qcode", qcode);
    formData.append("file", file);
    const controller = new AbortController();
    try {
      const url = `${API_BASE}/api/replace/master-sheet/`;
      console.log("Requesting URL:", url);
      const response = await fetch(url, {
        method: "POST",
        body: formData,
        signal: controller.signal,
        redirect: "follow",
      });
      console.log("Response status:", response.status, "OK:", response.ok, "URL:", response.url);
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Response error text:", errorText);
        throw new Error(`Replacement failed with status ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      console.log("Response result:", result);
      setOperationResult((prev) => ({ ...prev, master_sheet: result }));
      if (result.totalRows === 0 || result.insertedRows === 0) {
        const errorMessage = result.firstError
          ? `First error: ${result.firstError.error} (Row ${result.firstError.rowIndex})`
          : "Unknown error";
        alert(`⚠️ ${result.message}\n${errorMessage}\nCheck Operation Result for details on failed rows.`);
      } else {
        const message = `${result.message}${result.failedRows && result.failedRows.length > 0
          ? `\nFirst error: ${result.firstError?.error} (Row ${result.firstError?.rowIndex})\nCheck Operation Result for details on ${result.failedRows.length} failed rows.`
          : ""
          }`;
        alert(`✅ ${message}`);
        fetchTableData("master_sheet");
        fetchChartData();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
      console.error("Full error details:", err);
      alert(`❌ Replacement failed: ${errorMessage}. Check the console for details.`);
    } finally {
      setIsUploading((prev) => ({ ...prev, master_sheet: false }));
      setIsProcessing((prev) => ({ ...prev, master_sheet: false }));
      setOperationType(null);
      setFiles((prev) => ({ ...prev, master_sheet: null }));
      setCsvPreviews((prev) => ({ ...prev, master_sheet: [] }));
      setFilterStartDate((prev) => ({ ...prev, master_sheet: null }));
      setFilterEndDate((prev) => ({ ...prev, master_sheet: null }));
      if (fileInputRefs.master_sheet.current) fileInputRefs.master_sheet.current.value = "";
    }
  };

  const isOperationInProgress = isUploading.master_sheet || isProcessing.master_sheet || isDeleting;

  return (
    <div className="space-y-8 p-6">
      <ComponentCard title="Upload Master Sheet" className="p-6">
        <div className="space-y-6">
          {/* Account Select */}
          <div>
            <Label>Select Account</Label>
            <Select
              options={accounts}
              placeholder="Choose account"
              onChange={(value) => setQcode(value)}
              className="w-full h-11 px-4 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/50"
            />
          </div>

          {/* Date Range Selection */}
          <div className="flex flex-col sm:flex-row gap-4">
            <DatePicker
              label="Start Date"
              placeholder="From"
              onChange={(date) => {
                if (date) {
                  const formatted = new Date(date[0]).toISOString().split("T")[0];
                  setFilterStartDate((prev) => ({ ...prev, master_sheet: formatted }));
                } else {
                  setFilterStartDate((prev) => ({ ...prev, master_sheet: null }));
                }
              }}
              id="filterStartDate"
            />
            <DatePicker
              label="End Date"
              placeholder="To"
              onChange={(date) => {
                if (date) {
                  const formatted = new Date(date[0]).toISOString().split("T")[0];
                  setFilterEndDate((prev) => ({ ...prev, master_sheet: formatted }));
                } else {
                  setFilterEndDate((prev) => ({ ...prev, master_sheet: null }));
                }
              }}
              id="filterEndDate"
            />
          </div>

          {/* File Input */}
          <div>
            <Label>CSV File</Label>
            <div className="flex items-center gap-4">
              <button
                onClick={() => fileInputRefs.master_sheet.current?.click()}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${isOperationInProgress
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-brand-600 hover:bg-brand-700"
                  }`}
                disabled={isOperationInProgress}
              >
                Select CSV
              </button>
              <input
                type="file"
                accept=".csv"
                ref={fileInputRefs.master_sheet}
                className="hidden"
                onChange={handleFileChange}
                disabled={isOperationInProgress}
              />
              {files.master_sheet && (
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {files.master_sheet.name}
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              CSV must include columns: {requiredColumns.join(", ")}
            </p>
          </div>

          {/* CSV Preview */}
          {csvPreviews.master_sheet.length > 0 && (
            <div>
              <Label>CSV Preview</Label>
              <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-x-auto">
                <pre className="text-xs text-gray-700 dark:text-white/90">
                  {csvPreviews.master_sheet.join("\n")}
                </pre>
              </div>
            </div>
          )}

          {/* Delete Records */}
          <div>
            <Label>Delete Records</Label>
            <button
              onClick={handleDelete}
              disabled={isOperationInProgress || !filterStartDate.master_sheet || !filterEndDate.master_sheet || !qcode}
              className={`w-full sm:w-auto px-6 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 flex items-center justify-center ${isOperationInProgress || !filterStartDate.master_sheet || !filterEndDate.master_sheet || !qcode
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-red-600 hover:bg-red-700"
                }`}
            >
              {isDeleting && operationType === "delete" ? (
                <>
                  <Spinner />
                  Deleting...
                </>
              ) : (
                "Delete Records for Selected Date Range"
              )}
            </button>
          </div>

          {/* Upload Options */}
          {csvPreviews.master_sheet.length > 0 && (
            <div>
              <Label>Upload CSV</Label>
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={handleUpload}
                  disabled={isOperationInProgress || !files.master_sheet || !qcode}
                  className={`w-full sm:w-auto px-6 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 flex items-center justify-center ${isOperationInProgress || !files.master_sheet || !qcode
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-brand-600 hover:bg-brand-700"
                    }`}
                >
                  {isUploading.master_sheet && operationType === "upload" ? (
                    <>
                      <Spinner />
                      {isProcessing.master_sheet ? "Processing..." : "Uploading..."}
                    </>
                  ) : (
                    "Upload CSV"
                  )}
                </button>
                <button
                  onClick={handleCombinedOperation}
                  disabled={
                    isOperationInProgress ||
                    !filterStartDate.master_sheet ||
                    !filterEndDate.master_sheet ||
                    !files.master_sheet ||
                    !qcode
                  }
                  className={`w-full sm:w-auto px-6 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 flex items-center justify-center ${isOperationInProgress ||
                    !filterStartDate.master_sheet ||
                    !filterEndDate.master_sheet ||
                    !files.master_sheet ||
                    !qcode
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-purple-600 hover:bg-purple-700"
                    }`}
                >
                  {isUploading.master_sheet && operationType === "combined" ? (
                    <>
                      <Spinner />
                      {isProcessing.master_sheet ? "Processing..." : "Uploading..."}
                    </>
                  ) : (
                    "Delete and Upload for Selected Date Range"
                  )}
                </button>
                <button
                  onClick={handleReplaceMasterSheet}
                  disabled={isOperationInProgress || !files.master_sheet || !qcode}
                  className={`w-full sm:w-auto px-6 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 flex items-center justify-center ${isOperationInProgress || !files.master_sheet || !qcode
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-orange-600 hover:bg-orange-700"
                    }`}
                >
                  {isUploading.master_sheet && operationType === "replace" ? (
                    <>
                      <Spinner />
                      {isProcessing.master_sheet ? "Processing..." : "Uploading..."}
                    </>
                  ) : (
                    "Replace Entire Master Sheet"
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Progress Bar */}
          {isOperationInProgress && (
            <div className="mt-4">
              <Label>Operation Progress</Label>
              <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                <div
                  className="bg-brand-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress.master_sheet}%` }}
                ></div>
              </div>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {isDeleting && operationType === "delete"
                  ? "Deleting records..."
                  : isProcessing.master_sheet
                    ? "Processing on server..."
                    : `${uploadProgress.master_sheet}% Uploading`}
              </p>
            </div>
          )}
        </div>
      </ComponentCard>

      {/* Operation Result */}
      {operationResult.master_sheet && (
        <ComponentCard title="Operation Result" className="p-6">
          <div className="space-y-6">
            <div
              className={
                operationResult.master_sheet.failedRows &&
                  operationResult.master_sheet.failedRows.length > 0 ||
                  operationResult.master_sheet.message.includes("failed")
                  ? "p-4 border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/10 rounded-lg"
                  : "p-4 border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-900/10 rounded-lg"
              }
            >
              <h3
                className={
                  operationResult.master_sheet.failedRows &&
                    operationResult.master_sheet.failedRows.length > 0 ||
                    operationResult.master_sheet.message.includes("failed")
                    ? "font-semibold text-red-800 dark:text-red-300"
                    : "font-semibold text-green-800 dark:text-green-300"
                }
              >
                {operationResult.master_sheet.message}
              </h3>
              {operationResult.master_sheet.deletedCount && operationResult.master_sheet.deletedCount > 0 && (
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-400">
                  Deleted {operationResult.master_sheet.deletedCount} existing rows.
                </p>
              )}
              {operationResult.master_sheet.failedRows && operationResult.master_sheet.failedRows.length > 0 && (
                <p className="mt-1 text-sm text-red-700 dark:text-red-400">
                  Found {operationResult.master_sheet.failedRows.length} row(s) with errors. Below are details for the first{" "}
                  {Math.min(operationResult.master_sheet.failedRows.length, 5)} issues:
                </p>
              )}
            </div>
            {operationResult.master_sheet.failedRows && operationResult.master_sheet.failedRows.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="border-b border-gray-100 dark:border-gray-700">
                    <TableRow>
                      <TableCell
                        isHeader
                        className="px-5 py-3 text-start text-xs text-gray-500 font-medium dark:text-gray-400"
                      >
                        Row #
                      </TableCell>
                      <TableCell
                        isHeader
                        className="px-5 py-3 text-start text-xs text-gray-500 font-medium dark:text-gray-400"
                      >
                        Error
                      </TableCell>
                      <TableCell
                        isHeader
                        className="px-5 py-3 text-start text-xs text-gray-500 font-medium dark:text-gray-400"
                      >
                        Row Data
                      </TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {operationResult.master_sheet.failedRows.slice(0, 5).map((row, index) => (
                      <TableRow key={index}>
                        <TableCell className="px-5 py-4 text-sm text-gray-700 dark:text-white">
                          {row.rowIndex}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-sm text-red-600 dark:text-red-400">
                          {row.error}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-sm text-gray-700 dark:text-white">
                          <pre className="whitespace-pre-wrap text-xs">
                            {JSON.stringify(row.row, null, 2)}
                          </pre>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {operationResult.master_sheet.columnNames && operationResult.master_sheet.columnNames.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-700 dark:text-white">CSV Columns Found:</h4>
                <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg mt-2">
                  <code className="text-xs text-gray-700 dark:text-white/90">
                    {operationResult.master_sheet.columnNames.join(", ")}
                  </code>
                </div>
              </div>
            )}
            <div className="p-4 border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-900/10 rounded-lg">
              <h4 className="font-medium text-blue-800 dark:text-blue-300">Troubleshooting Tips:</h4>
              <ul className="list-disc ml-5 mt-2 text-sm text-blue-700 dark:text-blue-400">
                <li>Make sure your CSV has all required columns with exact spelling</li>
                <li>Check that dates are in a valid format (YYYY-MM-DD recommended)</li>
                <li>Ensure numeric values don"t contain invalid characters</li>
                <li>Verify that "System Tag" column is not empty</li>
                <li>Ensure CSV dates are within the selected date range if provided</li>
              </ul>
            </div>
          </div>
        </ComponentCard>
      )}
    </div>
  );
}