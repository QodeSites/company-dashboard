// @ts-nocheck
"use client";

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import _ from "lodash";
import { Loader2, Maximize2 } from "lucide-react";
import dynamic from "next/dynamic";

const ApexCharts = dynamic(() => import("react-apexcharts"), { ssr: false });

type Stock = {
    symbolname: string;
    category?: string;
    strategy?: string;
    clients: { clientcode: string; percentassets: number }[];
    total?: number;
};

type Allocation = {
    id: number;
    date: string;
    stock_name: string;
    asset_class?: string;
    sector?: string;
    strategy_code: string;
    custodian_code?: string;
    total_percent: string | number | null;
    value?: string | number | null;
    total: string | number | null;
};

type Summary = {
    key: string;
    asset_class: string;
    sector: string;
    total_percent: string | number | null;
    custodianCodeAllocations: { [key: string]: string | number | null };
    initialCustodianAllocations: { [key: string]: string | number | null };
    totalValue: number;
};

export default function PmsAllocationChart() {
    const [allocations, setAllocations] = useState<Allocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [strategyFilter, setStrategyFilter] = useState<string>("QAW");
    const [selectedClients, setSelectedClients] = useState<string[]>([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedStock, setSelectedStock] = useState<Stock | null>(null);
    const [activeMainTab, setActiveMainTab] = useState<string>("Category");
    const [isHorizontal, setIsHorizontal] = useState(false);

    const initialLoadRef = useRef(true);
    const summaryDataRef = useRef<Summary[]>([]);
    const totalRupeesByCustodianRef = useRef<{ [key: string]: number }>({});

    const categorizeAssetClass = useCallback((stockName?: string, assetClassName?: string): string => {
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
    }, []);

    useEffect(() => {
        fetch("/api/pms-allocation")
            .then((res) => res.json())
            .then((data: Allocation[]) => {
                const transformedData = data.map((item) => ({
                    ...item,
                    asset_class: categorizeAssetClass(item.stock_name, item.asset_class),
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
        ).sort() as string[];
    }, [strategyFilteredAllocations]);

    useEffect(() => {
        setSelectedClients(uniqueCustodianCodes);
    }, [uniqueCustodianCodes]);

    const assetClassOrder = ["Cash", "Gold", "Momentum", "Low Volatility", "Derivatives", "Equity"];

    const uniqueStrategies = useMemo(() => {
        return _.uniq(allocations.map((item) => item.strategy_code).filter(Boolean)).sort() as string[];
    }, [allocations]);

    const totalRupeesByCustodian = useMemo(() => {
        return uniqueCustodianCodes.reduce((acc, custodianCode) => {
            const total = strategyFilteredAllocations
                .filter((item) => item.custodian_code === custodianCode)
                .reduce((sum, item) => {
                    const value = parseFloat(item.value?.toString() ?? "0");
                    return sum + (isNaN(value) ? 0 : value);
                }, 0);
            acc[custodianCode] = total;
            return acc;
        }, {} as { [key: string]: number });
    }, [uniqueCustodianCodes, strategyFilteredAllocations]);

    useEffect(() => {
        totalRupeesByCustodianRef.current = totalRupeesByCustodian;
    }, [totalRupeesByCustodian]);

    const summaryData = useMemo(() => {
        const groups = _.groupBy(strategyFilteredAllocations, "stock_name") as { [key: string]: Allocation[] };
        return Object.entries(groups).map(([key, items]) => {
            const firstItem = items[0];
            const totalPercent = parseFloat(firstItem.total_percent?.toString() ?? "0");

            const custodianCodeAllocations: { [key: string]: string | number | null } = {};
            const initialCustodianAllocations: { [key: string]: string | number | null } = {};
            uniqueCustodianCodes.forEach((custodianCode) => {
                const clientItems = items.filter((item) => item.custodian_code === custodianCode);
                const clientPercent = clientItems.length > 0 ? parseFloat(clientItems[0].total?.toString() ?? "0") : 0;
                custodianCodeAllocations[custodianCode] = clientPercent.toFixed(2);
                initialCustodianAllocations[custodianCode] = clientPercent.toFixed(2);
            });

            const totalValue = items.reduce((sum, item) => {
                const value = parseFloat(item.value?.toString() ?? "0");
                return sum + (isNaN(value) ? 0 : value);
            }, 0);

            return {
                key,
                asset_class: firstItem.asset_class || "-",
                sector: firstItem.sector || "-",
                total_percent: isNaN(totalPercent) ? "0.00" : totalPercent.toFixed(2),
                custodianCodeAllocations,
                initialCustodianAllocations,
                totalValue,
            };
        });
    }, [strategyFilteredAllocations, uniqueCustodianCodes]);

    useEffect(() => {
        summaryDataRef.current = summaryData;
    }, [summaryData]);

    const sortedSummaryData = useMemo(() => {
        return _.sortBy(summaryData, [
            (item) => assetClassOrder.indexOf(item.asset_class),
            "key",
        ]);
    }, [summaryData]);

    const renderStockChart = (stock: Stock, isModal: boolean = false) => {
        const MAX_CLIENTS = 100000;
        const sortedClients = stock.clients
            .map((client) => ({
                ...client,
                percentassets: parseFloat(parseFloat(client.percentassets.toString()).toFixed(2)),
            }))
            .sort((a, b) => b.percentassets - a.percentassets);

        const topClients = sortedClients.slice(0, MAX_CLIENTS);
        const otherClients = sortedClients.slice(MAX_CLIENTS);
        const othersSum = otherClients.reduce((acc, c) => acc + c.percentassets, 0);
        const chartData = othersSum > 0
            ? [...topClients, { clientcode: "Others", percentassets: parseFloat(othersSum.toFixed(2)) }]
            : topClients;

        const dataCount = stock.clients.length;
        const totalValue = parseFloat(parseFloat(stock.total?.toString() || "0").toFixed(2));
        const totalLabel = `${totalValue.toFixed(2)}%`;

        const chartOptions: ApexCharts.ApexOptions = {
            chart: {
                type: "bar",
                height: isModal ? 600 : 250,
                toolbar: { show: isModal },
            },
            plotOptions: {
                bar: {
                    borderRadius: isModal ? 4 : 2,
                    horizontal: isModal ? isHorizontal : false,
                },
            },
            colors: ["#D1A47B"],
            xaxis: {
                categories: chartData.map((c) => c.clientcode),
                labels: {
                    rotate: isModal && isHorizontal ? 0 : -60,
                    style: { fontSize: isModal ? "12px" : "9px", colors: "#666" },
                    trim: true,
                },
                tickAmount: chartData.length > 10 ? 10 : undefined,
            },
            yaxis: {
                labels: { style: { fontSize: isModal ? "12px" : "10px", colors: "#666" } },
            },
            tooltip: {
                custom: ({ series, seriesIndex, dataPointIndex }) => `
                    <div class="bg-white p-2 rounded-lg shadow-lg text-${isModal ? "sm" : "xs"}">
                        <span>Client: ${chartData[dataPointIndex].clientcode}</span><br/>
                        <span>Holding: ${series[seriesIndex][dataPointIndex].toFixed(2)}%</span>
                    </div>
                `,
            },
            annotations: {
                yaxis: [
                    {
                        y: totalValue,
                        borderColor: "#FF4136",
                        borderWidth: isModal ? 2 : 1.5,
                        strokeDashArray: isModal ? 6 : 4,
                        label: {
                            text: `Total: ${totalLabel}`,
                            style: { color: "#FF4136", fontSize: isModal ? "13px" : "11px" },
                        },
                    },
                ],
            },
            grid: {
                borderColor: "#e0e0e0",
                strokeDashArray: 5,
                opacity: 0.5,
            },
            dataLabels: {
                enabled: false, // Disable data labels to hide values on top of bars
            },
        };

        const series = [
            {
                name: "Client Holding (%)",
                data: chartData.map((c) => c.percentassets),
            },
        ];

        return (
            <div className={`bg-white border border-gray-200 rounded-lg shadow-sm ${!isModal ? "hover:-translate-y-1 hover:shadow-md transition-transform" : ""}`}>
                {!isModal ? (
                    <>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
                            <h3 className="text-base font-medium text-gray-900">{stock.symbolname || stock.category}</h3>
                            <button
                                className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full"
                                onClick={() => {
                                    setSelectedStock(stock);
                                    setModalOpen(true);
                                }}
                            >
                                <Maximize2 className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="px-2 py-1">
                            <ApexCharts options={chartOptions} series={series} type="bar" height={250} />
                        </div>
                        <div className="flex justify-between items-center px-4 py-2 border-t border-gray-200 bg-gray-50 text-sm">
                            <span className="text-red-600 font-medium">Total: {totalValue}%</span>
                            <span className="text-gray-500">{dataCount} Clients</span>
                        </div>
                    </>
                ) : (
                    <ApexCharts options={chartOptions} series={series} type="bar" height={600} />
                )}
            </div>
        );
    };

    const stocks: Stock[] = useMemo(() => {
        return sortedSummaryData.map((item) => ({
            symbolname: item.key,
            category: item.asset_class,
            strategy: strategyFilter,
            clients: Object.entries(item.custodianCodeAllocations)
                .filter(([custodianCode]) => selectedClients.includes(custodianCode))
                .map(([custodianCode, percent]) => ({
                    clientcode: custodianCode,
                    percentassets: parseFloat(percent?.toString() || "0"),
                }))
                .filter((client) => client.percentassets !== 0),
            total: parseFloat(item.total_percent?.toString() || "0"),
        }));
    }, [sortedSummaryData, selectedClients, strategyFilter]);

    const lower = stocks.map((s) => ({
        ...s,
        lowerName: (s.symbolname || "").toLowerCase(),
    }));

    const buildCombinedData = (name: string, items: Stock[]): Stock => {
        const combinedClients = uniqueCustodianCodes
            .filter((custodianCode) => selectedClients.includes(custodianCode))
            .map((custodianCode) => {
                const totalPercent = items.reduce((sum, stock) => {
                    const client = stock.clients.find((c) => c.clientcode === custodianCode);
                    return sum + (client ? client.percentassets : 0);
                }, 0);
                return {
                    clientcode: custodianCode,
                    percentassets: parseFloat(totalPercent.toFixed(2)),
                };
            })
            .filter((client) => client.percentassets !== 0);

        const total = items.reduce((sum, item) => {
            const percent = parseFloat(item.total?.toString() ?? "0");
            return sum + (isNaN(percent) ? 0 : percent);
        }, 0);

        return {
            symbolname: name,
            category: name,
            strategy: strategyFilter,
            clients: combinedClients,
            total: parseFloat(total.toFixed(2)),
        };
    };

    const buildSubCategoryData = (name: string, items: Stock[]): Stock => {
        const combinedClients = uniqueCustodianCodes
            .filter((custodianCode) => selectedClients.includes(custodianCode))
            .map((custodianCode) => {
                const totalPercent = items.reduce((sum, stock) => {
                    const client = stock.clients.find((c) => c.clientcode === custodianCode);
                    return sum + (client ? client.percentassets : 0);
                }, 0);
                return {
                    clientcode: custodianCode,
                    percentassets: parseFloat(totalPercent.toFixed(2)),
                };
            })
            .filter((client) => client.percentassets !== 0);

        const total = items.reduce((sum, item) => {
            const percent = parseFloat(item.total?.toString() ?? "0");
            return sum + (isNaN(percent) ? 0 : percent);
        }, 0);

        return {
            symbolname: name,
            category: name,
            strategy: strategyFilter,
            clients: combinedClients,
            total: parseFloat(total.toFixed(2)),
        };
    };

    const momentumItems = lower.filter((s) => s.lowerName.includes("momentum"));
    const lowVolItems = lower.filter((s) => s.lowerName.includes("low vol"));
    const goldItems = lower.filter((s) => s.lowerName.includes("gold"));
    const equityItems = lower.filter((s) => s.lowerName.includes("equity") || s.category === "Equity");
    const cashItems = lower.filter((s) => s.lowerName.includes("cash") || s.lowerName.includes("initial margin"));
    const derivativesItems = lower.filter((s) => s.lowerName.includes("put") || s.lowerName.includes("call"));

    const momentum150Items = lower.filter((s) => s.lowerName.includes("150 momentum"));
    const momentum500Items = lower.filter((s) => s.lowerName.includes("500 momentum"));
    const lowVol100Items = lower.filter((s) => s.lowerName.includes("100 low vol"));
    const cashOnlyItems = lower.filter((s) => s.lowerName.includes("cash") && !s.lowerName.includes("initial margin"));
    const initialMarginItems = lower.filter((s) => s.lowerName.includes("initial margin"));
    const callsItems = lower.filter((s) => s.lowerName.includes("call"));
    const putsItems = lower.filter((s) => s.lowerName.includes("put"));

    const combinedMomentum = buildCombinedData("Momentum", momentumItems);
    const combinedLowVol = buildCombinedData("Low Volatility", lowVolItems);
    const combinedGold = buildCombinedData("Gold", goldItems);
    const combinedEquity = buildCombinedData("Equity", equityItems);
    const combinedCash = buildCombinedData("Cash", cashItems);
    const combinedDerivatives = buildCombinedData("Derivatives", derivativesItems);

    const subMomentum150 = buildSubCategoryData("150 Momentum", momentum150Items);
    const subMomentum500 = buildSubCategoryData("500 Momentum", momentum500Items);
    const subLowVol100 = buildSubCategoryData("100 Low Volatility", lowVol100Items);
    const subCashOnly = buildSubCategoryData("Cash", cashOnlyItems);
    const subInitialMargin = buildSubCategoryData("Initial Margin", initialMarginItems);
    const subCalls = buildSubCategoryData("Calls", callsItems);
    const subPuts = buildSubCategoryData("Put", putsItems);

    const mainTabs = {
        Category: {
            label: "Category",
            content: (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 gap-4">
                    {combinedMomentum.clients.length > 0 && renderStockChart(combinedMomentum)}
                    {combinedLowVol.clients.length > 0 && renderStockChart(combinedLowVol)}
                    {combinedGold.clients.length > 0 && renderStockChart(combinedGold)}
                    {combinedEquity.clients.length > 0 && renderStockChart(combinedEquity)}
                    {combinedCash.clients.length > 0 && renderStockChart(combinedCash)}
                    {combinedDerivatives.clients.length > 0 && renderStockChart(combinedDerivatives)}
                </div>
            ),
        },
        SubCategory: {
            label: "Sub Category",
            content: (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 gap-4">
                    {subMomentum150.clients.length > 0 && renderStockChart(subMomentum150)}
                    {subMomentum500.clients.length > 0 && renderStockChart(subMomentum500)}
                    {subLowVol100.clients.length > 0 && renderStockChart(subLowVol100)}
                    {subCashOnly.clients.length > 0 && renderStockChart(subCashOnly)}
                    {subInitialMargin.clients.length > 0 && renderStockChart(subInitialMargin)}
                    {subCalls.clients.length > 0 && renderStockChart(subCalls)}
                    {subPuts.clients.length > 0 && renderStockChart(subPuts)}
                </div>
            ),
        },
        IndividualStocks: {
            label: "Individual Stocks",
            content: (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 gap-4">
                    {lower.map((stock, idx) =>
                        stock.clients.length > 0 && (
                            <div key={`${stock.symbolname}-${idx}`}>
                                {renderStockChart(stock)}
                            </div>
                        )
                    )}
                </div>
            ),
        },
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
                        <label className="block text-sm font-semibold text-gray-700 mb-3">Strategy</label>
                        <div className="flex flex-wrap gap-2">
                            {uniqueStrategies.map((strategy) => (
                                <button
                                    key={strategy}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm ${strategyFilter === strategy
                                        ? "bg-blue-600 text-white"
                                        : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                                        }`}
                                    onClick={() => {
                                        setStrategyFilter(strategy);
                                        initialLoadRef.current = true;
                                        setSelectedClients(uniqueCustodianCodes);
                                    }}
                                >
                                    {strategy}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-xl shadow-sm border border-gray-100">
                        <h3 className="text-lg font-semibold text-gray-700 mb-4">Allocation Charts</h3>
                        <div className="space-y-6">
                            <div className="flex border-b border-gray-200 bg-white rounded-t-lg shadow-sm">
                                {Object.entries(mainTabs).map(([tabKey, tabData]) => (
                                    <button
                                        key={tabKey}
                                        onClick={() => setActiveMainTab(tabKey)}
                                        className={`px-6 py-3 text-sm font-medium ${activeMainTab === tabKey
                                            ? "border-b-2 border-indigo-600 text-indigo-600"
                                            : "text-gray-600 hover:text-indigo-600"
                                            }`}
                                    >
                                        {tabData.label}
                                    </button>
                                ))}
                            </div>
                            <div className="bg-white rounded-b-lg shadow-sm p-4">
                                {mainTabs[activeMainTab].content}
                                {Object.values(mainTabs[activeMainTab].content.props.children).every(
                                    (child) => !child
                                ) && (
                                        <div className="text-center text-gray-500 mt-4">No data available for this category</div>
                                    )}
                            </div>
                        </div>
                    </div>

                    {modalOpen && selectedStock && (
                        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-[10000] p-4" onClick={() => setModalOpen(false)}>
                            <div className="bg-white rounded-xl w-full mt-20 max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
                                <div className="flex justify-between items-start p-6 border-b border-gray-200">
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900">
                                            {selectedStock.symbolname || selectedStock.category}
                                        </h2>
                                        {selectedStock.strategy && (
                                            <div className="flex gap-2 mt-2">
                                                <span className="px-2 py-1 bg-gray-100 rounded text-sm">{selectedStock.strategy}</span>
                                                {selectedStock.category && (
                                                    <span className={`px-2 py-1 bg-gray-100 rounded text-sm text-${selectedStock.category.toLowerCase()}-600`}>
                                                        {selectedStock.category}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <button
                                            className="px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm"
                                            onClick={() => setIsHorizontal(!isHorizontal)}
                                        >
                                            {isHorizontal ? "Vertical Bars" : "Horizontal Bars"}
                                        </button>
                                        <button className="text-gray-500 hover:text-gray-700 text-2xl" onClick={() => setModalOpen(false)}>
                                            ×
                                        </button>
                                    </div>
                                </div>
                                <div className="p-6 flex-1 overflow-y-auto">
                                    {renderStockChart(selectedStock, true)}
                                </div>
                                <div className="flex justify-between items-center p-4 border-t border-gray-200 bg-gray-50">
                                    <p className="text-sm text-gray-600">Clients: {selectedStock.clients.length || 0}</p>
                                    <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200" onClick={() => setModalOpen(false)}>
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </ComponentCard>
    );
}