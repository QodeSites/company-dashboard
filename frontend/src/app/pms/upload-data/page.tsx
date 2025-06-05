// @ts-nocheck
"use client"

import React from 'react';
import FileInput from "@/components/form/input/FileInput";

const UploadPmsData = () => {
  return (
    <div className="max-w-7xl mx-auto mt-10 p-6 rounded-xl border shadow bg-white dark:bg-gray-800">
      <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-white">
        Upload Transaction Report
      </h2>
      <FileInput onChange={() => {}} />

      <h2 className="text-xl font-semibold mt-10 mb-4 text-gray-800 dark:text-white">
        Upload AUM Report
      </h2>
      <FileInput onChange={() => {}} />

      <button
        disabled={true}
        className="mt-6 px-6 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400"
      >
        Submit Reports
      </button>
    </div>
  );
};

export default UploadPmsData;