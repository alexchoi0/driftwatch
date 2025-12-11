"use client";

import { useState } from "react";
import { Flame, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FlamegraphList } from "@/components/flamegraph-viewer";
import { cn } from "@/lib/utils";

interface Report {
  id: string;
  gitHash: string | null;
  createdAt: Date;
  branch: { name: string };
  testbed: { name: string };
  flamegraphs: Array<{
    id: string;
    fileName: string;
    fileSize: number;
    storagePath: string;
  }>;
}

interface ReportsListClientProps {
  reports: Report[];
}

export function ReportsListClient({ reports }: ReportsListClientProps) {
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);

  if (reports.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No reports yet. Reports will appear here once you submit benchmark data.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {reports.map((report) => {
        const hasFlamegraphs = report.flamegraphs.length > 0;
        const isExpanded = expandedReportId === report.id;

        return (
          <div key={report.id} className="border-b last:border-0">
            <div
              className={cn(
                "flex items-center justify-between py-2",
                hasFlamegraphs && "cursor-pointer hover:bg-muted/50 -mx-2 px-2 rounded"
              )}
              onClick={() => {
                if (hasFlamegraphs) {
                  setExpandedReportId(isExpanded ? null : report.id);
                }
              }}
            >
              <div className="flex items-center gap-2">
                {hasFlamegraphs && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-5 w-5 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedReportId(isExpanded ? null : report.id);
                    }}
                  >
                    {isExpanded ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                  </Button>
                )}
                <div>
                  <div className="font-mono text-sm flex items-center gap-2">
                    {report.gitHash?.slice(0, 7) || "N/A"}
                    {hasFlamegraphs && (
                      <span className="inline-flex items-center gap-1 text-xs text-orange-500">
                        <Flame className="size-3" />
                        {report.flamegraphs.length}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {report.branch.name} / {report.testbed.name}
                  </div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(report.createdAt).toLocaleDateString()}
              </div>
            </div>

            {isExpanded && hasFlamegraphs && (
              <div className="pb-4 pt-2">
                <FlamegraphList flamegraphs={report.flamegraphs} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
