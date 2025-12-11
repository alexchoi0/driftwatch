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
  image?: string | null;
}

export interface GraphQLContext {
  prisma: PrismaClient;
  user: AuthUser | null;
}

const DEV_USER: AuthUser = {
  id: "00000000-0000-0000-0000-000000000000",
  email: "dev@localhost",
  name: "Dev User",
  image: null,
};

const DEV_API_TOKEN = process.env.DEV_API_TOKEN;

export async function createContext({
  request,
}: {
  request: Request;
}): Promise<GraphQLContext> {
  const prisma = await getPrisma();
  const authHeader = request.headers.get("authorization");
  const token = extractBearerToken(authHeader);

  if (token) {
    const jwtClaims = verifyJwt(token);
    if (jwtClaims) {
      const user = await prisma.user.upsert({
        where: { email: jwtClaims.email },
        create: {
          id: jwtClaims.sub,
          email: jwtClaims.email,
          name: jwtClaims.name || null,
          image: jwtClaims.picture || null,
        },
        update: {
          name: jwtClaims.name || null,
          image: jwtClaims.picture || null,
        },
      });

      return {
        prisma,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        },
      };
    }

    const tokenHash = hashApiToken(token);
    const apiToken = await prisma.apiToken.findFirst({
      where: {
        tokenHash,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: { user: true },
    });

    if (apiToken) {
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
          image: apiToken.user.image,
        },
      };
    }
  }

  if (DEV_MODE) {
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
            image: apiToken.user.image,
          },
        };
      }
    }

    return {
      prisma,
      user: DEV_USER,
    };
  }

  return { prisma, user: null };
}
