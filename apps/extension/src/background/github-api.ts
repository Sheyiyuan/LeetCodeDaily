const defaultFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export class GitHubRepositoryClient {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = defaultFetch,
    private readonly apiBaseUrl = "https://api.github.com",
  ) {}

  async assertWritable(repository: string, branch: string): Promise<void> {
    const scopesResponse = await this.fetchImpl(`${this.apiBaseUrl}/user`, {
      headers: this.headers(),
    });
    if (!scopesResponse.ok) {
      await this.throwResponseError(scopesResponse);
    }
    const scopes = (scopesResponse.headers.get("X-OAuth-Scopes") ?? "")
      .split(",")
      .map((scope) => scope.trim().toLowerCase());
    if (!scopes.includes("repo")) {
      throw new GitHubApiError(
        "当前连接不是具有 repo 权限的 GitHub OAuth App。请断开 GitHub 后重新连接，再继续导入。",
        403,
      );
    }

    const [owner, name, ...rest] = repository.split("/");
    if (!owner || !name || rest.length > 0) {
      throw new TypeError("GitHub 仓库必须使用 owner/repository 格式");
    }
    const repositoryPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
    const metadata = await this.request<{
      permissions?: { push?: boolean };
      size?: number;
    }>(repositoryPath);
    if (metadata.permissions?.push !== true) {
      throw new GitHubApiError(
        "当前 GitHub 账号没有该仓库的写权限，请检查 owner/repository 后重试。",
        403,
      );
    }
    if (metadata.size !== 0) {
      await this.request(`${repositoryPath}/git/ref/heads/${encodeURIComponent(branch)}`);
    }
  }

  async listBranches(repository: string): Promise<string[]> {
    const [owner, name, ...rest] = repository.split("/");
    if (!owner || !name || rest.length > 0) {
      throw new TypeError("GitHub 仓库必须使用 owner/repository 格式");
    }
    const repositoryPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
    const metadata = await this.request<{ default_branch?: string }>(repositoryPath);
    const branches = await this.collectArrayPages<{ name: string }>(`${repositoryPath}/branches`);
    const unique = [...new Set(branches.map((branch) => branch.name))];
    const defaultBranch = metadata.default_branch;
    return unique.sort((left, right) => {
      if (left === defaultBranch) return -1;
      if (right === defaultBranch) return 1;
      return left.localeCompare(right);
    });
  }

  private async collectArrayPages<T>(path: string): Promise<T[]> {
    const values: T[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const items = await this.request<T[]>(
        `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
      );
      if (!Array.isArray(items)) throw new Error("GitHub 返回了无效列表");
      values.push(...items);
      if (items.length < 100) break;
    }
    return values;
  }

  private async request<T>(path: string): Promise<T> {
    const response = await this.fetchImpl(`${this.apiBaseUrl}${path}`, {
      headers: this.headers(),
    });
    if (!response.ok) {
      await this.throwResponseError(response);
    }
    return (await response.json()) as T;
  }

  private headers(): HeadersInit {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.token}`,
      "X-GitHub-Api-Version": "2026-03-10",
    };
  }

  private async throwResponseError(response: Response): Promise<never> {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new GitHubApiError(
      body?.message ?? `GitHub returned HTTP ${response.status}`,
      response.status,
    );
  }
}
