// @ts-nocheck
"use client";

import { useSidebar } from "@/context/SidebarContext";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import React from "react";
export default function PmsAllocation({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();

  const mainContentMargin = isMobileOpen
    ? "ml-0"
    : isExpanded || isHovered
      ? "lg:ml-[290px]"
      : "lg:ml-[90px]";

  return (
    <div className="min-h-screen xl:flex">
      {/* Sidebar and Backdrop */}
      <AppSidebar />
      <Backdrop />

      {/* Main Content Area */}
      <div
        className={`flex-1 transition-all overflow-x-hidden max-w-full p-1 duration-300 ease-in-out`}
      >
        {/* <AppHeader /> */}
        <div className="p-4 mx-auto max-w-(--breakpoint-4xl) md:p-1 ml-20">

        {children}
        </div>
      </div>
    </div>
  );
}
