"use client";

import React, { useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Label from "@/components/form/Label";
import InputField from "@/components/form/input/InputField";
import PooledAllocationsForm from "@/components/allocations/PooledAllocationsForm";

export default function CreatePooledAccountPage() {
    return (
        <ComponentCard title="Create Pooled Account with Users & Allocations">
            <PooledAllocationsForm />
        </ComponentCard>
    );
}
