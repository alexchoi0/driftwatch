import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getPrisma } from "@/lib/db/prisma";
import { createSignedReadUrl } from "@/lib/storage";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const prisma = await getPrisma();

  // Fetch flamegraph and verify ownership
  const flamegraph = await prisma.flamegraph.findUnique({
    where: { id },
    include: {
      report: {
        include: {
          project: {
            select: { userId: true },
          },
        },
      },
    },
  });

  if (!flamegraph) {
    return NextResponse.json({ error: "Flamegraph not found" }, { status: 404 });
  }

  // Verify the user owns this project
  if (flamegraph.report.project.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const signedUrl = await createSignedReadUrl(flamegraph.storagePath);
    return NextResponse.json({ url: signedUrl });
  } catch (error) {
    console.error("Failed to create signed URL:", error);
    return NextResponse.json(
      { error: "Failed to generate flamegraph URL" },
      { status: 500 }
    );
  }
}
