// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import DatePicker from "@/components/form/date-picker";
import InputField from "@/components/form/input/InputField";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import Pagination from "@/components/tables/Pagination";
import Spinner from "@/components/spinners/Spinner";
import * as XLSX from "xlsx";
import Breadcrumb from "@/components/breadcrumb/breadcrumb";
import LineChartOne from "@/components/charts/line/LineChartOne";

interface Row {
  id: number;
  date: string;
  system_tag: string;
  nav: number | null | string;
  pnl: number | null | string;
  drawdown: number | null | string;
  portfolio_value: number | null | string;
  capital_in_out: number | null | string;
  prev_nav: number | null | string;
  daily_p_l: number | null | string;
  exposure_value: number | null | string;
  prev_portfolio_value: number | null | string;
  prev_exposure_value: number | null | string;
  prev_pnl: number | null | string;
  [key: string]: unknown;
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

interface ApiResponse {
  data: Row[];
  total: number;
}


export default function AccountDetailsPage() {
  const params = useParams();
  const qcode = Array.isArray(params.qcode) ? params.qcode[0] : params.qcode;
  if (!qcode) {
    throw new Error("qcode is required");
  }

  const [data, setData] = useState<Row[]>([]);
  const [chartData, setChartData] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterStartDate, setFilterStartDate] = useState<string | null>(null);
  const [filterEndDate, setFilterEndDate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isChartLoading, setIsChartLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [operationType, setOperationType] = useState<"upload" | "combined" | "replace" | "delete" | null>(null);
  const [operationResult, setOperationResult] = useState<UploadResponse | null>(null);
  const [csvPreview, setCsvPreview] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pageSize = 25;

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

  const fetchTableData = async () => {
    setIsLoading(true);
    const query = new URLSearchParams({
      qcode,
      page: page.toString(),
      pageSize: pageSize.toString(),
    });
    if (search) query.append("search", search);
    if (filterStartDate) query.append("start", filterStartDate);
    if (filterEndDate) query.append("end", filterEndDate);

    try {
      const res = await fetch(`/api/master-sheet?${query.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to fetch table data");
      }
      const json: ApiResponse = await res.json();
      console.log("Table API response data:", json.data);
      setData(json.data || []);
      setTotal(json.total || 0);
    } catch (error) {
      console.error("Error fetching table data:", error);
      alert("Failed to load table data. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchChartData = async () => {
    setIsChartLoading(true);
    const query = new URLSearchParams({
      qcode,
    });
    if (search) query.append("search", search);
    if (filterStartDate) query.append("start", filterStartDate);
    if (filterEndDate) query.append("end", filterEndDate);

    try {
      const res = await fetch(`/api/master-sheet?${query.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to fetch chart data");
      }
      const json: ApiResponse = await res.json();
      console.log("Chart API response data:", json.data);
      const validData = json.data.filter(
        (row) => row.nav != null && !isNaN(parseFloat(row.nav.toString()))
      );
      console.log(`Valid NAV records: ${validData.length} out of ${json.data.length}`);
      setChartData(json.data || []);
    } catch (error) {
      console.error("Error fetching chart data:", error);
      alert("Failed to load chart data. Please try again.");
    } finally {
      setIsChartLoading(false);
    }
  };

  useEffect(() => {
    fetchTableData();
    fetchChartData();
  }, [qcode, page, search, filterStartDate, filterEndDate]);

  const format = (val: unknown): string => {
    if (val == null) return "-";
    const num = typeof val === "string" ? parseFloat(val) : Number(val);
    return !isNaN(num) ? num.toFixed(2) : "-";
  };

  const chartSeries: Array<{ name: string; data: number[] }> = [
    {
      name: "NAV",
      data: chartData
        .map((row, index) => {
          if (row.nav == null || row.nav === "") {
            console.warn(`Null or empty nav value at index ${index}`);
            return 0;
          }
          const navNum = typeof row.nav === "string" ? parseFloat(row.nav) : Number(row.nav);
          if (isNaN(navNum)) {
            console.warn(`Invalid nav value at index ${index}:`, row.nav);
            return 0;
          }
          return Number(navNum.toFixed(2));
        })
        .filter((value): value is number => !isNaN(value)),
    },
  ];

  const chartCategories: string[] = chartData.map((row) => {
    const date = new Date(row.date);
    if (isNaN(date.getTime())) {
      console.warn(`Invalid date in row:`, row.date);
      return "Invalid Date";
    }
    return `${date.getDate()} ${date.toLocaleString("default", { month: "short" })} ${date.getFullYear()}`;
  });

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

  const handleDelete = async () => {
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
          qcode,
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
      fetchTableData();
      fetchChartData();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      alert(`❌ Deletion failed: ${errorMessage}`);
      console.error(err);
    } finally {
      setIsDeleting(false);
      setOperationType(null);
      setFilterStartDate(null);
      setFilterEndDate(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      alert("Please select a CSV file to upload.");
      return;
    }

    if (filterStartDate || filterEndDate) {
      if (!validateDateRange("upload")) return;
    }

    setIsUploading(true);
    setIsProcessing(false);
    setOperationType("upload");
    setUploadProgress(0);
    setOperationResult(null);

    const formData = new FormData();
    formData.append("qcode", qcode);
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
        alert(
          `⚠️ ${response.message}\n${errorMessage}\nCheck Operation Result for details on failed rows.`
        );
      } else {
        const message = `${response.message}${response.failedRows && response.failedRows.length > 0
          ? `\nFirst error: ${response.firstError?.error} (Row ${response.firstError?.rowIndex}, Date: ${response.firstError?.rawDate}, System Tag: ${response.firstError?.rawSystemTag})\nCheck Operation Result for details on ${response.failedRows.length} failed rows.`
          : ""
          }`;
        alert(`✅ ${message}`);
        fetchTableData();
        fetchChartData();
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      alert(`❌ Upload failed: ${errorMessage}`);
      console.error(err);
    } finally {
      setIsUploading(false);
      setIsProcessing(false);
      setOperationType(null);
      setFile(null);
      setCsvPreview([]);
      setFilterStartDate(null);
      setFilterEndDate(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleCombinedOperation = async () => {
    if (!file) {
      alert("Please select a CSV file to upload.");
      return;
    }
    if (!validateDateRange("deletion and upload")) return;
    if (!filterStartDate || !filterEndDate) {
      alert("Please select a date range for deletion and upload.");
      return;
    }

    setIsUploading(true);
    setIsProcessing(true);
    setOperationType("combined");
    setUploadProgress(0);
    setOperationResult(null);

    try {
      const deleteRes = await fetch("/api/delete-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qcode,
          startDate: filterStartDate,
          endDate: filterEndDate,
        }),
      });

      const deleteResponse: UploadResponse = await deleteRes.json();
      if (!deleteRes.ok) {
        throw new Error(deleteResponse.message || "Deletion failed");
      }

      const formData = new FormData();
      formData.append("qcode", qcode);
      formData.append("file", file);
      formData.append("startDate", filterStartDate);
      formData.append("endDate", filterEndDate);

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (event

      ) => {
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

      const message = `${deleteResponse.message}. ${uploadResponse.message}${uploadResponse.failedRows && uploadResponse.failedRows.length > 0
        ? `\nFirst error: ${uploadResponse.firstError?.error} (Row ${uploadResponse.firstError?.rowIndex}, Date: ${uploadResponse.firstError?.rawDate}, System Tag: ${uploadResponse.firstError?.rawSystemTag})\nCheck Operation Result for details on ${uploadResponse.failedRows.length} failed rows.`
        : ""
        }`;
      alert(`✅ ${message}`);
      fetchTableData();
      fetchChartData();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      alert(`❌ Operation failed: ${errorMessage}`);
      console.error(err);
    } finally {
      setIsUploading(false);
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
    if (!file) {
      alert("Please select a CSV file to upload.");
      return;
    }

    if (!confirm("This will DELETE ALL existing data in the master sheet and replace it with the new CSV data. This action cannot be undone. Are you sure you want to proceed?")) {
      return;
    }

    setIsUploading(true);
    setIsProcessing(false);
    setOperationType("replace");
    setUploadProgress(0);
    setOperationResult(null);

    const formData = new FormData();
    formData.append("qcode", qcode);
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

      console.log("Replace Master Sheet Response:", response);
      setOperationResult(response);
      if (response.totalRows === 0 || response.insertedRows === 0) {
        console.warn("No rows processed or inserted:", response);
        const errorMessage = response.firstError
          ? `First error: ${response.firstError.error} (Row ${response.firstError.rowIndex}, Date: ${response.firstError.rawDate}, System Tag: ${response.firstError.rawSystemTag})`
          : "Unknown error";
        alert(
          `⚠️ ${response.message}\n${errorMessage}\nCheck Operation Result for details on failed rows.`
        );
      } else {
        const message = `${response.message}${response.failedRows && response.failedRows.length > 0
          ? `\nFirst error: ${response.firstError?.error} (Row ${response.firstError?.rowIndex}, Date: ${response.firstError?.rawDate}, System Tag: ${response.firstError?.rawSystemTag})\nCheck Operation Result for details on ${response.failedRows.length} failed rows.`
          : ""
          }`;
        alert(`✅ ${message}`);
        fetchTableData();
        fetchChartData();
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      console.error("Replace Master Sheet Error:", errorMessage);
      alert(`❌ Replacement failed: ${errorMessage}`);
    } finally {
      setIsUploading(false);
      setIsProcessing(false);
      setOperationType(null);
      setFile(null);
      setCsvPreview([]);
      setFilterStartDate(null);
      setFilterEndDate(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const exportToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, qcode || "Sheet1");
    XLSX.writeFile(workbook, `${qcode}_master_sheet.xlsx`);
  };

  const startRecord = (page - 1) * pageSize + 1;
  const endRecord = Math.min(page * pageSize, total);
  const recordDisplay = total > 0 ? `Showing ${startRecord}–${endRecord} of ${total} records` : "No records found";

  const isOperationInProgress = isUploading || isProcessing || isDeleting;

  return (
    <div className="space-y-6 p-6 bg-gray-50 dark:bg-gray-900 rounded-xl">
      <Breadcrumb
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Accounts", href: "/accounts" },
          { label: `${qcode}` },
        ]}
      />
      <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Account: {qcode}</h1>

      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <InputField
            label="Search by System Tag"
            placeholder="e.g. SPSAR"
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            className="w-full sm:w-64"
            disabled={isOperationInProgress}
          />
          <DatePicker
            label="Start Date"
            placeholder="From"
            onChange={(date) => {
              if (date && Array.isArray(date) && date.length > 0) {
                const formatted = date[0].toISOString().split("T")[0];
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
              if (date && Array.isArray(date) && date.length > 0) {
                const formatted = date[0].toISOString().split("T")[0];
                setFilterEndDate(formatted);
              } else {
                setFilterEndDate(null);
              }
            }}
            id="filterEndDate"
          />
        </div>
        <div className="flex gap-4">
          <button
            onClick={exportToExcel}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
            disabled={isOperationInProgress}
          >
            Export to Excel
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
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
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-white mb-3">Delete Records</h3>
        <button
          onClick={handleDelete}
          disabled={isOperationInProgress || !filterStartDate || !filterEndDate}
          className="w-full sm:w-auto px-6 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
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

      {csvPreview.length > 0 && (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-white mb-3">Upload CSV</h3>
          <h4 className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">CSV Preview</h4>
          <pre className="text-xs text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 p-3 rounded-lg overflow-x-auto mb-4">
            {csvPreview.join("\n")}
          </pre>
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={handleUpload}
              disabled={isOperationInProgress}
              className="w-full sm:w-auto px-6 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isUploading && operationType === "upload" ? (
                <>
                  <Spinner />
                  {isProcessing ? "Processing..." : "Uploading..."}
                </>
              ) : (
                "Upload CSV"
              )}
            </button>
            <button
              onClick={handleCombinedOperation}
              disabled={isOperationInProgress || !filterStartDate || !filterEndDate}
              className="w-full sm:w-auto px-6 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isUploading && operationType === "combined" ? (
                <>
                  <Spinner />
                  {isProcessing ? "Processing..." : "Uploading..."}
                </>
              ) : (
                "Delete and Upload for Selected Date Range"
              )}
            </button>
            <button
              onClick={handleReplaceMasterSheet}
              disabled={isOperationInProgress}
              className="w-full sm:w-auto px-6 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isUploading && operationType === "replace" ? (
                <>
                  <Spinner />
                  {isProcessing ? "Processing..." : "Uploading..."}
                </>
              ) : (
                "Replace Entire Master Sheet"
              )}
            </button>
          </div>
        </div>
      )}

      {(isUploading || isProcessing || isDeleting) && (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-white mb-3">Operation Progress</h3>
          <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 overflow-hidden">
            <div
              className="bg-brand-600 h-2.5 rounded-full transition-all duration-300 ease-in-out"
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            {isDeleting && operationType === "delete"
              ? "Deleting records..."
              : isProcessing
                ? "Processing on server..."
                : `${uploadProgress}% Uploading`}
          </p>
        </div>
      )}

      {operationResult && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Operation Result</h3>
          <div className="space-y-6">
            <div
              className={
                (operationResult.failedRows && operationResult.failedRows.length > 0) || operationResult.message.includes("failed")
                  ? "p-4 border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/10 rounded-lg"
                  : "p-4 border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-900/10 rounded-lg"
              }
            >
              <h4
                className={
                  (operationResult.failedRows && operationResult.failedRows.length > 0) || operationResult.message.includes("failed")
                    ? "font-semibold text-red-800 dark:text-red-300"
                    : "font-semibold text-green-800 dark:text-green-300"
                }
              >
                {operationResult.message}
              </h4>
              {operationResult.deletedCount !== undefined && operationResult.deletedCount > 0 && (
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-400">
                  Deleted {operationResult.deletedCount} existing rows.
                </p>
              )}
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
                <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded-lg mt-2">
                  <code className="text-xs text-gray-700 dark:text-white">
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
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-white mb-3">NAV Over Time</h3>
        {isChartLoading ? (
          <div className="flex justify-center items-center h-64">
            <Spinner />
          </div>
        ) : chartSeries[0].data.length > 0 ? (
          <LineChartOne series={chartSeries} categories={chartCategories} />
        ) : (
          <p className="text-sm text-gray-700 dark:text-white text-center">No valid NAV data available for chart.</p>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
        <div className="flex justify-end p-4">
          <p className="text-sm text-gray-700 dark:text-white">{recordDisplay}</p>
        </div>
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <Spinner />
          </div>
        ) : (
          <div className="overflow-hidden">
            <div className="max-w-full overflow-x-auto">
              <div className="min-w-[1024px]">
                <Table>
                  <TableHeader className="border-b border-gray-100 dark:border-gray-700">
                    <TableRow>
                      {[
                        "Date",
                        "System Tag",
                        "Portfolio Value",
                        "Capital In/Out",
                        "NAV",
                        "Prev NAV",
                        "PnL",
                        "Daily P/L",
                        "Exposure Value",
                        "Prev Portfolio Value",
                        "Prev Exposure Value",
                        "Prev Pnl",
                        "Drawdown",
                      ].map((col) => (
                        <TableCell
                          key={col}
                          isHeader
                          className="px-5 py-3 text-start text-xs text-gray-500 font-medium dark:text-gray-400"
                        >
                          {col}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {data.length > 0 ? (
                      data.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="px-5 whitespace-nowrap py-4 text-sm text-gray-700 dark:text-white">
                            {row.date && typeof row.date === "string" ? row.date.split("T")[0] : "-"}
                          </TableCell>
                          <TableCell className="px-5 whitespace-nowrap py-4 text-sm text-gray-700 dark:text-white">
                            {row.system_tag}
                          </TableCell>
                          <TableCell className="px-5 whitespace-nowrap py-4 text-sm text-gray-700 dark:text-white">
                            {format(row.portfolio_value)}
                          </TableCell>
                          <TableCell className="px-5 whitespace-nowrap py-4 text-sm text-gray-700 dark:text-white">
                            {format(row.capital_in_out)}
                          </TableCell>
                          <TableCell className="px-5 whitespace-nowrap py-4 text-sm text-gray-700 dark:text-white">
                            {format(row.nav)}
                          </TableCell>
                          <TableCell className="px-5 whitespace-nowrap py-4 text-sm text-gray-700 dark:text-white">
                            {format(row.prev_nav)}
                          </TableCell>
                          <TableCell className="px-5 whitespace-nowrap py-4 text-sm text-gray-700 dark:text-white">
                            {format(row.pnl)}
                          </TableCell>
                          <TableCell className="px-5 whitespace-nowrap py-4 text-sm text-gray-700 dark:text-white">
                            {format(row.daily_p_l)}
                          </TableCell>
                          <TableCell className="px-5 whitespace-nowrap py-4 text-sm text-gray-700 dark:text-white">
                            {format(row.exposure_value)}
                          </TableCell>
                          <TableCell className="px-5 whitespace-nowrap py-4 text-sm text-gray-700 dark:text-white">
                            {format(row.prev_portfolio_value)}
                          </TableCell>
                          <TableCell className="px-5 whitespace-nowrap py-4 text-sm text-gray-700 dark:text-white">
                            {format(row.prev_exposure_value)}
                          </TableCell>
                          <TableCell className="px-5 whitespace-nowrap py-4 text-sm text-gray-700 dark:text-white">
                            {format(row.prev_pnl)}
                          </TableCell>
                          <TableCell className="px-5 whitespace-nowrap py-4 text-sm text-gray-700 dark:text-white">
                            {format(row.drawdown)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          className="px-5 py-4 text-center text-sm text-gray-700 dark:text-white"
                        >
                          No data found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}
      </div>

      <Pagination
        currentPage={page}
        totalPages={Math.ceil(total / pageSize)}
        onPageChange={(p) => setPage(p)}
      />
    </div>
  );
}