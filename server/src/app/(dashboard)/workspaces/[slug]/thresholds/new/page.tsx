"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { triggerNavigationStart } from "@/components/progress-bar";
import { createThreshold } from "./actions";

interface ProjectData {
  branches: Array<{ id: string; name: string }>;
  testbeds: Array<{ id: string; name: string }>;
  measures: Array<{ id: string; name: string; units: string | null }>;
}

export default function NewThresholdPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Form state
  const [measureId, setMeasureId] = useState<string>("");
  const [branchId, setBranchId] = useState<string>("all");
  const [testbedId, setTestbedId] = useState<string>("all");
  const [upperBoundary, setUpperBoundary] = useState<string>("");
  const [lowerBoundary, setLowerBoundary] = useState<string>("");
  const [minSampleSize, setMinSampleSize] = useState<string>("2");

  // Fetch project data
  useEffect(() => {
    async function fetchProjectData() {
      try {
        const res = await fetch("/api/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `
              query GetProjectData($slug: String!) {
                project(slug: $slug) {
                  branches { id name }
                  testbeds { id name }
                  measures { id name units }
                }
              }
            `,
            variables: { slug },
          }),
        });
        const data = await res.json();
        if (data.errors) {
          setFetchError(data.errors[0]?.message || "Failed to load project");
          return;
        }
        if (!data.data?.project) {
          setFetchError("Project not found");
          return;
        }
        setProjectData(data.data.project);
        // Set default measure if available
        if (data.data.project.measures.length > 0) {
          setMeasureId(data.data.project.measures[0].id);
        }
      } catch (err) {
        setFetchError("Failed to load project data");
        console.error(err);
      }
    }
    fetchProjectData();
  }, [slug]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!measureId) {
      setError("Please select a measure");
      setIsLoading(false);
      return;
    }

    if (!upperBoundary && !lowerBoundary) {
      setError("Please set at least one boundary (upper or lower)");
      setIsLoading(false);
      return;
    }

    try {
      const result = await createThreshold({
        projectSlug: slug,
        measureId,
        branchId: branchId === "all" ? undefined : branchId,
        testbedId: testbedId === "all" ? undefined : testbedId,
        upperBoundary: upperBoundary ? parseFloat(upperBoundary) : undefined,
        lowerBoundary: lowerBoundary ? parseFloat(lowerBoundary) : undefined,
        minSampleSize: minSampleSize ? parseInt(minSampleSize, 10) : 2,
      });

      if (!result.success) {
        setError(result.error || "Failed to create threshold");
        setIsLoading(false);
        return;
      }

      triggerNavigationStart();
      router.push(`/workspaces/${slug}?tab=thresholds`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create threshold");
      setIsLoading(false);
    }
  }

  if (fetchError) {
    return (
      <div className="max-w-2xl">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Link href="/workspaces" className="hover:underline">
            Workspaces
          </Link>
          <span>/</span>
          <Link href={`/workspaces/${slug}`} className="hover:underline">
            {slug}
          </Link>
          <span>/</span>
          <span>New Threshold</span>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-destructive">{fetchError}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => router.back()}
            >
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!projectData) {
    return (
      <div className="max-w-2xl">
        <div className="animate-pulse">
          <div className="h-4 bg-muted rounded w-48 mb-6"></div>
          <div className="h-8 bg-muted rounded w-64 mb-2"></div>
          <div className="h-4 bg-muted rounded w-96 mb-8"></div>
          <div className="h-96 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
        <Link href="/workspaces" className="hover:underline">
          Workspaces
        </Link>
        <span>/</span>
        <Link href={`/workspaces/${slug}`} className="hover:underline">
          {slug}
        </Link>
        <span>/</span>
        <span>New Threshold</span>
      </div>
      <h1 className="text-3xl font-bold">New Threshold</h1>
      <p className="text-muted-foreground">
        Configure a threshold to detect performance regressions automatically
      </p>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Threshold Configuration</CardTitle>
          <CardDescription>
            Set boundaries to trigger alerts when metrics exceed limits
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="measure">Measure *</Label>
              <Select value={measureId} onValueChange={setMeasureId}>
                <SelectTrigger id="measure">
                  <SelectValue placeholder="Select a measure" />
                </SelectTrigger>
                <SelectContent>
                  {projectData.measures.map((measure) => (
                    <SelectItem key={measure.id} value={measure.id}>
                      {measure.name}
                      {measure.units && ` (${measure.units})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The metric to monitor for regressions
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="branch">Branch</Label>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger id="branch">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All branches</SelectItem>
                    {projectData.branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="testbed">Testbed</Label>
                <Select value={testbedId} onValueChange={setTestbedId}>
                  <SelectTrigger id="testbed">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All testbeds</SelectItem>
                    {projectData.testbeds.map((testbed) => (
                      <SelectItem key={testbed.id} value={testbed.id}>
                        {testbed.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="upperBoundary">Upper Boundary (%)</Label>
                <Input
                  id="upperBoundary"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="e.g., 10"
                  value={upperBoundary}
                  onChange={(e) => setUpperBoundary(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Alert if metric increases by more than this %
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="lowerBoundary">Lower Boundary (%)</Label>
                <Input
                  id="lowerBoundary"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="e.g., 10"
                  value={lowerBoundary}
                  onChange={(e) => setLowerBoundary(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Alert if metric decreases by more than this %
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="minSampleSize">Minimum Sample Size</Label>
              <Input
                id="minSampleSize"
                type="number"
                min="1"
                value={minSampleSize}
                onChange={(e) => setMinSampleSize(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Number of previous data points to compare against (default: 2)
              </p>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex gap-4">
              <Button type="submit" loading={isLoading}>
                Create Threshold
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
