import { cache } from "react";
import { prisma } from "./prisma";

// Get basic project info (lightweight, for headers)
export const getProjectBasic = cache(async (userId: string, slug: string) => {
  return prisma.project.findFirst({
    where: { userId, slug },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      public: true,
    },
  });
});

// Get all projects for a user
export const getProjectsForUser = cache(async (userId: string) => {
  return prisma.project.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      public: true,
      createdAt: true,
    },
  });
});

// Get a single project by slug for a user
export const getProjectBySlug = cache(async (userId: string, slug: string) => {
  return prisma.project.findFirst({
    where: { userId, slug },
    include: {
      branches: {
        orderBy: { name: "asc" },
      },
      testbeds: {
        orderBy: { name: "asc" },
      },
      measures: {
        orderBy: { name: "asc" },
      },
      benchmarks: {
        orderBy: { name: "asc" },
      },
      thresholds: true,
      reports: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          branch: true,
          testbed: true,
          flamegraphs: {
            select: {
              id: true,
              fileName: true,
              fileSize: true,
              storagePath: true,
            },
          },
        },
      },
    },
  });
});

// Get active alerts for a project
export const getActiveAlerts = cache(async (projectId: string) => {
  return prisma.alert.findMany({
    where: {
      status: "active",
      threshold: {
        projectId,
      },
    },
    orderBy: { createdAt: "desc" },
    include: {
      metric: {
        include: {
          benchmark: true,
          measure: true,
        },
      },
    },
  });
});

// Ensure user exists (upsert from session)
export async function ensureUser(user: {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
}) {
  return prisma.user.upsert({
    where: { email: user.email },
    create: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    },
    update: {
      name: user.name,
      image: user.image,
    },
  });
}
