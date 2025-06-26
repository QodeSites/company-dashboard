// @ts-nocheck
"use client"

import FileInput from "@/components/form/input/FileInput";
import React, { useState } from "react";

const UploadPMSData = () => {
  const [transactionFile, setTransactionFile] = useState<File | null>(null);
  const [holdingFile, setHoldingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  const validExtensions = [".csv", ".xlsx", ".xls"];

  const validateFile = (file: File | null, type: string): boolean => {
    if (!file) {
      setMessage(`❌ Please select a ${type} file.`);
      return false;
    }
    const extension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!validExtensions.includes(extension)) {
      setMessage(`❌ ${type} file must be CSV, XLSX, or XLS.`);
      return false;
    }
    return true;
  };

  const handleTransactionUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file && validateFile(file, "Transaction")) {
      setTransactionFile(file);
      setMessage("✅ Transaction file selected.");
    } else {
      setTransactionFile(null);
    }
  };

  const handleHoldingUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file && validateFile(file, "Holding")) {
      setHoldingFile(file);
      setMessage("✅ Holding file selected.");
    } else {
      setHoldingFile(null);
    }
  };

  const handleSubmit = async () => {
    if (!validateFile(transactionFile, "Transaction") || !validateFile(holdingFile, "Holding")) {
      return;
    }

    setUploading(true);
    setMessage("");

    const formData = new FormData();
    formData.append("transaction_file", transactionFile!);
    formData.append("holding_file", holdingFile!);

    try {
      const response = await fetch("https://reporting-backend.qodeinvest.com/upload/consolidated-sheet/", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to process files");
      }

      // Handle file download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "consolidated_sheet.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setMessage("✅ Files processed successfully. Consolidated sheet downloaded.");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
      setMessage(`❌ Error: ${errorMessage}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto mt-10 p-6 rounded-xl border shadow bg-white dark:bg-gray-800">
      <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">
        Upload Transaction Class File
      </h2>
      <FileInput onChange={handleTransactionUpload} accept=".csv,.xlsx,.xls" />

      <h2 className="text-xl font-semibold mt-10 mb-4 text-gray-800 dark:text-white">
        Upload Holding Asset Class File
      </h2>
      <FileInput onChange={handleHoldingUpload} accept=".csv,.xlsx,.xls" />

      {message && <p className="mt-4 text-sm">{message}</p>}

      <button
        onClick={handleSubmit}
        disabled={uploading || !transactionFile || !holdingFile}
        className="mt-6 px-6 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400"
      >
        {uploading ? "Processing..." : "Generate Consolidated Sheet"}
      </button>
    </div>
  );
};

export default UploadPMSData;