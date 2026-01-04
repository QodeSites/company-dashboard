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
  };
  columnNames?: string[];
}

export default function MutualFundHoldingsUploadPage() {
  const [accounts, setAccounts] = useState<SelectOption[]>([]);
  const [qcode, setQcode] = useState("");
  const [uploadDate, setUploadDate] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [operationResult, setOperationResult] = useState<UploadResponse | null>(null);
  const [csvPreview, setCsvPreview] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const requiredColumns = [
    "As of Date",
    "Symbol",
    "ISIN",
    "Quantity",
    "Avg Price",
    "Broker",
    "Debt/Equity",
    "Mastersheet Tag",
    "Sub Category",
    "NAV",
    "Buy Value",
    "Value as of Today",
    "PNL Amount",
    "% PNL",
  ];

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const res = await fetch("/api/accounts");
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
        // Scheme Code is optional, so we don't check for it
        const requiredCheck = requiredColumns.filter(col => col !== "Scheme Code");
        const missingColumns = requiredCheck.filter((col) => !headers.includes(col));
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
    if (!qcode || !file || !uploadDate) {
      alert("Please select an account, upload a CSV file, and select a date.");
      return;
    }

    setIsUploading(true);
    setIsProcessing(false);
    setUploadProgress(0);
    setOperationResult(null);

    const formData = new FormData();
    formData.append("qcode", qcode);
    formData.append("file", file);
    formData.append("date", uploadDate);

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
        xhr.open("POST", "/api/upload/mutual-fund-holding-test");
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
          ? `First error: ${response.firstError.error} (Row ${response.firstError.rowIndex})`
          : "Unknown error";
        alert(`⚠️ ${response.message}\n${errorMessage}\nCheck Operation Result for details on failed rows.`);
      } else {
        const message = `${response.message}${
          response.failedRows && response.failedRows.length > 0
            ? `\nFirst error: ${response.firstError?.error} (Row ${response.firstError?.rowIndex})\nCheck Operation Result for details on ${response.failedRows.length} failed rows.`
            : ""
        }`;
        alert(`✅ ${message}`);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
      alert(`❌ Upload failed: ${errorMessage}`);
      console.error(err);
    } finally {
      setIsUploading(false);
      setIsProcessing(false);
      setFile(null);
      setCsvPreview([]);
      setUploadDate(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const isOperationInProgress = isUploading || isProcessing;

  return (
    <div className="space-y-8 p-6">
      <ComponentCard title="Upload Mutual Fund Holdings" className="p-6">
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

          {/* Date Selection */}
          <div>
            <DatePicker
              label="Upload Date"
              placeholder="Select date"
              onChange={(date) => {
                if (date) {
                  const formatted = new Date(date[0]).toISOString().split("T")[0];
                  setUploadDate(formatted);
                } else {
                  setUploadDate(null);
                }
              }}
              id="uploadDate"
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
              CSV must include columns: {requiredColumns.join(", ")} (Scheme Code is optional)
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

          {/* Upload Button */}
          {csvPreview.length > 0 && (
            <div>
              <Label>Upload CSV</Label>
              <button
                onClick={handleUpload}
                disabled={isOperationInProgress || !file || !qcode || !uploadDate}
                className={`w-full sm:w-auto px-6 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 flex items-center justify-center ${
                  isOperationInProgress || !file || !qcode || !uploadDate
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-brand-600 hover:bg-brand-700"
                }`}
              >
                {isUploading ? (
                  <>
                    <Spinner />
                    {isProcessing ? "Processing..." : "Uploading..."}
                  </>
                ) : (
                  "Upload CSV"
                )}
              </button>
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
                {isProcessing ? "Processing on server..." : `${uploadProgress}% Uploading`}
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
                operationResult.failedRows && operationResult.failedRows.length > 0 ||
                operationResult.message.includes("failed")
                  ? "p-4 border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/10 rounded-lg"
                  : "p-4 border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-900/10 rounded-lg"
              }
            >
              <h3
                className={
                  operationResult.failedRows && operationResult.failedRows.length > 0 ||
                  operationResult.message.includes("failed")
                    ? "font-semibold text-red-800 dark:text-red-300"
                    : "font-semibold text-green-800 dark:text-green-300"
                }
              >
                {operationResult.message}
              </h3>
              {operationResult.failedRows && operationResult.failedRows.length > 0 && (
                <p className="mt-1 text-sm text-red-700 dark:text-red-400">
                  Found {operationResult.failedRows.length} row(s) with errors. Below are details for the first{" "}
                  {Math.min(operationResult.failedRows.length, 5)} issues:
                </p>
              )}
            </div>
            {operationResult.failedRows && operationResult.failedRows.length > 0 && (
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
                <li>Ensure numeric values don't contain invalid characters</li>
                <li>Verify that all required fields are not empty</li>
                <li>Scheme Code is optional and can be left empty</li>
              </ul>
            </div>
          </div>
        </ComponentCard>
      )}
    </div>
  );
}
