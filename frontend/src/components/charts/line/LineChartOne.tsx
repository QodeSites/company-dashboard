// @ts-nocheck
"use client";
import React from "react";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";

// Dynamically import the ReactApexChart component
const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

interface LineChartOneProps {
  series: {
    name: string;
    data: number[];
  }[];
  categories: string[];
}

export default function LineChartOne({ series, categories }: LineChartOneProps) {
  const options: ApexOptions = {
    legend: {
      show: true,
      position: "top",
      horizontalAlign: "left",
    },
    colors: ["#465FFF"], // Single color for NAV
    chart: {
       animations: { enabled: false }, // disable animations
      fontFamily: "Outfit, sans-serif",
      height: 310,
      type: "line",
      toolbar: {
        show: true,
      },
    },
    stroke: {
      curve: "straight", // faster than "smooth"
      width: [2],
    },
    fill: {
      type: "gradient",
      gradient: {
        opacityFrom: 0.55,
        opacityTo: 0,
      },
    },
    markers: {
      size: 0,
      strokeColors: "#fff",
      strokeWidth: 2,
      hover: {
        size: 6,
      },
    },
    grid: {
      xaxis: {
        lines: {
          show: false,
        },
      },
      yaxis: {
        lines: {
          show: true,
        },
      },
    },
    dataLabels: {
      enabled: false,
    },
    tooltip: {
      enabled: true,
      x: {
        formatter: (val) => val.toString(), // Use category as is
      },
    },
    xaxis: {
      type: "category",
      categories: categories,
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
      tooltip: {
        enabled: false,
      },
      labels: {
        rotate: -45,
        style: {
          fontSize: "12px",
          colors: ["#6B7280"],
        },
      },
    },
    yaxis: {
      labels: {
        style: {
          fontSize: "12px",
          colors: ["#6B7280"],
        },
        formatter: (val) => val.toFixed(2), // Format NAV to 2 decimal places
      },
      title: {
        text: "NAV",
        style: {
          fontSize: "14px",
          fontWeight: 600,
          color: "#6B7280",
        },
      },
    },
  };

  return (
    <div className="max-w-full overflow-x-auto custom-scrollbar">
      <div id="chartNav" className="min-w-[1000px]">
        <ReactApexChart
          options={options}
          series={series}
          type="area"
          height={310}
        />
      </div>
    </div>
  );
}