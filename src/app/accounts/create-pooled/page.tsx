"use client";

import React from "react";
import ComponentCard from "@/components/common/ComponentCard";
import PooledAllocationsForm from "@/components/allocations/PooledAllocationsForm";

export default function CreatePooledAccountPage() {
    return (
        <ComponentCard title="Create Pooled Account with Users & Allocations">
            <PooledAllocationsForm />
        </ComponentCard>
    );
}
