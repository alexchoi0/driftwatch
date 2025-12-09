"use client";

import { useState, useMemo } from "react";
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  ReferenceLine,
} from "recharts";
import { Button } from "@/components/ui/button";
import { GitCompare } from "lucide-react";

export interface Branch {
  id: string;
  name: string;
}

export interface Testbed {
  id: string;
  name: string;
}

export interface Measure {
  id: string;
  name: string;
  units: string | null;
}

export interface Benchmark {
  id: string;
  name: string;
}

export interface DataPoint {
  x: string;
  y: number;
  lower: number | null;
  upper: number | null;
  gitHash: string | null;
}

export interface Series {
  benchmark: { id: string; name: string };
  branch: { id: string; name: string };
  testbed: { id: string; name: string };
  measure: { id: string; name: string; units: string | null };
  data: DataPoint[];
}

interface BenchmarkChartClientProps {
  benchmarks: Benchmark[];
  branches: Branch[];
  testbeds: Testbed[];
  measures: Measure[];
  initialSeries: Series[];
}

const COLORS = [
  "hsl(221, 83%, 53%)",
  "hsl(142, 76%, 36%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 84%, 60%)",
  "hsl(262, 83%, 58%)",
  "hsl(199, 89%, 48%)",
];

export function BenchmarkChartClient({
  benchmarks,
  branches,
  testbeds,
  measures,
  initialSeries,
}: BenchmarkChartClientProps) {
  const [selectedBenchmarks, setSelectedBenchmarks] = useState<string[]>(
    benchmarks.slice(0, 1).map((b) => b.id)
  );
  const [selectedBranches, setSelectedBranches] = useState<string[]>(
    branches.slice(0, 1).map((b) => b.id)
  );
  const [selectedTestbeds, setSelectedTestbeds] = useState<string[]>(
    testbeds.slice(0, 1).map((t) => t.id)
  );
  const [selectedMeasures, setSelectedMeasures] = useState<string[]>(
    measures.slice(0, 1).map((m) => m.id)
  );
  const [compareMode, setCompareMode] = useState(false);

  const filteredSeries = useMemo(() => {
    return initialSeries.filter(
      (s) =>
        selectedBenchmarks.includes(s.benchmark.id) &&
        selectedBranches.includes(s.branch.id) &&
        selectedTestbeds.includes(s.testbed.id) &&
        selectedMeasures.includes(s.measure.id)
    );
  }, [initialSeries, selectedBenchmarks, selectedBranches, selectedTestbeds, selectedMeasures]);

  // Get baseline branch (first selected) for comparison
  const baselineBranchId = selectedBranches[0];
  const baselineBranch = branches.find((b) => b.id === baselineBranchId);

  // Calculate comparison data when in compare mode
  const { chartData, comparisonStats } = useMemo(() => {
    if (filteredSeries.length === 0) {
      return { chartData: [], comparisonStats: null };
    }

    const data = transformData(filteredSeries);

    if (!compareMode || selectedBranches.length < 2) {
      return { chartData: data, comparisonStats: null };
    }

    // Calculate percentage differences from baseline
    const baselineSeries = filteredSeries.filter(
      (s) => s.branch.id === baselineBranchId
    );
    const comparisonSeries = filteredSeries.filter(
      (s) => s.branch.id !== baselineBranchId
    );

    // Calculate stats for comparison
    const stats: Record<string, { avgDiff: number; maxDiff: number; minDiff: number }> = {};

    for (const series of comparisonSeries) {
      const baseMatch = baselineSeries.find(
        (bs) =>
          bs.benchmark.id === series.benchmark.id &&
          bs.testbed.id === series.testbed.id &&
          bs.measure.id === series.measure.id
      );

      if (!baseMatch) continue;

      const key = `${series.benchmark.name} (${series.branch.name})`;
      const diffs: number[] = [];

      // Find matching data points by date
      for (const point of series.data) {
        const basePoint = baseMatch.data.find((bp) => bp.x === point.x);
        if (basePoint && basePoint.y !== 0) {
          const diff = ((point.y - basePoint.y) / basePoint.y) * 100;
          diffs.push(diff);
        }
      }

      if (diffs.length > 0) {
        stats[key] = {
          avgDiff: diffs.reduce((a, b) => a + b, 0) / diffs.length,
          maxDiff: Math.max(...diffs),
          minDiff: Math.min(...diffs),
        };
      }
    }

    return { chartData: data, comparisonStats: stats };
  }, [filteredSeries, compareMode, selectedBranches, baselineBranchId]);

  const toggleSelection = (
    id: string,
    selected: string[],
    setSelected: (ids: string[]) => void
  ) => {
    if (selected.includes(id)) {
      if (selected.length > 1) {
        setSelected(selected.filter((s) => s !== id));
      }
    } else {
      setSelected([...selected, id]);
    }
  };

  const canCompare = selectedBranches.length >= 2;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="text-sm font-medium mb-2 block">Benchmarks</label>
          <div className="flex flex-wrap gap-1">
            {benchmarks.map((b) => (
              <Button
                key={b.id}
                variant={selectedBenchmarks.includes(b.id) ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  toggleSelection(b.id, selectedBenchmarks, setSelectedBenchmarks)
                }
              >
                {b.name}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Branches</label>
          <div className="flex flex-wrap gap-1">
            {branches.map((b) => (
              <Button
                key={b.id}
                variant={selectedBranches.includes(b.id) ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  toggleSelection(b.id, selectedBranches, setSelectedBranches)
                }
              >
                {b.name}
                {compareMode && b.id === baselineBranchId && (
                  <span className="ml-1 text-xs opacity-70">(base)</span>
                )}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Testbeds</label>
          <div className="flex flex-wrap gap-1">
            {testbeds.map((t) => (
              <Button
                key={t.id}
                variant={selectedTestbeds.includes(t.id) ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  toggleSelection(t.id, selectedTestbeds, setSelectedTestbeds)
                }
              >
                {t.name}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-2 block">Measures</label>
          <div className="flex flex-wrap gap-1">
            {measures.map((m) => (
              <Button
                key={m.id}
                variant={selectedMeasures.includes(m.id) ? "default" : "outline"}
                size="sm"
                onClick={() =>
                  toggleSelection(m.id, selectedMeasures, setSelectedMeasures)
                }
              >
                {m.name}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Compare Mode Toggle */}
      {canCompare && (
        <div className="flex items-center gap-4 pt-2">
          <Button
            variant={compareMode ? "default" : "outline"}
            size="sm"
            onClick={() => setCompareMode(!compareMode)}
            className="gap-2"
          >
            <GitCompare className="h-4 w-4" />
            Compare Branches
          </Button>
          {compareMode && baselineBranch && (
            <span className="text-sm text-muted-foreground">
              Baseline: <span className="font-medium">{baselineBranch.name}</span>
            </span>
          )}
        </div>
      )}

      {/* Comparison Stats */}
      {compareMode && comparisonStats && Object.keys(comparisonStats).length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 pt-2">
          {Object.entries(comparisonStats).map(([key, stats]) => (
            <div
              key={key}
              className="border rounded-lg p-3 text-sm"
            >
              <div className="font-medium truncate mb-1">{key}</div>
              <div className="flex gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Avg:</span>{" "}
                  <span className={stats.avgDiff > 0 ? "text-destructive" : "text-green-600"}>
                    {stats.avgDiff > 0 ? "+" : ""}
                    {stats.avgDiff.toFixed(1)}%
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Max:</span>{" "}
                  <span className={stats.maxDiff > 0 ? "text-destructive" : "text-green-600"}>
                    {stats.maxDiff > 0 ? "+" : ""}
                    {stats.maxDiff.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {chartData.length === 0 ? (
        <div className="h-[400px] flex items-center justify-center text-muted-foreground">
          No data available for the selected filters
        </div>
      ) : (
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) =>
                  new Date(value).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                }
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => formatValue(value)}
              />
              <Tooltip
                isAnimationActive={false}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;

                  // In compare mode, calculate diffs for tooltip
                  let baselineValue: number | null = null;
                  if (compareMode && baselineBranchId) {
                    const baselineEntry = payload.find((p) => {
                      const dataKey = p.dataKey as string;
                      return dataKey.includes(baselineBranchId);
                    });
                    baselineValue = baselineEntry?.value as number ?? null;
                  }

                  return (
                    <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
                      <div className="font-medium mb-2">
                        {new Date(label).toLocaleDateString()}
                      </div>
                      {payload.map((item, idx) => {
                        const value = item.value as number;
                        const isBaseline = compareMode && (item.dataKey as string).includes(baselineBranchId);
                        const diff = compareMode && baselineValue && !isBaseline && baselineValue !== 0
                          ? ((value - baselineValue) / baselineValue) * 100
                          : null;

                        return (
                          <div
                            key={idx}
                            className="flex items-center gap-2"
                            style={{ color: item.color }}
                          >
                            <span>
                              {item.name}
                              {isBaseline && <span className="opacity-70"> (base)</span>}:
                            </span>
                            <span className="font-mono">
                              {formatValue(value)}
                            </span>
                            {diff !== null && (
                              <span className={`font-mono text-xs ${diff > 0 ? "text-destructive" : "text-green-600"}`}>
                                ({diff > 0 ? "+" : ""}{diff.toFixed(1)}%)
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                }}
              />
              <Legend />
              {compareMode && <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />}
              {filteredSeries.map((s, idx) => {
                const seriesKey = getSeriesKey(s);
                const isBaseline = s.branch.id === baselineBranchId;
                const color = COLORS[idx % COLORS.length];
                return (
                  <Line
                    key={seriesKey}
                    type="monotone"
                    dataKey={seriesKey}
                    name={getSeriesLabel(s)}
                    stroke={color}
                    strokeWidth={isBaseline && compareMode ? 3 : 2}
                    strokeDasharray={!isBaseline && compareMode ? "5 5" : undefined}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                );
              })}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}

function getSeriesKey(series: Series): string {
  return `${series.benchmark.id}_${series.branch.id}_${series.testbed.id}_${series.measure.id}`;
}

function getSeriesLabel(series: Series): string {
  return `${series.benchmark.name} (${series.branch.name})`;
}

function transformData(series: Series[]): Record<string, unknown>[] {
  const dataMap = new Map<string, Record<string, unknown>>();

  for (const s of series) {
    const key = getSeriesKey(s);
    for (const point of s.data) {
      const dateKey = point.x;
      if (!dataMap.has(dateKey)) {
        dataMap.set(dateKey, { date: dateKey });
      }
      const entry = dataMap.get(dateKey)!;
      entry[key] = point.y;
      entry[`${key}_lower`] = point.lower;
      entry[`${key}_upper`] = point.upper;
      entry[`${key}_hash`] = point.gitHash;
    }
  }

  return Array.from(dataMap.values()).sort(
    (a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime()
  );
}

function formatValue(value: number): string {
  if (value >= 1e9) {
    return `${(value / 1e9).toFixed(2)}B`;
  } else if (value >= 1e6) {
    return `${(value / 1e6).toFixed(2)}M`;
  } else if (value >= 1e3) {
    return `${(value / 1e3).toFixed(2)}K`;
  } else if (value < 1) {
    return value.toFixed(4);
  }
  return value.toFixed(2);
}
