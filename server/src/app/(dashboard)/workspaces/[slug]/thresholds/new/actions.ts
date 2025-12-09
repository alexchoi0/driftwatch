"use server";

import { createAuthenticatedClient } from "@/lib/graphql/client";
import { CREATE_THRESHOLD_MUTATION } from "@/lib/graphql/mutations";
import { getSession, createGraphQLToken } from "@/lib/auth";
import { revalidatePath } from "next/cache";

interface CreateThresholdInput {
  projectSlug: string;
  measureId: string;
  branchId?: string;
  testbedId?: string;
  upperBoundary?: number;
  lowerBoundary?: number;
  minSampleSize?: number;
}

export async function createThreshold(
  input: CreateThresholdInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  const session = await getSession();

  if (!session?.user) {
    return { success: false, error: "Not authenticated" };
  }

  const token = await createGraphQLToken(session);
  const client = createAuthenticatedClient(token);

  const result = await client.mutation(CREATE_THRESHOLD_MUTATION, {
    input: {
      projectSlug: input.projectSlug,
      measureId: input.measureId,
      branchId: input.branchId || null,
      testbedId: input.testbedId || null,
      upperBoundary: input.upperBoundary,
      lowerBoundary: input.lowerBoundary,
      minSampleSize: input.minSampleSize ?? 2,
    },
  });

  if (result.error) {
    console.error("GraphQL error:", result.error);
    return { success: false, error: result.error.message };
  }

  revalidatePath(`/workspaces/${input.projectSlug}`);
  return { success: true, id: result.data.createThreshold.id };
}
