// @ts-nocheck
"use client";

import React from "react";
import Breadcrumb from "@/components/breadcrumb/breadcrumb";
import PmsAllocationTable from "@/components/pms-allocation/PmsAllocationTable";
import TabUnderline from "@/components/tab/tab-underline";
import PmsAllocationChart from "@/components/pms-allocation/PmsAllocationChart";

export default function PmsAllocation() {
  const tabs = [
    {
      id: "table",
      label: "Table",
      content: <PmsAllocationTable />,
    },
    {
      id: "chart",
      label: "Chart",
      content: <PmsAllocationChart />,
    },
  ];

  return (
    <div className="">
      {/* <Breadcrumb
        crumbs={[
          { label: "Home", href: "/" },
        ]}
      /> */}
      <TabUnderline tabs={tabs} />
    </div>
  );
}