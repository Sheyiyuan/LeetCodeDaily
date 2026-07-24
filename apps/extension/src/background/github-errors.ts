import { GitHubSyncError } from "@leetcode-daily/github-sync";

export const GITHUB_REPOSITORY_PERMISSION_MESSAGE =
  "GitHub App 无权写入该仓库。请将 Repository permissions > Contents 设为 Read and write，并在 GitHub 安装设置中批准新权限；重新连接 GitHub 后点击重试，无需再次提交题目。";

export function isRepositoryPermissionFailure(message: string): boolean {
  return message.trim().toLowerCase() === "resource not accessible by integration";
}

export function githubSyncFailureMessage(cause: unknown): string {
  if (
    cause instanceof GitHubSyncError &&
    cause.status === 403 &&
    (isRepositoryPermissionFailure(cause.message) ||
      cause.acceptedPermissions?.toLowerCase().includes("contents=write"))
  ) {
    return GITHUB_REPOSITORY_PERMISSION_MESSAGE;
  }
  if (cause instanceof GitHubSyncError && cause.status === 401) {
    return "GitHub 授权已失效。请在设置页断开并重新连接 GitHub，然后点击重试。";
  }
  if (cause instanceof GitHubSyncError && cause.status === 404) {
    return "GitHub 无法访问目标仓库或分支。请确认 GitHub App 已安装并授权该仓库，在设置页刷新后重新选择仓库和分支。";
  }
  return cause instanceof Error && cause.message.trim() ? cause.message.trim() : "GitHub 提交失败";
}

export function displayStoredSyncFailure(message: string): string {
  return isRepositoryPermissionFailure(message) ? GITHUB_REPOSITORY_PERMISSION_MESSAGE : message;
}
