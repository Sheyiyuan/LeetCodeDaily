import type { GitHubRepositorySummary } from "../shared/messages";

interface GitHubInstallation {
  id: number;
}

interface GitHubRepositoryResponse {
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  owner: { login: string };
}

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
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly apiBaseUrl = "https://api.github.com",
  ) {}

  async listAuthorizedRepositories(): Promise<GitHubRepositorySummary[]> {
    const installations = await this.collectPages<GitHubInstallation>(
      "/user/installations",
      "installations",
    );
    const repositories = (
      await Promise.all(
        installations.map((installation) =>
          this.collectPages<GitHubRepositoryResponse>(
            `/user/installations/${installation.id}/repositories`,
            "repositories",
          ),
        ),
      )
    ).flat();

    return [...new Map(repositories.map((repository) => [repository.full_name, repository])).values()]
      .map((repository) => ({
        fullName: repository.full_name,
        owner: repository.owner.login,
        name: repository.name,
        defaultBranch: repository.default_branch,
        private: repository.private,
      }))
      .sort((left, right) => left.fullName.localeCompare(right.fullName));
  }

  async listBranches(repository: string): Promise<string[]> {
    const [owner, name, ...rest] = repository.split("/");
    if (!owner || !name || rest.length > 0) {
      throw new TypeError("GitHub 仓库必须使用 owner/repository 格式");
    }
    const branches = await this.collectArrayPages<{ name: string }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/branches`,
    );
    return [...new Set(branches.map((branch) => branch.name))].sort((left, right) =>
      left.localeCompare(right),
    );
  }

  private async collectPages<T>(path: string, key: string): Promise<T[]> {
    const values: T[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const payload = await this.request<Record<string, unknown>>(
        `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
      );
      const items = payload[key];
      if (!Array.isArray(items)) throw new Error(`GitHub 响应缺少 ${key}`);
      values.push(...(items as T[]));
      if (items.length < 100) break;
    }
    return values;
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
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "X-GitHub-Api-Version": "2026-03-10",
      },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new GitHubApiError(
        body?.message ?? `GitHub returned HTTP ${response.status}`,
        response.status,
      );
    }
    return (await response.json()) as T;
  }
}
