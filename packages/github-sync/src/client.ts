export interface RepositoryTarget {
  owner: string;
  repository: string;
  branch: string;
}

export interface CommitFile {
  path: string;
  content: string;
}

export interface AtomicCommitInput extends RepositoryTarget {
  message: string;
  files: CommitFile[];
}

export interface AtomicCommitResult {
  commitSha: string;
  treeSha: string;
  changed: boolean;
}

export class GitHubSyncError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "GitHubSyncError";
  }
}

export interface GitHubAtomicCommitClientOptions {
  token: string;
  fetch?: typeof fetch;
  apiBaseUrl?: string;
}

const defaultFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

export class GitHubAtomicCommitClient {
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly apiBaseUrl: string;

  constructor(options: GitHubAtomicCommitClientOptions) {
    this.token = options.token;
    this.fetchImpl = options.fetch ?? defaultFetch;
    this.apiBaseUrl = options.apiBaseUrl ?? "https://api.github.com";
  }

  async commitFiles(input: AtomicCommitInput): Promise<AtomicCommitResult> {
    validateInput(input);
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.commitFilesOnce(input);
      } catch (error) {
        lastError = error;
        if (
          !(error instanceof GitHubSyncError) ||
          !error.retryable ||
          attempt === 1
        ) {
          throw error;
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("GitHub commit failed");
  }

  private async commitFilesOnce(
    input: AtomicCommitInput,
  ): Promise<AtomicCommitResult> {
    const repositoryPath = `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}`;
    const refPath = `${repositoryPath}/git/ref/heads/${encodeURIComponent(input.branch)}`;
    let bootstrapped = false;
    let ref: { object: { sha: string } };
    try {
      ref = await this.request(refPath, { method: "GET" });
    } catch (cause) {
      if (!isEmptyRepositoryError(cause)) throw cause;
      await this.bootstrapEmptyRepository(repositoryPath, input);
      bootstrapped = true;
      ref = await this.request(refPath, { method: "GET" });
    }
    const parentSha = ref.object.sha;
    const parent = await this.request<{ tree: { sha: string } }>(
      `${repositoryPath}/git/commits/${parentSha}`,
      { method: "GET" },
    );

    if (
      await this.filesAlreadyMatch(repositoryPath, parent.tree.sha, input.files)
    ) {
      return {
        commitSha: parentSha,
        treeSha: parent.tree.sha,
        changed: bootstrapped,
      };
    }

    const blobs = await Promise.all(
      input.files.map(async (file) => {
        const blob = await this.request<{ sha: string }>(
          `${repositoryPath}/git/blobs`,
          {
            method: "POST",
            body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
          },
        );
        return { path: file.path, sha: blob.sha };
      }),
    );

    const tree = await this.request<{ sha: string }>(
      `${repositoryPath}/git/trees`,
      {
        method: "POST",
        body: JSON.stringify({
          base_tree: parent.tree.sha,
          tree: blobs.map((blob) => ({
            path: blob.path,
            mode: "100644",
            type: "blob",
            sha: blob.sha,
          })),
        }),
      },
    );

    const commit = await this.request<{ sha: string }>(
      `${repositoryPath}/git/commits`,
      {
        method: "POST",
        body: JSON.stringify({
          message: input.message,
          tree: tree.sha,
          parents: [parentSha],
        }),
      },
    );

    await this.request(
      `${repositoryPath}/git/refs/heads/${encodeURIComponent(input.branch)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ sha: commit.sha, force: false }),
      },
    );

    return { commitSha: commit.sha, treeSha: tree.sha, changed: true };
  }

  private async bootstrapEmptyRepository(
    repositoryPath: string,
    input: AtomicCommitInput,
  ): Promise<void> {
    const firstFile = input.files[0];
    if (!firstFile) throw new TypeError("at least one file is required");
    const contentPath = firstFile.path
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    await this.request(`${repositoryPath}/contents/${contentPath}`, {
      method: "PUT",
      body: JSON.stringify({
        message: "chore: initialize repository for LeetCodeDaily",
        content: encodeBase64(firstFile.content),
      }),
    });
  }

  private async filesAlreadyMatch(
    repositoryPath: string,
    treeSha: string,
    files: CommitFile[],
  ): Promise<boolean> {
    const tree = await this.request<{
      truncated?: boolean;
      tree: Array<{ path?: string; type?: string; sha?: string }>;
    }>(`${repositoryPath}/git/trees/${treeSha}?recursive=1`, { method: "GET" });
    if (tree.truncated) return false;

    const entries = new Map(
      tree.tree
        .filter(
          (entry): entry is { path: string; type: "blob"; sha: string } =>
            entry.type === "blob" &&
            typeof entry.path === "string" &&
            typeof entry.sha === "string",
        )
        .map((entry) => [entry.path, entry.sha]),
    );

    for (const file of files) {
      const sha = entries.get(file.path);
      if (!sha) return false;
      const blob = await this.request<{ content?: string; encoding?: string }>(
        `${repositoryPath}/git/blobs/${sha}`,
        { method: "GET" },
      );
      if (blob.encoding !== "base64" || typeof blob.content !== "string") {
        return false;
      }
      if (decodeBase64(blob.content) !== file.content) return false;
    }
    return true;
  }

  private async request<T = unknown>(
    path: string,
    init: RequestInit,
  ): Promise<T> {
    const response = await this.fetchImpl(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2026-03-10",
        ...init.headers,
      },
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      throw new GitHubSyncError(
        body?.message ?? `GitHub returned HTTP ${response.status}`,
        response.status,
        response.status === 409 ||
          response.status === 422 ||
          response.status === 429 ||
          response.status >= 500,
      );
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}

function decodeBase64(value: string): string {
  const binary = atob(value.replaceAll(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function isEmptyRepositoryError(cause: unknown): boolean {
  return (
    cause instanceof GitHubSyncError &&
    cause.status === 409 &&
    cause.message.toLowerCase().includes("repository is empty")
  );
}

function validateInput(input: AtomicCommitInput): void {
  if (!input.owner || !input.repository || !input.branch) {
    throw new TypeError("owner, repository and branch are required");
  }
  if (!input.message.trim()) {
    throw new TypeError("commit message is required");
  }
  if (input.files.length === 0) {
    throw new TypeError("at least one file is required");
  }

  const paths = new Set<string>();
  for (const file of input.files) {
    if (
      !file.path ||
      file.path.startsWith("/") ||
      file.path.includes("..") ||
      file.path.includes("\\")
    ) {
      throw new TypeError(`unsafe repository path: ${file.path}`);
    }
    if (paths.has(file.path)) {
      throw new TypeError(`duplicate repository path: ${file.path}`);
    }
    paths.add(file.path);
  }
}
