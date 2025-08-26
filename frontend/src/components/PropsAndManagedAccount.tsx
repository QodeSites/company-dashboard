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

// helper (optional)
const toSlug = (k: string) => k.replace(/_/g, "-");

// when creating tableConfigs
const tableConfigs = Object.entries(sharedTableConfigs).reduce((acc, [key, value]) => {
    acc[key] = {
        requiredColumns: value.requiredColumns,
        dateField: value.dateField,
        endpoint: `${API_BASE}/api/upload/${toSlug(key)}/`, // <-- underscore → hyphen
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
        master_sheet: 0, tradebook: 0, slippage: 0, mutual_fund_holding: 0, gold_tradebook: 0, liquidbees_tradebook: 0, equity_holding: 0,
    });
    const [page, setPage] = useState<Record<string, number>>({
        master_sheet: 1, tradebook: 1, slippage: 1, mutual_fund_holding: 1, gold_tradebook: 1, liquidbees_tradebook: 1, equity_holding: 1,
    });
    const [pageSize, setPageSize] = useState(25);
    const [search, setSearch] = useState<Record<string, string>>({
        master_sheet: "", tradebook: "", slippage: "", mutual_fund_holding: "", gold_tradebook: "", liquidbees_tradebook: "", equity_holding: "",
    });
    const [filterStartDate, setFilterStartDate] = useState<Record<string, string | null>>({
        master_sheet: null, tradebook: null, slippage: null, mutual_fund_holding: null, gold_tradebook: null, liquidbees_tradebook: null, equity_holding: null,
    });
    const [filterEndDate, setFilterEndDate] = useState<Record<string, string | null>>({
        master_sheet: null, tradebook: null, slippage: null, mutual_fund_holding: null, gold_tradebook: null, liquidbees_tradebook: null, equity_holding: null,
    });
    const [isLoading, setIsLoading] = useState<Record<string, boolean>>({
        master_sheet: false, tradebook: false, slippage: false, mutual_fund_holding: false, gold_tradebook: false, liquidbees_tradebook: false, equity_holding: false,
    });
    const [isChartLoading, setIsChartLoading] = useState(false);
    const [files, setFiles] = useState<Record<string, File | null>>({
        master_sheet: null, tradebook: null, slippage: null, mutual_fund_holding: null, gold_tradebook: null, liquidbees_tradebook: null, equity_holding: null,
    });
    const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({
        master_sheet: 0, tradebook: 0, slippage: 0, mutual_fund_holding: 0, gold_tradebook: 0, liquidbees_tradebook: 0, equity_holding: 0,
    });
    const [isUploading, setIsUploading] = useState<Record<string, boolean>>({
        master_sheet: false, tradebook: false, slippage: false, mutual_fund_holding: false, gold_tradebook: false, liquidbees_tradebook: false,
    });
    const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({
        master_sheet: false, tradebook: false, slippage: false, mutual_fund_holding: false, gold_tradebook: false, liquidbees_tradebook: false, equity_holding: false,
    });
    const [isDeleting, setIsDeleting] = useState<Record<string, boolean>>({
        master_sheet: false, tradebook: false, slippage: false, mutual_fund_holding: false, gold_tradebook: false, liquidbees_tradebook: false, equity_holding: false,
    });
    const [operationType, setOperationType] = useState<"upload" | "combined" | "replace" | "delete" | null>(null);
    const [operationResult, setOperationResult] = useState<Record<string, UploadResponse | null>>({
        master_sheet: null, tradebook: null, slippage: null, mutual_fund_holding: null, gold_tradebook: null, liquidbees_tradebook: null, equity_holding: null,
    });
    const [csvPreviews, setCsvPreviews] = useState<Record<string, string[]>>({
        master_sheet: [], tradebook: [], slippage: [], mutual_fund_holding: [], gold_tradebook: [], liquidbees_tradebook: [], equity_holding: [],
    });
    const [sortConfig, setSortConfig] = useState<Record<string, { key: string; direction: "asc" | "desc" } | null>>({
        master_sheet: null, tradebook: null, slippage: null, mutual_fund_holding: null, gold_tradebook: null, liquidbees_tradebook: null, equity_holding: null,
    });
    const [isUploadOpen, setIsUploadOpen] = useState<Record<string, boolean>>({
        master_sheet: false, tradebook: false, slippage: false, mutual_fund_holding: false, gold_tradebook: false, liquidbees_tradebook: false, equity_holding: false,
    });
    const fileInputRefs = {
        master_sheet: useRef<HTMLInputElement>(null),
        tradebook: useRef<HTMLInputElement>(null),
        slippage: useRef<HTMLInputElement>(null),
        mutual_fund_holding: useRef<HTMLInputElement>(null),
        gold_tradebook: useRef<HTMLInputElement>(null),
        liquidbees_tradebook: useRef<HTMLInputElement>(null),
        equity_holding: useRef<HTMLInputElement>(null),
    };

    const [accountDetails, setAccountDetails] = useState<any>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<any>({});

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

    const fetchAccountDetails = async () => {
        try {
            const res = await fetch(`/api/accounts?qcode=${qcode}`);
            if (!res.ok) throw new Error("Failed to fetch account details");
            const { account } = await res.json();
            setAccountDetails(account);
            setEditForm(account);
        } catch (error) {
            console.error("Error fetching account details:", error);
            alert("Failed to load account details. Please try again.");
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch("/api/accounts", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ qcode, ...editForm }),
            });
            if (!res.ok) throw new Error("Failed to update account");
            setIsEditing(false);
            fetchAccountDetails();
            alert("Account updated successfully!");
        } catch (error) {
            console.error("Error updating account:", error);
            alert("Failed to update account. Please try again.");
        }
    };

    const handleEditChange = (field: string, value: any) => {
        setEditForm((prev: any) => ({ ...prev, [field]: value }));
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
        // Create AbortController
        const controller = new AbortController();
        try {
            const url = `${API_BASE}/api/replace/master-sheet/`;
            console.log("Requesting URL:", url);
            const response = await fetch(url, {
                method: "POST",
                body: formData,
                signal: controller.signal, // Use the defined controller
                redirect: "follow", // Follow redirects to handle any server-side redirects
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
    // Add this utility function to parse error messages better
    const parseErrorMessage = (error: string): { message: string; field?: string; value?: string } => {
        // Handle Pydantic validation errors
        if (error.includes('validation error for MasterSheet')) {
            // Extract field name and error type from Pydantic error
            const fieldMatch = error.match(/(\w+)\s*\n\s*(.+?)\s*\[type=(\w+)/);
            if (fieldMatch) {
                const [, field, message, type] = fieldMatch;
                return {
                    message: `${field}: ${message}`,
                    field: field,
                    value: type
                };
            }

            // Fallback for complex Pydantic errors
            const simpleMatch = error.match(/validation error for MasterSheet[\s\S]*?(\w+)[\s\S]*?(Input should be .+?)(?:\s*\[|$)/);
            if (simpleMatch) {
                const [, field, message] = simpleMatch;
                return {
                    message: `${field}: ${message}`,
                    field: field
                };
            }
        }

        // Handle decimal conversion errors
        if (error.includes('Invalid decimal value')) {
            const match = error.match(/Invalid decimal value in '(.+?)' at row (\d+): (.+)/);
            if (match) {
                const [, field, row, value] = match;
                return {
                    message: `Invalid value in '${field}': '${value}'`,
                    field: field,
                    value: value
                };
            }
        }

        // Handle date format errors
        if (error.includes('Invalid Date format')) {
            const match = error.match(/Invalid Date format at row (\d+): (.+?), expected (.+)/);
            if (match) {
                const [, row, value, expected] = match;
                return {
                    message: `Invalid date format: '${value}' (expected ${expected})`,
                    field: 'Date',
                    value: value
                };
            }
        }

        // Return original error if no pattern matches
        return { message: error };
    };

    useEffect(() => {
        fetchTableData("master_sheet");
        fetchChartData();
        fetchAccountDetails();
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

    useEffect(() => {
        fetchTableData("equity_holding");
    }, [qcode, page.equity_holding, search.equity_holding, filterStartDate.equity_holding, filterEndDate.equity_holding, pageSize]);


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
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
                            Operation Result for {tableConfigs[tableName].displayName}
                        </h3>

                        <div className="space-y-6">
                            {/* Summary Section */}
                            <div className={
                                (operationResult[tableName]!.failedRows && operationResult[tableName]!.failedRows!.length > 0) ||
                                    operationResult[tableName]!.message.includes("failed")
                                    ? "p-4 border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/10 rounded-lg"
                                    : "p-4 border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-900/10 rounded-lg"
                            }>
                                <h4 className={
                                    (operationResult[tableName]!.failedRows && operationResult[tableName]!.failedRows!.length > 0) ||
                                        operationResult[tableName]!.message.includes("failed")
                                        ? "font-semibold text-red-800 dark:text-red-300"
                                        : "font-semibold text-green-800 dark:text-green-300"
                                }>
                                    {operationResult[tableName]!.message}
                                </h4>

                                {/* Detailed Statistics */}
                                <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                                    {operationResult[tableName]!.total_rows && (
                                        <div className="bg-white dark:bg-gray-700 p-3 rounded border">
                                            <span className="font-medium text-gray-600 dark:text-gray-300">Total Rows:</span>
                                            <span className="ml-2 text-lg font-bold text-blue-600 dark:text-blue-400">
                                                {operationResult[tableName]!.total_rows}
                                            </span>
                                        </div>
                                    )}

                                    {operationResult[tableName]!.inserted_rows !== undefined && (
                                        <div className="bg-white dark:bg-gray-700 p-3 rounded border">
                                            <span className="font-medium text-gray-600 dark:text-gray-300">Successful:</span>
                                            <span className="ml-2 text-lg font-bold text-green-600 dark:text-green-400">
                                                {operationResult[tableName]!.inserted_rows}
                                            </span>
                                        </div>
                                    )}

                                    {operationResult[tableName]!.failed_rows && (
                                        <div className="bg-white dark:bg-gray-700 p-3 rounded border">
                                            <span className="font-medium text-gray-600 dark:text-gray-300">Failed:</span>
                                            <span className="ml-2 text-lg font-bold text-red-600 dark:text-red-400">
                                                {operationResult[tableName]!.failed_rows!.length}
                                            </span>
                                        </div>
                                    )}

                                    {operationResult[tableName]!.deletedCount !== undefined && operationResult[tableName]!.deletedCount! > 0 && (
                                        <div className="bg-white dark:bg-gray-700 p-3 rounded border">
                                            <span className="font-medium text-gray-600 dark:text-gray-300">Deleted:</span>
                                            <span className="ml-2 text-lg font-bold text-yellow-600 dark:text-yellow-400">
                                                {operationResult[tableName]!.deletedCount}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Failed Rows Detail Section */}
                            {operationResult[tableName]!.failed_rows && operationResult[tableName]!.failed_rows!.length > 0 && (
                                <div className="border border-red-200 dark:border-red-800 rounded-lg overflow-hidden">
                                    <div className="bg-red-50 dark:bg-red-900/20 px-4 py-3 border-b border-red-200 dark:border-red-800">
                                        <h4 className="font-semibold text-red-800 dark:text-red-300 flex items-center gap-2">
                                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                            </svg>
                                            Failed Rows ({operationResult[tableName]!.failed_rows!.length} total)
                                        </h4>
                                        <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                                            The following rows could not be processed. Review the errors and fix your CSV file.
                                        </p>
                                    </div>

                                    <div className="max-h-96 overflow-y-auto">
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full divide-y divide-red-200 dark:divide-red-800">
                                                <thead className="bg-red-50 dark:bg-red-900/30 sticky top-0">
                                                    <tr>
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-red-800 dark:text-red-300 uppercase tracking-wider w-20">
                                                            Row #
                                                        </th>
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-red-800 dark:text-red-300 uppercase tracking-wider w-32">
                                                            Field
                                                        </th>
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-red-800 dark:text-red-300 uppercase tracking-wider">
                                                            Error Description
                                                        </th>
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-red-800 dark:text-red-300 uppercase tracking-wider w-32">
                                                            Invalid Value
                                                        </th>
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-red-800 dark:text-red-300 uppercase tracking-wider">
                                                            Actions
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white dark:bg-gray-800 divide-y divide-red-100 dark:divide-red-900">
                                                    {operationResult[tableName]!.failed_rows!.map((failedRow, index) => {
                                                        const parsedError = parseErrorMessage(failedRow.error);
                                                        return (
                                                            <tr key={index} className="hover:bg-red-25 dark:hover:bg-red-900/10">
                                                                <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-red-900 dark:text-red-100">
                                                                    {failedRow.row_index}
                                                                </td>
                                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-red-800 dark:text-red-200">
                                                                    {parsedError.field && (
                                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-200">
                                                                            {parsedError.field}
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-3 text-sm text-red-800 dark:text-red-200">
                                                                    <div className="max-w-md">
                                                                        <p className="break-words">{parsedError.message}</p>
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                                                                    {parsedError.value && (
                                                                        <code className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs font-mono">
                                                                            {parsedError.value}
                                                                        </code>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-3 text-sm">
                                                                    <details className="cursor-pointer">
                                                                        <summary className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-xs">
                                                                            View raw data
                                                                        </summary>
                                                                        <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-700 rounded border max-w-lg overflow-x-auto">
                                                                            <pre className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                                                                {JSON.stringify(failedRow.row, null, 2)}
                                                                            </pre>
                                                                        </div>
                                                                    </details>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Export Failed Rows Button */}
                            {operationResult[tableName]!.failed_rows && operationResult[tableName]!.failed_rows!.length > 0 && (
                                <div className="flex justify-end">
                                    <button
                                        onClick={() => exportFailedRows(tableName)}
                                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                                    >
                                        Export Failed Rows to Excel ({operationResult[tableName]!.failed_rows!.length} rows)
                                    </button>
                                </div>
                            )}

                            {/* CSV Columns Section */}
                            {operationResult[tableName]!.column_names && operationResult[tableName]!.column_names!.length > 0 && (
                                <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                                    <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2">
                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                                        </svg>
                                        CSV Columns Detected ({operationResult[tableName]!.column_names!.length})
                                    </h4>
                                    <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                                        <div className="flex flex-wrap gap-2">
                                            {operationResult[tableName]!.column_names!.map((column, index) => (
                                                <span
                                                    key={index}
                                                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200"
                                                >
                                                    {column}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Troubleshooting Section */}
                            <div className="border border-amber-200 dark:border-amber-800 rounded-lg p-4 bg-amber-50 dark:bg-amber-900/20">
                                <h4 className="font-medium text-amber-800 dark:text-amber-300 mb-2 flex items-center gap-2">
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                    </svg>
                                    Common Issues & Solutions
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 text-sm text-amber-700 dark:text-amber-400">
                                    <div>
                                        <h5 className="font-medium mb-1">Data Format Issues:</h5>
                                        <ul className="list-disc ml-4 space-y-1">
                                            <li>Remove "%" symbols from percentage fields</li>
                                            <li>Replace "#DIV/0!" or "N/A" with empty cells or 0</li>
                                            <li>Replace "-" in numeric fields with 0 or empty</li>
                                            <li>Use YYYY-MM-DD format for dates</li>
                                        </ul>
                                    </div>
                                    <div>
                                        <h5 className="font-medium mb-1">Validation Issues:</h5>
                                        <ul className="list-disc ml-4 space-y-1">
                                            <li>Ensure all required fields are filled</li>
                                            <li>Check numeric fields don't contain text</li>
                                            <li>Verify date ranges are valid</li>
                                            <li>Remove extra spaces and special characters</li>
                                        </ul>
                                    </div>
                                </div>
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
        <>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 mb-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-white">Account Details - {qcode}</h2>
                    <button
                        onClick={() => setIsEditing(!isEditing)}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                        {isEditing ? "Cancel" : "Edit"}
                    </button>
                </div>
                {accountDetails ? (
                    isEditing ? (
                        <form onSubmit={handleUpdate} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Account Name
                                </label>
                                <InputField
                                    value={editForm.account_name || ""}
                                    onChange={(e) => handleEditChange("account_name", e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Broker
                                </label>
                                <InputField
                                    value={editForm.broker || ""}
                                    onChange={(e) => handleEditChange("broker", e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Account Type
                                </label>
                                <InputField
                                    value={editForm.account_type || ""}
                                    onChange={(e) => handleEditChange("account_type", e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Email Linked
                                </label>
                                <InputField
                                    value={editForm.email_linked || ""}
                                    onChange={(e) => handleEditChange("email_linked", e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Contact Number
                                </label>
                                <InputField
                                    value={editForm.contact_number || ""}
                                    onChange={(e) => handleEditChange("contact_number", e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Login ID
                                </label>
                                <InputField
                                    value={editForm.login_id || ""}
                                    onChange={(e) => handleEditChange("login_id", e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Login Password
                                </label>
                                <InputField
                                    type="password"
                                    value={editForm.login_password || ""}
                                    onChange={(e) => handleEditChange("login_password", e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    TOTP Secret
                                </label>
                                <InputField
                                    value={editForm.totp_secret || ""}
                                    onChange={(e) => handleEditChange("totp_secret", e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Aadhar
                                </label>
                                <InputField
                                    value={editForm.aadhar || ""}
                                    onChange={(e) => handleEditChange("aadhar", e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    PAN
                                </label>
                                <InputField
                                    value={editForm.pan || ""}
                                    onChange={(e) => handleEditChange("pan", e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Remarks
                                </label>
                                <InputField
                                    value={editForm.remarks || ""}
                                    onChange={(e) => handleEditChange("remarks", e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    API Details (JSON)
                                </label>
                                <textarea
                                    value={JSON.stringify(editForm.api_details || {}, null, 2)}
                                    onChange={(e) => {
                                        try {
                                            handleEditChange("api_details", JSON.parse(e.target.value));
                                        } catch (err) {
                                            console.error("Invalid JSON for api_details");
                                        }
                                    }}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    rows={6}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Nominees (JSON Array)
                                </label>
                                <textarea
                                    value={JSON.stringify(editForm.nominees || [], null, 2)}
                                    onChange={(e) => {
                                        try {
                                            handleEditChange("nominees", JSON.parse(e.target.value));
                                        } catch (err) {
                                            console.error("Invalid JSON for nominees");
                                        }
                                    }}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-brand-500 focus:ring-brand-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    rows={4}
                                />
                            </div>

                            <button
                                type="submit"
                                className="px-6 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                            >
                                Save Changes
                            </button>
                        </form>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700 dark:text-gray-300">
                            <div><strong>Account Name:</strong> {accountDetails.account_name}</div>
                            <div><strong>Broker:</strong> {accountDetails.broker}</div>
                            <div><strong>Account Type:</strong> {accountDetails.account_type}</div>
                            <div><strong>Email Linked:</strong> {accountDetails.email_linked}</div>
                            <div><strong>Contact Number:</strong> {accountDetails.contact_number}</div>
                            <div><strong>Login ID:</strong> {accountDetails.login_id}</div>
                            <div><strong>TOTP Secret:</strong> {accountDetails.totp_secret}</div>
                            <div><strong>Aadhar:</strong> {accountDetails.aadhar}</div>
                            <div><strong>PAN:</strong> {accountDetails.pan}</div>
                            <div><strong>Remarks:</strong> {accountDetails.remarks}</div>
                            {accountDetails.account_type === "pms" && accountDetails.account_custodian_codes && (
                                <div className="col-span-2">
                                    <strong>Custodian Codes:</strong>
                                    <ul className="list-disc ml-4">
                                        {accountDetails.account_custodian_codes.map((code: any, idx: number) => (
                                            <li key={idx}>{code.custodian_code}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {/* Add more display fields as needed, e.g., nominees, api_details */}
                        </div>
                    )
                ) : (
                    <div className="flex justify-center items-center h-32">
                        <Spinner />
                    </div>
                )}
            </div>
            <DefaultTab defaultTab="Master Sheet" tabs={tabs} />
        </>
    );
}
