// @ts-nocheck
"use client";

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import _ from "lodash";
import * as XLSX from "xlsx";
import debounce from "lodash/debounce";
import { Download, ChevronRight, RotateCcw, Loader2, Eye, EyeOff, DollarSign, Percent, RefreshCw, Upload, IndianRupee } from "lucide-react";
import MultiSelect from "../form/MultiSelect";
import Select from "../form/Select";
import ClientSelectCheckbox from "../form/ClientSelectCheckbox";

type Allocation = {
    id: number;
    date: string;
    stock_name: string;
    asset_class?: string;
    assetclassname?: string;
    sector?: string;
    strategy_code: string;
    qcode: string;
    custodian_code?: string;
    total_percent: string | number | null;
    units: string | number | null;
    rate: string | number | null;
    value?: string | number | null;
    total: string | number | null;
    created_at?: string;
};

type Summary = {
    key: string;
    asset_class: string;
    sector: string;
    total_percent: string | number | null;
    units: string | number | null;
    rate: string | number | null;
    custodianCodeAllocations: { [key: string]: string | number | null };
    initialCustodianAllocations: { [key: string]: string | number | null };
    totalValue: number;
};

export default function PmsAllocationTable() {
    const [allocations, setAllocations] = useState<Allocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [assetClassFilter, setAssetClassFilter] = useState<string>("all");
    const [sectorFilter, setSectorFilter] = useState<string>("all");
    const [stockFilter, setStockFilter] = useState<string>("all");
    const [strategyFilter, setStrategyFilter] = useState<string>("QAW");
    const [clientFilter, setClientFilter] = useState<"all" | "buy" | "sell">("all");
    const [selectedClients, setSelectedClients] = useState<string[]>([]);
    const [displayMode, setDisplayMode] = useState<"percent" | "rupees">("percent");
    const [modelPercentages, setModelPercentages] = useState<{ [key: string]: number }>({});
    const [inputValues, setInputValues] = useState<{ [key: string]: string }>({});
    const [changedKeys, setChangedKeys] = useState<string[]>([]);
    const [newClientName, setNewClientName] = useState<string>("");
    const [newClientCash, setNewClientCash] = useState<string>("");
    const [newClientError, setNewClientError] = useState<string>("");
    const [stateHistory, setStateHistory] = useState<
        Array<{
            modelPercentages: { [key: string]: number };
            inputValues: { [key: string]: string };
            changedKeys: string[];
            changedKey: string;
            adjustedAllocations: { [key: string]: { [custodianCode: string]: { percent: number; rupees: number } } };
        }>
    >([]);
    const [tab, setTab] = useState<"total" | "change">("total");
    const [adjustedAllocations, setAdjustedAllocations] = useState<{
        [key: string]: { [custodianCode: string]: { percent: number; rupees: number } };
    }>({});
    const [rowFilters, setRowFilters] = useState<{ [key: string]: "buy" | "sell" | "both" | "none" }>({});
    const [inputErrors, setInputErrors] = useState<{ [key: string]: boolean }>({});
    const [isCashAdjusted, setIsCashAdjusted] = useState<boolean>(false);
    const [adjustedValues, setAdjustedValues] = useState<{ [custodianCode: string]: { [key: string]: number } }>({});
    const [openAccordions, setOpenAccordions] = useState<{ [key: string]: boolean }>({});
    const [bufferValue, setBufferValue] = useState<number>(0);
    const [bufferError, setBufferError] = useState<boolean>(false);
    const [isModelSumExceeding, setIsModelSumExceeding] = useState<boolean>(false);
    const [securityActionableFilter, setSecurityActionableFilter] = useState<string>("all");
    const [clientActionableFilter, setClientActionableFilter] = useState<string>("all");
    const [selectedUploadStrategy, setSelectedUploadStrategy] = useState<string>("");
    const initialLoadRef = useRef(true);
    const summaryDataRef = useRef<Summary[]>([]);
    const totalRupeesByCustodianRef = useRef<{ [key: string]: number }>({});
    const [uploadLoading, setUploadLoading] = useState<boolean>(false);

    useEffect(() => {
        const sum = Object.values(modelPercentages).reduce((acc, value) => acc + (value || 0), 0);
        setIsModelSumExceeding(sum > 100);
    }, [modelPercentages]);

    const categorizeAssetClass = useCallback(
        (stockName?: string, assetClassName?: string): string => {
            if (stockName) {
                const lowerStockName = stockName.toLowerCase();
                if (lowerStockName.includes("momentum")) return "Momentum";
                if (lowerStockName.includes("low vol")) return "Low Volatility";
                if (lowerStockName.includes("gold")) return "Gold";
                if (stockName === "Initial Margin") return "Cash";
            }
            if (!assetClassName) return "Equity";
            if (["Cash and Equivalent", "Initial Margin"].includes(assetClassName)) return "Cash";
            else if (["Futures", "Options"].includes(assetClassName)) return "Derivatives";
            else return "Equity";
        },
        []
    );

    useEffect(() => {
        fetch("/api/pms-allocation")
            .then((res) => res.json())
            .then((data: Allocation[]) => {
                const transformedData = data.map((item) => ({
                    ...item,
                    asset_class: categorizeAssetClass(item.stock_name, item.asset_class || item.assetclassname),
                }));
                setAllocations(transformedData);
                setLoading(false);
            })
            .catch((err) => {
                console.error("Error loading data", err);
                setLoading(false);
            });
    }, [categorizeAssetClass]);

    const strategyFilteredAllocations = useMemo(() => {
        return allocations.filter(
            (item) => strategyFilter === "all" || item.strategy_code === strategyFilter
        );
    }, [allocations, strategyFilter]);

    const uniqueCustodianCodes = useMemo(() => {
        return _.uniq(
            strategyFilteredAllocations.map((item) => item.custodian_code).filter(Boolean)
        ).sort((a, b) => {
           // Prioritize clients that are in selectedClients (newly added clients)
           if (selectedClients.includes(a) && !selectedClients.includes(b)) return -1;
           if (!selectedClients.includes(a) && selectedClients.includes(b)) return 1;
           return a.localeCompare(b);
       }) as string[];
    }, [strategyFilteredAllocations]);

    useEffect(() => {
        // Initialize selectedClients with all custodian codes on first load
        setSelectedClients(uniqueCustodianCodes);
    }, [uniqueCustodianCodes]);

    // Define the desired order of asset classes
    const assetClassOrder = ["Cash", "Gold", "Momentum", "Low Volatility", "Derivatives", "Equity"];

    const uniqueAssetClasses = useMemo(() => {
        const classes = _.uniq(
            strategyFilteredAllocations.map((item) => item.asset_class).filter(Boolean)
        ).sort((a, b) => {
            const indexA = assetClassOrder.indexOf(a as string);
            const indexB = assetClassOrder.indexOf(b as string);
            return indexA - indexB;
        }) as string[];
        return classes;
    }, [strategyFilteredAllocations]);

    const uniqueStocks = useMemo(() => {
        return _.uniq(strategyFilteredAllocations.map((item) => item.stock_name)).sort();
    }, [strategyFilteredAllocations]);

    const uniqueStrategies = useMemo(() => {
        return _.uniq(allocations.map((item) => item.strategy_code).filter(Boolean)).sort() as string[];
    }, [allocations]);

    const filteredAllocations = useMemo(() => {
        return strategyFilteredAllocations.filter((item) => {
            const assetClassMatch = assetClassFilter === "all" || item.asset_class === assetClassFilter;
            const sectorMatch = sectorFilter === "all" || item.sector === sectorFilter;
            const stockMatch = stockFilter === "all" || item.stock_name === stockFilter;
            return assetClassMatch && sectorMatch && stockMatch;
        });
    }, [strategyFilteredAllocations, assetClassFilter, sectorFilter, stockFilter]);

    const totalRupeesByCustodian = useMemo(() => {
        return uniqueCustodianCodes.reduce((acc, custodianCode) => {
            const total = filteredAllocations
                .filter((item) => item.custodian_code === custodianCode)
                .reduce((sum, item) => {
                    const value = parseFloat(item.value?.toString() ?? "0");
                    return sum + (isNaN(value) ? 0 : value);
                }, 0);
            acc[custodianCode] = total;
            return acc;
        }, {} as { [key: string]: number });
    }, [uniqueCustodianCodes, filteredAllocations]);

    useEffect(() => {
        totalRupeesByCustodianRef.current = totalRupeesByCustodian;
    }, [totalRupeesByCustodian]);

    const summaryData = useMemo(() => {
        const groupKey = "stock_name";
        const groups = _.groupBy(filteredAllocations, groupKey) as { [key: string]: Allocation[] };
        return Object.entries(groups).map(([key, items]) => {
            const firstItem = items[0];
            const totalPercent = parseFloat(firstItem.total_percent?.toString() ?? "0");

            const details = {
                key,
                asset_class: firstItem.asset_class || "-",
                sector: firstItem.sector || "-",
                total_percent: isNaN(totalPercent) ? "0.00" : totalPercent.toFixed(2),
                units: items.reduce((sum, item) => {
                    const units = parseFloat(item.units?.toString() ?? "0");
                    return sum + (isNaN(units) ? 0 : units);
                }, 0),
                rate: firstItem.rate ?? "0",
            };

            const totalValue = items.reduce((sum, item) => {
                const value = parseFloat(item.value?.toString() ?? "0");
                return sum + (isNaN(value) ? 0 : value);
            }, 0);

            const custodianCodeAllocations: { [key: string]: string | number | null } = {};
            const initialCustodianAllocations: { [key: string]: string | number | null } = {};
            uniqueCustodianCodes.forEach((custodianCode) => {
                initialCustodianAllocations[custodianCode] = "0";
                const modelPercent = modelPercentages[key] || 0;
                custodianCodeAllocations[custodianCode] = modelPercent.toFixed(2);
            });

            items.forEach((item) => {
                if (item.custodian_code) {
                    const percentValue = parseFloat(item.total?.toString() ?? "0");
                    initialCustodianAllocations[item.custodian_code] = percentValue;
                }
            });

            return {
                ...details,
                custodianCodeAllocations,
                initialCustodianAllocations,
                totalValue,
            };
        });
    }, [filteredAllocations, uniqueCustodianCodes, modelPercentages]);

    useEffect(() => {
        summaryDataRef.current = summaryData;
    }, [summaryData]);

    useEffect(() => {
        if (initialLoadRef.current && !loading && allocations.length > 0) {
            initialLoadRef.current = false;

            const newModelPercentages = summaryData.reduce((acc, item) => {
                const percent = parseFloat(item.total_percent?.toString() ?? "0");
                acc[item.key] = isNaN(percent) ? 0 : percent;
                return acc;
            }, {} as { [key: string]: number });

            const newInputValues = summaryData.reduce((acc, item) => {
                const percent = parseFloat(item.total_percent?.toString() ?? "0");
                acc[item.key] = isNaN(percent) ? "0.00" : percent.toFixed(2);
                return acc;
            }, {} as { [key: string]: string });

            const newRowFilters = summaryData.reduce((acc, item) => {
                acc[item.key] = item.asset_class === "Derivatives" ? "none" : "both";
                return acc;
            }, {} as { [key: string]: "buy" | "sell" | "both" | "none" });

            const newOpenAccordions = uniqueAssetClasses.reduce((acc, assetClass) => {
                acc[assetClass] = true;
                return acc;
            }, {} as { [key: string]: boolean });

            setStateHistory([{
                modelPercentages: newModelPercentages,
                inputValues: newInputValues,
                changedKeys: [],
                changedKey: "",
                adjustedAllocations: {},
            }]);

            setModelPercentages(newModelPercentages);
            setInputValues(newInputValues);
            setChangedKeys([]);
            setRowFilters(newRowFilters);
            setOpenAccordions(newOpenAccordions);

            setAdjustedAllocations((prev) => {
                const newAdjusted = { ...prev };
                summaryData.forEach((item) => {
                    newAdjusted[item.key] = {};
                    const modelPercent =
                        newModelPercentages[item.key] || parseFloat(item.total_percent?.toString() ?? "0");
                    uniqueCustodianCodes.forEach((custodianCode) => {
                        newAdjusted[item.key][custodianCode] = {
                            percent: modelPercent,
                            rupees: modelPercent * (totalRupeesByCustodian[custodianCode] / 100),
                        };
                    });
                });
                return newAdjusted;
            });
        }
    }, [
        loading,
        allocations,
        summaryData,
        uniqueAssetClasses,
        uniqueCustodianCodes,
        totalRupeesByCustodian,
    ]);

    const getClientDifference = useCallback(
        (item: Summary, custodianCode: string) => {
            const current = parseFloat(item.custodianCodeAllocations[custodianCode]?.toString() ?? "0");
            const initial = parseFloat(
                item.initialCustodianAllocations[custodianCode]?.toString() ?? "0"
            );
            return current - initial;
        },
        []
    );

    const hasBuyAction = useCallback(
        (item: Summary) => {
            if (item.asset_class === "Cash") {
                return uniqueCustodianCodes.some(
                    (custodianCode) => selectedClients.includes(custodianCode) && getClientDifference(item, custodianCode) > 0
                );
            }
            return uniqueCustodianCodes.some(
                (custodianCode) => selectedClients.includes(custodianCode) && getClientDifference(item, custodianCode) > bufferValue
            );
        },
        [uniqueCustodianCodes, selectedClients, getClientDifference, bufferValue]
    );

    const hasSellAction = useCallback(

        (item: Summary) => {
            if (item.asset_class === "Cash") {
                return uniqueCustodianCodes.some(
                    (custodianCode) => selectedClients.includes(custodianCode) && getClientDifference(item, custodianCode) < 0
                );
            }
            return uniqueCustodianCodes.some(
                (custodianCode) => selectedClients.includes(custodianCode) && getClientDifference(item, custodianCode) < -bufferValue
            );
        },
        [uniqueCustodianCodes, selectedClients, getClientDifference, bufferValue]
    );

    const filteredSummaryData = useMemo(() => {
        return summaryData.filter((item) => {
            if (clientFilter === "all") return true;
            return uniqueCustodianCodes.some((custodianCode) => {
                if (!selectedClients.includes(custodianCode)) return false;
                const difference = getClientDifference(item, custodianCode);
                return clientFilter === "buy" ? difference > bufferValue : difference < -bufferValue;
            });
        });
    }, [summaryData, clientFilter, uniqueCustodianCodes, selectedClients, getClientDifference, bufferValue]);

    const sortedSummaryData = useMemo(() => {
        return _.sortBy(filteredSummaryData, [
            (item) => assetClassOrder.indexOf(item.asset_class),
            "key",
        ]);
    }, [filteredSummaryData]);

    const formatNumber = useCallback((num: number | string | null | undefined): string => {
        if (num == null) return "0.00";
        const parsed = parseFloat(num.toString());
        return isNaN(parsed)
            ? "0.00"
            : parsed.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }, []);

    const formatPercent = useCallback((num: number | string | null | undefined): string => {
        if (num == null) return "0.00%";
        const parsed = parseFloat(num.toString());
        return isNaN(parsed) ? "0.00%" : parsed.toFixed(2) + "%";
    }, []);

    const calculateTotals = useCallback(
        (items: Summary[], isGrandTotal: boolean = false) => {
            const totals = {
                totalPercent: 0,
                modelPercent: 0,
                clientTotals: uniqueCustodianCodes.reduce(
                    (acc, code) => ({ ...acc, [code]: 0 }),
                    {} as { [key: string]: number }
                ),
            };

            items.forEach((item) => {
                const totalPercent = parseFloat(item.total_percent?.toString() ?? "0");
                const modelPercent = modelPercentages[item.key] || 0;
                totals.totalPercent += isNaN(totalPercent) ? 0 : totalPercent;
                totals.modelPercent += modelPercent;

                uniqueCustodianCodes.forEach((custodianCode) => {
                    if (!selectedClients.includes(custodianCode)) return;

                    const percentValue =
                        tab === "total"
                            ? item.initialCustodianAllocations[custodianCode]
                            : getClientDifference(item, custodianCode);
                    const adjustedPercentValue =
                        tab === "change" &&
                            isCashAdjusted &&
                            percentValue > bufferValue &&
                            adjustedValues[custodianCode]?.[item.key] != null
                            ? adjustedValues[custodianCode][item.key]
                            : percentValue;
                    let parsedPercent = adjustedPercentValue != null ? parseFloat(adjustedPercentValue.toString()) : 0;

                    if (tab === "change") {
                        if (Math.abs(parsedPercent) <= bufferValue) return;
                        const filter = rowFilters[item.key] || "both";
                        if (filter === "buy" && parsedPercent <= bufferValue) return;
                        if (filter === "sell" && parsedPercent >= -bufferValue) return;
                        if (filter === "none") return;
                    }
                    const value =
                        displayMode === "percent"
                            ? parsedPercent
                            : totalRupeesByCustodianRef.current[custodianCode] * (parsedPercent / 100);
                    totals.clientTotals[custodianCode] += isNaN(value) ? 0 : value;
                });
            });

            return totals;
        },
        [
            uniqueCustodianCodes,
            selectedClients,
            modelPercentages,
            tab,
            bufferValue,
            rowFilters,
            displayMode,
            getClientDifference,
            isCashAdjusted,
            adjustedValues,
        ]
    );

    const calculatePositiveSum = useCallback(
        (custodianCode: string): { [key: string]: number } => {
            const cashItem = sortedSummaryData.find((item) => item.asset_class === "Cash");
            const cashValue = cashItem ? getClientDifference(cashItem, custodianCode) : 0;
            // ***UPDATED LOGIC***: Treat positive cash as 0, use absolute value for negative cash
            const adjustedCashValue = cashValue < 0 ? Math.abs(cashValue) : 0;

            const positiveValues: { key: string; value: number }[] = [];
            sortedSummaryData.forEach((item) => {
                if (item.asset_class === "Cash") return;
                const difference = getClientDifference(item, custodianCode);
                if (difference > bufferValue) {
                    positiveValues.push({ key: item.key, value: difference });
                }
            });

            const sum = positiveValues.reduce((acc, { value }) => acc + value, 0);

            const replacedValues: { [key: string]: number } = {};
            positiveValues.forEach(({ key, value }) => {
                const weightage = sum > 0 ? (value / sum) * 100 : 0;
                const replacedValue = (weightage / 100) * adjustedCashValue;
                replacedValues[key] = Math.abs(replacedValue) > bufferValue ? replacedValue : 0;
            });

            return replacedValues;
        },
        [sortedSummaryData, getClientDifference, bufferValue]
    );

    const handleAdjustCash = useCallback(() => {
        if (isCashAdjusted) {
            setIsCashAdjusted(false);
            setAdjustedValues({});
        } else {
            const newAdjustedValues: { [custodianCode: string]: { [key: string]: number } } = {};
            uniqueCustodianCodes.forEach((custodianCode) => {
                if (selectedClients.includes(custodianCode)) {
                    newAdjustedValues[custodianCode] = calculatePositiveSum(custodianCode);
                }
            });
            setAdjustedValues(newAdjustedValues);
            setIsCashAdjusted(true);
        }
    }, [isCashAdjusted, uniqueCustodianCodes, selectedClients, calculatePositiveSum]);

    const updateAllocationsForKey = useCallback(
        (
            key: string,
            percent: number,
            custodianCodes: string[],
            totalRupees: { [key: string]: number }
        ) => {
            return {
                [key]: custodianCodes.reduce(
                    (acc, custodianCode) => ({
                        ...acc,
                        [custodianCode]: {
                            percent,
                            rupees: percent * (totalRupees[custodianCode] / 100),
                        },
                    }),
                    {} as { [key: string]: { percent: number; rupees: number } }
                ),
            };
        },
        []
    );

    const adjustOtherStocks = useCallback(
        (
            valueChange: number,
            changedKeys: string[],
            modelPercentages: { [key: string]: number },
            summaryData: Summary[],
            custodianCodes: string[],
            totalRupees: { [key: string]: number }
        ) => {
            const newModelPercentages = { ...modelPercentages };
            const newAdjustedAllocations: {
                [key: string]: { [custodianCode: string]: { percent: number; rupees: number } };
            } = {};

            const excludeKeys = [...changedKeys, "Derivatives", "Initial Margin", "NIPPON INDIA ETF LIQUID BEES"];
            const otherStocks = summaryData.filter(
                (s) =>
                    !excludeKeys.includes(s.key) &&
                    s.asset_class !== "Derivatives" &&
                    s.key !== "Initial Margin" &&
                    s.key !== "NIPPON INDIA ETF LIQUID BEES"
            );

            const totalOtherModelPercent = otherStocks.reduce((sum, s) => {
                const percent = newModelPercentages[s.key] || 0;
                return sum + percent;
            }, 0);

            if (totalOtherModelPercent > 0) {
                if (valueChange > 0) {
                    otherStocks.forEach((s) => {
                        const currentModelPercent = newModelPercentages[s.key] || 0;
                        if (currentModelPercent > 0) {
                            const proportion = currentModelPercent / totalOtherModelPercent;
                            const adjustment = valueChange * proportion;
                            const newPercent = Math.max(0, currentModelPercent - adjustment);

                            newModelPercentages[s.key] = newPercent;
                            newAdjustedAllocations[s.key] = updateAllocationsForKey(
                                s.key,
                                newPercent,
                                custodianCodes,
                                totalRupees
                            )[s.key];
                        }
                    });
                } else {
                    const maxIncrease = Math.abs(valueChange);
                    const desiredIncreases: { key: string; increase: number }[] = [];
                    otherStocks.forEach((s) => {
                        const currentModelPercent = newModelPercentages[s.key] || 0;
                        if (currentModelPercent >= 0) {
                            const proportion = currentModelPercent / totalOtherModelPercent;
                            const desiredIncrease = maxIncrease * proportion;
                            desiredIncreases.push({ key: s.key, increase: desiredIncrease });
                        }
                    });

                    const totalDesiredIncrease = desiredIncreases.reduce(
                        (sum, { increase }) => sum + increase,
                        0
                    );
                    const scaleFactor =
                        totalDesiredIncrease > 0 ? Math.min(1, maxIncrease / totalDesiredIncrease) : 0;

                    desiredIncreases.forEach(({ key: sKey, increase }) => {
                        const scaledIncrease = increase * scaleFactor;
                        const currentModelPercent = newModelPercentages[sKey] || 0;
                        const newPercent = currentModelPercent + scaledIncrease;

                        newModelPercentages[sKey] = newPercent;
                        newAdjustedAllocations[sKey] = updateAllocationsForKey(
                            sKey,
                            newPercent,
                            custodianCodes,
                            totalRupees
                        )[sKey];
                    });
                }
            } else {
                const adjustKey = Object.keys(newModelPercentages).find(
                    (k) =>
                        !excludeKeys.includes(k) &&
                        k !== "Derivatives" &&
                        k !== "Initial Margin" &&
                        k !== "NIPPON INDIA ETF LIQUID BEES"
                );
                if (adjustKey) {
                    const currentPercent = newModelPercentages[adjustKey] || 0;
                    const newPercent =
                        valueChange > 0
                            ? Math.max(0, currentPercent - valueChange)
                            : currentPercent + Math.abs(valueChange);

                    newModelPercentages[adjustKey] = newPercent;
                    newAdjustedAllocations[adjustKey] = updateAllocationsForKey(
                        adjustKey,
                        newPercent,
                        custodianCodes,
                        totalRupees
                    )[adjustKey];
                }
            }

            return { newModelPercentages, newAdjustedAllocations };
        },
        [updateAllocationsForKey]
    );

    const handleModelChange = useCallback(
        (key: string, value: string, updateInput: boolean = true) => {
            if (value === "") {
                setInputValues((prev) => ({ ...prev, [key]: "0.00" }));
                setInputErrors((prev) => ({ ...prev, [key]: false }));
                setModelPercentages((prev) => ({ ...prev, [key]: 0 }));
                setAdjustedAllocations((prev) => ({
                    ...prev,
                    [key]: updateAllocationsForKey(
                        key,
                        0,
                        uniqueCustodianCodes,
                        totalRupeesByCustodianRef.current
                    )[key],
                }));
                setStateHistory((prev) => [
                    ...prev,
                    {
                        modelPercentages: { ...modelPercentages },
                        inputValues: { ...inputValues },
                        changedKeys: [...changedKeys],
                        changedKey: key,
                        adjustedAllocations: { ...adjustedAllocations },
                    },
                ]);
                if (!changedKeys.includes(key)) {
                    setChangedKeys((prev) => [...prev, key]);
                }
                return;
            }

            const parsedValue = parseFloat(value);
            if (isNaN(parsedValue) || parsedValue < 0) {
                setInputErrors((prev) => ({ ...prev, [key]: true }));
                return;
            }

            setInputErrors((prev) => ({ ...prev, [key]: false }));
            if (updateInput) {
                setInputValues((prev) => ({ ...prev, [key]: parsedValue.toFixed(2) }));
            }

            setStateHistory((prev) => [
                ...prev,
                {
                    modelPercentages: { ...modelPercentages },
                    inputValues: { ...inputValues },
                    changedKeys: [...changedKeys],
                    changedKey: key,
                    adjustedAllocations: { ...adjustedAllocations },
                },
            ]);

            if (!changedKeys.includes(key)) {
                setChangedKeys((prev) => [...prev, key]);
            }

            const oldValue = modelPercentages[key] || 0;
            const valueChange = parsedValue - oldValue;

            setModelPercentages((prev) => {
                const newModelPercentages = { ...prev, [key]: parsedValue };
                let updatedAllocations = {
                    [key]: updateAllocationsForKey(
                        key,
                        parsedValue,
                        uniqueCustodianCodes,
                        totalRupeesByCustodianRef.current
                    )[key],
                };

                if (valueChange !== 0) {
                    const { newModelPercentages: adjustedModelPercentages, newAdjustedAllocations } =
                        adjustOtherStocks(
                            valueChange,
                            [...changedKeys, key],
                            newModelPercentages,
                            summaryDataRef.current,
                            uniqueCustodianCodes,
                            totalRupeesByCustodianRef.current
                        );
                    setInputValues((prevInput) => {
                        const newInputValues = { ...prevInput };
                        Object.keys(newAdjustedAllocations).forEach((k) => {
                            newInputValues[k] = (adjustedModelPercentages[k] || 0).toFixed(2);
                        });
                        return newInputValues;
                    });
                    updatedAllocations = { ...updatedAllocations, ...newAdjustedAllocations };
                    setAdjustedAllocations((prev) => ({
                        ...prev,
                        ...updatedAllocations,
                    }));
                    return adjustedModelPercentages;
                }

                setAdjustedAllocations((prev) => ({
                    ...prev,
                    ...updatedAllocations,
                }));
                return newModelPercentages;
            });
        },
        [
            modelPercentages,
            inputValues,
            changedKeys,
            adjustedAllocations,
            uniqueCustodianCodes,
            updateAllocationsForKey,
            adjustOtherStocks,
        ]
    );

    const handleBlur = useCallback(
        (key: string, value: string) => {
            const parsedValue = parseFloat(value);
            const currentModelValue = modelPercentages[key] || 0;

            if (isNaN(parsedValue)) {
                setInputValues((prev) => ({ ...prev, [key]: "0.00" }));
                setInputErrors((prev) => ({ ...prev, [key]: false }));
                return;
            }

            if (parsedValue === currentModelValue) {
                setInputValues((prev) => ({ ...prev, [key]: parsedValue.toFixed(2) }));
                setInputErrors((prev) => ({ ...prev, [key]: false }));
                return;
            }

            if (parsedValue < 0) {
                setInputErrors((prev) => ({ ...prev, [key]: true }));
                return;
            }

            setInputValues((prev) => ({ ...prev, [key]: parsedValue.toFixed(2) }));
            setInputErrors((prev) => ({ ...prev, [key]: false }));
            handleModelChange(key, parsedValue.toFixed(2), false);
        },
        [modelPercentages, handleModelChange]
    );

    const debouncedModelChange = useMemo(
        () =>
            debounce((key: string, value: string) => {
                handleModelChange(key, value, true);
            }, 300),
        [handleModelChange]
    );

    useEffect(() => {
        return () => {
            debouncedModelChange.cancel();
        };
    }, [debouncedModelChange]);

    const handleUndo = useCallback(
        (key: string) => {
            const keyStates = stateHistory
                .slice()
                .reverse()
                .filter((state) => state.changedKey === key || state.changedKey === "");

            if (keyStates.length <= 1) return;

            const previousState = keyStates[1];

            setModelPercentages(previousState.modelPercentages);
            setInputValues(previousState.inputValues);
            setChangedKeys(previousState.changedKeys);
            setAdjustedAllocations(previousState.adjustedAllocations);

            const latestStateIndex = stateHistory.findIndex((state) => state === keyStates[0]);
            setStateHistory((prev) => [
                ...prev.slice(0, latestStateIndex),
                ...prev.slice(latestStateIndex + 1),
            ]);
        },
        [stateHistory]
    );

    const getModelDifference = useCallback(
        (key: string, totalPercent: string | number | null) => {
            const modelPercent = modelPercentages[key] || 0;
            const actualPercent = parseFloat(totalPercent?.toString() ?? "0");
            return modelPercent - actualPercent;
        },
        [modelPercentages]
    );

    const handleRowFilter = useCallback(
        (key: string, action: "buy" | "sell" | "both" | "none") => {
            setRowFilters((prev) => ({ ...prev, [key]: action }));
        },
        []
    );

    const resetRowFilters = useCallback(() => {
        const newRowFilters = summaryData.reduce((acc, item) => {
            acc[item.key] = item.asset_class === "Derivatives" ? "none" : "both";
            return acc;
        }, {} as { [key: string]: "buy" | "sell" | "both" | "none" });
        setRowFilters(newRowFilters);
    }, [summaryData]);

    const handleResetAll = useCallback(() => {
        const newModelPercentages = summaryData.reduce((acc, item) => {
            const percent = parseFloat(item.total_percent?.toString() ?? "0");
            acc[item.key] = isNaN(percent) ? 0 : percent;
            return acc;
        }, {} as { [key: string]: number });

        const newInputValues = summaryData.reduce((acc, item) => {
            const percent = parseFloat(item.total_percent?.toString() ?? "0");
            acc[item.key] = isNaN(percent) ? "0.00" : percent.toFixed(2);
            return acc;
        }, {} as { [key: string]: string });

        const newRowFilters = summaryData.reduce((acc, item) => {
            acc[item.key] = item.asset_class === "Derivatives" ? "none" : "both";
            return acc;
        }, {} as { [key: string]: "buy" | "sell" | "both" | "none" });

        const newOpenAccordions = uniqueAssetClasses.reduce((acc, assetClass) => {
            acc[assetClass] = true;
            return acc;
        }, {} as { [key: string]: boolean });

        const newAdjustedAllocations = summaryData.reduce((acc, item) => {
            acc[item.key] = {};
            const modelPercent =
                newModelPercentages[item.key] || parseFloat(item.total_percent?.toString() ?? "0");
            uniqueCustodianCodes.forEach((custodianCode) => {
                acc[item.key][custodianCode] = {
                    percent: modelPercent,
                    rupees: modelPercent * (totalRupeesByCustodianRef.current[custodianCode] / 100),
                };
            });
            return acc;
        }, {} as { [key: string]: { [custodianCode: string]: { percent: number; rupees: number } } });

        setModelPercentages(newModelPercentages);
        setInputValues(newInputValues);
        setChangedKeys([]);
        setStateHistory([{
            modelPercentages: newModelPercentages,
            inputValues: newInputValues,
            changedKeys: [],
            changedKey: "",
            adjustedAllocations: newAdjustedAllocations,
        }]);
        setAdjustedAllocations(newAdjustedAllocations);
        setRowFilters(newRowFilters);
        setOpenAccordions(newOpenAccordions);
        setIsCashAdjusted(false);
        setAdjustedValues({});
        setBufferValue(0);
        setBufferError(false);
        setInputErrors({});
        setClientFilter("all");
        setSecurityActionableFilter("all");
        setClientActionableFilter("all");
        setSelectedClients(uniqueCustodianCodes);
    }, [summaryData, uniqueAssetClasses, uniqueCustodianCodes]);

    const exportToExcel = useCallback(() => {
        const stockKeys = sortedSummaryData.map((item) => item.key).sort();
        const headers = ["Client", ...stockKeys];
        const data: any[] = [];
        const cellStyles: { [cell: string]: { fill?: { fgColor: { rgb: string } }; font?: { bold?: boolean } } } = {};

        const getCellAddress = (row: number, col: number) => {
            const colLetters = String.fromCharCode(65 + col);
            return `${colLetters}${row + 1}`;
        };

        const equityAndMFTotals: {
            [custodianCode: string]: { equityBuy: number; equitySell: number; mfBuy: number; mfSell: number };
        } = {};
        uniqueCustodianCodes.forEach((custodianCode) => {
            equityAndMFTotals[custodianCode] = { equityBuy: 0, equitySell: 0, mfBuy: 0, mfSell: 0 };
            sortedSummaryData.forEach((item) => {
                if (!selectedClients.includes(custodianCode)) return;
                if (item.asset_class === "Cash" || item.asset_class === "Derivatives") return;
                const percentValue =
                    tab === "total"
                        ? item.initialCustodianAllocations[custodianCode]
                        : getClientDifference(item, custodianCode);
                const adjustedPercentValue =
                    tab === "change" &&
                        isCashAdjusted &&
                        percentValue > bufferValue &&
                        adjustedValues[custodianCode]?.[item.key] != null
                        ? adjustedValues[custodianCode][item.key]
                        : percentValue;
                if (tab === "change") {
                    const epsilon = 1e-10;
                    if (Math.abs(adjustedPercentValue ?? 0) <= bufferValue + epsilon) return;
                    const filter = rowFilters[item.key] || "both";
                    if (filter === "buy" && !(adjustedPercentValue > bufferValue)) return;
                    if (filter === "sell" && !(adjustedPercentValue < -bufferValue)) return;
                    if (filter === "none") return;
                }
                const amount =
                    totalRupeesByCustodianRef.current[custodianCode] * ((adjustedPercentValue ?? 0) / 100);
                const isMF = item.key.toLowerCase().includes("etf") || item.key.toLowerCase().includes("mutual fund");
                if (tab === "change") {
                    if (adjustedPercentValue > bufferValue) {
                        if (isMF) {
                            equityAndMFTotals[custodianCode].mfBuy += Math.abs(amount);
                        } else {
                            equityAndMFTotals[custodianCode].equityBuy += Math.abs(amount);
                        }
                    } else if (adjustedPercentValue < -bufferValue) {
                        if (isMF) {
                            equityAndMFTotals[custodianCode].mfSell += Math.abs(amount);
                        } else {
                            equityAndMFTotals[custodianCode].equitySell += Math.abs(amount);
                        }
                    }
                }
            });
        });
        // Filter out clients and stocks with no trades for export
        const activeStockKeys = stockKeys.filter((stockKey) => {
            const item = sortedSummaryData.find((s) => s.key === stockKey);
            if (!item) return false;
            if (rowFilters[item.key] === "none") return false;
            return uniqueCustodianCodes.some((custodianCode) => {
                if (!selectedClients.includes(custodianCode)) return false;
                const percentValue =
                    tab === "total"
                        ? item.initialCustodianAllocations[custodianCode]
                        : getClientDifference(item, custodianCode);
                const adjustedPercentValue =
                    tab === "change" &&
                        isCashAdjusted &&
                        percentValue > bufferValue &&
                        adjustedValues[custodianCode]?.[item.key] != null
                        ? adjustedValues[custodianCode][item.key]
                        : percentValue;
                if (tab === "change") {
                    const epsilon = 1e-10;
                    if (Math.abs(adjustedPercentValue ?? 0) <= bufferValue + epsilon) return false;
                    const filter = rowFilters[item.key] || "both";
                    if (filter === "buy" && !(adjustedPercentValue > bufferValue)) return false;
                    if (filter === "sell" && !(adjustedPercentValue < -bufferValue)) return false;
                }
                return true;
            });
        });
        const activeClients = uniqueCustodianCodes.filter((custodianCode) =>
            selectedClients.includes(custodianCode) &&
            activeStockKeys.some((stockKey) => {
                const item = sortedSummaryData.find((s) => s.key === stockKey);
                if (!item) return false;
                const percentValue =
                    tab === "total"
                        ? item.initialCustodianAllocations[custodianCode]
                        : getClientDifference(item, custodianCode);
                const adjustedPercentValue =
                    tab === "change" &&
                        isCashAdjusted &&
                        percentValue > bufferValue &&
                        adjustedValues[custodianCode]?.[item.key] != null
                        ? adjustedValues[custodianCode][item.key]
                        : percentValue;
                if (tab === "change") {
                    const epsilon = 1e-10;
                    if (Math.abs(adjustedPercentValue ?? 0) <= bufferValue + epsilon) return false;
                    const filter = rowFilters[item.key] || "both";
                    if (filter === "buy" && !(adjustedPercentValue > bufferValue)) return false;
                    if (filter === "sell" && !(adjustedPercentValue < -bufferValue)) return false;
                }
                return true;
            })
        );
        const filteredHeaders = ["Client", ...activeStockKeys];
        data.push(filteredHeaders);
        filteredHeaders.forEach((_, col) => {
            const cell = getCellAddress(0, col);
            cellStyles[cell] = { font: { bold: true } };
        });
        // Add total buy/sell headers
        if (tab === "change") {
            data.push([
                "", // Empty for Client column
                ...activeStockKeys.map(() => ""), // Empty for stock columns
                "Total Equity Buy",
                "Total Equity Sell",
                "Total MF Buy",
                "Total MF Sell",
            ]);
            const headerRow = data.length - 1;
            [0, 1, 2, 3].forEach((offset) => {
                const cell = getCellAddress(headerRow, activeStockKeys.length + offset + 1);
                cellStyles[cell] = { font: { bold: true } };
            });
        }

        data.push(headers);
        headers.forEach((_, col) => {
            const cell = getCellAddress(0, col);
            cellStyles[cell] = { font: { bold: true } };
        });

        uniqueCustodianCodes.forEach((custodianCode, rowIndex) => {
            if (!activeClients.includes(custodianCode)) return;
            const row: any[] = [custodianCode];
            activeStockKeys.forEach((stockKey, colIndex) => {
                if (!selectedClients.includes(custodianCode)) {
                    row.push("-");
                    return;
                }

                const item = sortedSummaryData.find((s) => s.key === stockKey);
                if (!item) {
                    row.push("-");
                    return;
                }

                const percentValue =
                    tab === "total"
                        ? item.initialCustodianAllocations[custodianCode]
                        : getClientDifference(item, custodianCode);
                const adjustedPercentValue =
                    tab === "change" &&
                        isCashAdjusted &&
                        percentValue > bufferValue &&
                        adjustedValues[custodianCode]?.[stockKey] != null
                        ? adjustedValues[custodianCode][stockKey]
                        : percentValue;
                const value =
                    displayMode === "percent"
                        ? adjustedPercentValue
                        : totalRupeesByCustodianRef.current[custodianCode] * ((adjustedPercentValue ?? 0) / 100);

                if (tab === "change") {
                    if (rowFilters[stockKey] === "none") {
                        row.push("-");
                        return;
                    }

                    const epsilon = 1e-10;
                    if (Math.abs(adjustedPercentValue ?? 0) <= bufferValue + epsilon) {
                        row.push("-");
                        return;
                    }

                    const filter = rowFilters[stockKey] || "both";
                    if (filter === "buy" && !(adjustedPercentValue > bufferValue)) {
                        row.push("-");
                        return;
                    }
                    if (filter === "sell" && !(adjustedPercentValue < -bufferValue)) {
                        row.push("-");
                        return;
                    }
                }

                const formattedValue =
                    value != null
                        ? displayMode === "percent"
                            ? parseFloat(value.toString()).toFixed(2)
                            : parseFloat(value.toString()).toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                            })
                        : "-";
                row.push(formattedValue);

                if (tab === "change" && adjustedPercentValue != null && formattedValue !== "-") {
                    const cell = getCellAddress(rowIndex + 1, colIndex + 1);
                    if (adjustedPercentValue > bufferValue) {
                        cellStyles[cell] = { fill: { fgColor: { rgb: "3B82F6" } } };
                    } else if (adjustedPercentValue < -bufferValue) {
                        cellStyles[cell] = { fill: { fgColor: { rgb: "EF4444" } } };
                    }
                }
            });

            if (tab === "change") {
                row.push(
                    formatNumber(equityAndMFTotals[custodianCode].equityBuy),
                    formatNumber(equityAndMFTotals[custodianCode].equitySell),
                    formatNumber(equityAndMFTotals[custodianCode].mfBuy),
                    formatNumber(equityAndMFTotals[custodianCode].mfSell)
                );
            }

            data.push(row);
            const cell = getCellAddress(rowIndex + 1, 0);
            cellStyles[cell] = { font: { bold: true } };
        });

        const worksheet = XLSX.utils.aoa_to_sheet(data);
        Object.entries(cellStyles).forEach(([cell, style]) => {
            if (!worksheet[cell]) worksheet[cell] = {};
            worksheet[cell].s = style;
        });

        worksheet["!cols"] = filteredHeaders.map((header, i) => ({
            wch: i === 0 ? 15 : tab === "change" && i > activeStockKeys.length ? 20 : 20,
        }));

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, tab === "total" ? "Total Weights" : "Change in Weights");

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        XLSX.writeFile(workbook, `PmsAllocation_${tab === "total" ? "TotalWeights" : "ChangeInWeights"}_${timestamp}.xlsx`);
    }, [
        sortedSummaryData,
        uniqueCustodianCodes,
        selectedClients,
        tab,
        isCashAdjusted,
        bufferValue,
        adjustedValues,
        displayMode,
        rowFilters,
        getClientDifference,
    ]);

    const handleTabChange = useCallback(
        (newTab: "total" | "change") => {
            if (tab !== newTab && changedKeys.length > 0) {
                const confirmDownload = window.confirm(
                    "Switching tabs may reset your changes. Would you like to download the current table before proceeding?"
                );
                if (confirmDownload) {
                    exportToExcel();
                }
            }
            setTab(newTab);
            resetRowFilters();
            if (newTab === "total") {
                setIsCashAdjusted(false);
                setAdjustedValues({});
                setSecurityActionableFilter("all");
                setClientActionableFilter("all");
            }
        },
        [tab, changedKeys, resetRowFilters, exportToExcel]
    );

    const handleAccordionToggle = useCallback((assetClass: string) => {
        setOpenAccordions((prev) => ({ ...prev, [assetClass]: !prev[assetClass] }));
    }, []);

    const handleBufferChange = useCallback(
        debounce((value: string) => {
            const parsedValue = parseFloat(value);
            if (isNaN(parsedValue) || parsedValue < 0) {
                setBufferError(true);
                setBufferValue(0);
            } else {
                setBufferError(false);
                setBufferValue(parsedValue);
            }
        }, 300),
        []
    );

    const actionables = useMemo(() => {
        const groupedByAssetClass = _.groupBy(sortedSummaryData, "asset_class") as { [key: string]: Summary[] };
        const result: {
            [assetClass: string]: {
                buy: { stock: string; custodianCode: string; amount: number }[];
                sell: { stock: string; custodianCode: string; amount: number }[];
            };
        } = {};

        Object.entries(groupedByAssetClass).forEach(([assetClass, items]) => {
            const buyActions: { stock: string; custodianCode: string; amount: number }[] = [];
            const sellActions: { stock: string; custodianCode: string; amount: number }[] = [];

            items.forEach((item) => {
                const filter = rowFilters[item.key] || "both";
                if (filter === "none") return;

                uniqueCustodianCodes.forEach((custodianCode) => {
                    if (!selectedClients.includes(custodianCode)) return;

                    let percentValue = getClientDifference(item, custodianCode);
                    if (isCashAdjusted && adjustedValues[custodianCode]?.[item.key] != null) {
                        percentValue = adjustedValues[custodianCode][item.key];
                    }

                    const epsilon = 1e-10;
                    if (item.asset_class !== "Cash" && Math.abs(percentValue) <= bufferValue) return;

                    if (item.asset_class !== "Cash" && filter === "buy" && percentValue <= bufferValue) return;
                    if (item.asset_class !== "Cash" && filter === "sell" && percentValue >= -bufferValue) return;

                    const amount = Math.abs(
                        totalRupeesByCustodianRef.current[custodianCode] * (percentValue / 100)
                    );

                    if (percentValue > (item.asset_class === "Cash" ? 0 : bufferValue)) {
                        buyActions.push({
                            stock: item.key,
                            custodianCode,
                            amount,
                        });
                    } else if (percentValue < (item.asset_class === "Cash" ? 0 : -bufferValue)) {
                        sellActions.push({
                            stock: item.key,
                            custodianCode,
                            amount,
                        });
                    }
                });
            });

            result[assetClass] = { buy: buyActions, sell: sellActions };
        });

        return result;
    }, [
        sortedSummaryData,
        rowFilters,
        uniqueCustodianCodes,
        selectedClients,
        getClientDifference,
        bufferValue,
        isCashAdjusted,
        adjustedValues,
    ]);

    const getRowBgColor = (assetClass: string) => {
        switch (assetClass) {
            case "Gold":
                return "bg-yellow-200";
            case "Momentum":
                return "bg-blue-200";
            case "Low Volatility":
                return "bg-green-200";
            case "Cash":
                return "bg-gray-200";
            case "Equity":
                return "bg-white";
            default:
                return "bg-white";
        }
    };

    // Function to handle file upload
    const handleFileUpload = useCallback(
        async (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            if (!file) return;

            if (!selectedUploadStrategy) {
                alert("Please select a strategy before uploading a file.");
                event.target.value = "";
                return;
            }

            setUploadLoading(true);

            const formData = new FormData();
            formData.append("file", file);
            formData.append("strategy_code", selectedUploadStrategy);

            try {
                const response = await fetch("/api/upload-pms-allocation-data", {
                    method: "POST",
                    body: formData,
                });

                if (!response.ok) {
                    throw new Error("Upload failed");
                }

                // Refresh allocations data
                const res = await fetch("/api/pms-allocation");
                const data: Allocation[] = await res.json();
                const transformedData = data.map((item) => ({
                    ...item,
                    asset_class: categorizeAssetClass(item.stock_name, item.asset_class || item.assetclassname),
                }));
                setAllocations(transformedData);

                // Reset filters and state
                initialLoadRef.current = true;
                setChangedKeys([]);
                setStateHistory([]);
                setAdjustedAllocations({});
                setIsCashAdjusted(false);
                setAdjustedValues({});
                resetRowFilters();
                setOpenAccordions(
                    uniqueAssetClasses.reduce(
                        (acc, assetClass) => ({ ...acc, [assetClass]: true }),
                        {} as { [key: string]: boolean }
                    )
                );
                setBufferValue(0);
                setBufferError(false);
                setSecurityActionableFilter("all");
                setClientActionableFilter("all");
                setSelectedClients(uniqueCustodianCodes);

                alert(`File uploaded successfully for ${selectedUploadStrategy}`);
            } catch (error) {
                console.error("Error uploading file:", error);
                alert("Failed to upload file. Please try again.");
            } finally {
                setUploadLoading(false);
                event.target.value = "";
            }
        },
        [
            selectedUploadStrategy,
            categorizeAssetClass,
            uniqueAssetClasses,
            uniqueCustodianCodes,
            resetRowFilters,
        ]
    );

    const handleAddClient = useCallback(() => {
    // Validate inputs
    if (!newClientName.trim()) {
        setNewClientError("Client name is required.");
        return;
    }
    if (uniqueCustodianCodes.includes(newClientName)) {
        setNewClientError("Client name already exists.");
        return;
    }
    const cashAmount = parseFloat(newClientCash);
    if (isNaN(cashAmount) || cashAmount <= 0) {
        setNewClientError("Valid cash amount greater than 0 is required.");
        return;
    }

    setNewClientError("");

    // Create new allocation for Cash
    const cashStock = summaryData.find((item) => item.asset_class === "Cash")?.key || "Cash";
    const newAllocation: Allocation = {
        id: allocations.length + 1,
        date: new Date().toISOString().split("T")[0],
        stock_name: cashStock,
        asset_class: "Cash",
        strategy_code: strategyFilter === "all" ? uniqueStrategies[0] : strategyFilter,
        qcode: `Q${Math.random().toString(36).substr(2, 9)}`,
        custodian_code: newClientName,
        total_percent: 100,
        units: cashAmount / 1, // Assuming rate is 1 for simplicity
        rate: 1,
        value: cashAmount,
        total: 100,
        created_at: new Date().toISOString(),
    };

    // Update allocations
    setAllocations((prev) => [...prev, newAllocation]);

    // Update selectedClients to include new client
    setSelectedClients((prev) => [newClientName, ...prev]);

    // Update totalRupeesByCustodianRef for the new client
    totalRupeesByCustodianRef.current = {
        ...totalRupeesByCustodianRef.current,
        [newClientName]: cashAmount,
    };

    // Update adjustedAllocations for Total Weights (100% Cash)
    setAdjustedAllocations((prev) => {
        const newAdjusted = { ...prev };
        summaryData.forEach((item) => {
            if (!newAdjusted[item.key]) {
                newAdjusted[item.key] = {};
            }
            newAdjusted[item.key][newClientName] = {
                percent: item.asset_class === "Cash" ? 100 : 0,
                rupees: item.asset_class === "Cash" ? cashAmount : 0,
            };
        });
        return newAdjusted;
    });

    // If in Change tab, distribute 100% according to modelPercentages
    if (tab === "change") {
        setAdjustedAllocations((prev) => {
            const newAdjusted = { ...prev };
            summaryData.forEach((item) => {
                const modelPercent = modelPercentages[item.key] || 0;
                newAdjusted[item.key] = {
                    ...newAdjusted[item.key],
                    [newClientName]: {
                        percent: modelPercent,
                        rupees: modelPercent * (cashAmount / 100),
                    },
                };
            });
            return newAdjusted;
        });
    }

    // Reset input fields
    setNewClientName("");
    setNewClientCash("");
}, [
    newClientName,
    newClientCash,
    uniqueCustodianCodes,
    summaryData,
    strategyFilter,
    uniqueStrategies,
    allocations,
    modelPercentages,
    tab,
]);
    return (
        <ComponentCard title="PMS Portfolio Allocation by Stock" className="m-0     p-0">
            {loading ? (
                <div className="flex flex-col items-center justify-center h-64 bg-white rounded-xl shadow-sm border border-gray-100">
                    <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                    <p className="mt-4 text-gray-500 font-medium">Loading portfolio data...</p>
                </div>
            ) : (
                <div className=" font-inter">
                    <div className="bg-gray-50 p-4 rounded-xl shadow-sm border border-gray-100">
                 <h3 className="text-lg font-semibold text-gray-700 mb-4">Add New Client</h3>
                 <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
                     <div>
                         <label className="block text-sm font-semibold text-gray-700 mb-2">Client Name</label>
                         <input
                             type="text"
                             value={newClientName}
                             onChange={(e) => setNewClientName(e.target.value)}
                             className={`p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 w-full sm:w-48 ${newClientError ? "border-red-500" : "border-gray-200"}`}
                              placeholder="Enter client name"
                              aria-label="New client name"
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Cash Amount (₹)</label>
                          <input
                              type="number"
                              value={newClientCash}
                              onChange={(e) => setNewClientCash(e.target.value)}
                              className={`p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 w-full sm:w-48 ${newClientError ? "border-red-500" : "border-gray-200"}`}
                               placeholder="Enter cash amount"
                               aria-label="New client cash amount"
                               min="0"
                           />
                       </div>
                       <div>
                           <button
                               className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm flex items-center gap-2 ${newClientName &&         newClientCash && !newClientError ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-gray-300 text-gray-500 cursor-not-allowed"}`}
                               onClick={handleAddClient}
                               disabled={!newClientName || !newClientCash || !!newClientError}
                           >
                               <Plus className="w-4 h-4" />
                               Add Client
                           </button>
                       </div>
                   </div>
                   {newClientError && (
                       <p className="mt-2 text-sm text-red-500">{newClientError}</p>
                   )}
               </div>
                    <div className="bg-gray-50 p-4 rounded-xl shadow-sm border border-gray-100">
                        <h3 className="text-lg font-semibold text-gray-700 mb-4">Upload Allocation Data</h3>
                        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Strategy</label>
                                <select
                                    value={selectedUploadStrategy}
                                    onChange={(e) => setSelectedUploadStrategy(e.target.value)}
                                    className="p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 w-full sm:w-48"
                                    aria-label="Select strategy for file upload"
                                >
                                    <option value="">Select a strategy</option>
                                    {uniqueStrategies.map((strategy) => (
                                        <option key={strategy} value={strategy}>
                                            {strategy}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm cursor-pointer flex items-center gap-2 ${uploadLoading || !selectedUploadStrategy
                                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                        : "bg-green-600 text-white hover:bg-green-700"
                                        }`}
                                >
                                    <input
                                        type="file"
                                        accept=".csv,.xlsx,.xls"
                                        className="hidden"
                                        onChange={handleFileUpload}
                                        disabled={uploadLoading || !selectedUploadStrategy}
                                    />
                                    {uploadLoading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Upload className="w-4 h-4" />
                                    )}
                                    Upload File
                                </label>
                            </div>
                        </div>
                    </div>
                    {/* Strategy Selector */}
                    <div className="bg-gray-50 p-4 rounded-xl shadow-sm border border-gray-100">
                        <label className="block text-sm font-semibold text-gray-700 mb-3">Strategy</label>
                        <div className="flex flex-wrap gap-2">
                            {uniqueStrategies.map((strategy) => (
                                <div key={strategy} className="relative flex items-center gap-2">
                                    <button
                                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm ${strategyFilter === strategy
                                            ? "bg-blue-600 text-white"
                                            : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                                            }`}
                                        onClick={() => {
                                            setStrategyFilter(strategy);
                                            setClientFilter("all");
                                            initialLoadRef.current = true;
                                            setChangedKeys([]);
                                            setStateHistory([]);
                                            setAdjustedAllocations({});
                                            setIsCashAdjusted(false);
                                            setAdjustedValues({});
                                            resetRowFilters();
                                            setOpenAccordions(
                                                uniqueAssetClasses.reduce(
                                                    (acc, assetClass) => ({ ...acc, [assetClass]: true }),
                                                    {} as { [key: string]: boolean }
                                                )
                                            );
                                            setBufferValue(0);
                                            setBufferError(false);
                                            setSecurityActionableFilter("all");
                                            setClientActionableFilter("all");
                                            setSelectedClients(uniqueCustodianCodes);
                                        }}
                                    >
                                        {strategy}
                                    </button>
                                    {/* <label
                                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm cursor-pointer ${uploadLoading[strategy]
                                            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                                            : "bg-green-600 text-white hover:bg-green-700"
                                            } flex items-center gap-2`}
                                    >
                                        <input
                                            type="file"
                                            accept=".csv,.xlsx,.xls"
                                            className="hidden"
                                            onChange={(e) => handleFileUpload(strategy, e)}
                                            disabled={uploadLoading[strategy]}
                                        />
                                        {uploadLoading[strategy] ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Download className="w-4 h-4" />
                                        )}
                                        Upload
                                    </label> */}
                                </div>
                            ))}
                        </div>
                    </div>



                    {/* Top Controls */}
                    <div className="flex flex-wrap items-center justify-between gap-4 bg-gray-50 p-4 rounded-xl shadow-sm border border-gray-100">
                        <div className="flex items-center gap-2">
                            <label className="text-sm font-semibold text-gray-700">View:</label>
                            <div className="inline-flex rounded-lg bg-white border border-gray-200 shadow-sm">
                                <button
                                    className={`px-4 py-2 text-sm font-medium transition-all duration-200 rounded-l-lg flex items-center gap-2 ${tab === "total" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
                                        }`}
                                    onClick={() => handleTabChange("total")}
                                >
                                    <Eye className="w-4 h-4" />
                                    Total Weights
                                </button>
                                <button
                                    className={`px-4 py-2 text-sm font-medium transition-all duration-200 rounded-r-lg flex items-center gap-2 ${tab === "change" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
                                        }`}
                                    onClick={() => handleTabChange("change")}
                                >
                                    <EyeOff className="w-4 h-4" />
                                    Change in Weights
                                </button>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-600 text-white hover:bg-gray-700 flex items-center gap-2 transition-all duration-200 shadow-sm"
                                onClick={handleResetAll}
                            >
                                <RefreshCw className="w-4 h-4" />
                                Reset All
                            </button>
                            <button
                                className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all duration-200 shadow-sm ${isCashAdjusted
                                    ? "bg-amber-600 text-white hover:bg-amber-700"
                                    : "bg-amber-500 text-white hover:bg-amber-600"
                                    }`}
                                onClick={handleAdjustCash}
                            >
                                {isCashAdjusted ? <RotateCcw className="w-4 h-4" /> : <IndianRupee className="w-4 h-4" />}
                                {isCashAdjusted ? "Reset Cash" : "Adjust Cash"}
                            </button>
                            <button
                                className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 flex items-center gap-2 transition-all duration-200 shadow-sm"
                                onClick={exportToExcel}
                            >
                                <Download className="w-4 h-4" />
                                Export to Excel
                            </button>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-xl shadow-sm border border-gray-100">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Display Mode</label>
                            <div className="inline-flex rounded-lg bg-white border border-gray-200 shadow-sm">
                                <button
                                    className={`px-4 py-2 text-sm font-medium transition-all duration-200 rounded-l-lg flex items-center gap-2 ${displayMode === "percent" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
                                        }`}
                                    onClick={() => setDisplayMode("percent")}
                                >
                                    <Percent className="w-4 h-4" />
                                    Percentage
                                </button>
                                <button
                                    className={`px-4 py-2 text-sm font-medium transition-all duration-200 rounded-r-lg flex items-center gap-2 ${displayMode === "rupees" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
                                        }`}
                                    onClick={() => setDisplayMode("rupees")}
                                >
                                    <DollarSign className="w-4 h-4" />
                                    Rupees
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Client Action</label>
                            <div className="inline-flex rounded-lg bg-white border border-gray-200 shadow-sm">
                                <button
                                    className={`px-4 py-2 text-sm font-medium transition-all duration-200 rounded-l-lg ${clientFilter === "all" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
                                        }`}
                                    onClick={() => {
                                        setClientFilter("all");
                                        resetRowFilters();
                                    }}
                                >
                                    All
                                </button>
                                <button
                                    className={`px-4 py-2 text-sm font-medium transition-all duration-200 ${clientFilter === "buy" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
                                        }`}
                                    onClick={() => {
                                        setClientFilter("buy");
                                        resetRowFilters();
                                    }}
                                >
                                    Buy
                                </button>
                                <button
                                    className={`px-4 py-2 text-sm font-medium transition-all duration-200 rounded-r-lg ${clientFilter === "sell" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
                                        }`}
                                    onClick={() => {
                                        setClientFilter("sell");
                                        resetRowFilters();
                                    }}
                                >
                                    Sell
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Buffer (%)</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={bufferValue}
                                    onChange={(e) => handleBufferChange(e.target.value)}
                                    className={`w-24 p-2 text-right border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 ${bufferError ? "border-red-500 text-red-500" : "border-gray-200"
                                        }`}
                                    placeholder="0.00"
                                    aria-label="Buffer threshold in percentage"
                                />
                                <span className="absolute right-2 top-2.5 text-gray-500">%</span>
                            </div>
                        </div>
                        <div>
                            <div className="relative">
                                <div className="p-2 border rounded-lg bg-white dark:bg-gray-900">

                                    <ClientSelectCheckbox
                                        label="Clients"
                                        options={uniqueCustodianCodes}
                                        selected={selectedClients}
                                        onChange={setSelectedClients}
                                    />
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* Table */}
                    <div className="relative overflow-x-auto rounded-xl shadow-sm border border-gray-100">
                        <table className="min-w-full text-sm bg-white">
                            <thead className="bg-gray-100 text-gray-600 uppercase font-semibold text-xs">
                                {tab === "change" && (
                                    <tr>
                                        <th className="p-3 text-center w-[120px] sticky top-0 left-[0px] bg-gray-100 z-20 border-r border-gray-200"></th>
                                        <th className="p-3 text-left min-w-[200px] sticky top-0 left-[120px] bg-gray-100 z-20 border-r border-gray-200"></th>
                                        <th className="p-3 text-left w-[150px] sticky top-0 bg-gray-100 z-10 border-r border-gray-200"></th>
                                        <th className="p-3 text-right w-[100px] sticky top-0 bg-gray-100 z-10 border-r border-gray-200"></th>
                                        <th className="p-3 text-right w-[200px] sticky top-0 bg-gray-100 z-10 border-r border-gray-200"></th>
                                        {uniqueCustodianCodes.map((custodianCode) => {
                                            if (!selectedClients.includes(custodianCode)) return null;
                                            const buyTotal = sortedSummaryData.reduce((sum, item) => {
                                                if (item.asset_class === "Cash" || rowFilters[item.key] === "none") return sum;
                                                const percentValue = getClientDifference(item, custodianCode);
                                                const adjustedPercentValue =
                                                    isCashAdjusted && adjustedValues[custodianCode]?.[item.key] != null
                                                        ? adjustedValues[custodianCode][item.key]
                                                        : percentValue;
                                                const filter = rowFilters[item.key] || "both";
                                                if (
                                                    Math.abs(adjustedPercentValue ?? 0) <= bufferValue ||
                                                    (filter === "buy" && !(adjustedPercentValue > bufferValue)) ||
                                                    (filter === "sell" && !(adjustedPercentValue < -bufferValue))
                                                ) {
                                                    return sum;
                                                }
                                                if (adjustedPercentValue > bufferValue) {
                                                    return sum + totalRupeesByCustodianRef.current[custodianCode] * (adjustedPercentValue / 100);
                                                }
                                                return sum;
                                            }, 0);
                                            const sellTotal = sortedSummaryData.reduce((sum, item) => {
                                                if (item.asset_class === "Cash" || rowFilters[item.key] === "none") return sum;
                                                const percentValue = getClientDifference(item, custodianCode);
                                                const adjustedPercentValue =
                                                    isCashAdjusted && adjustedValues[custodianCode]?.[item.key] != null
                                                        ? adjustedValues[custodianCode][item.key]
                                                        : percentValue;
                                                const filter = rowFilters[item.key] || "both";
                                                if (
                                                    Math.abs(adjustedPercentValue ?? 0) <= bufferValue ||
                                                    (filter === "buy" && !(adjustedPercentValue > bufferValue)) ||
                                                    (filter === "sell" && !(adjustedPercentValue < -bufferValue))
                                                ) {
                                                    return sum;
                                                }
                                                if (adjustedPercentValue < -bufferValue) {
                                                    return sum + Math.abs(totalRupeesByCustodianRef.current[custodianCode] * (adjustedPercentValue / 100));
                                                }
                                                return sum;
                                            }, 0);
                                            return (
                                                <th
                                                    key={custodianCode}
                                                    className="p-3 text-right w-[120px] sticky top-0 bg-gray-100 z-10 border-r border-gray-200"
                                                >
                                                    <div className="text-blue-500">Buy: {formatNumber(buyTotal)}</div>
                                                    <div className="text-red-500">Sell: {formatNumber(sellTotal)}</div>
                                                </th>
                                            );
                                        })}
                                    </tr>
                                )}
                                <tr>
                                    <th className="p-3 text-center w-[120px] sticky top-0 left-[0px] bg-gray-100 z-20 border-r border-gray-200">
                                        Actions
                                    </th>
                                    <th className="p-3 text-left min-w-[200px] sticky top-0 left-0 bg-gray-100 z-20 border-r border-gray-200">
                                        Stock
                                    </th>
                                    <th className="p-3 text-left w-[150px] sticky top-0 bg-gray-100 z-10 border-r border-gray-200">
                                        Asset Class
                                    </th>
                                    <th className="p-3 text-right w-[100px] sticky top-0 bg-gray-100 z-10 border-r border-gray-200">
                                        Total (%)
                                    </th>
                                    <th className="p-3 text-right w-[200px] sticky top-0 bg-gray-100 z-10 border-r border-gray-200">
                                        Model (%)
                                    </th>
                                    {uniqueCustodianCodes.map((custodianCode) => (
                                        selectedClients.includes(custodianCode) ? (
                                            <th
                                                key={custodianCode}
                                                className="p-3 text-right w-[120px] sticky top-0 bg-gray-100 z-10 border-r border-gray-200"
                                            >
                                                {custodianCode} {displayMode === "percent" ? "(%)" : "(₹)"}
                                            </th>
                                        ) : null
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {sortedSummaryData.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={uniqueCustodianCodes.length + 5}
                                            className="text-center py-8 text-gray-500"
                                        >
                                            No allocation data found with current filters
                                        </td>
                                    </tr>
                                ) : (
                                    <>
                                        {Object.entries(_.groupBy(sortedSummaryData, "asset_class") as { [key: string]: Summary[] })
                                            .sort(([a], [b]) => assetClassOrder.indexOf(a) - assetClassOrder.indexOf(b))
                                            .map(([assetClass, assetClassItems]) => (
                                                <React.Fragment key={assetClass}>
                                                    <tr
                                                        className="bg-gray-100 font-semibold cursor-pointer hover:bg-gray-200 transition-colors"
                                                        onClick={() => handleAccordionToggle(assetClass)}
                                                    >
                                                        <td className="p-3 text-center sticky left-[0px] bg-gray-100 z-20 border-r border-gray-200">
                                                            <ChevronRight
                                                                className={`w-5 h-5 transform transition-transform ${openAccordions[assetClass] ? "rotate-90" : ""
                                                                    }`}
                                                            />
                                                        </td>
                                                        <td className="p-3 text-left sticky left-0 bg-gray-100 z-10 border-r border-gray-200">
                                                            {assetClass}
                                                        </td>
                                                        <td className="p-3 border-r border-gray-200"></td>
                                                        <td className="p-3 text-right border-r border-gray-200">
                                                            {formatPercent(calculateTotals(assetClassItems).totalPercent)}
                                                        </td>
                                                        <td className="p-3 text-right border-r border-gray-200">
                                                            {formatPercent(calculateTotals(assetClassItems).modelPercent)}
                                                        </td>
                                                        {uniqueCustodianCodes.map((custodianCode) =>
                                                            selectedClients.includes(custodianCode) ? (
                                                                <td
                                                                    key={custodianCode}
                                                                    className={`p-3 text-right font-semibold border-r border-gray-200 ${selectedClients.includes(custodianCode)
                                                                        ? tab === "change"
                                                                            ? calculateTotals(assetClassItems).clientTotals[custodianCode] > bufferValue
                                                                                ? "text-blue-500"
                                                                                : calculateTotals(assetClassItems).clientTotals[custodianCode] < -bufferValue
                                                                                    ? "text-red-500"
                                                                                    : "text-gray-900"
                                                                            : "text-gray-900"
                                                                        : "text-gray-400"
                                                                        }`}
                                                                >
                                                                    {selectedClients.includes(custodianCode)
                                                                        ? displayMode === "percent"
                                                                            ? formatPercent(calculateTotals(assetClassItems).clientTotals[custodianCode])
                                                                            : formatNumber(calculateTotals(assetClassItems).clientTotals[custodianCode])
                                                                        : "-"}
                                                                </td>
                                                            ) : null
                                                        )}
                                                    </tr>
                                                    {openAccordions[assetClass] &&
                                                        assetClassItems.map((item, index) => {
                                                            const difference = getModelDifference(item.key, item.total_percent);
                                                            const hasUndo = stateHistory.some((state) => state.changedKey === item.key);
                                                            const isCash = item.asset_class === "Cash";
                                                            const buyLabel = isCash ? "Add" : "Buy";
                                                            const sellLabel = isCash ? "Use" : "Sell";
                                                            return (
                                                                <tr
                                                                    key={item.key}
                                                                    className={`border-b ${getRowBgColor(
                                                                        item.asset_class
                                                                    )} hover:bg-opacity-80 transition-colors`}
                                                                >
                                                                    <td className="p-3 text-center sticky left-[0px] z-20 bg-inherit border-r border-gray-200">
                                                                        {tab === "change" ? (
                                                                            <div className="flex justify-center gap-1">
                                                                                <button
                                                                                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-medium transition-all duration-200 ${rowFilters[item.key] === "buy"
                                                                                        ? "bg-green-600 text-white shadow-sm"
                                                                                        : hasBuyAction(item)
                                                                                            ? "bg-gray-200 text-green-600 hover:bg-green-100"
                                                                                            : "bg-gray-200 text-gray-400 cursor-not-allowed"
                                                                                        }`}
                                                                                    onClick={() => handleRowFilter(item.key, "buy")}
                                                                                    disabled={!hasBuyAction(item)}
                                                                                    title={buyLabel}
                                                                                >
                                                                                    B
                                                                                </button>
                                                                                <button
                                                                                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-medium transition-all duration-200 ${rowFilters[item.key] === "sell"
                                                                                        ? "bg-red-600 text-white shadow-sm"
                                                                                        : hasSellAction(item)
                                                                                            ? "bg-gray-200 text-red-600 hover:bg-red-100"
                                                                                            : "bg-gray-200 text-gray-400 cursor-not-allowed"
                                                                                        }`}
                                                                                    onClick={() => handleRowFilter(item.key, "sell")}
                                                                                    disabled={!hasSellAction(item)}
                                                                                    title={sellLabel}
                                                                                >
                                                                                    S
                                                                                </button>
                                                                                <button
                                                                                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-medium transition-all duration-200 ${rowFilters[item.key] === "both"
                                                                                        ? "bg-blue-600 text-white shadow-sm"
                                                                                        : "bg-gray-200 text-blue-600 hover:bg-blue-100"
                                                                                        }`}
                                                                                    onClick={() => handleRowFilter(item.key, "both")}
                                                                                    title="Both"
                                                                                >
                                                                                    A
                                                                                </button>
                                                                                <button
                                                                                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-medium transition-all duration-200 ${rowFilters[item.key] === "none"
                                                                                        ? "bg-gray-600 text-white shadow-sm"
                                                                                        : "bg-gray-200 text-gray-600 hover:bg-gray-100"
                                                                                        }`}
                                                                                    onClick={() => handleRowFilter(item.key, "none")}
                                                                                    title="None"
                                                                                >
                                                                                    N
                                                                                </button>
                                                                            </div>
                                                                        ) : null}
                                                                    </td>
                                                                    <td className="p-3 font-medium sticky left-0 bg-inherit z-10 border-r border-gray-200">
                                                                        {item.key}
                                                                    </td>
                                                                    <td className="p-3 border-r border-gray-200">{item.asset_class}</td>
                                                                    <td className="p-3 text-right border-r border-gray-200">
                                                                        {formatPercent(item.total_percent)}
                                                                    </td>
                                                                    <td className="p-3 text-right flex items-center gap-2 border-r border-gray-200">
                                                                        <button
                                                                            className={`px-2 py-1 rounded-lg text-xs font-medium transition-all duration-200 flex items-center gap-1 ${hasUndo
                                                                                ? "bg-blue-500 text-white hover:bg-blue-600"
                                                                                : "bg-gray-200 text-gray-400 cursor-not-allowed"
                                                                                }`}
                                                                            onClick={() => handleUndo(item.key)}
                                                                            disabled={!hasUndo}
                                                                        >
                                                                            <RotateCcw className="w-3 h-3" />
                                                                            Undo
                                                                        </button>
                                                                        <input
                                                                            type="text"
                                                                            value={inputValues[item.key] || ""}
                                                                            onChange={(e) => {
                                                                                setInputValues((prev) => ({ ...prev, [item.key]: e.target.value }));
                                                                                debouncedModelChange(item.key, e.target.value);
                                                                            }}
                                                                            onBlur={(e) => handleBlur(item.key, e.target.value)}
                                                                            className={`w-20 p-2 text-right border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 ${isModelSumExceeding
                                                                                ? "border-red-500 text-red-500"
                                                                                : inputErrors[item.key]
                                                                                    ? "border-red-500 text-red-500"
                                                                                    : difference > 0
                                                                                        ? "border-blue-500 text-blue-500"
                                                                                        : difference < 0
                                                                                            ? "border-red-500 text-red-500"
                                                                                            : "border-gray-200"
                                                                                }`}
                                                                            aria-label={`Model percentage for ${item.key}`}
                                                                        />
                                                                    </td>
                                                                    {uniqueCustodianCodes.map((custodianCode) => {
                                                                        if (!selectedClients.includes(custodianCode)) return null;
                                                                        // if (!selectedClients.includes(custodianCode)) {
                                                                        //     return (
                                                                        //         <td
                                                                        //             key={custodianCode}
                                                                        //             className="p-3 text-right text-gray-400 border-r border-gray-200"
                                                                        //         >
                                                                        //             -
                                                                        //         </td>
                                                                        //     );
                                                                        // }

                                                                        const percentValue =
                                                                            tab === "total"
                                                                                ? adjustedAllocations[item.key]?.[custodianCode]?.percent ?? item.initialCustodianAllocations[custodianCode] ?? 0
                                                                                : getClientDifference(item, custodianCode);
                                                                        const adjustedPercentValue =
                                                                            tab === "change" &&
                                                                                isCashAdjusted &&
                                                                                percentValue > bufferValue &&
                                                                                adjustedValues[custodianCode]?.[item.key] != null
                                                                                ? adjustedValues[custodianCode][item.key]
                                                                                : percentValue;
                                                                        const displayValue =
                                                                            displayMode === "percent"
                                                                                ? adjustedPercentValue
                                                                                : totalRupeesByCustodianRef.current[custodianCode] *
                                                                                ((adjustedPercentValue ?? 0) / 100);

                                                                        if (tab === "change" && rowFilters[item.key] === "none") {
                                                                            return (
                                                                                <td
                                                                                    key={custodianCode}
                                                                                    className="p-3 text-right text-gray-400 border-r border-gray-200"
                                                                                >
                                                                                    -
                                                                                </td>
                                                                            );
                                                                        }

                                                                        if (tab === "change") {
                                                                            const epsilon = 1e-10;
                                                                            if (!isCash && Math.abs(adjustedPercentValue ?? 0) <= bufferValue) {
                                                                                return (
                                                                                    <td
                                                                                        key={custodianCode}
                                                                                        className="p-3 text-right text-gray-400 border-r border-gray-200"
                                                                                    >
                                                                                        -
                                                                                    </td>
                                                                                );
                                                                            }
                                                                            const filter = rowFilters[item.key] || "both";
                                                                            if (!isCash && rowFilters[item.key] === "buy" && !(adjustedPercentValue > bufferValue)) {
                                                                                return (
                                                                                    <td
                                                                                        key={custodianCode}
                                                                                        className="p-3 text-right text-gray-400 border-r border-gray-200"
                                                                                    >
                                                                                        -
                                                                                    </td>
                                                                                );
                                                                            }
                                                                            if (!isCash && rowFilters[item.key] === "sell" && !(adjustedPercentValue < -bufferValue)) {
                                                                                return (
                                                                                    <td
                                                                                        key={custodianCode}
                                                                                        className="p-3 text-right text-gray-400 border-r border-gray-200"
                                                                                    >
                                                                                        -
                                                                                    </td>
                                                                                );
                                                                            }
                                                                        }

                                                                        return (
                                                                            <td
                                                                                key={custodianCode}
                                                                                className={`p-3 text-right border-r border-gray-200 ${tab === "change"
                                                                                    ? adjustedPercentValue > bufferValue
                                                                                        ? "text-blue-500"
                                                                                        : adjustedPercentValue < -bufferValue
                                                                                            ? "text-red-500"
                                                                                            : "text-gray-900"
                                                                                    : "text-gray-900"
                                                                                    }`}
                                                                            >
                                                                                {displayValue != null
                                                                                    ? displayMode === "percent"
                                                                                        ? formatPercent(displayValue)
                                                                                        : formatNumber(displayValue)
                                                                                    : "-"}
                                                                            </td>
                                                                        );
                                                                    })}
                                                                </tr>
                                                            );
                                                        })}
                                                </React.Fragment>
                                            ))}
                                        {/* Grand Total Row */}
                                        <tr className="bg-gray-200 font-bold text-gray-800">
                                            <td className="p-3 text-center sticky left-[0px] bg-gray-200 z-20 border-r border-gray-200">
                                                {/* Empty for Actions */}
                                            </td>
                                            <td className="p-3 text-left sticky left-0 bg-gray-200 z-10 border-r border-gray-200">
                                                Grand Total
                                            </td>
                                            <td className="p-3 border-r border-gray-200">
                                                {/* Empty for Asset Class */}
                                            </td>
                                            <td className="p-3 text-right border-r border-gray-200">
                                                {formatPercent(calculateTotals(sortedSummaryData, true).totalPercent)}
                                            </td>
                                            <td className="p-3 text-right border-r border-gray-200">
                                                {formatPercent(calculateTotals(sortedSummaryData, true).modelPercent)}
                                            </td>
                                            {uniqueCustodianCodes.map((custodianCode) => (
                                                <td
                                                    key={custodianCode}
                                                    className={`p-3 text-right font-bold border-r border-gray-200 ${selectedClients.includes(custodianCode)
                                                        ? tab === "change"
                                                            ? calculateTotals(sortedSummaryData, true).clientTotals[custodianCode] >
                                                                bufferValue
                                                                ? "text-blue-500"
                                                                : calculateTotals(sortedSummaryData, true).clientTotals[custodianCode] <
                                                                    -bufferValue
                                                                    ? "text-red-500"
                                                                    : "text-gray-800"
                                                            : "text-gray-800"
                                                        : "text-gray-400"
                                                        }`}
                                                >
                                                    {selectedClients.includes(custodianCode)
                                                        ? displayMode === "percent"
                                                            ? formatPercent(
                                                                calculateTotals(sortedSummaryData, true).clientTotals[custodianCode]
                                                            )
                                                            : formatNumber(
                                                                calculateTotals(sortedSummaryData, true).clientTotals[custodianCode]
                                                            )
                                                        : "-"}
                                                </td>
                                            ))}
                                        </tr>
                                    </>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Actionables Section */}
                    {tab === "change" && (
                        <div className="bg-gray-50 p-4 rounded-xl shadow-sm border border-gray-100">
                            <h3 className="text-lg font-semibold text-gray-700 mb-4">Actionables</h3>
                            <div className="flex flex-wrap gap-4 mb-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Security</label>
                                    <select
                                        value={securityActionableFilter}
                                        onChange={(e) => setSecurityActionableFilter(e.target.value)}
                                        className="p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                                        aria-label="Filter actionables by security"
                                    >
                                        <option value="all">All Securities</option>
                                        {uniqueStocks.map((stock) => (
                                            <option key={stock} value={stock}>
                                                {stock}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Client</label>
                                    <select
                                        value={clientActionableFilter}
                                        onChange={(e) => setClientActionableFilter(e.target.value)}
                                        className="p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                                        aria-label="Filter actionables by client"
                                    >
                                        <option value="all">All Clients</option>
                                        {uniqueCustodianCodes.map((custodianCode) => (
                                            <option key={custodianCode} value={custodianCode}>
                                                {custodianCode}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            {Object.keys(actionables).length === 0 ||
                                Object.values(actionables).every(
                                    (actions) => actions.buy.length === 0 && actions.sell.length === 0
                                ) ? (
                                <p className="text-gray-500">No actionable items found with current filters.</p>
                            ) : (
                                <div className="space-y-6">
                                    {Object.entries(actionables)
                                        .sort(([a], [b]) => assetClassOrder.indexOf(a) - assetClassOrder.indexOf(b))
                                        .map(([assetClass, actions]) => {
                                            const filteredBuyActions = actions.buy.filter(
                                                (action) =>
                                                    (securityActionableFilter === "all" || action.stock === securityActionableFilter) &&
                                                    (clientActionableFilter === "all" || action.custodianCode === clientActionableFilter)
                                            );
                                            const filteredSellActions = actions.sell.filter(
                                                (action) =>
                                                    (securityActionableFilter === "all" || action.stock === securityActionableFilter) &&
                                                    (clientActionableFilter === "all" || action.custodianCode === clientActionableFilter)
                                            );

                                            if (filteredBuyActions.length === 0 && filteredSellActions.length === 0) return null;

                                            const isCash = assetClass === "Cash";
                                            const buyLabel = isCash ? "Add" : "Buy";
                                            const sellLabel = isCash ? "Use" : "Sell";
                                            return (
                                                <div key={assetClass}>
                                                    <h4 className="text-base font-semibold text-gray-600 mb-2">{assetClass}</h4>
                                                    <div className="space-y-2">
                                                        {filteredBuyActions.length > 0 && (
                                                            <div>
                                                                <p className="text-sm font-medium text-blue-600">{buyLabel}:</p>
                                                                <ul className="list-disc pl-5 text-sm text-gray-700">
                                                                    {filteredBuyActions.map((action, index) => (
                                                                        <li key={index}>
                                                                            Rs {formatNumber(action.amount)} in {action.custodianCode} for {action.stock}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}
                                                        {filteredSellActions.length > 0 && (
                                                            <div>
                                                                <p className="text-sm font-medium text-red-600">{sellLabel}:</p>
                                                                <ul className="list-disc pl-5 text-sm text-gray-700">
                                                                    {filteredSellActions.map((action, index) => (
                                                                        <li key={index}>
                                                                            Rs {formatNumber(action.amount)} in {action.custodianCode} for {action.stock}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </ComponentCard>
    );
}