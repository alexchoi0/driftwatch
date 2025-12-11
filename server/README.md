# Driftwatch Server

Next.js application providing the web dashboard and GraphQL API for Driftwatch.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: PostgreSQL (via Docker Compose)
- **ORM**: Prisma
- **Auth**: Better Auth (GitHub OAuth)
- **GraphQL**: graphql-yoga
- **Styling**: Tailwind CSS + shadcn/ui

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- Docker (for PostgreSQL)

### Database Setup

Start the PostgreSQL database:

```bash
docker compose up -d
```

### Environment Variables

Copy the example file and configure:

```bash
cp .env.example .env.local
```

Required variables:

```bash
# Database
DATABASE_URL="postgresql://driftwatch:driftwatch@localhost:5433/driftwatch"
DIRECT_URL="postgresql://driftwatch:driftwatch@localhost:5433/driftwatch"

# Better Auth
BETTER_AUTH_SECRET="your-secret-key-at-least-32-characters"
BETTER_AUTH_URL="http://localhost:3000"

# GitHub OAuth (create at https://github.com/settings/developers)
# Callback URL: http://localhost:3000/api/auth/callback/github
GITHUB_CLIENT_ID="your_github_client_id"
GITHUB_CLIENT_SECRET="your_github_client_secret"
```

### Installation

```bash
pnpm install
```

### Database Migration

```bash
# Push schema to database
pnpm exec prisma db push

# Generate Prisma client
pnpm exec prisma generate
```

### Development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production Build

```bash
pnpm build
pnpm start
```

## Project Structure

```
server/
├── prisma/
│   └── schema.prisma      # Database schema
├── src/
│   ├── app/
│   │   ├── (auth)/        # Auth pages (login, etc.)
│   │   ├── (dashboard)/   # Dashboard pages
│   │   ├── api/
│   │   │   ├── auth/      # Better Auth handler
│   │   │   └── graphql/   # GraphQL endpoint
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/            # shadcn/ui components
│   │   └── ...            # App components
│   └── lib/
│       ├── auth.ts        # Better Auth configuration
│       ├── auth-client.ts # Client-side auth
│       ├── db/
│       │   ├── prisma.ts  # Prisma client
│       │   └── queries.ts # Database queries
│       └── graphql/
│           ├── schema.ts  # GraphQL schema
│           └── context.ts # GraphQL context
└── package.json
```

## API

### GraphQL Endpoint

`POST /api/graphql`

Authentication via Bearer token:
```
Authorization: Bearer <api_token>
```

### Key Queries

```graphql
# Get current user
query {
  me {
    id
    email
    name
  }
}

# List projects
query {
  projects {
    id
    slug
    name
  }
}

# Get project details
query {
  project(slug: "my-project") {
    id
    name
    branches { id name }
    testbeds { id name }
    benchmarks { id name }
    measures { id name units }
  }
}

# Performance data
query {
  perf(
    projectSlug: "my-project"
    branches: ["branch-id"]
    testbeds: ["testbed-id"]
    benchmarks: ["benchmark-id"]
    measures: ["measure-id"]
  ) {
    series {
      benchmark { id name }
      branch { id name }
      data { x y gitHash }
    }
  }
}
```

### Key Mutations

```graphql
# Create project
mutation {
  createProject(input: {
    slug: "my-project"
    name: "My Project"
  }) {
    id
    slug
  }
}

# Submit benchmark report
mutation {
  createReport(input: {
    projectSlug: "my-project"
    branch: "main"
    testbed: "ci-linux"
    gitHash: "abc123"
    metrics: [
      {
        benchmark: "parse_json"
        measure: "nanoseconds"
        value: 1234.56
      }
    ]
  }) {
    id
    alerts {
      id
      percentChange
    }
  }
}
```

## Authentication

### Web (Dashboard)

Uses Better Auth with GitHub OAuth. Session is stored in cookies.

### API (CLI/CI)

Uses API tokens in the format `dw_<uuid>`. Tokens are hashed (SHA256) before storage.

Create tokens in the dashboard settings or via the CLI browser auth flow.

## Dev Mode

For local development without GitHub OAuth:

```bash
DEV_MODE=true
DEV_API_TOKEN=dw_your_test_token  # Optional: use real user
```

When `DEV_MODE=true`:
- Auth is bypassed with a mock user
- If `DEV_API_TOKEN` is set, looks up the real user from the database
