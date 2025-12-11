import * as crypto from "crypto";
import { randomUUID } from "crypto";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { getPrisma } from "@/lib/db/prisma";

export const DEV_MODE =
  process.env.DEV_MODE === "true" || process.env.DEV_MODE === "1";

const DEV_API_TOKEN = process.env.DEV_API_TOKEN;

const fallbackDevSession = {
  user: {
    id: "00000000-0000-0000-0000-000000000000",
    email: "dev@localhost",
    name: "Dev User",
    image: null,
  },
};

let authInstance: ReturnType<typeof betterAuth> | null = null;

export async function getAuth() {
  if (authInstance) return authInstance;

  const prisma = await getPrisma();

  authInstance = betterAuth({
    database: prismaAdapter(prisma, {
      provider: "postgresql",
    }),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL,
    socialProviders: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID || "",
        clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day
    },
    user: {
      additionalFields: {
        image: {
          type: "string",
          required: false,
        },
      },
    },
    plugins: [nextCookies()],
  });

  return authInstance;
}

export const auth = {
  get api() {
    return getAuth().then((a) => a.api);
  },
  get handler() {
    return getAuth().then((a) => a.handler);
  },
};

export async function getSession() {
  if (DEV_MODE) {
    if (DEV_API_TOKEN) {
      const prisma = await getPrisma();
      const tokenHash = hashApiToken(DEV_API_TOKEN);
      const apiToken = await prisma.apiToken.findFirst({
        where: { tokenHash },
        include: { user: true },
      });

      if (apiToken) {
        return {
          user: {
            id: apiToken.user.id,
            email: apiToken.user.email,
            name: apiToken.user.name,
            image: apiToken.user.image,
          },
        };
      }
    }
    return fallbackDevSession;
  }

  const { headers } = await import("next/headers");
  const authInstance = await getAuth();
  const session = await authInstance.api.getSession({
    headers: await headers(),
  });

  if (!session) return null;

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
    },
  };
}

export async function createGraphQLToken(session: {
  user: { id: string; email: string; name?: string | null; image?: string | null };
}) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: session.user.id,
    email: session.user.email,
    name: session.user.name || undefined,
    picture: session.user.image || undefined,
    iat: now,
    exp: now + 3600, // 1 hour
  };

  const base64UrlEncode = (data: string) =>
    Buffer.from(data).toString("base64url");

  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${headerEncoded}.${payloadEncoded}`;

  const secret = process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET!;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(signatureInput)
    .digest("base64url");

  return `${signatureInput}.${signature}`;
}

export interface JwtClaims {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  iat: number;
  exp: number;
}

export function verifyJwt(token: string): JwtClaims | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerEncoded, payloadEncoded, signatureProvided] = parts;

    const signatureInput = `${headerEncoded}.${payloadEncoded}`;
    const secret = process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET!;
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(signatureInput)
      .digest("base64url");

    if (signatureProvided !== expectedSignature) return null;

    const payload = JSON.parse(
      Buffer.from(payloadEncoded, "base64url").toString()
    ) as JwtClaims;

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function hashApiToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("base64");
}

export function generateApiToken(): string {
  const uuid = randomUUID().replace(/-/g, "");
  return `dw_${uuid}`;
}

export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^[Bb]earer\s+(.+)$/);
  return match ? match[1] : null;
}
