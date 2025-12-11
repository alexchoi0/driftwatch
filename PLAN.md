# Flamegraph Upload Feature Implementation Plan

## Overview
Add the ability for the CLI to upload flamegraph SVG files alongside benchmark reports, storing them in Supabase Storage, and rendering them in the dashboard.

## Architecture

```
CLI (--flamegraph flag)
    → Read SVG file
    → Upload to Supabase Storage via signed URL
    → Include storage path in createReport mutation

Server
    → Generate signed upload URL (new mutation)
    → Store flamegraph reference in database
    → Serve flamegraphs via signed read URLs

Frontend
    → Display flamegraph viewer in report details
    → Interactive SVG rendering with zoom/pan
```

## Implementation Steps

### 1. Database Schema Changes
**File**: `server/prisma/schema.prisma`

Add a new `Flamegraph` model linked to reports:
```prisma
model Flamegraph {
  id          String   @id @default(uuid())
  reportId    String
  report      Report   @relation(fields: [reportId], references: [id], onDelete: Cascade)
  benchmarkId String?  // Optional: link to specific benchmark
  benchmark   Benchmark? @relation(fields: [benchmarkId], references: [id])
  storagePath String   // Path in Supabase storage bucket
  fileName    String   // Original filename
  fileSize    Int      // Size in bytes
  createdAt   DateTime @default(now())

  @@index([reportId])
}
```

Update `Report` model to include flamegraphs relation:
```prisma
model Report {
  // ... existing fields
  flamegraphs Flamegraph[]
}
```

### 2. Supabase Storage Configuration
**File**: `server/supabase/config.toml`

Add flamegraphs bucket:
```toml
[storage.buckets.flamegraphs]
public = false
file_size_limit = "10MiB"
allowed_mime_types = ["image/svg+xml"]
```

### 3. Server-Side Changes

#### 3a. GraphQL Schema Updates
**File**: `server/src/lib/graphql/schema.ts`

Add new types and mutations:
```graphql
type Flamegraph {
  id: ID!
  storagePath: String!
  fileName: String!
  fileSize: Int!
  url: String!  # Signed URL for viewing
  benchmark: Benchmark
  createdAt: DateTime!
}

type UploadUrlResponse {
  uploadUrl: String!
  storagePath: String!
}

extend type Report {
  flamegraphs: [Flamegraph!]!
}

extend type Mutation {
  # Get a signed URL for uploading a flamegraph
  createFlamegraphUploadUrl(
    projectSlug: String!
    fileName: String!
    fileSize: Int!
  ): UploadUrlResponse!

  # Confirm upload and link to report
  confirmFlamegraphUpload(
    reportId: ID!
    storagePath: String!
    fileName: String!
    fileSize: Int!
    benchmarkName: String  # Optional: link to specific benchmark
  ): Flamegraph!
}

extend type Query {
  # Get signed URL for viewing a flamegraph
  flamegraphUrl(id: ID!): String!
}
```

#### 3b. Supabase Storage Client
**File**: `server/src/lib/supabase/storage.ts` (new file)

```typescript
import { createClient } from '@supabase/supabase-js'

const BUCKET_NAME = 'flamegraphs'

export async function createSignedUploadUrl(
  projectId: string,
  fileName: string
): Promise<{ uploadUrl: string; storagePath: string }> {
  // Generate unique path: projects/{projectId}/flamegraphs/{uuid}_{filename}
  // Create signed upload URL with 1 hour expiry
}

export async function createSignedReadUrl(
  storagePath: string
): Promise<string> {
  // Create signed read URL with 1 hour expiry
}

export async function deleteFile(storagePath: string): Promise<void> {
  // Delete file from storage
}
```

#### 3c. GraphQL Resolvers
**File**: `server/src/lib/graphql/schema.ts`

Implement the mutations:
- `createFlamegraphUploadUrl`: Validate project ownership, generate signed URL
- `confirmFlamegraphUpload`: Verify file exists in storage, create database record
- `flamegraphUrl`: Generate signed read URL for viewing

### 4. CLI Changes

#### 4a. Add Flamegraph Flag to Run Command
**File**: `cli/src/commands/run.rs`

Add new CLI arguments:
```rust
#[derive(Args)]
pub struct RunArgs {
    // ... existing args

    /// Path to flamegraph SVG file(s) to upload
    #[arg(long, value_name = "FILE")]
    flamegraph: Vec<PathBuf>,
}
```

#### 4b. Implement Upload Flow
**File**: `cli/src/api.rs`

Add new API methods:
```rust
impl ApiClient {
    pub async fn get_flamegraph_upload_url(
        &self,
        project_slug: &str,
        file_name: &str,
        file_size: i64,
    ) -> Result<UploadUrlResponse> { ... }

    pub async fn upload_flamegraph(
        &self,
        upload_url: &str,
        file_path: &Path,
    ) -> Result<()> { ... }

    pub async fn confirm_flamegraph_upload(
        &self,
        report_id: &str,
        storage_path: &str,
        file_name: &str,
        file_size: i64,
        benchmark_name: Option<&str>,
    ) -> Result<Flamegraph> { ... }
}
```

#### 4c. Update Run Command Logic
**File**: `cli/src/commands/run.rs`

After creating the report:
1. For each `--flamegraph` file:
   - Validate it's a valid SVG file
   - Get signed upload URL
   - Upload file to Supabase Storage
   - Confirm upload and link to report

### 5. Frontend Changes

#### 5a. Flamegraph Viewer Component
**File**: `server/src/components/flamegraph-viewer.tsx` (new file)

Interactive SVG viewer with:
- Zoom in/out controls
- Pan functionality
- Full-screen mode
- Download button

#### 5b. Update Report Display
**File**: `server/src/app/(dashboard)/workspaces/[slug]/page.tsx`

Add flamegraph section to Reports tab:
- List flamegraphs attached to each report
- Click to open viewer modal
- Show benchmark association if present

#### 5c. GraphQL Query Updates
**File**: `server/src/lib/graphql/queries.ts`

Update report queries to include flamegraphs:
```graphql
query GetReport($id: ID!) {
  report(id: $id) {
    # ... existing fields
    flamegraphs {
      id
      fileName
      url
      benchmark { name }
    }
  }
}
```

## CLI Usage Examples

```bash
# Upload benchmark results with a single flamegraph
driftwatch run -p my-project -b main --flamegraph ./profile.svg ./run-benchmarks.sh

# Upload with multiple flamegraphs
driftwatch run -p my-project -b main \
  --flamegraph ./cpu-profile.svg \
  --flamegraph ./memory-profile.svg \
  ./run-benchmarks.sh

# Dry run to preview
driftwatch run -p my-project -b main --flamegraph ./profile.svg --dry-run ./run-benchmarks.sh
```

## File Size and Validation

- Maximum file size: 10 MiB per flamegraph
- Allowed MIME type: `image/svg+xml`
- CLI validates SVG structure before upload
- Server validates file exists after upload confirmation

## Security Considerations

1. **Signed URLs**: All storage access uses time-limited signed URLs (1 hour)
2. **Project Ownership**: Users can only upload to projects they own
3. **Content Validation**: SVG files are validated on client and server
4. **Bucket Privacy**: Storage bucket is private, no public access

## Migration Steps

1. Run Prisma migration for new schema
2. Create Supabase storage bucket
3. Deploy server changes
4. Release CLI update

## Testing Plan

1. Unit tests for SVG validation in CLI
2. Integration tests for upload flow
3. E2E test for full CLI → Storage → Dashboard flow
4. Test error handling (invalid files, network failures, etc.)
