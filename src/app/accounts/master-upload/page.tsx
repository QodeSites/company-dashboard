"use client";

import React, { useEffect, useState, useRef } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import Select from "@/components/form/Select";
import DatePicker from "@/components/form/date-picker";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import Spinner from "@/components/spinners/Spinner";

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
    row: Record<string, unknown>; // Changed 'any' to 'unknown'
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
  const [selectedQcode, setSelectedQcode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [operationType, setOperationType] = useState<
    "upload" | "combined" | "replace" | "delete" | null
  >(null);
  const [operationResult, setOperationResult] = useState<UploadResponse | null>(null);
  const [csvPreview, setCsvPreview] = useState<string[]>([]);
  const [filterStartDate, setFilterStartDate] = useState<string | null>(null);
  const [filterEndDate, setFilterEndDate] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        const res = await fetch("/api/accounts");
        if (!res.ok) {
          throw new Error("Failed to fetch accounts");
        }
        const json: Account[] = await res.json();
        const formatted: SelectOption[] = json.map((acc) => ({
          value: acc.qcode,
          label: `${acc.qcode.toUpperCase()} - ${acc.account_name} (${acc.account_type})`,
        }));
        setAccounts(formatted);
        if (formatted.length > 0) {
          setSelectedQcode(formatted[0].value);
        }
      } catch (error) {
        console.error("Failed to fetch accounts:", error);
        alert("Failed to load accounts. Please refresh the page.");
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
    if (!filterStartDate && !filterEndDate) return true;
    if (!filterStartDate || !filterEndDate) {
      alert(`Both start and end dates are required for ${context}.`);
      return false;
    }
    if (new Date(filterStartDate) > new Date(filterEndDate)) {
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
    setCsvPreview(validation.preview);
    if (!validation.isValid) {
      alert(`CSV validation failed: ${validation.message}`);
      if (e.target) e.target.value = "";
      return;
    }
    setFile(selectedFile);
    setOperationResult(null);
    setUploadProgress(0);
    setIsProcessing(false);
  };

  const handleUpload = async () => {
    if (!selectedQcode || !file) {
      alert("Please select an account and upload a CSV file.");
      return;
    }
    if (filterStartDate || filterEndDate) {
      if (!validateDateRange("upload")) return;
    }
    setIsLoading(true);
    setIsProcessing(false);
    setOperationType("upload");
    setUploadProgress(0);
    setOperationResult(null);
    const formData = new FormData();
    formData.append("qcode", selectedQcode);
    formData.append("file", file);
    if (filterStartDate && filterEndDate) {
      formData.append("startDate", filterStartDate);
      formData.append("endDate", filterEndDate);
    }
    try {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          setUploadProgress(Math.min(Math.round(percentComplete), 99));
        }
      });
      xhr.upload.addEventListener("load", () => {
        setIsProcessing(true);
      });
      const response: UploadResponse = await new Promise((resolve, reject) => {
        xhr.open("POST", "/api/upload-csv");
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
      setOperationResult(response);
      if (response.totalRows === 0 || response.insertedRows === 0) {
        console.error("Upload details:", response);
        const errorMessage = response.firstError
          ? `First error: ${response.firstError.error} (Row ${response.firstError.rowIndex}, Date: ${response.firstError.rawDate}, System Tag: ${response.firstError.rawSystemTag})`
          : "Unknown error";
        alert(`⚠️ ${response.message}\n${errorMessage}\nCheck Operation Result for details on failed rows.`);
      } else {
        const message = `${response.message}${
          response.failedRows && response.failedRows.length > 0
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
      setIsLoading(false);
      setIsProcessing(false);
      setOperationType(null);
      setFile(null);
      setCsvPreview([]);
      setFilterStartDate(null);
      setFilterEndDate(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!selectedQcode) {
      alert("Please select an account.");
      return;
    }
    if (!validateDateRange("deletion")) return;
    if (!filterStartDate || !filterEndDate) {
      alert("Please select a date range to delete records.");
      return;
    }
    setIsDeleting(true);
    setOperationType("delete");
    setOperationResult(null);
    try {
      const res = await fetch("/api/delete-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qcode: selectedQcode,
          startDate: filterStartDate,
          endDate: filterEndDate,
        }),
      });
      const response: UploadResponse = await res.json();
      if (!res.ok) {
        throw new Error(response.message || "Deletion failed");
      }
      setOperationResult(response);
      alert(`✅ ${response.message}`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
      alert(`❌ Deletion failed: ${errorMessage}`);
      console.error(err);
    } finally {
      setIsDeleting(false);
      setOperationType(null);
      setFilterStartDate(null);
      setFilterEndDate(null);
    }
  };

  const handleCombinedOperation = async () => {
    if (!selectedQcode || !file) {
      alert("Please select an account and upload a CSV file.");
      return;
    }
    if (!validateDateRange("deletion and upload")) return;
    if (!filterStartDate || !filterEndDate) {
      alert("Please select a date range for deletion and upload.");
      return;
    }
    setIsLoading(true);
    setIsProcessing(true);
    setOperationType("combined");
    setUploadProgress(0);
    setOperationResult(null);
    try {
      const deleteRes = await fetch("/api/delete-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qcode: selectedQcode,
          startDate: filterStartDate,
          endDate: filterEndDate,
        }),
      });
      const deleteResponse: UploadResponse = await deleteRes.json();
      if (!deleteRes.ok) {
        throw new Error(deleteResponse.message || "Deletion failed");
      }
      const formData = new FormData();
      formData.append("qcode", selectedQcode);
      formData.append("file", file);
      formData.append("startDate", filterStartDate);
      formData.append("endDate", filterEndDate);
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          setUploadProgress(Math.min(Math.round(percentComplete), 99));
        }
      });
      xhr.upload.addEventListener("load", () => {
        setIsProcessing(true);
      });
      const uploadResponse: UploadResponse = await new Promise((resolve, reject) => {
        xhr.open("POST", "/api/upload-csv");
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
      setOperationResult({
        message: `${deleteResponse.message}. ${uploadResponse.message}`,
        deletedCount: deleteResponse.deletedCount,
        totalRows: uploadResponse.totalRows,
        columnNames: uploadResponse.columnNames,
        firstError: uploadResponse.firstError,
        failedRows: uploadResponse.failedRows,
      });
      const message = `${deleteResponse.message}. ${uploadResponse.message}${
        uploadResponse.failedRows && uploadResponse.failedRows.length > 0
          ? `\nFirst error: ${uploadResponse.firstError?.error} (Row ${uploadResponse.firstError?.rowIndex}, Date: ${uploadResponse.firstError?.rawDate}, System Tag: ${uploadResponse.firstError?.rawSystemTag})\nCheck Operation Result for details on ${uploadResponse.failedRows.length} failed rows.`
          : ""
      }`;
      alert(`✅ ${message}`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
      alert(`❌ Operation failed: ${errorMessage}`);
      console.error(err);
    } finally {
      setIsLoading(false);
      setIsProcessing(false);
      setOperationType(null);
      setFile(null);
      setCsvPreview([]);
      setFilterStartDate(null);
      setFilterEndDate(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleReplaceMasterSheet = async () => {
    if (!selectedQcode || !file) {
      alert("Please select an account and upload a CSV file.");
      return;
    }
    if (!confirm("This will DELETE ALL existing data in the master sheet for this account and replace it with the new CSV data. This action cannot be undone. Are you sure you want to proceed?")) {
      return;
    }
    setIsLoading(true);
    setIsProcessing(false);
    setOperationType("replace");
    setUploadProgress(0);
    setOperationResult(null);
    const formData = new FormData();
    formData.append("qcode", selectedQcode);
    formData.append("file", file);
    try {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          setUploadProgress(Math.min(Math.round(percentComplete), 99));
        }
      });
      xhr.upload.addEventListener("load", () => {
        setIsProcessing(true);
      });
      const response: UploadResponse = await new Promise((resolve, reject) => {
        xhr.open("POST", "/api/replace-master-sheet");
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error(`Replacement failed with status ${xhr.status}: ${xhr.statusText}`));
          }
        };
        xhr.onerror = () => reject(new Error("Network error during replacement"));
        xhr.send(formData);
      });
      setOperationResult(response);
      if (response.totalRows === 0 || response.insertedRows === 0) {
        console.warn("No rows processed or inserted:", response);
        const errorMessage = response.firstError
          ? `First error: ${response.firstError.error} (Row ${response.firstError.rowIndex}, Date: ${response.firstError.rawDate}, System Tag: ${response.firstError.rawSystemTag})`
          : "Unknown error";
        alert(`⚠️ ${response.message}\n${errorMessage}\nCheck Operation Result for details on failed rows.`);
      } else {
        const message = `${response.message}${
          response.failedRows && response.failedRows.length > 0
            ? `\nFirst error: ${response.firstError?.error} (Row ${response.firstError?.rowIndex}, Date: ${response.firstError?.rawDate}, System Tag: ${response.firstError?.rawSystemTag})\nCheck Operation Result for details on ${response.failedRows.length} failed rows.`
            : ""
        }`;
        alert(`✅ ${message}`);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
      alert(`❌ Replacement failed: ${errorMessage}`);
      console.error(err);
    } finally {
      setIsLoading(false);
      setIsProcessing(false);
      setOperationType(null);
      setFile(null);
      setCsvPreview([]);
      setFilterStartDate(null);
      setFilterEndDate(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const isOperationInProgress = isLoading || isProcessing || isDeleting;

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
              onChange={(value) => setSelectedQcode(value)}
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
                  setFilterStartDate(formatted);
                } else {
                  setFilterStartDate(null);
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
                  setFilterEndDate(formatted);
                } else {
                  setFilterEndDate(null);
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
                onClick={() => fileInputRef.current?.click()}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                  isOperationInProgress
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
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileChange}
                disabled={isOperationInProgress}
              />
              {file && (
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {file.name}
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              CSV must include columns: {requiredColumns.join(", ")}
            </p>
          </div>

          {/* CSV Preview */}
          {csvPreview.length > 0 && (
            <div>
              <Label>CSV Preview</Label>
              <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-x-auto">
                <pre className="text-xs text-gray-700 dark:text-white/90">
                  {csvPreview.join("\n")}
                </pre>
              </div>
            </div>
          )}

          {/* Delete Records */}
          <div>
            <Label>Delete Records</Label>
            <button
              onClick={handleDelete}
              disabled={isOperationInProgress || !filterStartDate || !filterEndDate || !selectedQcode}
              className={`w-full sm:w-auto px-6 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 flex items-center justify-center ${
                isOperationInProgress || !filterStartDate || !filterEndDate || !selectedQcode
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-red-600 hover:bg-red-700"
              }`}
            >
              {isDeleting && operationType === "delete" ? (
                <>
                  <Spinner  />
                  Deleting...
                </>
              ) : (
                "Delete Records for Selected Date Range"
              )}
            </button>
          </div>

          {/* Upload Options */}
          {csvPreview.length > 0 && (
            <div>
              <Label>Upload CSV</Label>
              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={handleUpload}
                  disabled={isOperationInProgress || !file || !selectedQcode}
                  className={`w-full sm:w-auto px-6 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 flex items-center justify-center ${
                    isOperationInProgress || !file || !selectedQcode
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-brand-600 hover:bg-brand-700"
                  }`}
                >
                  {isLoading && operationType === "upload" ? (
                    <>
                      <Spinner  />
                      {isProcessing ? "Processing..." : "Uploading..."}
                    </>
                  ) : (
                    "Upload CSV"
                  )}
                </button>
                <button
                  onClick={handleCombinedOperation}
                  disabled={isOperationInProgress || !filterStartDate || !filterEndDate || !file || !selectedQcode}
                  className={`w-full sm:w-auto px-6 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 flex items-center justify-center ${
                    isOperationInProgress || !filterStartDate || !filterEndDate || !file || !selectedQcode
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-purple-600 hover:bg-purple-700"
                  }`}
                >
                  {isLoading && operationType === "combined" ? (
                    <>
                      <Spinner  />
                      {isProcessing ? "Processing..." : "Uploading..."}
                    </>
                  ) : (
                    "Delete and Upload for Selected Date Range"
                  )}
                </button>
                <button
                  onClick={handleReplaceMasterSheet}
                  disabled={isOperationInProgress || !file || !selectedQcode}
                  className={`w-full sm:w-auto px-6 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 flex items-center justify-center ${
                    isOperationInProgress || !file || !selectedQcode
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-orange-600 hover:bg-orange-700"
                  }`}
                >
                  {isLoading && operationType === "replace" ? (
                    <>
                      <Spinner  />
                      {isProcessing ? "Processing..." : "Uploading..."}
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
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {isDeleting && operationType === "delete"
                  ? "Deleting records..."
                  : isProcessing
                  ? "Processing on server..."
                  : `${uploadProgress}% Uploading`}
              </p>
            </div>
          )}
        </div>
      </ComponentCard>

      {/* Operation Result */}
      {operationResult && (
        <ComponentCard title="Operation Result" className="p-6">
          <div className="space-y-6">
            <div
              className={
                operationResult.failedRows && operationResult.failedRows.length > 0|| operationResult.message.includes("failed")
                  ? "p-4 border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/10 rounded-lg"
                  : "p-4 border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-900/10 rounded-lg"
              }
            >
              <h3
                className={
                  operationResult.failedRows && operationResult.failedRows.length > 0|| operationResult.message.includes("failed")
                    ? "font-semibold text-red-800 dark:text-red-300"
                    : "font-semibold text-green-800 dark:text-green-300"
                }
              >
                {operationResult.message}
              </h3>
              {operationResult.deletedCount && operationResult.deletedCount > 0 && (
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-400">
                  Deleted {operationResult.deletedCount} existing rows.
                </p>
              )}
              {operationResult.failedRows && operationResult.failedRows.length > 0&& (
                <p className="mt-1 text-sm text-red-700 dark:text-red-400">
                  Found {operationResult.failedRows.length} row(s) with errors. Below are details for the first{" "}
                  {Math.min(operationResult.failedRows.length, 5)} issues:
                </p>
              )}
            </div>
            {operationResult.failedRows && operationResult.failedRows.length > 0&& (
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
                    {operationResult.failedRows.slice(0, 5).map((row, index) => (
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
            {operationResult.columnNames && operationResult.columnNames.length > 0 && (
              <div>
                <h4 className="font-medium text-gray-700 dark:text-white">CSV Columns Found:</h4>
                <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg mt-2">
                  <code className="text-xs text-gray-700 dark:text-white/90">
                    {operationResult.columnNames.join(", ")}
                  </code>
                </div>
              </div>
            )}
            <div className="p-4 border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-900/10 rounded-lg">
              <h4 className="font-medium text-blue-800 dark:text-blue-300">Troubleshooting Tips:</h4>
              <ul className="list-disc ml-5 mt-2 text-sm text-blue-700 dark:text-blue-400">
                <li>Make sure your CSV has all required columns with exact spelling</li>
                <li>Check that dates are in a valid format (YYYY-MM-DD recommended)</li>
                <li>Ensure numeric values don&quot;t contain invalid characters</li>
                <li>Verify that &quot;System Tag&quot; column is not empty</li>
                <li>Ensure CSV dates are within the selected date range if provided</li>
              </ul>
            </div>
          </div>
        </ComponentCard>
      )}
    </div>
  );
}