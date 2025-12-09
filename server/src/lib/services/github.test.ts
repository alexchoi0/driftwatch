import { describe, it, expect, vi, beforeEach } from "vitest";

// We need to test the internal formatting functions, so we'll extract them for testing
// For now, let's test the exported functions with mocks

// Mock prisma
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    project: {
      findUnique: vi.fn(),
    },
    report: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { postPRComment, updateCommitStatus } from "./github";
import { prisma } from "@/lib/db/prisma";

describe("GitHub Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe("postPRComment", () => {
    it("returns false if project not found", async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(null);

      const result = await postPRComment({
        projectId: "non-existent",
        prNumber: 123,
        reportId: "report-id",
      });

      expect(result).toBe(false);
    });

    it("returns false if project has no GitHub repo", async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: "project-id",
        userId: "user-id",
        slug: "test-project",
        name: "Test Project",
        description: null,
        public: false,
        githubRepo: null,
        githubToken: null,
        githubPrComments: false,
        githubStatusChecks: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await postPRComment({
        projectId: "project-id",
        prNumber: 123,
        reportId: "report-id",
      });

      expect(result).toBe(false);
    });

    it("returns false if project has no GitHub token", async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: "project-id",
        userId: "user-id",
        slug: "test-project",
        name: "Test Project",
        description: null,
        public: false,
        githubRepo: "owner/repo",
        githubToken: null,
        githubPrComments: true,
        githubStatusChecks: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await postPRComment({
        projectId: "project-id",
        prNumber: 123,
        reportId: "report-id",
      });

      expect(result).toBe(false);
    });

    it("returns false if PR comments are disabled", async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: "project-id",
        userId: "user-id",
        slug: "test-project",
        name: "Test Project",
        description: null,
        public: false,
        githubRepo: "owner/repo",
        githubToken: "ghp_token",
        githubPrComments: false,
        githubStatusChecks: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await postPRComment({
        projectId: "project-id",
        prNumber: 123,
        reportId: "report-id",
      });

      expect(result).toBe(false);
    });

    it("returns false if report not found", async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: "project-id",
        userId: "user-id",
        slug: "test-project",
        name: "Test Project",
        description: null,
        public: false,
        githubRepo: "owner/repo",
        githubToken: "ghp_token",
        githubPrComments: true,
        githubStatusChecks: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.mocked(prisma.report.findUnique).mockResolvedValue(null);

      const result = await postPRComment({
        projectId: "project-id",
        prNumber: 123,
        reportId: "non-existent-report",
      });

      expect(result).toBe(false);
    });

    it("posts comment to GitHub API successfully", async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: "project-id",
        userId: "user-id",
        slug: "test-project",
        name: "Test Project",
        description: null,
        public: false,
        githubRepo: "owner/repo",
        githubToken: "ghp_token",
        githubPrComments: true,
        githubStatusChecks: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.mocked(prisma.report.findUnique).mockResolvedValue({
        id: "report-id",
        projectId: "project-id",
        branchId: "branch-id",
        testbedId: "testbed-id",
        gitHash: "abc1234",
        prNumber: 123,
        createdAt: new Date(),
        branch: { id: "branch-id", name: "main", projectId: "project-id", createdAt: new Date() },
        testbed: { id: "testbed-id", name: "linux", projectId: "project-id", createdAt: new Date() },
        metrics: [
          {
            id: "metric-id",
            reportId: "report-id",
            benchmarkId: "bench-id",
            measureId: "measure-id",
            value: 100.5,
            lowerValue: null,
            upperValue: null,
            createdAt: new Date(),
            benchmark: { id: "bench-id", name: "test_benchmark", projectId: "project-id", createdAt: new Date() },
            measure: { id: "measure-id", name: "latency", units: "ns", projectId: "project-id", createdAt: new Date() },
            alerts: [],
          },
        ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1 }),
      });

      const result = await postPRComment({
        projectId: "project-id",
        prNumber: 123,
        reportId: "report-id",
      });

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo/issues/123/comments",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer ghp_token",
          }),
        })
      );
    });

    it("returns false if GitHub API fails", async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: "project-id",
        userId: "user-id",
        slug: "test-project",
        name: "Test Project",
        description: null,
        public: false,
        githubRepo: "owner/repo",
        githubToken: "ghp_token",
        githubPrComments: true,
        githubStatusChecks: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.mocked(prisma.report.findUnique).mockResolvedValue({
        id: "report-id",
        projectId: "project-id",
        branchId: "branch-id",
        testbedId: "testbed-id",
        gitHash: "abc1234",
        prNumber: 123,
        createdAt: new Date(),
        branch: { id: "branch-id", name: "main", projectId: "project-id", createdAt: new Date() },
        testbed: { id: "testbed-id", name: "linux", projectId: "project-id", createdAt: new Date() },
        metrics: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      const result = await postPRComment({
        projectId: "project-id",
        prNumber: 123,
        reportId: "report-id",
      });

      expect(result).toBe(false);
    });
  });

  describe("updateCommitStatus", () => {
    it("returns false if project not found", async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue(null);

      const result = await updateCommitStatus(
        "non-existent",
        "abc123",
        "success",
        "All tests passed"
      );

      expect(result).toBe(false);
    });

    it("returns false if project has no GitHub repo", async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: "project-id",
        userId: "user-id",
        slug: "test-project",
        name: "Test Project",
        description: null,
        public: false,
        githubRepo: null,
        githubToken: null,
        githubPrComments: false,
        githubStatusChecks: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await updateCommitStatus(
        "project-id",
        "abc123",
        "success",
        "All tests passed"
      );

      expect(result).toBe(false);
    });

    it("returns false if status checks are disabled", async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: "project-id",
        userId: "user-id",
        slug: "test-project",
        name: "Test Project",
        description: null,
        public: false,
        githubRepo: "owner/repo",
        githubToken: "ghp_token",
        githubPrComments: false,
        githubStatusChecks: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await updateCommitStatus(
        "project-id",
        "abc123",
        "success",
        "All tests passed"
      );

      expect(result).toBe(false);
    });

    it("posts status to GitHub API successfully", async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: "project-id",
        userId: "user-id",
        slug: "test-project",
        name: "Test Project",
        description: null,
        public: false,
        githubRepo: "owner/repo",
        githubToken: "ghp_token",
        githubPrComments: false,
        githubStatusChecks: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1 }),
      });

      const result = await updateCommitStatus(
        "project-id",
        "abc123def456",
        "success",
        "All benchmarks passed"
      );

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo/statuses/abc123def456",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer ghp_token",
          }),
          body: expect.stringContaining("success"),
        })
      );
    });

    it("sends failure status when there are regressions", async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: "project-id",
        userId: "user-id",
        slug: "test-project",
        name: "Test Project",
        description: null,
        public: false,
        githubRepo: "owner/repo",
        githubToken: "ghp_token",
        githubPrComments: false,
        githubStatusChecks: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1 }),
      });

      const result = await updateCommitStatus(
        "project-id",
        "abc123def456",
        "failure",
        "3 performance regressions detected"
      );

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining("failure"),
        })
      );
    });

    it("returns false if GitHub API fails", async () => {
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: "project-id",
        userId: "user-id",
        slug: "test-project",
        name: "Test Project",
        description: null,
        public: false,
        githubRepo: "owner/repo",
        githubToken: "ghp_token",
        githubPrComments: false,
        githubStatusChecks: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => "Forbidden",
      });

      const result = await updateCommitStatus(
        "project-id",
        "abc123",
        "success",
        "All tests passed"
      );

      expect(result).toBe(false);
    });
  });
});
