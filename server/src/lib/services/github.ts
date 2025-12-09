import { prisma } from "@/lib/db/prisma";

interface GitHubCommentData {
  projectId: string;
  prNumber: number;
  reportId: string;
}

interface AlertData {
  benchmarkName: string;
  measureName: string;
  baselineValue: number;
  currentValue: number;
  percentChange: number;
}

/**
 * Post a benchmark report comment to a GitHub PR
 */
export async function postPRComment(data: GitHubCommentData): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: data.projectId },
  });

  if (!project || !project.githubRepo || !project.githubToken || !project.githubPrComments) {
    return false;
  }

  // Fetch the report with metrics and any alerts
  const report = await prisma.report.findUnique({
    where: { id: data.reportId },
    include: {
      branch: true,
      testbed: true,
      metrics: {
        include: {
          benchmark: true,
          measure: true,
          alerts: {
            include: {
              threshold: true,
            },
          },
        },
      },
    },
  });

  if (!report) {
    console.error(`Report ${data.reportId} not found`);
    return false;
  }

  // Build the comment body
  const alerts: AlertData[] = [];
  for (const metric of report.metrics) {
    for (const alert of metric.alerts) {
      alerts.push({
        benchmarkName: metric.benchmark.name,
        measureName: metric.measure.name,
        baselineValue: alert.baselineValue,
        currentValue: metric.value,
        percentChange: alert.percentChange,
      });
    }
  }

  const commentBody = formatPRComment(report, alerts, project.slug);

  // Post to GitHub
  try {
    const [owner, repo] = project.githubRepo.split("/");
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${data.prNumber}/comments`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${project.githubToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body: commentBody }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to post GitHub comment: ${response.status} ${error}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error posting GitHub comment:", error);
    return false;
  }
}

/**
 * Update commit status on GitHub
 */
export async function updateCommitStatus(
  projectId: string,
  sha: string,
  state: "success" | "failure" | "pending",
  description: string
): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project || !project.githubRepo || !project.githubToken || !project.githubStatusChecks) {
    return false;
  }

  try {
    const [owner, repo] = project.githubRepo.split("/");
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/statuses/${sha}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${project.githubToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          state,
          description,
          context: "rabbitbench/performance",
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to update commit status: ${response.status} ${error}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error updating commit status:", error);
    return false;
  }
}

interface ReportData {
  branch: { name: string };
  testbed: { name: string };
  gitHash: string | null;
  metrics: Array<{
    benchmark: { name: string };
    measure: { name: string; units: string | null };
    value: number;
  }>;
}

function formatPRComment(
  report: ReportData,
  alerts: AlertData[],
  projectSlug: string
): string {
  const lines: string[] = [];

  lines.push("## Benchmark Results");
  lines.push("");
  lines.push(`**Branch:** \`${report.branch.name}\``);
  lines.push(`**Testbed:** \`${report.testbed.name}\``);
  if (report.gitHash) {
    lines.push(`**Commit:** \`${report.gitHash.substring(0, 7)}\``);
  }
  lines.push("");

  // Add alerts section if there are any
  if (alerts.length > 0) {
    lines.push("### Performance Alerts");
    lines.push("");
    lines.push("| Benchmark | Measure | Baseline | Current | Change |");
    lines.push("|-----------|---------|----------|---------|--------|");

    for (const alert of alerts) {
      const changeStr =
        alert.percentChange > 0
          ? `+${alert.percentChange.toFixed(1)}%`
          : `${alert.percentChange.toFixed(1)}%`;
      const emoji = alert.percentChange > 0 ? "regression" : "improvement";

      lines.push(
        `| ${alert.benchmarkName} | ${alert.measureName} | ${formatValue(alert.baselineValue)} | ${formatValue(alert.currentValue)} | ${changeStr} (${emoji}) |`
      );
    }
    lines.push("");
  }

  // Add results summary
  lines.push("### Results Summary");
  lines.push("");
  lines.push("| Benchmark | Measure | Value |");
  lines.push("|-----------|---------|-------|");

  for (const metric of report.metrics) {
    const units = metric.measure.units ? ` ${metric.measure.units}` : "";
    lines.push(
      `| ${metric.benchmark.name} | ${metric.measure.name} | ${formatValue(metric.value)}${units} |`
    );
  }

  lines.push("");
  lines.push(`---`);
  lines.push(`*View full results in the [dashboard](/${projectSlug})*`);

  return lines.join("\n");
}

function formatValue(value: number): string {
  if (value >= 1e9) {
    return `${(value / 1e9).toFixed(2)}B`;
  } else if (value >= 1e6) {
    return `${(value / 1e6).toFixed(2)}M`;
  } else if (value >= 1e3) {
    return `${(value / 1e3).toFixed(2)}K`;
  } else if (value < 0.01 && value > 0) {
    return value.toExponential(2);
  }
  return value.toFixed(2);
}
