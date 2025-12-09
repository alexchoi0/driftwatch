import * as crypto from "crypto";
import { randomUUID } from "crypto";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
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

// Cached per-request - prevents duplicate DB calls within the same render
export const getSession = cache(async () => {
  if (DEV_MODE) {
    // If DEV_API_TOKEN is set, look up the real user from database
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
            image: apiToken.user.avatarUrl,
          },
        };
      }
    }

    // Fallback to mock user
    return fallbackDevSession;
  }

  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return {
    user: {
      id: user.id,
      email: user.email!,
      name: user.user_metadata?.full_name || user.user_metadata?.name || null,
      image: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
    },
  };
});

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

  const signature = crypto
    .createHmac("sha256", process.env.AUTH_SECRET!)
    .update(signatureInput)
    .digest("base64url");

  return `${signatureInput}.${signature}`;
}

// JWT Claims interface
export interface JwtClaims {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  iat: number;
  exp: number;
}

// Verify and decode a JWT token
export function verifyJwt(token: string): JwtClaims | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerEncoded, payloadEncoded, signatureProvided] = parts;

    // Verify signature
    const signatureInput = `${headerEncoded}.${payloadEncoded}`;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.AUTH_SECRET!)
      .update(signatureInput)
      .digest("base64url");

    if (signatureProvided !== expectedSignature) return null;

    // Decode payload
    const payload = JSON.parse(
      Buffer.from(payloadEncoded, "base64url").toString()
    ) as JwtClaims;

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// Hash an API token using SHA256 + base64
export function hashApiToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("base64");
}

// Generate a new API token in the format rb_{uuid}
export function generateApiToken(): string {
  const uuid = randomUUID().replace(/-/g, "");
  return `rb_${uuid}`;
}

// Extract bearer token from Authorization header
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^[Bb]earer\s+(.+)$/);
  return match ? match[1] : null;
}
