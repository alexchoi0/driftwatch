"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { triggerNavigationStart } from "@/components/progress-bar";
import { Copy, Eye, EyeOff, Trash2, Plus, Github } from "lucide-react";
import {
  updateProject,
  deleteProject,
  createApiToken,
  revokeApiToken,
  updateGitHubSettings,
} from "./actions";

interface ProjectData {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  public: boolean;
  githubRepo: string | null;
  githubPrComments: boolean;
  githubStatusChecks: boolean;
  hasGithubToken: boolean;
}

interface ApiToken {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export default function SettingsPage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;

  const [project, setProject] = useState<ProjectData | null>(null);
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Delete state
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  // Token state
  const [newTokenName, setNewTokenName] = useState("");
  const [isCreatingToken, setIsCreatingToken] = useState(false);
  const [newTokenSecret, setNewTokenSecret] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  // GitHub settings state
  const [githubRepo, setGithubRepo] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [githubPrComments, setGithubPrComments] = useState(false);
  const [githubStatusChecks, setGithubStatusChecks] = useState(false);
  const [hasGithubToken, setHasGithubToken] = useState(false);
  const [isSavingGithub, setIsSavingGithub] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [githubSuccess, setGithubSuccess] = useState(false);

  // Fetch project data
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `
              query GetProjectSettings($slug: String!) {
                project(slug: $slug) {
                  id
                  slug
                  name
                  description
                  public
                  githubRepo
                  githubPrComments
                  githubStatusChecks
                  hasGithubToken
                }
                me {
                  apiTokens {
                    id
                    name
                    createdAt
                    lastUsedAt
                  }
                }
              }
            `,
            variables: { slug },
          }),
        });
        const data = await res.json();
        if (data.errors) {
          setFetchError(data.errors[0]?.message || "Failed to load settings");
          return;
        }
        if (!data.data?.project) {
          setFetchError("Project not found");
          return;
        }
        const proj = data.data.project;
        setProject(proj);
        setName(proj.name);
        setDescription(proj.description || "");
        setIsPublic(proj.public);
        setGithubRepo(proj.githubRepo || "");
        setGithubPrComments(proj.githubPrComments);
        setGithubStatusChecks(proj.githubStatusChecks);
        setHasGithubToken(proj.hasGithubToken);
        setTokens(data.data.me?.apiTokens || []);
      } catch (err) {
        setFetchError("Failed to load settings");
        console.error(err);
      }
    }
    fetchData();
  }, [slug]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const result = await updateProject({
      slug,
      name,
      description: description || undefined,
      public: isPublic,
    });

    setIsSaving(false);

    if (!result.success) {
      setSaveError(result.error || "Failed to save");
      return;
    }

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  }

  async function handleDelete() {
    if (deleteConfirmation !== slug) return;

    setIsDeleting(true);
    const result = await deleteProject(slug);

    if (!result.success) {
      setIsDeleting(false);
      return;
    }

    triggerNavigationStart();
    router.push("/workspaces");
  }

  async function handleCreateToken(e: React.FormEvent) {
    e.preventDefault();
    if (!newTokenName.trim()) return;

    setIsCreatingToken(true);
    setTokenError(null);

    const result = await createApiToken(newTokenName.trim());

    setIsCreatingToken(false);

    if (!result.success) {
      setTokenError(result.error || "Failed to create token");
      return;
    }

    if (result.token && result.secret) {
      const newToken: ApiToken = {
        id: result.token.id,
        name: result.token.name,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
      };
      setTokens([...tokens, newToken]);
      setNewTokenSecret(result.secret);
      setNewTokenName("");
    }
  }

  async function handleRevokeToken(tokenId: string) {
    const result = await revokeApiToken(tokenId);

    if (result.success) {
      setTokens(tokens.filter((t) => t.id !== tokenId));
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  async function handleSaveGithub(e: React.FormEvent) {
    e.preventDefault();
    setIsSavingGithub(true);
    setGithubError(null);
    setGithubSuccess(false);

    const result = await updateGitHubSettings({
      slug,
      githubRepo: githubRepo || undefined,
      // Only send token if it was changed (not empty placeholder)
      githubToken: githubToken || undefined,
      githubPrComments,
      githubStatusChecks,
    });

    setIsSavingGithub(false);

    if (!result.success) {
      setGithubError(result.error || "Failed to save GitHub settings");
      return;
    }

    // Update hasGithubToken if a new token was provided
    if (githubToken) {
      setHasGithubToken(true);
      setGithubToken(""); // Clear the input after saving
    }

    setGithubSuccess(true);
    setTimeout(() => setGithubSuccess(false), 3000);
  }

  if (fetchError) {
    return (
      <div className="max-w-3xl">
        <Card>
          <CardContent className="pt-6">
            <p className="text-destructive">{fetchError}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => router.back()}
            >
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="max-w-3xl">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-48"></div>
          <div className="h-64 bg-muted rounded"></div>
          <div className="h-48 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
        <Link href="/workspaces" className="hover:underline">
          Workspaces
        </Link>
        <span>/</span>
        <Link href={`/workspaces/${slug}`} className="hover:underline">
          {slug}
        </Link>
        <span>/</span>
        <span>Settings</span>
      </div>

      <h1 className="text-3xl font-bold">Settings</h1>

      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>
            Update your workspace name and description
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="public">Public Workspace</Label>
                <p className="text-sm text-muted-foreground">
                  Make this workspace visible to everyone
                </p>
              </div>
              <Switch
                id="public"
                checked={isPublic}
                onCheckedChange={setIsPublic}
              />
            </div>

            {saveError && (
              <p className="text-sm text-destructive">{saveError}</p>
            )}
            {saveSuccess && (
              <p className="text-sm text-green-600">Settings saved!</p>
            )}

            <Button type="submit" loading={isSaving}>
              Save Changes
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* API Tokens */}
      <Card>
        <CardHeader>
          <CardTitle>API Tokens</CardTitle>
          <CardDescription>
            Create tokens for CLI authentication
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* New token secret display */}
          {newTokenSecret && (
            <div className="rounded-lg border border-green-500 bg-green-50 dark:bg-green-950/20 p-4">
              <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-2">
                Token created! Copy it now - you won&apos;t see it again.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded bg-background px-2 py-1 font-mono text-sm">
                  {showSecret ? newTokenSecret : "•".repeat(40)}
                </code>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setShowSecret(!showSecret)}
                >
                  {showSecret ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => copyToClipboard(newTokenSecret)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setNewTokenSecret(null)}
              >
                Done
              </Button>
            </div>
          )}

          {/* Create token form */}
          <form onSubmit={handleCreateToken} className="flex gap-2">
            <Input
              placeholder="Token name (e.g., CI/CD)"
              value={newTokenName}
              onChange={(e) => setNewTokenName(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" loading={isCreatingToken} disabled={!newTokenName.trim()}>
              <Plus className="h-4 w-4 mr-1" />
              Create Token
            </Button>
          </form>

          {tokenError && (
            <p className="text-sm text-destructive">{tokenError}</p>
          )}

          {/* Token list */}
          {tokens.length > 0 ? (
            <div className="space-y-2">
              {tokens.map((token) => (
                <div
                  key={token.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium">{token.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(token.createdAt).toLocaleDateString()}
                      {token.lastUsedAt && (
                        <> · Last used {new Date(token.lastUsedAt).toLocaleDateString()}</>
                      )}
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon-sm">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Revoke Token</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to revoke &quot;{token.name}&quot;? Any
                          applications using this token will lose access.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleRevokeToken(token.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Revoke
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4">
              No API tokens yet. Create one to use with the CLI.
            </p>
          )}
        </CardContent>
      </Card>

      {/* GitHub Integration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            GitHub Integration
          </CardTitle>
          <CardDescription>
            Connect to GitHub for PR comments and status checks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveGithub} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="githubRepo">Repository</Label>
              <Input
                id="githubRepo"
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
                placeholder="owner/repo"
              />
              <p className="text-xs text-muted-foreground">
                The GitHub repository to post comments to (e.g., owner/repo)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="githubToken">Personal Access Token</Label>
              <Input
                id="githubToken"
                type="password"
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder={hasGithubToken ? "••••••••••••••••" : "ghp_..."}
              />
              <p className="text-xs text-muted-foreground">
                {hasGithubToken
                  ? "A token is configured. Enter a new token to replace it."
                  : "Create a token with 'repo' scope at GitHub Settings > Developer settings > Personal access tokens"}
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="prComments">PR Comments</Label>
                  <p className="text-sm text-muted-foreground">
                    Post benchmark results as PR comments
                  </p>
                </div>
                <Switch
                  id="prComments"
                  checked={githubPrComments}
                  onCheckedChange={setGithubPrComments}
                  disabled={!githubRepo}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="statusChecks">Status Checks</Label>
                  <p className="text-sm text-muted-foreground">
                    Report performance regressions as commit status
                  </p>
                </div>
                <Switch
                  id="statusChecks"
                  checked={githubStatusChecks}
                  onCheckedChange={setGithubStatusChecks}
                  disabled={!githubRepo}
                />
              </div>
            </div>

            {githubError && (
              <p className="text-sm text-destructive">{githubError}</p>
            )}
            {githubSuccess && (
              <p className="text-sm text-green-600">GitHub settings saved!</p>
            )}

            <Button type="submit" loading={isSavingGithub}>
              Save GitHub Settings
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Irreversible actions for this workspace
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Delete Workspace</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Workspace</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the workspace &quot;{project.name}&quot; and
                  all associated data including benchmarks, reports, and alerts.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-4">
                <Label htmlFor="confirm">
                  Type <span className="font-mono font-bold">{slug}</span> to
                  confirm
                </Label>
                <Input
                  id="confirm"
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  className="mt-2"
                  placeholder={slug}
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setDeleteConfirmation("")}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={deleteConfirmation !== slug || isDeleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeleting ? "Deleting..." : "Delete Workspace"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
