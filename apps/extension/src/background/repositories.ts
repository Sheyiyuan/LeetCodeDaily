import type { GitHubRepositorySummary } from "../shared/messages";
import { githubAccessToken } from "./auth";
import { GitHubRepositoryClient } from "./github-api";

async function client(): Promise<GitHubRepositoryClient> {
  const token = await githubAccessToken();
  if (!token) throw new Error("尚未连接 GitHub");
  return new GitHubRepositoryClient(token);
}

export async function readAuthorizedRepositories(): Promise<
  GitHubRepositorySummary[]
> {
  return (await client()).listAuthorizedRepositories();
}

export async function readRepositoryBranches(
  repository: string,
): Promise<string[]> {
  return (await client()).listBranches(repository);
}
