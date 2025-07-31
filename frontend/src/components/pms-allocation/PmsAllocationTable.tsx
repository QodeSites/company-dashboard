// @ts-nocheck
"use client";

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import _ from "lodash";
import * as XLSX from "xlsx";
import debounce from "lodash/debounce";
import { Download, ChevronRight, RotateCcw, Loader2, Eye, EyeOff, DollarSign, Percent, RefreshCw, Upload, IndianRupee, Plus } from "lucide-react";
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
    const [newClientAmount, setNewClientAmount] = useState<string>("");
    const [newClientError, setNewClientError] = useState<boolean>(false);
    const [newCustodianCodes, setNewCustodianCodes] = useState<{ name: string; amount: string }[]>([]);
    const initialLoadRef = useRef(true);
    const summaryDataRef = useRef<Summary[]>([]);
    const totalRupeesByCustodianRef = useRef<{ [key: string]: number }>({});
    const [uploadLoading, setUploadLoading] = useState<boolean>(false);

    // New state for cash filter
    const [cashFilterValue, setCashFilterValue] = useState('');
    const [cashFilterOperator, setCashFilterOperator] = useState('greater');

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

    // Update uniqueCustodianCodes to place new custodian codes at the start
    const uniqueCustodianCodes = useMemo(() => {
        const originalCodes = _.uniq(
            strategyFilteredAllocations.map((item) => item.custodian_code).filter(Boolean)
        ).sort() as string[];
        return [...newCustodianCodes.map((client) => client.name), ...originalCodes];
    }, [strategyFilteredAllocations, newCustodianCodes]);

    useEffect(() => {
        setSelectedClients(uniqueCustodianCodes);
    }, [uniqueCustodianCodes]);

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

    // Update totalRupeesByCustodian to handle new clients
    const totalRupeesByCustodian = useMemo(() => {
        const totals = uniqueCustodianCodes.reduce((acc, custodianCode) => {
            const newClient = newCustodianCodes.find((client) => client.name === custodianCode);
            if (newClient) {
                acc[custodianCode] = parseFloat(newClient.amount) || 0;
            } else {
                const total = filteredAllocations
                    .filter((item) => item.custodian_code === custodianCode)
                    .reduce((sum, item) => {
                        const value = parseFloat(item.value?.toString() ?? "0");
                        return sum + (isNaN(value) ? 0 : value);
                    }, 0);
                acc[custodianCode] = total;
            }
            return acc;
        }, {} as { [key: string]: number });
        return totals;
    }, [uniqueCustodianCodes, filteredAllocations, newCustodianCodes]);

    useEffect(() => {
        totalRupeesByCustodianRef.current = totalRupeesByCustodian;
    }, [totalRupeesByCustodian]);

    // Update summaryData to set Cash category to 100% for new clients
    const summaryData = useMemo(() => {
        const groupKey = "stock_name";
        const groups = _.groupBy(filteredAllocations, groupKey) as { [key: string]: Allocation[] };

        const cashStockKey = "Cash";

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
                if (newCustodianCodes.find((client) => client.name === custodianCode)) {
                    custodianCodeAllocations[custodianCode] = key === cashStockKey ? "100.00" : "0.00";
                    initialCustodianAllocations[custodianCode] = key === cashStockKey ? "100.00" : "0.00";
                } else {
                    const modelPercent = modelPercentages[key] || 0;
                    custodianCodeAllocations[custodianCode] = modelPercent.toFixed(2);
                    initialCustodianAllocations[custodianCode] = "0";
                    items.forEach((item) => {
                        if (item.custodian_code === custodianCode) {
                            const percentValue = parseFloat(item.total?.toString() ?? "0");
                            initialCustodianAllocations[custodianCode] = percentValue.toFixed(2);
                        }
                    });
                }
            });

            return {
                ...details,
                custodianCodeAllocations,
                initialCustodianAllocations,
                totalValue,
            };
        });
    }, [filteredAllocations, uniqueCustodianCodes, modelPercentages, newCustodianCodes]);

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
                        const percent = newCustodianCodes.includes(custodianCode) && item.asset_class === "Cash" ? 100 : modelPercent;
                        newAdjusted[item.key][custodianCode] = {
                            percent,
                            rupees: percent * (totalRupeesByCustodian[custodianCode] / 100),
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
        newCustodianCodes,
    ]);

    const getClientDifference = useCallback(
        (item: Summary, custodianCode: string) => {
            if (newCustodianCodes.find((client) => client.name === custodianCode)) {
                const modelPercent = modelPercentages[item.key] || 0;
                const initialPercent = item.key === "Cash" ? 100 : 0;
                return modelPercent - initialPercent;
            }
            const current = parseFloat(item.custodianCodeAllocations[custodianCode]?.toString() ?? "0");
            const initial = parseFloat(item.initialCustodianAllocations[custodianCode]?.toString() ?? "0");
            return current - initial;
        },
        [modelPercentages, newCustodianCodes]
    );

    const hasBuyAction = useCallback(
        (item: Summary) => {
            if (item.asset_class === "Cash") return true; // No buffer for Cash
            return uniqueCustodianCodes.some(
                (custodianCode) => selectedClients.includes(custodianCode) && getClientDifference(item, custodianCode) > bufferValue
            );
        },
        [uniqueCustodianCodes, selectedClients, getClientDifference, bufferValue]
    );

    const hasSellAction = useCallback(
        (item: Summary) => {
            if (item.asset_class === "Cash") return true; // No buffer for Cash
            return uniqueCustodianCodes.some(
                (custodianCode) => selectedClients.includes(custodianCode) && getClientDifference(item, custodianCode) < -bufferValue
            );
        },
        [uniqueCustodianCodes, selectedClients, getClientDifference, bufferValue]
    );

    const filteredSummaryData = useMemo(() => {
        return summaryData.filter((item) => {
            if (item.asset_class === "Cash") return true; // Always include Cash
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
                clientTotals: selectedClients.reduce(
                    (acc, code) => ({ ...acc, [code]: 0 }),
                    {} as { [key: string]: number }
                ),
            };

            items.forEach((item) => {
                const totalPercent = parseFloat(item.total_percent?.toString() ?? "0");
                const modelPercent = modelPercentages[item.key] || 0;
                totals.totalPercent += isNaN(totalPercent) ? 0 : totalPercent;
                totals.modelPercent += modelPercent;

                selectedClients.forEach((custodianCode) => {
                    const percentValue =
                        tab === "total"
                            ? parseFloat(item.initialCustodianAllocations[custodianCode]?.toString() ?? "0")
                            : getClientDifference(item, custodianCode);
                    const adjustedPercentValue =
                        tab === "change" &&
                            isCashAdjusted &&
                            percentValue > bufferValue &&
                            adjustedValues[custodianCode]?.[item.key] != null
                            ? adjustedValues[custodianCode][item.key]
                            : percentValue;
                    let parsedPercent = adjustedPercentValue != null ? parseFloat(adjustedPercentValue.toString()) : 0;

                    if (tab === "change" && item.asset_class !== "Cash") {
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
                const percent = newCustodianCodes.includes(custodianCode) && item.asset_class === "Cash" ? 100 : modelPercent;
                acc[item.key][custodianCode] = {
                    percent,
                    rupees: percent * (totalRupeesByCustodianRef.current[custodianCode] / 100),
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
        setNewClientAmount("");
        setNewClientError(false);
        setNewCustodianCodes([]);
    }, [summaryData, uniqueAssetClasses, uniqueCustodianCodes, newCustodianCodes]);

    const exportToExcel = useCallback(() => {
        const stockKeys = sortedSummaryData.map((item) => item.key).sort();
        // Include all stock keys, including Cash and Initial Margin
        const activeStockKeys = tab === "change"
            ? stockKeys.filter((stockKey) => {
                const item = sortedSummaryData.find((s) => s.key === stockKey);
                if (!item) return false;
                // Include Cash and Initial Margin explicitly
                if (item.asset_class === "Cash" || item.asset_class === "Initial Margin") return true;
                // Filter non-Cash/Initial Margin with non-zero trades
                return selectedClients.some((custodianCode) => {
                    const percentValue = getClientDifference(item, custodianCode);
                    const adjustedPercentValue =
                        isCashAdjusted && adjustedValues[custodianCode]?.[stockKey] != null
                            ? adjustedValues[custodianCode][stockKey]
                            : percentValue;
                    const filter = rowFilters[stockKey] || "both";
                    if (filter === "none") return false;
                    if (filter === "buy" && adjustedPercentValue <= bufferValue) return false;
                    if (filter === "sell" && adjustedPercentValue >= -bufferValue) return false;
                    return Math.abs(adjustedPercentValue ?? 0) > bufferValue;
                });
            })
            : stockKeys;

        // Use only selected clients, filtered by Cash value if applicable
        const activeCustodianCodes = tab === "change"
            ? selectedClients.filter((custodianCode) => {
                return sortedSummaryData.some((item) => {
                    // Include clients with non-zero trades or Cash/Initial Margin rows
                    if (item.asset_class === "Cash" || item.asset_class === "Initial Margin") return true;
                    const percentValue = getClientDifference(item, custodianCode);
                    const adjustedPercentValue =
                        isCashAdjusted && adjustedValues[custodianCode]?.[item.key] != null
                            ? adjustedValues[custodianCode][item.key]
                            : percentValue;
                    const filter = rowFilters[item.key] || "both";
                    if (filter === "none") return false;
                    if (filter === "buy" && adjustedPercentValue <= bufferValue) return false;
                    if (filter === "sell" && adjustedPercentValue >= -bufferValue) return false;
                    return Math.abs(adjustedPercentValue ?? 0) > bufferValue;
                });
            })
            : selectedClients;

        const headers = ["Client", ...activeStockKeys];
        const data: any[] = [];
        const cellStyles: { [cell: string]: { fill?: { fgColor: { rgb: string } }; font?: { bold?: boolean } } } = {};

        const getCellAddress = (row: number, col: number) => {
            const colLetters = String.fromCharCode(65 + col);
            return `${colLetters}${row + 1}`;
        };

        data.push(headers);
        headers.forEach((_, col) => {
            const cell = getCellAddress(0, col);
            cellStyles[cell] = { font: { bold: true } };
        });

        activeCustodianCodes.forEach((custodianCode, rowIndex) => {
            const row: any[] = [custodianCode];
            activeStockKeys.forEach((stockKey, colIndex) => {
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
                        adjustedValues[custodianCode]?.[stockKey] != null
                        ? adjustedValues[custodianCode][stockKey]
                        : percentValue;
                const value =
                    displayMode === "percent"
                        ? adjustedPercentValue
                        : totalRupeesByCustodianRef.current[custodianCode] * ((adjustedPercentValue ?? 0) / 100);

                if (tab === "change" && item.asset_class !== "Cash" && item.asset_class !== "Initial Margin") {
                    const epsilon = 1e-10;
                    if (Math.abs(adjustedPercentValue ?? 0) <= bufferValue + epsilon) {
                        row.push("-");
                        return;
                    }
                    const filter = rowFilters[stockKey] || "both";
                    if (filter === "none") {
                        row.push("-");
                        return;
                    }
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
                    if (adjustedPercentValue > bufferValue && item.asset_class !== "Cash" && item.asset_class !== "Initial Margin") {
                        cellStyles[cell] = { fill: { fgColor: { rgb: "3B82F6" } } }; // Blue for buy
                    } else if (adjustedPercentValue < -bufferValue && item.asset_class !== "Cash" && item.asset_class !== "Initial Margin") {
                        cellStyles[cell] = { fill: { fgColor: { rgb: "EF4444" } } }; // Red for sell
                    }
                }
            });

            data.push(row);
            const cell = getCellAddress(rowIndex + 1, 0);
            cellStyles[cell] = { font: { bold: true } };
        });

        const worksheet = XLSX.utils.aoa_to_sheet(data);
        Object.entries(cellStyles).forEach(([cell, style]) => {
            if (!worksheet[cell]) worksheet[cell] = {};
            worksheet[cell].s = style;
        });

        worksheet["!cols"] = headers.map((header, i) => ({
            wch: i === 0 ? 15 : 20,
        }));

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, tab === "total" ? "Total Weights" : "Change in Weights");

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        XLSX.writeFile(workbook, `PmsAllocation_${tab === "total" ? "TotalWeights" : "ChangeInWeights"}_${timestamp}.xlsx`);
    }, [
        sortedSummaryData,
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

    // Update handleAddNewClient to validate and add new client
    const handleAddNewClient = useCallback(() => {
        const parsedAmount = parseFloat(newClientAmount);
        if (isNaN(parsedAmount) || parsedAmount <= 0 || newClientName.trim() === "") {
            setNewClientError(true);
            return;
        }
        setNewClientError(false);
        setNewCustodianCodes((prev) => [{ name: newClientName.trim(), amount: newClientAmount }, ...prev]);
        setSelectedClients((prev) => [newClientName.trim(), ...prev]);
        setNewClientName("");
        setNewClientAmount("");
    }, [newClientAmount, newClientName]);
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
                    if (Math.abs(percentValue) <= bufferValue + epsilon) return;

                    if (filter === "buy" && percentValue <= bufferValue) return;
                    if (filter === "sell" && percentValue >= -bufferValue) return;

                    const amount = Math.abs(
                        totalRupeesByCustodianRef.current[custodianCode] * (percentValue / 100)
                    );

                    if (percentValue > bufferValue) {
                        buyActions.push({
                            stock: item.key,
                            custodianCode,
                            amount,
                        });
                    } else if (percentValue < -bufferValue) {
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

                const res = await fetch("/api/pms-allocation");
                const data: Allocation[] = await res.json();
                const transformedData = data.map((item) => ({
                    ...item,
                    asset_class: categorizeAssetClass(item.stock_name, item.asset_class || item.assetclassname),
                }));
                setAllocations(transformedData);

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
                setNewClientAmount("");
                setNewClientError(false);
                setNewCustodianCodes([]);

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

    // Filter clients based on Cash row value
    const filteredClients = selectedClients.filter((custodianCode) => {
        if (!cashFilterValue) return true;
        const cashItem = sortedSummaryData.find(item => item.asset_class === "Cash");
        if (!cashItem) return true;
        const value = tab === "total"
            ? cashItem.initialCustodianAllocations[custodianCode]
            : getClientDifference(cashItem, custodianCode);
        const adjustedValue =
            tab === "change" && isCashAdjusted && adjustedValues[custodianCode]?.[cashItem.key] != null
                ? adjustedValues[custodianCode][cashItem.key]
                : value;
        const displayValue = displayMode === "percent"
            ? adjustedValue
            : adjustedValue * (totalRupeesByCustodianRef.current[custodianCode] / 100);

        if (cashFilterOperator === "between") {
            const [minVal, maxVal] = cashFilterValue.split(',').map(val => parseFloat(val.trim()));
            return displayValue >= minVal && displayValue <= maxVal;
        }

        const filterNum = parseFloat(cashFilterValue);
        return cashFilterOperator === "greater"
            ? displayValue >= filterNum
            : cashFilterOperator === "less"
                ? displayValue <= filterNum
                : true;
    });

    // Reset cash filter values
    const handleResetCashFilter = () => {
        setCashFilterValue("");
        setCashFilterOperator("greater");
    };
    return (
        <ComponentCard title="PMS Portfolio Allocation by Stock">
            {loading ? (
                <div className="flex flex-col items-center justify-center h-64 bg-white rounded-xl shadow-sm border border-gray-100">
                    <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                    <p className="mt-4 text-gray-500 font-medium">Loading portfolio data...</p>
                </div>
            ) : (
                <div className="space-y-6 font-inter">
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
                    <div className="bg-gray-50 p-4 rounded-xl shadow-sm border border-gray-100">
                        <h3 className="text-lg font-semibold text-gray-700 mb-4">Add New Client</h3>
                        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Client Name</label>
                                <input
                                    type="text"
                                    value={newClientName}
                                    onChange={(e) => setNewClientName(e.target.value)}
                                    className={`w-48 p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 ${newClientError && newClientName.trim() === "" ? "border-red-500 text-red-500" : "border-gray-200"}`}
                                    placeholder="Enter client name"
                                    aria-label="New client name"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Amount (₹)</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={newClientAmount}
                                        onChange={(e) => setNewClientAmount(e.target.value)}
                                        className={`w-32 p-2 text-right border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 ${newClientError ? "border-red-500 text-red-500" : "border-gray-200"} `}
                                        placeholder="0.00"
                                        aria-label="New client amount in rupees"
                                    />
                                    <span className="absolute right-2 top-2.5 text-gray-500">₹</span>
                                </div>
                            </div>
                            <button
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm flex items-center gap-2 ${newClientAmount === "" || parseFloat(newClientAmount) <= 0 || newClientName.trim() === "" ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"}`}
                                onClick={handleAddNewClient}
                                disabled={newClientAmount === "" || parseFloat(newClientAmount) <= 0 || newClientName.trim() === ""}
                            >
                                <Plus className="w-4 h-4" />
                                Add Client
                            </button>
                        </div>
                    </div>
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
                                            setNewClientAmount("");
                                            setNewClientError(false);
                                            setNewCustodianCodes([]);
                                            setCashFilterValue("");
                                            setCashFilterOperator("greater");
                                        }}
                                    >
                                        {strategy}
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
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
                    <div className="bg-gray-50 p-4 rounded-xl shadow-sm border border-gray-100">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Cash Filter</label>
                        <div className="flex items-center gap-2">
                            <select
                                value={cashFilterOperator}
                                onChange={(e) => setCashFilterOperator(e.target.value)}
                                className="p-1 border rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                                aria-label="Cash filter operator"
                            >
                                <option value="greater">≥</option>
                                <option value="less">≤</option>
                            </select>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={cashFilterValue}
                                onChange={(e) => setCashFilterValue(e.target.value)}
                                className="w-16 p-1 text-right border rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                                placeholder="0.00"
                                aria-label="Cash filter value"
                            />
                            <span className="text-gray-500">{displayMode === "percent" ? "%" : "₹"}</span>
                        </div>
                    </div>
                    <div className="relative overflow-x-auto rounded-xl shadow-sm border border-gray-100">
                        <table className="min-w-full text-sm bg-white">
                            <thead className="bg-gray-100 text-gray-600 uppercase font-semibold text-xs">
                                <tr>
                                    <th className="p-3 text-center w-[120px] sticky top-0 left-0 bg-gray-100 z-20 border-r border-gray-200"></th>
                                    <th className="p-3 text-left min-w-[200px] sticky top-0 left-[120px] bg-gray-100 z-20 border-r border-gray-200"></th>
                                    <th className="p-3 text-left w-[150px] sticky top-0 bg-gray-100 z-10 border-r border-gray-200"></th>
                                    <th className="p-3 text-right w-[100px] sticky top-0 bg-gray-100 z-10 border-r border-gray-200"></th>
                                    <th className="p-3 text-right w-[100px] sticky top-0 bg-gray-100 z-10 border-r border-gray-200">Min</th>
                                    <th className="p-3 text-right w-[100px] sticky top-0 bg-gray-100 z-10 border-r border-gray-200">Max</th>
                                    <th className="p-3 text-right w-[200px] sticky top-0 bg-gray-100 z-10 border-r border-gray-200"></th>
                                    {filteredClients.map((custodianCode) => {
                                        const buyTotal = sortedSummaryData.reduce((sum, item) => {
                                            if (tab !== "change" || item.asset_class === "Cash") return sum;
                                            const difference = getClientDifference(item, custodianCode);
                                            const adjustedValue =
                                                isCashAdjusted && adjustedValues[custodianCode]?.[item.key] != null
                                                    ? adjustedValues[custodianCode][item.key]
                                                    : difference;
                                            return sum + (adjustedValue > 0 ? adjustedValue * (totalRupeesByCustodianRef.current[custodianCode] / 100) : 0);
                                        }, 0);
                                        const sellTotal = sortedSummaryData.reduce((sum, item) => {
                                            if (tab !== "change" || item.asset_class === "Cash") return sum;
                                            const difference = getClientDifference(item, custodianCode);
                                            const adjustedValue =
                                                isCashAdjusted && adjustedValues[custodianCode]?.[item.key] != null
                                                    ? adjustedValues[custodianCode][item.key]
                                                    : difference;
                                            return sum + (adjustedValue < 0 ? Math.abs(adjustedValue) * (totalRupeesByCustodianRef.current[custodianCode] / 100) : 0);
                                        }, 0);
                                        return (
                                            <th key={custodianCode} className="p-3 text-right w-[120px] sticky top-0 bg-gray-100 z-10 border-r border-gray-200">
                                                {tab === "change" ? (
                                                    <>
                                                        <div className="text-green-500">B: ₹{formatNumber(buyTotal)}</div>
                                                        <div className="text-red-500">S: ₹{formatNumber(sellTotal)}</div>
                                                    </>
                                                ) : null}
                                            </th>
                                        );
                                    })}
                                </tr>
                                <tr>
                                    <th className="p-3 text-center w-[120px] sticky top-[72px] left-0 bg-gray-100 z-20 border-r border-gray-200">
                                        Actions
                                    </th>
                                    <th className="p-3 text-left min-w-[200px] sticky top-[72px] left-[120px] bg-gray-100 z-20 border-r border-gray-200">
                                        Stock
                                    </th>
                                    <th className="p-3 text-left w-[150px] sticky top-[72px] bg-gray-100 z-10 border-r border-gray-200">
                                        Asset Class
                                    </th>
                                    <th className="p-3 text-right w-[100px] sticky top-[72px] bg-gray-100 z-10 border-r border-gray-200">
                                        Total (%)
                                    </th>
                                    <th className="p-3 text-right w-[100px] sticky top-[72px] bg-gray-100 z-10 border-r border-gray-200">
                                        Min {displayMode === "percent" ? "(%)" : "(₹)"}
                                    </th>
                                    <th className="p-3 text-right w-[100px] sticky top-[72px] bg-gray-100 z-10 border-r border-gray-200">
                                        Max {displayMode === "percent" ? "(%)" : "(₹)"}
                                    </th>
                                    <th className="p-3 text-right w-[200px] sticky top-[72px] bg-gray-100 z-10 border-r border-gray-200">
                                        Model (%)
                                    </th>
                                    {filteredClients.map((custodianCode) => (
                                        <th
                                            key={custodianCode}
                                            className="p-3 text-right w-[120px] sticky top-[72px] bg-gray-100 z-10 border-r border-gray-200"
                                        >
                                            {custodianCode} {displayMode === "percent" ? "(%)" : "(₹)"}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {sortedSummaryData.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={filteredClients.length + 7}
                                            className="text-center py-8 text-gray-500"
                                        >
                                            No allocation data found with current filters
                                        </td>
                                    </tr>
                                ) : (
                                    <>
                                        {Object.entries(_.groupBy(sortedSummaryData, "asset_class") as { [key: string]: Summary[] })
                                            .sort(([a], [b]) => assetClassOrder.indexOf(a) - assetClassOrder.indexOf(b))
                                            .map(([assetClass, assetClassItems]) => {
                                                const totals = calculateTotals(assetClassItems);
                                                const clientValues = filteredClients.map((custodianCode) => {
                                                    const value = tab === "total"
                                                        ? totals.clientTotals[custodianCode]
                                                        : totals.clientTotals[custodianCode];
                                                    return displayMode === "percent"
                                                        ? value
                                                        : value * (totalRupeesByCustodianRef.current[custodianCode] / 100);
                                                }).filter((value) => value != null);
                                                const minValue = clientValues.length > 0 ? Math.min(...clientValues) : 0;
                                                const maxValue = clientValues.length > 0 ? Math.max(...clientValues) : 0;
                                                return (
                                                    <React.Fragment key={assetClass}>
                                                        <tr
                                                            className="bg-gray-100 font-semibold cursor-pointer hover:bg-gray-200 transition-colors"
                                                            onClick={() => handleAccordionToggle(assetClass)}
                                                        >
                                                            <td className="p-3 text-center sticky left-0 bg-gray-100 z-10 border-r border-gray-200">
                                                                <ChevronRight
                                                                    className={`w-5 h-5 transform transition-transform ${openAccordions[assetClass] ? "rotate-90" : ""}`}
                                                                />
                                                            </td>
                                                            <td className="p-3 text-left sticky left-[120px] bg-gray-100 z-10 border-r border-gray-200">
                                                                {assetClass}
                                                            </td>
                                                            <td className="p-3 border-r border-gray-200"></td>
                                                            <td className="p-3 text-right border-r border-gray-200">
                                                                {formatPercent(totals.totalPercent)}
                                                            </td>
                                                            <td className="p-3 text-right border-r border-gray-200">
                                                                {displayMode === "percent" ? formatPercent(minValue) : formatNumber(minValue)}
                                                            </td>
                                                            <td className="p-3 text-right border-r border-gray-200">
                                                                {displayMode === "percent" ? formatPercent(maxValue) : formatNumber(maxValue)}
                                                            </td>
                                                            <td className="p-3 text-right border-r border-gray-200">
                                                                {formatPercent(totals.modelPercent)}
                                                            </td>
                                                            {filteredClients.map((custodianCode) => (
                                                                <td
                                                                    key={custodianCode}
                                                                    className={`p-3 text-right font-semibold border-r border-gray-200 ${tab === "change"
                                                                        ? totals.clientTotals[custodianCode] > bufferValue
                                                                            ? "text-blue-500"
                                                                            : totals.clientTotals[custodianCode] < -bufferValue
                                                                                ? "text-red-500"
                                                                                : "text-gray-900"
                                                                        : "text-gray-900"
                                                                        }`}
                                                                >
                                                                    {displayMode === "percent"
                                                                        ? formatPercent(totals.clientTotals[custodianCode])
                                                                        : formatNumber(totals.clientTotals[custodianCode] * (totalRupeesByCustodianRef.current[custodianCode] / 100))}
                                                                </td>
                                                            ))}
                                                        </tr>
                                                        {openAccordions[assetClass] &&
                                                            assetClassItems.map((item, index) => {
                                                                const difference = getModelDifference(item.key, item.total_percent);
                                                                const hasUndo = stateHistory.some((state) => state.changedKey === item.key);
                                                                const isCash = item.asset_class === "Cash";
                                                                const buyLabel = isCash ? "Add" : "Buy";
                                                                const sellLabel = isCash ? "Use" : "Sell";
                                                                const clientValues = filteredClients.map((custodianCode) => {
                                                                    const value = tab === "total"
                                                                        ? item.initialCustodianAllocations[custodianCode]
                                                                        : getClientDifference(item, custodianCode);
                                                                    const adjustedValue =
                                                                        tab === "change" &&
                                                                            isCashAdjusted &&
                                                                            adjustedValues[custodianCode]?.[item.key] != null
                                                                            ? adjustedValues[custodianCode][item.key]
                                                                            : value;
                                                                    return displayMode === "percent"
                                                                        ? adjustedValue
                                                                        : adjustedValue * (totalRupeesByCustodianRef.current[custodianCode] / 100);
                                                                }).filter((value) => value != null);
                                                                const minValue = clientValues.length > 0 ? Math.min(...clientValues) : 0;
                                                                const maxValue = clientValues.length > 0 ? Math.max(...clientValues) : 0;
                                                                return (
                                                                    <tr
                                                                        key={item.key}
                                                                        className={`border-b ${getRowBgColor(item.asset_class)} hover:bg-opacity-80 transition-colors`}
                                                                    >
                                                                        <td className="p-3 text-center sticky left-0 bg-inherit z-10 border-r border-gray-200">
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
                                                                        <td className="p-3 font-medium sticky left-[120px] bg-inherit z-10 border-r border-gray-200">
                                                                            {item.key}
                                                                        </td>
                                                                        <td className="p-3 border-r border-gray-200">{item.asset_class}</td>
                                                                        <td className="p-3 text-right border-r border-gray-200">
                                                                            {formatPercent(item.total_percent)}
                                                                        </td>
                                                                        <td className="p-3 text-right border-r border-gray-200">
                                                                            {displayMode === "percent" ? formatPercent(minValue) : formatNumber(minValue)}
                                                                        </td>
                                                                        <td className="p-3 text-right border-r border-gray-200">
                                                                            {displayMode === "percent" ? formatPercent(maxValue) : formatNumber(maxValue)}
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
                                                                        {filteredClients.map((custodianCode) => {
                                                                            const percentValue =
                                                                                tab === "total"
                                                                                    ? item.initialCustodianAllocations[custodianCode]
                                                                                    : getClientDifference(item, custodianCode);
                                                                            const adjustedPercentValue =
                                                                                tab === "change" &&
                                                                                    isCashAdjusted &&
                                                                                    adjustedValues[custodianCode]?.[item.key] != null
                                                                                    ? adjustedValues[custodianCode][item.key]
                                                                                    : percentValue;
                                                                            const displayValue =
                                                                                displayMode === "percent"
                                                                                    ? adjustedPercentValue
                                                                                    : totalRupeesByCustodianRef.current[custodianCode] * ((adjustedPercentValue ?? 0) / 100);

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

                                                                            if (tab === "change" && item.asset_class !== "Cash") {
                                                                                const epsilon = 1e-10;
                                                                                if (Math.abs(adjustedPercentValue ?? 0) <= bufferValue + epsilon) {
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
                                                                                if (filter === "buy" && !(adjustedPercentValue > bufferValue)) {
                                                                                    return (
                                                                                        <td
                                                                                            key={custodianCode}
                                                                                            className="p-3 text-right text-gray-400 border-r border-gray-200"
                                                                                        >
                                                                                            -
                                                                                        </td>
                                                                                    );
                                                                                }
                                                                                if (filter === "sell" && !(adjustedPercentValue < -bufferValue)) {
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
                                                                                    className={`p-3 text-right border-r border-gray-200 ${tab === "change" && item.asset_class !== "Cash"
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
                                                );
                                            })}
                                        <tr className="bg-gray-200 font-bold text-gray-800">
                                            <td className="p-3 text-center sticky left-0 bg-gray-200 z-10 border-r border-gray-200"></td>
                                            <td className="p-3 text-left sticky left-[120px] bg-gray-200 z-10 border-r border-gray-200">
                                                Grand Total
                                            </td>
                                            <td className="p-3 border-r border-gray-200"></td>
                                            <td className="p-3 text-right border-r border-gray-200">
                                                {formatPercent(calculateTotals(sortedSummaryData, true).totalPercent)}
                                            </td>
                                            <td className="p-3 text-right border-r border-gray-200">
                                                {displayMode === "percent"
                                                    ? formatPercent(
                                                        Math.min(...filteredClients.map((custodianCode) =>
                                                            calculateTotals(sortedSummaryData, true).clientTotals[custodianCode]))
                                                    )
                                                    : formatNumber(
                                                        Math.min(...filteredClients.map((custodianCode) =>
                                                            calculateTotals(sortedSummaryData, true).clientTotals[custodianCode] * (totalRupeesByCustodianRef.current[custodianCode] / 100)))
                                                    )}
                                            </td>
                                            <td className="p-3 text-right border-r border-gray-200">
                                                {displayMode === "percent"
                                                    ? formatPercent(
                                                        Math.max(...filteredClients.map((custodianCode) =>
                                                            calculateTotals(sortedSummaryData, true).clientTotals[custodianCode]))
                                                    )
                                                    : formatNumber(
                                                        Math.max(...filteredClients.map((custodianCode) =>
                                                            calculateTotals(sortedSummaryData, true).clientTotals[custodianCode] * (totalRupeesByCustodianRef.current[custodianCode] / 100)))
                                                    )}
                                            </td>
                                            <td className="p-3 text-right border-r border-gray-200">
                                                {formatPercent(calculateTotals(sortedSummaryData, true).modelPercent)}
                                            </td>
                                            {filteredClients.map((custodianCode) => (
                                                <td
                                                    key={custodianCode}
                                                    className={`p-3 text-right font-bold border-r border-gray-200 ${tab === "change"
                                                        ? calculateTotals(sortedSummaryData, true).clientTotals[custodianCode] > bufferValue
                                                            ? "text-blue-500"
                                                            : calculateTotals(sortedSummaryData, true).clientTotals[custodianCode] < -bufferValue
                                                                ? "text-red-500"
                                                                : "text-gray-900"
                                                        : "text-gray-900"
                                                        }`}
                                                >
                                                    {displayMode === "percent"
                                                        ? formatPercent(calculateTotals(sortedSummaryData, true).clientTotals[custodianCode])
                                                        : formatNumber(calculateTotals(sortedSummaryData, true).clientTotals[custodianCode] * (totalRupeesByCustodianRef.current[custodianCode] / 100))}
                                                </td>
                                            ))}
                                        </tr>
                                    </>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {tab === "change" && (
                        <div className="bg-gray-50 p-4 rounded-xl shadow-sm border border-gray-100">
                            <h3 className="text-lg font-semibold text-gray-700 mb-4">Actionables</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <Select
                                    label="Security Actionable"
                                    options={["all", "buy", "sell"]}
                                    value={securityActionableFilter}
                                    onChange={(value) => setSecurityActionableFilter(value)}
                                />
                                <Select
                                    label="Client Actionable"
                                    options={["all", "buy", "sell"]}
                                    value={clientActionableFilter}
                                    onChange={(value) => setClientActionableFilter(value)}
                                />
                            </div>
                            {Object.entries(actionables)
                                .sort(([a], [b]) => assetClassOrder.indexOf(a) - assetClassOrder.indexOf(b))
                                .map(([assetClass, { buy, sell }]) => {
                                    const filteredBuy = buy.filter((action) =>
                                        filteredClients.includes(action.custodianCode) &&
                                        (securityActionableFilter === "all" || securityActionableFilter === "buy"
                                            ? clientActionableFilter === "all" ||
                                            (clientActionableFilter === "buy" &&
                                                action.amount > bufferValue) ||
                                            (clientActionableFilter === "sell" &&
                                                action.amount < -bufferValue)
                                            : false)
                                    );
                                    const filteredSell = sell.filter((action) =>
                                        filteredClients.includes(action.custodianCode) &&
                                        (securityActionableFilter === "all" || securityActionableFilter === "sell"
                                            ? clientActionableFilter === "all" ||
                                            (clientActionableFilter === "buy" &&
                                                action.amount > bufferValue) ||
                                            (clientActionableFilter === "sell" &&
                                                action.amount < -bufferValue)
                                            : false)
                                    );

                                    if (filteredBuy.length === 0 && filteredSell.length === 0) {
                                        return null;
                                    }

                                    return (
                                        <div key={assetClass} className="mb-6">
                                            <h4 className="text-md font-semibold text-gray-700 mb-2">{assetClass}</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <h5 className="text-sm font-medium text-gray-600 mb-2">Buy</h5>
                                                    {filteredBuy.length > 0 ? (
                                                        <ul className="space-y-2">
                                                            {filteredBuy.map((action, index) => (
                                                                <li
                                                                    key={`${action.stock}-${action.custodianCode}-${index}`}
                                                                    className="text-sm text-gray-600"
                                                                >
                                                                    <span className="font-medium">
                                                                        {action.stock}
                                                                    </span>{" "}
                                                                    for {action.custodianCode}: ₹
                                                                    {formatNumber(action.amount)}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    ) : (
                                                        <p className="text-sm text-gray-500">No buy actions</p>
                                                    )}
                                                </div>
                                                <div>
                                                    <h5 className="text-sm font-medium text-gray-600 mb-2">Sell</h5>
                                                    {filteredSell.length > 0 ? (
                                                        <ul className="space-y-2">
                                                            {filteredSell.map((action, index) => (
                                                                <li
                                                                    key={`${action.stock}-${action.custodianCode}-${index}`}
                                                                    className="text-sm text-gray-600"
                                                                >
                                                                    <span className="font-medium">
                                                                        {action.stock}
                                                                    </span>{" "}
                                                                    for {action.custodianCode}: ₹
                                                                    {formatNumber(action.amount)}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    ) : (
                                                        <p className="text-sm text-gray-500">No sell actions</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </div>
            )}
        </ComponentCard>
    );
}