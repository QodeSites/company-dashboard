import LineChartOne from "@/components/charts/line/LineChartOne";
import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Next.js Line Chart | TailAdmin - Next.js Dashboard Template",
  description:
    "This is Next.js Line Chart page for TailAdmin - Next.js Tailwind CSS Admin Dashboard Template",
};

export default function LineChart() {
  // Sample data for the LineChartOne component
  const sampleSeries = [
    {
      name: "Portfolio Value",
      data: [10000, 12000, 11500, 13500, 14200, 13800, 15000]
    },
    {
      name: "Benchmark",
      data: [9800, 10500, 11200, 12000, 12800, 13400, 14000]
    }
  ];
  
  const sampleCategories = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul"
  ];

  return (
    <div>
      <PageBreadcrumb pageTitle="Line Chart" />
      <div className="space-y-6">
        <ComponentCard title="Line Chart 1">
          <LineChartOne 
            series={sampleSeries}
            categories={sampleCategories}
          />
        </ComponentCard>
      </div>
    </div>
  );
}