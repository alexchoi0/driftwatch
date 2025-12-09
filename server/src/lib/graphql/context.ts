import { getPrisma } from "@/lib/db/prisma";
import {
  DEV_MODE,
  verifyJwt,
  hashApiToken,
  extractBearerToken,
} from "@/lib/auth";
import type { PrismaClient } from "@prisma/client";

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}

export interface GraphQLContext {
  prisma: PrismaClient;
  user: AuthUser | null;
}

// Fallback dev user (used when no DEV_API_TOKEN is configured)
const DEV_USER: AuthUser = {
  id: "00000000-0000-0000-0000-000000000000",
  email: "dev@localhost",
  name: "Dev User",
  avatarUrl: null,
};

// Dev API token from environment (created via `npm run create-test-user`)
const DEV_API_TOKEN = process.env.DEV_API_TOKEN;

export async function createContext({
  request,
}: {
  request: Request;
}): Promise<GraphQLContext> {
  const prisma = await getPrisma();
  const authHeader = request.headers.get("authorization");
  const token = extractBearerToken(authHeader);

  // Try JWT authentication first
  if (token) {
    const jwtClaims = verifyJwt(token);
    if (jwtClaims) {
      // Upsert user from JWT claims
      const user = await prisma.user.upsert({
        where: { email: jwtClaims.email },
        create: {
          id: jwtClaims.sub,
          email: jwtClaims.email,
          name: jwtClaims.name,
          avatarUrl: jwtClaims.picture,
        },
        update: {
          name: jwtClaims.name,
          avatarUrl: jwtClaims.picture,
        },
      });

      return {
        prisma,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
        },
      };
    }

    // Try API token authentication
    const tokenHash = hashApiToken(token);
    const apiToken = await prisma.apiToken.findFirst({
      where: {
        tokenHash,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: { user: true },
    });

    if (apiToken) {
      // Update last used timestamp
      await prisma.apiToken.update({
        where: { id: apiToken.id },
        data: { lastUsedAt: new Date() },
      });

      return {
        prisma,
        user: {
          id: apiToken.user.id,
          email: apiToken.user.email,
          name: apiToken.user.name,
          avatarUrl: apiToken.user.avatarUrl,
        },
      };
    }
  }

  // Dev mode fallback - only if no token provided or token invalid
  if (DEV_MODE) {
    // If DEV_API_TOKEN is configured, authenticate with it
    if (DEV_API_TOKEN) {
      const tokenHash = hashApiToken(DEV_API_TOKEN);
      const apiToken = await prisma.apiToken.findFirst({
        where: { tokenHash },
        include: { user: true },
      });

      if (apiToken) {
        return {
          prisma,
          user: {
            id: apiToken.user.id,
            email: apiToken.user.email,
            name: apiToken.user.name,
            avatarUrl: apiToken.user.avatarUrl,
          },
        };
      }
    }

    // Fallback to mock user (won't work for DB operations)
    return {
      prisma,
      user: DEV_USER,
    };
  }

  // No valid authentication
  return { prisma, user: null };
}
