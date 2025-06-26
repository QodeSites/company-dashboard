// @ts-nocheck
"use client";
import { useEffect, useState, useRef } from "react";
import DatePicker from "@/components/form/date-picker";
import InputField from "@/components/form/input/InputField";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import Pagination from "@/components/tables/Pagination";
import Spinner from "@/components/spinners/Spinner";
import * as XLSX from "xlsx";
import LineChartOne from "@/components/charts/line/LineChartOne";
import DefaultTab from "@/components/ui/tab/DefaultTab";
import { ChevronDown, ChevronUp, SortAsc, SortDesc } from "lucide-react";
import { sharedTableConfigs } from '../../shared-config/column';
import { API_BASE } from "@/lib/api";
interface Row {
    id: number;
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

interface TableConfig {
    requiredColumns: { fieldName: string; displayName: string }[];
    dateField: string;
    endpoint: string;
    displayName: string;
}

interface PropsAndManagedAccountProps {
    qcode: string;
}

const tableConfigs = Object.entries(sharedTableConfigs).reduce((acc, [key, value]) => {
    acc[key] = {
        requiredColumns: value.requiredColumns,
        dateField: value.dateField,
        endpoint: `${API_BASE}/api/upload/master-sheet/`,
        displayName: value.displayName,
    };
    return acc;
}, {} as Record<string, TableConfig>);

export default function PropsAndManagedAccount({ qcode }: PropsAndManagedAccountProps) {
    const [activeTab, setActiveTab] = useState("master_sheet");
    const [sheetData, setSheetData] = useState<Record<string, Row[]>>({
        master_sheet: [], tradebook: [], slippage: [], mutual_fund_holding: [], gold_tradebook: [], liquidbees_tradebook: [], equity_holding: [],
    });
    const [chartData, setChartData] = useState<Row[]>([]);
    const [totals, setTotals] = useState<Record<string, number>>({
        master_sheet: 0, tradebook: 0, slippage: 0, mutual_fund_holding: 0, gold_tradebook: 0, liquidbees_tradebook: 0,
    });
    const [page, setPage] = useState<Record<string, number>>({
        master_sheet: 1, tradebook: 1, slippage: 1, mutual_fund_holding: 1, gold_tradebook: 1, liquidbees_tradebook: 1,
    });
    const [pageSize, setPageSize] = useState(25);
    const [search, setSearch] = useState<Record<string, string>>({
        master_sheet: "", tradebook: "", slippage: "", mutual_fund_holding: "", gold_tradebook: "", liquidbees_tradebook: "",
    });
    const [filterStartDate, setFilterStartDate] = useState<Record<string, string | null>>({
        master_sheet: null, tradebook: null, slippage: null, mutual_fund_holding: null, gold_tradebook: null, liquidbees_tradebook: null,
    });
    const [filterEndDate, setFilterEndDate] = useState<Record<string, string | null>>({
        master_sheet: null, tradebook: null, slippage: null, mutual_fund_holding: null, gold_tradebook: null, liquidbees_tradebook: null,
    });
    const [isLoading, setIsLoading] = useState<Record<string, boolean>>({
        master_sheet: false, tradebook: false, slippage: false, mutual_fund_holding: false, gold_tradebook: false, liquidbees_tradebook: false,
    });
    const [isChartLoading, setIsChartLoading] = useState(false);
    const [files, setFiles] = useState<Record<string, File | null>>({
        master_sheet: null, tradebook: null, slippage: null, mutual_fund_holding: null, gold_tradebook: null, liquidbees_tradebook: null,
    });
    const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({
        master_sheet: 0, tradebook: 0, slippage: 0, mutual_fund_holding: 0, gold_tradebook: 0, liquidbees_tradebook: 0,
    });
    const [isUploading, setIsUploading] = useState<Record<string, boolean>>({
        master_sheet: false, tradebook: false, slippage: false, mutual_fund_holding: false, gold_tradebook: false, liquidbees_tradebook: false,
    });
    const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({
        master_sheet: false, tradebook: false, slippage: false, mutual_fund_holding: false, gold_tradebook: false, liquidbees_tradebook: false,
    });
    const [isDeleting, setIsDeleting] = useState<Record<string, boolean>>({
        master_sheet: false, tradebook: false, slippage: false, mutual_fund_holding: false, gold_tradebook: false, liquidbees_tradebook: false,
    });
    const [operationType, setOperationType] = useState<"upload" | "combined" | "replace" | "delete" | null>(null);
    const [operationResult, setOperationResult] = useState<Record<string, UploadResponse | null>>({
        master_sheet: null, tradebook: null, slippage: null, mutual_fund_holding: null, gold_tradebook: null, liquidbees_tradebook: null,
    });
    const [csvPreviews, setCsvPreviews] = useState<Record<string, string[]>>({
        master_sheet: [], tradebook: [], slippage: [], mutual_fund_holding: [], gold_tradebook: [], liquidbees_tradebook: [],
    });
    const [sortConfig, setSortConfig] = useState<Record<string, { key: string; direction: "asc" | "desc" } | null>>({
        master_sheet: null, tradebook: null, slippage: null, mutual_fund_holding: null, gold_tradebook: null, liquidbees_tradebook: null,
    });
    const [isUploadOpen, setIsUploadOpen] = useState<Record<string, boolean>>({
        master_sheet: false, tradebook: false, slippage: false, mutual_fund_holding: false, gold_tradebook: false, liquidbees_tradebook: false,
    });
    const fileInputRefs = {
        master_sheet: useRef<HTMLInputElement>(null),
        tradebook: useRef<HTMLInputElement>(null),
        slippage: useRef<HTMLInputElement>(null),
        mutual_fund_holding: useRef<HTMLInputElement>(null),
        gold_tradebook: useRef<HTMLInputElement>(null),
        liquidbees_tradebook: useRef<HTMLInputElement>(null),
    };

    const formatDisplayDate = (dateStr: string, tableName: string): string => {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return "-";
        if (tableName === "tradebook") {
            return date.toLocaleString("en-GB", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
            });
        }
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
    };

    const fetchTableData = async (tableName: string) => {
        setIsLoading((prev) => ({ ...prev, [tableName]: true }));
        const query = new URLSearchParams({
            qcode,
            page: page[tableName].toString(),
            pageSize: pageSize.toString(),
        });
        if (search[tableName]) query.append("search", search[tableName]);
        if (filterStartDate[tableName]) query.append("start", filterStartDate[tableName]!);
        if (filterEndDate[tableName]) query.append("end", filterEndDate[tableName]!);

        try {
            const res = await fetch(`/api/${tableName}?${query.toString()}`);
            if (!res.ok) throw new Error(`Failed to fetch ${tableName} data`);
            const json: ApiResponse = await res.json();
            setSheetData((prev) => ({ ...prev, [tableName]: json.data || [] }));
            setTotals((prev) => ({ ...prev, [tableName]: json.total || 0 }));
        } catch (error) {
            console.error(`Error fetching ${tableName} data:`, error);
            alert(`Failed to load ${tableName} data. Please try again.`);
        } finally {
            setIsLoading((prev) => ({ ...prev, [tableName]: false }));
        }
    };

    const fetchChartData = async () => {
        setIsChartLoading(true);
        const query = new URLSearchParams({
            qcode,
            chart: "true",
        });
        if (search.master_sheet) query.append("search", search.master_sheet);
        if (filterStartDate.master_sheet) query.append("start", filterStartDate.master_sheet!);
        if (filterEndDate.master_sheet) query.append("end", filterEndDate.master_sheet!);

        try {
            const res = await fetch(`/api/master-sheet?${query.toString()}`);
            if (!res.ok) throw new Error("Failed to fetch chart data");
            const json: ApiResponse = await res.json();
            const validData = json.data.filter(
                (row) => row.nav != null && !isNaN(parseFloat(row.nav.toString()))
            );
            const downsample = (data: Row[], maxPoints: number): Row[] => {
                if (data.length <= maxPoints) return data;
                const interval = Math.floor(data.length / maxPoints);
                return data.filter((_, index) => index % interval === 0);
            };
            const MAX_POINTS = 300;
            setChartData(downsample(validData, MAX_POINTS));
        } catch (error) {
            console.error("Error fetching chart data:", error);
            alert("Failed to load chart data. Please try again.");
        } finally {
            setIsChartLoading(false);
        }
    };

    const handlePageSizeChange = (newPageSize: number) => {
        setPageSize(newPageSize);
        setPage((prev) => {
            const newPages = { ...prev };
            Object.keys(newPages).forEach((key) => (newPages[key] = 1));
            return newPages;
        });
    };

    const handleResetFilters = (tableName: string) => {
        setSearch((prev) => ({ ...prev, [tableName]: "" }));
        setFilterStartDate((prev) => ({ ...prev, [tableName]: null }));
        setFilterEndDate((prev) => ({ ...prev, [tableName]: null }));
        setPage((prev) => ({ ...prev, [tableName]: 1 }));
        setSortConfig((prev) => ({ ...prev, [tableName]: null }));
    };

    const format = (val: unknown): string => {
        if (val == null) return "-";
        const num = typeof val === "string" ? parseFloat(val) : Number(val);
        return !isNaN(num) ? num.toFixed(2) : String(val);
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
        const date = new Date(row.date as string);
        if (isNaN(date.getTime())) {
            console.warn(`Invalid date in row:`, row.date);
            return "Invalid Date";
        }
        return `${date.getDate()} ${date.toLocaleString("default", { month: "short" })} ${date.getFullYear()}`;
    });

    const validateCsvFile = (file: File, tableName: string): Promise<{ isValid: boolean; message: string; preview: string[] }> => {
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
                const requiredFieldNames = tableConfigs[tableName].requiredColumns.map((col) => col.displayName);

                // Case-insensitive header validation
                const headerLowerMap = headers.map((h) => h.toLowerCase());
                const missingColumns = requiredFieldNames.filter(
                    (col) => !headerLowerMap.includes(col.toLowerCase())
                );

                if (missingColumns.length > 0) {
                    resolve({
                        isValid: false,
                        message: `CSV validation failed for ${tableName}: Missing required columns: ${missingColumns.join(", ")}`,
                        preview: lines.slice(0, 3),
                    });
                    return;
                }

                const dateField = tableConfigs[tableName].dateField;
                const dateFormatRegex = tableName === "tradebook" ? /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/;
                const dateFormat = tableName === "tradebook" ? "YYYY-MM-DD HH:MM:SS" : "YYYY-MM-DD";

                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;
                    const columns = line.split(",");
                    const dateHeader = tableConfigs[tableName].requiredColumns.find(
                        (col) => col.fieldName === dateField
                    )?.displayName;
                    const dateIndex = headers.findIndex((h) => h.toLowerCase() === dateHeader?.toLowerCase());
                    const dateStr = dateIndex !== -1 ? columns[dateIndex]?.trim() : null;
                    if (dateStr && !dateFormatRegex.test(dateStr)) {
                        resolve({
                            isValid: false,
                            message: `Invalid date format at row ${i + 1}: ${dateStr}. Expected ${dateFormat}.`,
                            preview: lines.slice(0, 3),
                        });
                        return;
                    }
                }

                resolve({
                    isValid: true,
                    message: "CSV validation passed",
                    preview: lines.slice(0, 3),
                });
            };
            reader.onerror = () => resolve({ isValid: false, message: "Error reading file", preview: [] });
            reader.readAsText(file);
        });
    };
    const validateDateRange = (context: string, tableName: string): boolean => {
        if (!filterStartDate[tableName] && !filterEndDate[tableName]) return true;
        if (!filterStartDate[tableName] || !filterEndDate[tableName]) {
            alert(`Both start and end dates are required for ${context}.`);
            return false;
        }
        if (new Date(filterStartDate[tableName]!) > new Date(filterEndDate[tableName]!)) {
            alert("Start date cannot be after end date.");
            return false;
        }
        return true;
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, tableName: string) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;
        if (!selectedFile.name.toLowerCase().endsWith(".csv")) {
            alert("Please select a CSV file");
            console.error("Invalid file type selected:", selectedFile.name);
            if (e.target) e.target.value = "";
            return;
        }
        const validation = await validateCsvFile(selectedFile, tableName);
        setCsvPreviews((prev) => ({ ...prev, [tableName]: validation.preview }));
        if (!validation.isValid) {
            alert(`CSV validation failed for ${tableName}: ${validation.message}`);
            console.error(`CSV validation failed for ${tableName}:`, validation.message);
            if (e.target) e.target.value = "";
            return;
        }
        setFiles((prev) => ({ ...prev, [tableName]: selectedFile }));
        setOperationResult((prev) => ({ ...prev, [tableName]: null }));
        setUploadProgress((prev) => ({ ...prev, [tableName]: 0 }));
        setIsProcessing((prev) => ({ ...prev, [tableName]: false }));
        console.log(`File selected and validated for ${tableName}:`, selectedFile.name);
    };

    const handleUpload = async (tableName: string) => {
        const file = files[tableName];
        if (!file) {
            alert(`Please select a CSV file to upload for ${tableName}.`);
            console.error(`No file selected for ${tableName} upload`);
            return;
        }
        if (filterStartDate[tableName] || filterEndDate[tableName]) {
            if (!validateDateRange(`${tableName} upload`, tableName)) return;
        }
        setIsUploading((prev) => ({ ...prev, [tableName]: true }));
        setIsProcessing((prev) => ({ ...prev, [tableName]: false }));
        setOperationType("upload");
        setUploadProgress((prev) => ({ ...prev, [tableName]: 0 }));
        setOperationResult((prev) => ({ ...prev, [tableName]: null }));
        const formData = new FormData();
        formData.append("qcode", qcode);
        formData.append("file", file);
        if (filterStartDate[tableName] && filterEndDate[tableName]) {
            formData.append("startDate", filterStartDate[tableName]!);
            formData.append("endDate", filterEndDate[tableName]!);
        }
        try {
            console.log(`Initiating upload to ${tableConfigs[tableName].endpoint} for qcode:`, qcode);
            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener("progress", (event) => {
                if (event.lengthComputable) {
                    const percentComplete = (event.loaded / event.total) * 100;
                    setUploadProgress((prev) => ({ ...prev, [tableName]: Math.min(Math.round(percentComplete), 99) }));
                    console.log(`Upload progress for ${tableName}: ${percentComplete.toFixed(2)}%`);
                }
            });
            xhr.upload.addEventListener("load", () => {
                setIsProcessing((prev) => ({ ...prev, [tableName]: true }));
                console.log(`Upload completed for ${tableName}, server processing started`);
            });
            const response: UploadResponse = await new Promise((resolve, reject) => {
                xhr.open("POST", tableConfigs[tableName].endpoint);
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve(JSON.parse(xhr.responseText));
                    } else {
                        reject(new Error(`Upload failed for ${tableName} with status ${xhr.status}: ${xhr.statusText}`));
                    }
                };
                xhr.onerror = () => reject(new Error(`Network error during upload for ${tableName}`));
                xhr.send(formData);
            });
            setOperationResult((prev) => ({ ...prev, [tableName]: response }));
            if (response.totalRows === 0 || response.insertedRows === 0) {
                console.error(`Upload failed for ${tableName}, no rows inserted:`, response);
                const errorMessage = response.firstError
                    ? `First error: ${response.firstError.error} (Row ${response.firstError.rowIndex})`
                    : "Unknown error";
                alert(
                    `⚠️ ${response.message}\n${errorMessage}\nCheck Operation Result for details on failed rows.`
                );
            } else {
                const message = `${response.message}${response.failedRows && response.failedRows.length > 0
                    ? `\nFirst error: ${response.firstError?.error} (Row ${response.firstError?.rowIndex})\nCheck Operation Result for details on ${response.failedRows.length} failed rows.`
                    : ""
                    }`;
                console.log(`Upload successful for ${tableName}:`, message);
                alert(`✅ ${message}`);
                fetchTableData(tableName);
                if (tableName === "master_sheet") fetchChartData();
            }
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
            console.error(`Upload failed for ${tableName}:`, errorMessage);
            alert(`❌ Upload failed for ${tableName}: ${errorMessage}`);
        } finally {
            setIsUploading((prev) => ({ ...prev, [tableName]: false }));
            setIsProcessing((prev) => ({ ...prev, [tableName]: false }));
            setOperationType(null);
            setFiles((prev) => ({ ...prev, [tableName]: null }));
            setCsvPreviews((prev) => ({ ...prev, [tableName]: [] }));
            setFilterStartDate((prev) => ({ ...prev, [tableName]: null }));
            setFilterEndDate((prev) => ({ ...prev, [tableName]: null }));
            if (fileInputRefs[tableName].current) fileInputRefs[tableName].current.value = "";
        }
    };

    const handleDelete = async (tableName: string) => {
        if (!validateDateRange("deletion", tableName)) return;
        if (!filterStartDate[tableName] || !filterEndDate[tableName]) {
            alert("Please select a date range to delete records.");
            return;
        }
        setIsDeleting((prev) => ({ ...prev, [tableName]: true }));
        setOperationType("delete");
        setOperationResult((prev) => ({ ...prev, [tableName]: null }));
        try {
            console.log(`Initiating delete operation for ${tableName}:`, qcode, "Date range:", filterStartDate[tableName], "to", filterEndDate[tableName]);
            const res = await fetch(`${API_BASE}/api/replace/delete/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    qcode,
                    startDate: filterStartDate[tableName],
                    endDate: filterEndDate[tableName],
                    table: tableName,
                }),
            });
            const response: UploadResponse = await res.json();
            if (!res.ok) throw new Error(response.message || "Deletion failed");
            setOperationResult((prev) => ({ ...prev, [tableName]: response }));
            console.log(`Delete operation successful for ${tableName}:`, response.message);
            alert(`✅ ${response.message}`);
            fetchTableData(tableName);
            if (tableName === "master_sheet") fetchChartData();
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
            console.error(`Delete operation failed for ${tableName}:`, errorMessage);
            alert(`❌ Deletion failed: ${errorMessage}`);
        } finally {
            setIsDeleting((prev) => ({ ...prev, [tableName]: false }));
            setOperationType(null);
            setFilterStartDate((prev) => ({ ...prev, [tableName]: null }));
            setFilterEndDate((prev) => ({ ...prev, [tableName]: null }));
        }
    };

    const handleCombinedOperation = async (tableName: string) => {
        const file = files[tableName];
        if (!file) {
            alert(`Please select a CSV file to upload for ${tableName}.`);
            console.error(`No file selected for combined operation for ${tableName}`);
            return;
        }
        if (!validateDateRange("deletion and upload", tableName)) return;
        if (!filterStartDate[tableName] || !filterEndDate[tableName]) {
            alert("Please select a date range for deletion and upload.");
            return;
        }
        setIsUploading((prev) => ({ ...prev, [tableName]: true }));
        setIsProcessing((prev) => ({ ...prev, [tableName]: true }));
        setOperationType("combined");
        setUploadProgress((prev) => ({ ...prev, [tableName]: 0 }));
        setOperationResult((prev) => ({ ...prev, [tableName]: null }));
        try {
            console.log(`Initiating combined operation (delete) for ${tableName}:`, qcode, "Date range:", filterStartDate[tableName], "to", filterEndDate[tableName]);
            const deleteRes = await fetch(`${API_BASE}/api/replace/delete/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    qcode,
                    startDate: filterStartDate[tableName],
                    endDate: filterEndDate[tableName],
                    table: tableName,
                }),
            });
            const deleteResponse: UploadResponse = await deleteRes.json();
            if (!deleteRes.ok) throw new Error(deleteResponse.message || "Deletion failed");
            console.log(`Delete in combined operation successful for ${tableName}:`, deleteResponse.message);
            const formData = new FormData();
            formData.append("qcode", qcode);
            formData.append("file", file);
            formData.append("startDate", filterStartDate[tableName]!);
            formData.append("endDate", filterEndDate[tableName]!);
            console.log(`Initiating upload in combined operation for ${tableName}`);
            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener("progress", (event) => {
                if (event.lengthComputable) {
                    const percentComplete = (event.loaded / event.total) * 100;
                    setUploadProgress((prev) => ({ ...prev, [tableName]: Math.min(Math.round(percentComplete), 99) }));
                    console.log(`Combined operation upload progress for ${tableName}: ${percentComplete.toFixed(2)}%`);
                }
            });
            xhr.upload.addEventListener("load", () => {
                setIsProcessing((prev) => ({ ...prev, [tableName]: true }));
                console.log(`Combined operation upload completed for ${tableName}, server processing started`);
            });
            const uploadResponse: UploadResponse = await new Promise((resolve, reject) => {
                xhr.open("POST", tableConfigs[tableName].endpoint);
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve(JSON.parse(xhr.responseText));
                    } else {
                        reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.statusText}`));
                    }
                };
                xhr.onerror = () => reject(new Error(`Network error during upload for ${tableName}`));
                xhr.send(formData);
            });
            setOperationResult((prev) => ({
                ...prev,
                [tableName]: {
                    message: `${deleteResponse.message}. ${uploadResponse.message}`,
                    deletedCount: deleteResponse.deletedCount,
                    totalRows: uploadResponse.totalRows,
                    columnNames: uploadResponse.columnNames,
                    firstError: uploadResponse.firstError,
                    failedRows: uploadResponse.failedRows,
                },
            }));
            const message = `${deleteResponse.message}. ${uploadResponse.message}${uploadResponse.failedRows && uploadResponse.failedRows.length > 0
                ? `\nFirst error: ${uploadResponse.firstError?.error} (Row ${uploadResponse.firstError?.rowIndex})\nCheck Operation Result for details on ${uploadResponse.failedRows.length} failed rows.`
                : ""
                }`;
            console.log(`Combined operation successful for ${tableName}:`, message);
            alert(`✅ ${message}`);
            fetchTableData(tableName);
            if (tableName === "master_sheet") fetchChartData();
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
            console.error(`Combined operation failed for ${tableName}:`, errorMessage);
            alert(`❌ Operation failed: ${errorMessage}`);
        } finally {
            setIsUploading((prev) => ({ ...prev, [tableName]: false }));
            setIsProcessing((prev) => ({ ...prev, [tableName]: false }));
            setOperationType(null);
            setFiles((prev) => ({ ...prev, [tableName]: null }));
            setCsvPreviews((prev) => ({ ...prev, [tableName]: [] }));
            setFilterStartDate((prev) => ({ ...prev, [tableName]: null }));
            setFilterEndDate((prev) => ({ ...prev, [tableName]: null }));
            if (fileInputRefs[tableName].current) fileInputRefs[tableName].current.value = "";
        }
    };

    const handleReplaceMasterSheet = async () => {
    const file = files.master_sheet;
    if (!file) {
        alert("Please select a CSV file to upload for master_sheet.");
        return;
    }
    if (!confirm("This will DELETE ALL existing data for this qcode in the master sheet and replace it with the new CSV data. This action cannot be undone. Are you sure you want to proceed?")) {
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
    try {
        const controller = new AbortController();
        const response = await fetch(`${API_BASE}/api/replace/master-sheet`, {
            method: "POST",
            body: formData,
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(`Replacement failed with status ${response.status}: ${response.statusText}`);
        }
        const result: UploadResponse = await response.json();
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
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
        console.error("Replace master sheet failed:", errorMessage);
        alert(`❌ Replacement failed: ${errorMessage}. If this is a CORS issue, please contact the server administrator.`);
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

    const exportToExcel = (tableName: string) => {
        const formattedData = sheetData[tableName].map((row) => {
            const formattedRow: Record<string, unknown> = { ...row };
            const dateKey = tableConfigs[tableName].dateField.toLowerCase();
            if (row[dateKey]) {
                formattedRow[dateKey] = formatDisplayDate(row[dateKey] as string, tableName);
            }
            return formattedRow;
        });
        const worksheet = XLSX.utils.json_to_sheet(formattedData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, tableConfigs[tableName].displayName);
        XLSX.writeFile(workbook, `${qcode}_${tableName}.xlsx`);
        console.log(`Exported ${tableName} data to Excel:`, `${qcode}_${tableName}.xlsx`);
    };

    const handleSort = (tableName: string, key: string) => {
        setSortConfig((prev) => {
            const currentSort = prev[tableName];
            const direction = currentSort?.key === key && currentSort.direction === "asc" ? "desc" : "asc";
            return { ...prev, [tableName]: { key, direction } };
        });
        const sortedData = [...sheetData[tableName]].sort((a, b) => {
            const aValue = a[key] ?? "";
            const bValue = b[key] ?? "";
            const isNumeric = !isNaN(parseFloat(aValue as string)) && !isNaN(parseFloat(bValue as string));
            if (isNumeric) {
                const aNum = parseFloat(aValue as string) || 0;
                const bNum = parseFloat(bValue as string) || 0;
                return sortConfig[tableName]?.direction === "asc" ? aNum - bNum : bNum - aNum;
            }
            const aStr = String(aValue).toLowerCase();
            const bStr = String(bValue).toLowerCase();
            return sortConfig[tableName]?.direction === "asc" ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
        });
        setSheetData((prev) => ({ ...prev, [tableName]: sortedData }));
    };

    const isOperationInProgress = Object.values(isUploading).some((v) => v) || Object.values(isProcessing).some((v) => v) || Object.values(isDeleting).some((v) => v);

    // [Copy all function implementations from the original file here]

    useEffect(() => {
        fetchTableData("master_sheet");
        fetchChartData();
    }, [qcode, page.master_sheet, search.master_sheet, filterStartDate.master_sheet, filterEndDate.master_sheet, pageSize]);

    useEffect(() => {
        fetchTableData("tradebook");
    }, [qcode, page.tradebook, search.tradebook, filterStartDate.tradebook, filterEndDate.tradebook, pageSize]);

    useEffect(() => {
        fetchTableData("slippage");
    }, [qcode, page.slippage, search.slippage, filterStartDate.slippage, filterEndDate.slippage, pageSize]);

    useEffect(() => {
        fetchTableData("mutual_fund_holding");
    }, [qcode, page.mutual_fund_holding, search.mutual_fund_holding, filterStartDate.mutual_fund_holding, filterEndDate.mutual_fund_holding, pageSize]);

    useEffect(() => {
        fetchTableData("gold_tradebook");
    }, [qcode, page.gold_tradebook, search.gold_tradebook, filterStartDate.gold_tradebook, filterEndDate.gold_tradebook, pageSize]);

    useEffect(() => {
        fetchTableData("liquidbees_tradebook");
    }, [qcode, page.liquidbees_tradebook, search.liquidbees_tradebook, filterStartDate.liquidbees_tradebook, filterEndDate.liquidbees_tradebook, pageSize]);

    const tabs = Object.keys(tableConfigs).map((tableName) => ({
        name: tableConfigs[tableName].displayName,
        content: (
            <div className="space-y-6">
                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800">
                    <button
                        onClick={() => setIsUploadOpen((prev) => ({ ...prev, [tableName]: !prev[tableName] }))}
                        className="flex items-center justify-between w-full p-3 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-white">
                            Manage {tableConfigs[tableName].displayName}
                        </h3>
                        {isUploadOpen[tableName] ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                    {isUploadOpen[tableName] && (
                        <div className="p-4 space-y-4">
                            <div className="flex flex-col sm:flex-row gap-4">
                                <button
                                    onClick={() => fileInputRefs[tableName].current?.click()}
                                    className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
                                    disabled={isOperationInProgress}
                                >
                                    Select CSV
                                </button>
                                <input
                                    type="file"
                                    accept=".csv"
                                    ref={fileInputRefs[tableName]}
                                    className="hidden"
                                    onChange={(e) => handleFileChange(e, tableName)}
                                    disabled={isOperationInProgress}
                                />
                                <button
                                    onClick={() => handleUpload(tableName)}
                                    disabled={isOperationInProgress || !files[tableName]}
                                    className="px-6 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                                >
                                    {isUploading[tableName] ? (
                                        <>
                                            <Spinner />
                                            {isProcessing[tableName] ? "Processing..." : "Uploading..."}
                                        </>
                                    ) : (
                                        `Upload ${tableConfigs[tableName].displayName} CSV`
                                    )}
                                </button>
                                <button
                                    onClick={() => handleDelete(tableName)}
                                    disabled={isOperationInProgress || !filterStartDate[tableName] || !filterEndDate[tableName]}
                                    className="px-6 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                                >
                                    {isDeleting[tableName] && operationType === "delete" ? (
                                        <>
                                            <Spinner />
                                            Deleting...
                                        </>
                                    ) : (
                                        "Delete Records"
                                    )}
                                </button>
                                {tableName === "master_sheet" && (
                                    <>
                                        <button
                                            onClick={() => handleCombinedOperation(tableName)}
                                            disabled={isOperationInProgress || !files[tableName] || !filterStartDate[tableName] || !filterEndDate[tableName]}
                                            className="px-6 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                                        >
                                            {isUploading[tableName] && operationType === "combined" ? (
                                                <>
                                                    <Spinner />
                                                    {isProcessing[tableName] ? "Processing..." : "Uploading..."}
                                                </>
                                            ) : (
                                                "Delete and Upload"
                                            )}
                                        </button>
                                        <button
                                            onClick={handleReplaceMasterSheet}
                                            disabled={isOperationInProgress || !files[tableName]}
                                            className="px-6 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                                        >
                                            {isUploading[tableName] && operationType === "replace" ? (
                                                <>
                                                    <Spinner />
                                                    {isProcessing[tableName] ? "Processing..." : "Uploading..."}
                                                </>
                                            ) : (
                                                "Replace Entire Master Sheet"
                                            )}
                                        </button>
                                    </>
                                )}
                            </div>
                            <div className="flex flex-col items-end sm:flex-row gap-4">
                                <InputField
                                    label="Search"
                                    placeholder={`Search ${tableConfigs[tableName].displayName}`}
                                    value={search[tableName]}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                        setSearch((prev) => ({ ...prev, [tableName]: e.target.value }))
                                    }
                                    className="w-full sm:w-64"
                                    disabled={isOperationInProgress}
                                />
                                <DatePicker
                                    label="Start Date"
                                    placeholder="From"
                                    dateFormat="dd-MM-yyyy"
                                    onChange={(date) => {
                                        if (date && Array.isArray(date) && date.length > 0) {
                                            const formatted = date[0].toISOString().split("T")[0];
                                            setFilterStartDate((prev) => ({ ...prev, [tableName]: formatted }));
                                        } else {
                                            setFilterStartDate((prev) => ({ ...prev, [tableName]: null }));
                                        }
                                    }}
                                    id={`filterStartDate-${tableName}`}
                                />
                                <DatePicker
                                    label="End Date"
                                    placeholder="To"
                                    dateFormat="dd-MM-yyyy"
                                    onChange={(date) => {
                                        if (date && Array.isArray(date) && date.length > 0) {
                                            const formatted = date[0].toISOString().split("T")[0];
                                            setFilterEndDate((prev) => ({ ...prev, [tableName]: formatted }));
                                        } else {
                                            setFilterEndDate((prev) => ({ ...prev, [tableName]: null }));
                                        }
                                    }}
                                    id={`filterEndDate-${tableName}`}
                                />
                                <button
                                    onClick={() => handleResetFilters(tableName)}
                                    className="px-4 py-3 text-sm font-medium text-white bg-gray-600 rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed sm:mt-6"
                                    disabled={isOperationInProgress || (!search[tableName] && !filterStartDate[tableName] && !filterEndDate[tableName])}
                                >
                                    Reset Filters
                                </button>
                                <button
                                    onClick={() => exportToExcel(tableName)}
                                    className="px-4 py-3 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed sm:mt-6"
                                    disabled={isOperationInProgress}
                                >
                                    Export to Excel
                                </button>
                            </div>
                            {csvPreviews[tableName].length > 0 && (
                                <>
                                    <h4 className="text-sm font-medium text-gray-600 dark:text-gray-300 mt-4 mb-2">CSV Preview</h4>
                                    <pre className="text-xs text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 p-3 rounded-lg overflow-x-auto">
                                        {csvPreviews[tableName].join("\n")}
                                    </pre>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {operationResult[tableName] && (
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">Operation Result for {tableConfigs[tableName].displayName}</h3>
                        <div className="space-y-6">
                            <div
                                className={
                                    (operationResult[tableName]!.failedRows && operationResult[tableName]!.failedRows!.length > 0) || operationResult[tableName]!.message.includes("failed")
                                        ? "p-4 border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/10 rounded-lg"
                                        : "p-4 border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-900/10 rounded-lg"
                                }
                            >
                                <h4
                                    className={
                                        (operationResult[tableName]!.failedRows && operationResult[tableName]!.failedRows!.length > 0) || operationResult[tableName]!.message.includes("failed")
                                            ? "font-semibold text-red-800 dark:text-red-300"
                                            : "font-semibold text-green-800 dark:text-green-300"
                                    }
                                >
                                    {operationResult[tableName]!.message}
                                </h4>
                                {operationResult[tableName]!.deletedCount !== undefined && operationResult[tableName]!.deletedCount! > 0 && (
                                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-400">
                                        Deleted {operationResult[tableName]!.deletedCount} existing rows for qcode {qcode}.
                                    </p>
                                )}
                                {operationResult[tableName]!.failedRows && operationResult[tableName]!.failedRows!.length > 0 && (
                                    <p className="mt-1 text-sm text-red-700 dark:text-red-400">
                                        Found {operationResult[tableName]!.failedRows!.length} row(s) with errors. Below are details for the first{" "}
                                        {Math.min(operationResult[tableName]!.failedRows!.length, 5)} issues:
                                    </p>
                                )}
                            </div>
                            {operationResult[tableName]!.failedRows && operationResult[tableName]!.failedRows!.length > 0 && (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader className="border-b border-gray-100 dark:border-gray-700">
                                            <TableRow>
                                                <TableCell isHeader className="px-5 py-3 text-start text-xs text-gray-500 font-medium dark:text-gray-400">
                                                    Row #
                                                </TableCell>
                                                <TableCell isHeader className="px-5 py-3 text-start text-xs text-gray-500 font-medium dark:text-gray-400">
                                                    Error
                                                </TableCell>
                                                <TableCell isHeader className="px-5 py-3 text-start text-xs text-gray-500 font-medium dark:text-gray-400">
                                                    Row Data
                                                </TableCell>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody className="divide-y divide-gray-100 dark:divide-gray-700">
                                            {operationResult[tableName]!.failedRows!.slice(0, 5).map((row, index) => (
                                                <TableRow key={index}>
                                                    <TableCell className="px-5 py-4 text-sm text-gray-700 dark:text-white">{row.rowIndex}</TableCell>
                                                    <TableCell className="px-5 py-4 text-sm text-red-600 dark:text-red-400">{row.error}</TableCell>
                                                    <TableCell className="px-5 py-4 text-sm text-gray-700 dark:text-white">
                                                        <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(row.row, null, 2)}</pre>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                            {operationResult[tableName]!.columnNames && operationResult[tableName]!.columnNames!.length > 0 && (
                                <div>
                                    <h4 className="font-medium text-gray-700 dark:text-white">CSV Columns Found:</h4>
                                    <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded-lg mt-2">
                                        <code className="text-xs text-gray-700 dark:text-white">{operationResult[tableName]!.columnNames!.join(", ")}</code>
                                    </div>
                                </div>
                            )}
                            <div className="p-4 border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-900/10 rounded-lg">
                                <h4 className="font-medium text-blue-800 dark:text-blue-300">Troubleshooting Tips:</h4>
                                <ul className="list-disc ml-5 mt-2 text-sm text-blue-700 dark:text-blue-400">
                                    <li>Ensure your CSV has all required columns with exact spelling</li>
                                    <li>Check that dates are in the correct format (YYYY-MM-DD for most tables, YYYY-MM-DD HH:MM:SS for tradebook)</li>
                                    <li>Ensure numeric values don’t contain invalid characters</li>
                                    <li>Verify that required fields are not empty</li>
                                    <li>Ensure CSV dates are within the selected date range if provided</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                )}

                {tableName === "master_sheet" && (
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800">
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
                )}

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800">
                    <div className="flex justify-end p-4">
                        <p className="text-sm text-gray-700 dark:text-white">
                            {totals[tableName] > 0
                                ? `Showing ${(page[tableName] - 1) * pageSize + 1}–${Math.min(page[tableName] * pageSize, totals[tableName])} of ${totals[tableName]} records`
                                : "No records found"}
                        </p>
                    </div>
                    {isLoading[tableName] ? (
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
                                                {tableConfigs[tableName].requiredColumns.map((col) => (
                                                    <TableCell
                                                        key={col.fieldName}
                                                        isHeader
                                                        className="px-5 py-3 text-start text-xs text-gray-500 font-medium dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                                                        onClick={() => handleSort(tableName, col.fieldName)}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            {col.displayName}
                                                            {sortConfig[tableName]?.key === col.fieldName &&
                                                                (sortConfig[tableName]?.direction === "asc" ? (
                                                                    <SortAsc className="w-4 h-4" />
                                                                ) : (
                                                                    <SortDesc className="w-4 h-4" />
                                                                ))}
                                                        </div>
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody className="divide-y divide-gray-100 dark:divide-gray-700">
                                            {sheetData[tableName].length > 0 ? (
                                                sheetData[tableName].map((row) => (
                                                    <TableRow key={row.id}>
                                                        {tableConfigs[tableName].requiredColumns.map((col) => {
                                                            const value = row[col.fieldName];
                                                            return (
                                                                <TableCell
                                                                    key={col.fieldName}
                                                                    className="px-5 whitespace-nowrap py-4 text-sm text-gray-700 dark:text-white"
                                                                >
                                                                    {col.fieldName.includes("date") || col.fieldName.includes("timestamp")
                                                                        ? formatDisplayDate(value as string, tableName)
                                                                        : format(value)}
                                                                </TableCell>
                                                            );
                                                        })}
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <TableRow>
                                                    <TableCell
                                                        className="px-5 py-4 text-center text-sm text-gray-700 dark:text-white"
                                                        colSpan={tableConfigs[tableName].requiredColumns.length}
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
                    <Pagination
                        currentPage={page[tableName]}
                        totalPages={Math.ceil(totals[tableName] / pageSize)}
                        pageSize={pageSize}
                        onPageChange={(p) => setPage((prev) => ({ ...prev, [tableName]: p }))}
                        onPageSizeChange={handlePageSizeChange}
                    />
                </div>
            </div>
        ),
    }));

    return (
        <DefaultTab defaultTab="Master Sheet" tabs={tabs} />
    );
}