"use server";

import { createAuthenticatedClient } from "@/lib/graphql/client";
import {
  UPDATE_PROJECT_MUTATION,
  DELETE_PROJECT_MUTATION,
  CREATE_API_TOKEN_MUTATION,
  REVOKE_API_TOKEN_MUTATION,
  UPDATE_GITHUB_SETTINGS_MUTATION,
} from "@/lib/graphql/mutations";
import { getSession, createGraphQLToken } from "@/lib/auth";
import { revalidatePath } from "next/cache";

interface UpdateProjectInput {
  slug: string;
  name?: string;
  description?: string;
  public?: boolean;
}

export async function updateProject(
  input: UpdateProjectInput
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();

  if (!session?.user) {
    return { success: false, error: "Not authenticated" };
  }

  const token = await createGraphQLToken(session);
  const client = createAuthenticatedClient(token);

  const result = await client.mutation(UPDATE_PROJECT_MUTATION, {
    slug: input.slug,
    input: {
      name: input.name,
      description: input.description,
      public: input.public,
    },
  });

  if (result.error) {
    console.error("GraphQL error:", result.error);
    return { success: false, error: result.error.message };
  }

  revalidatePath(`/workspaces/${input.slug}`);
  revalidatePath(`/workspaces/${input.slug}/settings`);
  return { success: true };
}

export async function deleteProject(
  slug: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();

  if (!session?.user) {
    return { success: false, error: "Not authenticated" };
  }

  const token = await createGraphQLToken(session);
  const client = createAuthenticatedClient(token);

  const result = await client.mutation(DELETE_PROJECT_MUTATION, { slug });

  if (result.error) {
    console.error("GraphQL error:", result.error);
    return { success: false, error: result.error.message };
  }

  revalidatePath("/workspaces");
  return { success: true };
}

export async function createApiToken(
  name: string
): Promise<{ success: boolean; token?: { id: string; name: string }; secret?: string; error?: string }> {
  const session = await getSession();

  if (!session?.user) {
    return { success: false, error: "Not authenticated" };
  }

  const token = await createGraphQLToken(session);
  const client = createAuthenticatedClient(token);

  const result = await client.mutation(CREATE_API_TOKEN_MUTATION, { name });

  if (result.error) {
    console.error("GraphQL error:", result.error);
    return { success: false, error: result.error.message };
  }

  return {
    success: true,
    token: result.data.createApiToken.token,
    secret: result.data.createApiToken.secret,
  };
}

export async function revokeApiToken(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();

  if (!session?.user) {
    return { success: false, error: "Not authenticated" };
  }

  const token = await createGraphQLToken(session);
  const client = createAuthenticatedClient(token);

  const result = await client.mutation(REVOKE_API_TOKEN_MUTATION, { id });

  if (result.error) {
    console.error("GraphQL error:", result.error);
    return { success: false, error: result.error.message };
  }

  return { success: true };
}

interface UpdateGitHubSettingsInput {
  slug: string;
  githubRepo?: string;
  githubToken?: string;
  githubPrComments?: boolean;
  githubStatusChecks?: boolean;
}

export async function updateGitHubSettings(
  input: UpdateGitHubSettingsInput
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession();

  if (!session?.user) {
    return { success: false, error: "Not authenticated" };
  }

  const token = await createGraphQLToken(session);
  const client = createAuthenticatedClient(token);

  const result = await client.mutation(UPDATE_GITHUB_SETTINGS_MUTATION, {
    slug: input.slug,
    input: {
      githubRepo: input.githubRepo,
      githubToken: input.githubToken,
      githubPrComments: input.githubPrComments,
      githubStatusChecks: input.githubStatusChecks,
    },
  });

  if (result.error) {
    console.error("GraphQL error:", result.error);
    return { success: false, error: result.error.message };
  }

  revalidatePath(`/workspaces/${input.slug}`);
  revalidatePath(`/workspaces/${input.slug}/settings`);
  return { success: true };
}
