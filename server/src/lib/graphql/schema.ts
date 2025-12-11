import { createSchema } from "graphql-yoga";
import type { GraphQLContext } from "./context";
import { generateApiToken, hashApiToken } from "@/lib/auth";
import { checkThreshold } from "@/lib/services/threshold";
import { postPRComment, updateCommitStatus } from "@/lib/services/github";
import {
  generateStoragePath,
  createSignedUploadUrl,
  createSignedReadUrl,
} from "@/lib/storage";

const typeDefs = /* GraphQL */ `
  scalar DateTime

  type User {
    id: ID!
    email: String!
    name: String
    avatarUrl: String
    createdAt: DateTime!
    projects: [Project!]!
    apiTokens: [ApiToken!]!
  }

  type ApiToken {
    id: ID!
    name: String!
    lastUsedAt: DateTime
    expiresAt: DateTime
    createdAt: DateTime!
  }

  type ApiTokenResult {
    token: ApiToken!
    secret: String!
  }

  type Project {
    id: ID!
    slug: String!
    name: String!
    description: String
    public: Boolean!
    githubRepo: String
    githubPrComments: Boolean!
    githubStatusChecks: Boolean!
    hasGithubToken: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
    branches: [Branch!]!
    testbeds: [Testbed!]!
    measures: [Measure!]!
    benchmarks: [Benchmark!]!
    thresholds: [Threshold!]!
    recentReports(limit: Int): [Report!]!
  }

  type Branch {
    id: ID!
    name: String!
    createdAt: DateTime!
  }

  type Testbed {
    id: ID!
    name: String!
    createdAt: DateTime!
  }

  type Measure {
    id: ID!
    name: String!
    units: String
    createdAt: DateTime!
  }

  type Benchmark {
    id: ID!
    name: String!
    createdAt: DateTime!
  }

  type Report {
    id: ID!
    gitHash: String
    createdAt: DateTime!
    branch: Branch!
    testbed: Testbed!
    metrics: [Metric!]!
    alerts: [Alert!]!
    flamegraphs: [Flamegraph!]!
  }

  type Flamegraph {
    id: ID!
    storagePath: String!
    fileName: String!
    fileSize: Int!
    url: String!
    createdAt: DateTime!
    benchmark: Benchmark
  }

  type FlamegraphUploadUrl {
    signedUrl: String!
    token: String!
    storagePath: String!
  }

  type Metric {
    id: ID!
    value: Float!
    lowerValue: Float
    upperValue: Float
    createdAt: DateTime!
    benchmark: Benchmark!
    measure: Measure!
  }

  type Threshold {
    id: ID!
    branchId: ID
    testbedId: ID
    measureId: ID!
    upperBoundary: Float
    lowerBoundary: Float
    minSampleSize: Int!
    createdAt: DateTime!
    updatedAt: DateTime!
    branch: Branch
    testbed: Testbed
    measure: Measure!
  }

  enum AlertStatus {
    active
    dismissed
    resolved
  }

  type Alert {
    id: ID!
    baselineValue: Float!
    percentChange: Float!
    status: String!
    createdAt: DateTime!
    threshold: Threshold!
    metric: Metric!
  }

  type PerfDataPoint {
    x: DateTime!
    y: Float!
    lower: Float
    upper: Float
    gitHash: String
  }

  type PerfSeries {
    benchmark: Benchmark!
    branch: Branch!
    testbed: Testbed!
    measure: Measure!
    data: [PerfDataPoint!]!
  }

  type PerfResult {
    series: [PerfSeries!]!
  }

  input CreateProjectInput {
    slug: String!
    name: String!
    description: String
    public: Boolean
  }

  input UpdateProjectInput {
    name: String
    description: String
    public: Boolean
  }

  input UpdateGitHubSettingsInput {
    githubRepo: String
    githubToken: String
    githubPrComments: Boolean
    githubStatusChecks: Boolean
  }

  input MetricInput {
    benchmark: String!
    measure: String!
    value: Float!
    lowerValue: Float
    upperValue: Float
  }

  input CreateReportInput {
    projectSlug: String!
    branch: String!
    testbed: String!
    gitHash: String
    prNumber: Int
    metrics: [MetricInput!]!
  }

  input CreateThresholdInput {
    projectSlug: String!
    branchId: ID
    testbedId: ID
    measureId: ID!
    upperBoundary: Float
    lowerBoundary: Float
    minSampleSize: Int
  }

  input UpdateThresholdInput {
    upperBoundary: Float
    lowerBoundary: Float
    minSampleSize: Int
  }

  type Query {
    me: User
    projects: [Project!]!
    project(slug: String!): Project
    perf(
      projectSlug: String!
      benchmarks: [ID!]!
      branches: [ID!]!
      measures: [ID!]!
      testbeds: [ID!]!
      startDate: DateTime
      endDate: DateTime
    ): PerfResult!
    alerts(projectSlug: String!, status: AlertStatus): [Alert!]!
  }

  type Mutation {
    createProject(input: CreateProjectInput!): Project!
    updateProject(slug: String!, input: UpdateProjectInput!): Project!
    deleteProject(slug: String!): Boolean!
    createReport(input: CreateReportInput!): Report!
    createThreshold(input: CreateThresholdInput!): Threshold!
    updateThreshold(id: ID!, input: UpdateThresholdInput!): Threshold!
    deleteThreshold(id: ID!): Boolean!
    dismissAlert(id: ID!): Alert!
    createApiToken(name: String!): ApiTokenResult!
    revokeApiToken(id: ID!): Boolean!
    updateGitHubSettings(slug: String!, input: UpdateGitHubSettingsInput!): Project!
    createFlamegraphUploadUrl(projectSlug: String!, fileName: String!): FlamegraphUploadUrl!
    confirmFlamegraphUpload(
      reportId: ID!
      storagePath: String!
      fileName: String!
      fileSize: Int!
      benchmarkName: String
    ): Flamegraph!
  }
`;

const resolvers = {
  Query: {
    me: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      if (!ctx.user) return null;

      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.user.id },
      });
      return user;
    },

    projects: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      if (!ctx.user) throw new Error("Not authenticated");

      return ctx.prisma.project.findMany({
        where: { userId: ctx.user.id },
        orderBy: { updatedAt: "desc" },
      });
    },

    project: async (
      _: unknown,
      { slug }: { slug: string },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new Error("Not authenticated");

      return ctx.prisma.project.findFirst({
        where: { userId: ctx.user.id, slug },
      });
    },

    perf: async (
      _: unknown,
      args: {
        projectSlug: string;
        benchmarks: string[];
        branches: string[];
        measures: string[];
        testbeds: string[];
        startDate?: string;
        endDate?: string;
      },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new Error("Not authenticated");

      const project = await ctx.prisma.project.findFirst({
        where: { userId: ctx.user.id, slug: args.projectSlug },
      });
      if (!project) throw new Error("Project not found");

      // Get metrics with all related data
      const metrics = await ctx.prisma.metric.findMany({
        where: {
          benchmarkId: { in: args.benchmarks },
          measureId: { in: args.measures },
          report: {
            projectId: project.id,
            branchId: { in: args.branches },
            testbedId: { in: args.testbeds },
            ...(args.startDate && { createdAt: { gte: new Date(args.startDate) } }),
            ...(args.endDate && { createdAt: { lte: new Date(args.endDate) } }),
          },
        },
        include: {
          benchmark: true,
          measure: true,
          report: {
            include: {
              branch: true,
              testbed: true,
            },
          },
        },
        orderBy: { report: { createdAt: "asc" } },
      });

      // Group metrics into series
      const seriesMap = new Map<
        string,
        {
          benchmark: typeof metrics[0]["benchmark"];
          branch: typeof metrics[0]["report"]["branch"];
          testbed: typeof metrics[0]["report"]["testbed"];
          measure: typeof metrics[0]["measure"];
          data: Array<{
            x: Date;
            y: number;
            lower: number | null;
            upper: number | null;
            gitHash: string | null;
          }>;
        }
      >();

      for (const metric of metrics) {
        const key = `${metric.benchmarkId}-${metric.report.branchId}-${metric.report.testbedId}-${metric.measureId}`;

        if (!seriesMap.has(key)) {
          seriesMap.set(key, {
            benchmark: metric.benchmark,
            branch: metric.report.branch,
            testbed: metric.report.testbed,
            measure: metric.measure,
            data: [],
          });
        }

        seriesMap.get(key)!.data.push({
          x: metric.report.createdAt,
          y: metric.value,
          lower: metric.lowerValue,
          upper: metric.upperValue,
          gitHash: metric.report.gitHash,
        });
      }

      return { series: Array.from(seriesMap.values()) };
    },

    alerts: async (
      _: unknown,
      args: { projectSlug: string; status?: string },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new Error("Not authenticated");

      const project = await ctx.prisma.project.findFirst({
        where: { userId: ctx.user.id, slug: args.projectSlug },
      });
      if (!project) throw new Error("Project not found");

      return ctx.prisma.alert.findMany({
        where: {
          threshold: { projectId: project.id },
          ...(args.status && { status: args.status }),
        },
        include: {
          threshold: true,
          metric: {
            include: {
              benchmark: true,
              measure: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    },
  },

  Mutation: {
    createProject: async (
      _: unknown,
      {
        input,
      }: {
        input: {
          slug: string;
          name: string;
          description?: string;
          public?: boolean;
        };
      },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new Error("Not authenticated");

      const project = await ctx.prisma.project.create({
        data: {
          userId: ctx.user.id,
          slug: input.slug,
          name: input.name,
          description: input.description,
          public: input.public ?? false,
        },
      });

      // Auto-create default "latency" measure
      await ctx.prisma.measure.create({
        data: {
          projectId: project.id,
          name: "latency",
          units: "ns",
        },
      });

      return project;
    },

    updateProject: async (
      _: unknown,
      {
        slug,
        input,
      }: {
        slug: string;
        input: { name?: string; description?: string; public?: boolean };
      },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new Error("Not authenticated");

      const project = await ctx.prisma.project.findFirst({
        where: { userId: ctx.user.id, slug },
      });
      if (!project) throw new Error("Project not found");

      return ctx.prisma.project.update({
        where: { id: project.id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && {
            description: input.description,
          }),
          ...(input.public !== undefined && { public: input.public }),
        },
      });
    },

    deleteProject: async (
      _: unknown,
      { slug }: { slug: string },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new Error("Not authenticated");

      const project = await ctx.prisma.project.findFirst({
        where: { userId: ctx.user.id, slug },
      });
      if (!project) throw new Error("Project not found");

      await ctx.prisma.project.delete({ where: { id: project.id } });
      return true;
    },

    createReport: async (
      _: unknown,
      {
        input,
      }: {
        input: {
          projectSlug: string;
          branch: string;
          testbed: string;
          gitHash?: string;
          prNumber?: number;
          metrics: Array<{
            benchmark: string;
            measure: string;
            value: number;
            lowerValue?: number;
            upperValue?: number;
          }>;
        };
      },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new Error("Not authenticated");

      const project = await ctx.prisma.project.findFirst({
        where: { userId: ctx.user.id, slug: input.projectSlug },
      });
      if (!project) throw new Error("Project not found");

      // Upsert branch
      const branch = await ctx.prisma.branch.upsert({
        where: {
          projectId_name: { projectId: project.id, name: input.branch },
        },
        create: { projectId: project.id, name: input.branch },
        update: {},
      });

      // Upsert testbed
      const testbed = await ctx.prisma.testbed.upsert({
        where: {
          projectId_name: { projectId: project.id, name: input.testbed },
        },
        create: { projectId: project.id, name: input.testbed },
        update: {},
      });

      // Create report
      const report = await ctx.prisma.report.create({
        data: {
          projectId: project.id,
          branchId: branch.id,
          testbedId: testbed.id,
          gitHash: input.gitHash,
          prNumber: input.prNumber,
        },
      });

      // Process each metric
      for (const metricInput of input.metrics) {
        // Upsert benchmark
        const benchmark = await ctx.prisma.benchmark.upsert({
          where: {
            projectId_name: {
              projectId: project.id,
              name: metricInput.benchmark,
            },
          },
          create: { projectId: project.id, name: metricInput.benchmark },
          update: {},
        });

        // Upsert measure
        const measure = await ctx.prisma.measure.upsert({
          where: {
            projectId_name: { projectId: project.id, name: metricInput.measure },
          },
          create: { projectId: project.id, name: metricInput.measure },
          update: {},
        });

        // Create metric
        const metric = await ctx.prisma.metric.create({
          data: {
            reportId: report.id,
            benchmarkId: benchmark.id,
            measureId: measure.id,
            value: metricInput.value,
            lowerValue: metricInput.lowerValue,
            upperValue: metricInput.upperValue,
          },
        });

        // Find applicable thresholds
        const thresholds = await ctx.prisma.threshold.findMany({
          where: {
            projectId: project.id,
            measureId: measure.id,
            OR: [{ branchId: null }, { branchId: branch.id }],
            AND: [
              { OR: [{ testbedId: null }, { testbedId: testbed.id }] },
            ],
          },
        });

        // Check each threshold
        for (const threshold of thresholds) {
          // Get baseline metrics
          const baselineMetrics = await ctx.prisma.metric.findMany({
            where: {
              benchmarkId: benchmark.id,
              measureId: measure.id,
              report: {
                projectId: project.id,
                branchId: branch.id,
                testbedId: testbed.id,
              },
              id: { not: metric.id }, // Exclude current metric
            },
            orderBy: { createdAt: "desc" },
            take: threshold.minSampleSize,
          });

          const baselineValues = baselineMetrics.map((m) => m.value);
          const violation = checkThreshold(threshold, metricInput.value, baselineValues);

          if (violation) {
            await ctx.prisma.alert.create({
              data: {
                thresholdId: threshold.id,
                metricId: metric.id,
                baselineValue: violation.baselineValue,
                percentChange: violation.percentChange,
                status: "active",
              },
            });
          }
        }
      }

      // Check for alerts to determine status
      const alertCount = await ctx.prisma.alert.count({
        where: { metric: { reportId: report.id } },
      });

      // Trigger GitHub integrations asynchronously (don't block response)
      if (input.prNumber && project.githubPrComments) {
        postPRComment({
          projectId: project.id,
          prNumber: input.prNumber,
          reportId: report.id,
        }).catch((err) => console.error("Failed to post PR comment:", err));
      }

      if (input.gitHash && project.githubStatusChecks) {
        const state = alertCount > 0 ? "failure" : "success";
        const description =
          alertCount > 0
            ? `${alertCount} performance regression${alertCount > 1 ? "s" : ""} detected`
            : "All benchmarks passed";

        updateCommitStatus(project.id, input.gitHash, state, description).catch(
          (err) => console.error("Failed to update commit status:", err)
        );
      }

      return ctx.prisma.report.findUnique({
        where: { id: report.id },
        include: {
          branch: true,
          testbed: true,
          metrics: {
            include: {
              benchmark: true,
              measure: true,
            },
          },
        },
      });
    },

    createThreshold: async (
      _: unknown,
      {
        input,
      }: {
        input: {
          projectSlug: string;
          branchId?: string;
          testbedId?: string;
          measureId: string;
          upperBoundary?: number;
          lowerBoundary?: number;
          minSampleSize?: number;
        };
      },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new Error("Not authenticated");

      const project = await ctx.prisma.project.findFirst({
        where: { userId: ctx.user.id, slug: input.projectSlug },
      });
      if (!project) throw new Error("Project not found");

      return ctx.prisma.threshold.create({
        data: {
          projectId: project.id,
          branchId: input.branchId,
          testbedId: input.testbedId,
          measureId: input.measureId,
          upperBoundary: input.upperBoundary,
          lowerBoundary: input.lowerBoundary,
          minSampleSize: input.minSampleSize ?? 2,
        },
      });
    },

    updateThreshold: async (
      _: unknown,
      {
        id,
        input,
      }: {
        id: string;
        input: {
          upperBoundary?: number;
          lowerBoundary?: number;
          minSampleSize?: number;
        };
      },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new Error("Not authenticated");

      // Verify ownership through project
      const threshold = await ctx.prisma.threshold.findUnique({
        where: { id },
        include: { project: true },
      });
      if (!threshold || threshold.project.userId !== ctx.user.id) {
        throw new Error("Threshold not found");
      }

      return ctx.prisma.threshold.update({
        where: { id },
        data: {
          ...(input.upperBoundary !== undefined && {
            upperBoundary: input.upperBoundary,
          }),
          ...(input.lowerBoundary !== undefined && {
            lowerBoundary: input.lowerBoundary,
          }),
          ...(input.minSampleSize !== undefined && {
            minSampleSize: input.minSampleSize,
          }),
        },
      });
    },

    deleteThreshold: async (
      _: unknown,
      { id }: { id: string },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new Error("Not authenticated");

      const threshold = await ctx.prisma.threshold.findUnique({
        where: { id },
        include: { project: true },
      });
      if (!threshold || threshold.project.userId !== ctx.user.id) {
        throw new Error("Threshold not found");
      }

      await ctx.prisma.threshold.delete({ where: { id } });
      return true;
    },

    dismissAlert: async (
      _: unknown,
      { id }: { id: string },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new Error("Not authenticated");

      const alert = await ctx.prisma.alert.findUnique({
        where: { id },
        include: { threshold: { include: { project: true } } },
      });
      if (!alert || alert.threshold.project.userId !== ctx.user.id) {
        throw new Error("Alert not found");
      }

      return ctx.prisma.alert.update({
        where: { id },
        data: { status: "dismissed" },
        include: {
          threshold: true,
          metric: {
            include: {
              benchmark: true,
              measure: true,
            },
          },
        },
      });
    },

    createApiToken: async (
      _: unknown,
      { name }: { name: string },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new Error("Not authenticated");

      const secret = generateApiToken();
      const tokenHash = hashApiToken(secret);

      const token = await ctx.prisma.apiToken.create({
        data: {
          userId: ctx.user.id,
          name,
          tokenHash,
        },
      });

      return { token, secret };
    },

    revokeApiToken: async (
      _: unknown,
      { id }: { id: string },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new Error("Not authenticated");

      const result = await ctx.prisma.apiToken.deleteMany({
        where: { id, userId: ctx.user.id },
      });

      return result.count > 0;
    },

    updateGitHubSettings: async (
      _: unknown,
      {
        slug,
        input,
      }: {
        slug: string;
        input: {
          githubRepo?: string;
          githubToken?: string;
          githubPrComments?: boolean;
          githubStatusChecks?: boolean;
        };
      },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new Error("Not authenticated");

      const project = await ctx.prisma.project.findFirst({
        where: { userId: ctx.user.id, slug },
      });
      if (!project) throw new Error("Project not found");

      return ctx.prisma.project.update({
        where: { id: project.id },
        data: {
          ...(input.githubRepo !== undefined && { githubRepo: input.githubRepo || null }),
          ...(input.githubToken !== undefined && { githubToken: input.githubToken || null }),
          ...(input.githubPrComments !== undefined && { githubPrComments: input.githubPrComments }),
          ...(input.githubStatusChecks !== undefined && { githubStatusChecks: input.githubStatusChecks }),
        },
      });
    },

    createFlamegraphUploadUrl: async (
      _: unknown,
      { projectSlug, fileName }: { projectSlug: string; fileName: string },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new Error("Not authenticated");

      const project = await ctx.prisma.project.findFirst({
        where: { userId: ctx.user.id, slug: projectSlug },
      });
      if (!project) throw new Error("Project not found");

      const storagePath = generateStoragePath(project.id, fileName);
      const { signedUrl, token } = await createSignedUploadUrl(storagePath);

      return { signedUrl, token, storagePath };
    },

    confirmFlamegraphUpload: async (
      _: unknown,
      {
        reportId,
        storagePath,
        fileName,
        fileSize,
        benchmarkName,
      }: {
        reportId: string;
        storagePath: string;
        fileName: string;
        fileSize: number;
        benchmarkName?: string;
      },
      ctx: GraphQLContext
    ) => {
      if (!ctx.user) throw new Error("Not authenticated");

      // Verify report exists and user owns it
      const report = await ctx.prisma.report.findUnique({
        where: { id: reportId },
        include: { project: true },
      });
      if (!report || report.project.userId !== ctx.user.id) {
        throw new Error("Report not found");
      }

      // Find benchmark if name provided
      let benchmarkId: string | null = null;
      if (benchmarkName) {
        const benchmark = await ctx.prisma.benchmark.findFirst({
          where: { projectId: report.projectId, name: benchmarkName },
        });
        benchmarkId = benchmark?.id ?? null;
      }

      // Create flamegraph record
      const flamegraph = await ctx.prisma.flamegraph.create({
        data: {
          reportId,
          benchmarkId,
          storagePath,
          fileName,
          fileSize,
        },
      });

      return flamegraph;
    },
  },

  // Field resolvers for nested types
  User: {
    projects: async (parent: { id: string }, _: unknown, ctx: GraphQLContext) => {
      return ctx.prisma.project.findMany({
        where: { userId: parent.id },
        orderBy: { updatedAt: "desc" },
      });
    },
    apiTokens: async (parent: { id: string }, _: unknown, ctx: GraphQLContext) => {
      return ctx.prisma.apiToken.findMany({
        where: { userId: parent.id },
        orderBy: { createdAt: "desc" },
      });
    },
  },

  Project: {
    hasGithubToken: (parent: { githubToken: string | null }) => {
      return !!parent.githubToken;
    },
    branches: async (parent: { id: string }, _: unknown, ctx: GraphQLContext) => {
      return ctx.prisma.branch.findMany({
        where: { projectId: parent.id },
        orderBy: { name: "asc" },
      });
    },
    testbeds: async (parent: { id: string }, _: unknown, ctx: GraphQLContext) => {
      return ctx.prisma.testbed.findMany({
        where: { projectId: parent.id },
        orderBy: { name: "asc" },
      });
    },
    measures: async (parent: { id: string }, _: unknown, ctx: GraphQLContext) => {
      return ctx.prisma.measure.findMany({
        where: { projectId: parent.id },
        orderBy: { name: "asc" },
      });
    },
    benchmarks: async (parent: { id: string }, _: unknown, ctx: GraphQLContext) => {
      return ctx.prisma.benchmark.findMany({
        where: { projectId: parent.id },
        orderBy: { name: "asc" },
      });
    },
    thresholds: async (parent: { id: string }, _: unknown, ctx: GraphQLContext) => {
      return ctx.prisma.threshold.findMany({
        where: { projectId: parent.id },
        orderBy: { createdAt: "desc" },
      });
    },
    recentReports: async (
      parent: { id: string },
      { limit }: { limit?: number },
      ctx: GraphQLContext
    ) => {
      return ctx.prisma.report.findMany({
        where: { projectId: parent.id },
        orderBy: { createdAt: "desc" },
        take: limit ?? 10,
        include: {
          branch: true,
          testbed: true,
        },
      });
    },
  },

  Report: {
    metrics: async (parent: { id: string }, _: unknown, ctx: GraphQLContext) => {
      return ctx.prisma.metric.findMany({
        where: { reportId: parent.id },
        include: {
          benchmark: true,
          measure: true,
        },
      });
    },
    alerts: async (parent: { id: string }, _: unknown, ctx: GraphQLContext) => {
      return ctx.prisma.alert.findMany({
        where: { metric: { reportId: parent.id } },
        include: {
          threshold: true,
          metric: {
            include: {
              benchmark: true,
              measure: true,
            },
          },
        },
      });
    },
    flamegraphs: async (parent: { id: string }, _: unknown, ctx: GraphQLContext) => {
      return ctx.prisma.flamegraph.findMany({
        where: { reportId: parent.id },
        orderBy: { createdAt: "asc" },
      });
    },
  },

  Flamegraph: {
    url: async (parent: { storagePath: string }) => {
      return createSignedReadUrl(parent.storagePath);
    },
    benchmark: async (
      parent: { benchmarkId: string | null },
      _: unknown,
      ctx: GraphQLContext
    ) => {
      if (!parent.benchmarkId) return null;
      return ctx.prisma.benchmark.findUnique({ where: { id: parent.benchmarkId } });
    },
  },

  Threshold: {
    branch: async (
      parent: { branchId: string | null },
      _: unknown,
      ctx: GraphQLContext
    ) => {
      if (!parent.branchId) return null;
      return ctx.prisma.branch.findUnique({ where: { id: parent.branchId } });
    },
    testbed: async (
      parent: { testbedId: string | null },
      _: unknown,
      ctx: GraphQLContext
    ) => {
      if (!parent.testbedId) return null;
      return ctx.prisma.testbed.findUnique({ where: { id: parent.testbedId } });
    },
    measure: async (
      parent: { measureId: string },
      _: unknown,
      ctx: GraphQLContext
    ) => {
      return ctx.prisma.measure.findUnique({ where: { id: parent.measureId } });
    },
  },

  // DateTime scalar - graphql-yoga handles this automatically with ISO strings
  DateTime: {
    serialize: (value: Date) => value.toISOString(),
    parseValue: (value: string) => new Date(value),
  },
};

export const schema = createSchema({
  typeDefs,
  resolvers,
});
