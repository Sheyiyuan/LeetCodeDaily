import { useEffect, useState } from "react";

import type {
  ExtensionSettings,
  GitHubAuthState,
  MessageResponse,
} from "../shared/messages";

const FALLBACK: ExtensionSettings = {
  timezone: "Asia/Shanghai",
  githubRepository: null,
  githubBranch: "main",
  githubRootDirectory: "solutions",
  heatmapPublicEnabled: false,
};

export function App() {
  const [settings, setSettings] = useState(FALLBACK);
  const [github, setGithub] = useState<GitHubAuthState>({
    connected: false,
    login: null,
    sessionExpiresAt: null,
    heatmapUrl: null,
  });
  const [saved, setSaved] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      chrome.runtime.sendMessage({ type: "settings-read" }),
      chrome.runtime.sendMessage({ type: "github-auth-read" }),
    ]).then(([settingsResponse, authResponse]: [
      MessageResponse<ExtensionSettings>,
      MessageResponse<GitHubAuthState>,
    ]) => {
      if (settingsResponse.ok && settingsResponse.data) {
        setSettings(settingsResponse.data);
      }
      if (authResponse.ok && authResponse.data) {
        setGithub(authResponse.data);
      }
    });
  }, []);

  async function toggleGitHub() {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const response = (await chrome.runtime.sendMessage({
        type: github.connected ? "github-disconnect" : "github-connect",
      })) as MessageResponse<GitHubAuthState>;
      if (!response.ok) throw new Error(response.error ?? "GitHub 操作失败");
      setGithub(
        response.data ?? {
          connected: false,
          login: null,
          sessionExpiresAt: null,
          heatmapUrl: null,
        },
      );
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : "GitHub 操作失败");
    } finally {
      setAuthBusy(false);
    }
  }

  async function deleteAccount() {
    if (
      !window.confirm(
        "这会删除服务端账户、热力图数据和扩展本地记录，且无法撤销。确定继续吗？",
      )
    ) {
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    try {
      const response = (await chrome.runtime.sendMessage({
        type: "github-delete-account",
      })) as MessageResponse<undefined>;
      if (!response.ok) throw new Error(response.error ?? "删除账户失败");
      setGithub({
        connected: false,
        login: null,
        sessionExpiresAt: null,
        heatmapUrl: null,
      });
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : "删除账户失败");
    } finally {
      setAuthBusy(false);
    }
  }

  async function save() {
    const response = (await chrome.runtime.sendMessage({
      type: "settings-write",
      payload: settings,
    })) as MessageResponse<undefined>;
    setSaved(response.ok);
    window.setTimeout(() => setSaved(false), 1_500);
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <p className="m-0 text-xs tracking-[0.18em] text-orange-400 uppercase">
        LeetCodeDaily
      </p>
      <h1 className="mt-2 text-3xl font-semibold">设置</h1>

      <section className="mt-8 space-y-5 rounded-3xl border border-white/8 bg-white/4 p-6">
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/8 bg-black/15 p-4">
          <div>
            <div className="text-sm font-medium">
              {github.connected
                ? `已连接 @${github.login}`
                : "尚未连接 GitHub"}
            </div>
            <div className="mt-1 text-xs text-white/45">
              通过 GitHub App 授权，无需粘贴访问令牌
            </div>
          </div>
          <button
            className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
            disabled={authBusy}
            onClick={() => void toggleGitHub()}
            type="button"
          >
            {authBusy
              ? "处理中"
              : github.connected
                ? "断开"
                : "连接 GitHub"}
          </button>
        </div>
        {authError ? (
          <div className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {authError}
          </div>
        ) : null}
        {github.connected ? (
          <button
            className="w-fit rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-2 text-sm text-rose-100 hover:bg-rose-500/15"
            disabled={authBusy}
            onClick={() => void deleteAccount()}
            type="button"
          >
            删除账户数据
          </button>
        ) : null}
        <label className="block">
          <span className="text-sm text-white/70">统计时区</span>
          <input
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 outline-none focus:border-orange-400"
            onChange={(event) =>
              setSettings({ ...settings, timezone: event.target.value })
            }
            value={settings.timezone}
          />
        </label>
        <label className="block">
          <span className="text-sm text-white/70">GitHub 仓库</span>
          <input
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 outline-none focus:border-orange-400"
            onChange={(event) =>
              setSettings({
                ...settings,
                githubRepository: event.target.value || null,
              })
            }
            placeholder="owner/repository"
            value={settings.githubRepository ?? ""}
          />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm text-white/70">分支</span>
            <input
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 outline-none focus:border-orange-400"
              onChange={(event) =>
                setSettings({ ...settings, githubBranch: event.target.value })
              }
              value={settings.githubBranch}
            />
          </label>
          <label className="block">
            <span className="text-sm text-white/70">根目录</span>
            <input
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 outline-none focus:border-orange-400"
              onChange={(event) =>
                setSettings({
                  ...settings,
                  githubRootDirectory: event.target.value,
                })
              }
              value={settings.githubRootDirectory}
            />
          </label>
        </div>
        <label className="flex items-start gap-3 rounded-2xl border border-white/8 bg-black/15 p-4">
          <input
            checked={settings.heatmapPublicEnabled}
            className="mt-1 size-4 accent-orange-500"
            onChange={(event) =>
              setSettings({
                ...settings,
                heatmapPublicEnabled: event.target.checked,
              })
            }
            type="checkbox"
          />
          <span>
            <span className="block text-sm font-medium">公开刷题热力图</span>
            <span className="mt-1 block text-xs leading-5 text-white/45">
              开启后可在 GitHub Profile README 中使用固定 SVG 地址
            </span>
          </span>
        </label>
        {github.heatmapUrl ? (
          <div className="rounded-2xl border border-white/8 bg-black/15 p-4">
            <div className="text-xs text-white/45">热力图地址</div>
            <code className="mt-2 block break-all text-xs text-orange-300">
              {github.heatmapUrl}
            </code>
          </div>
        ) : null}
        <button
          className="rounded-xl bg-orange-500 px-4 py-2 font-semibold text-black hover:bg-orange-400"
          onClick={() => void save()}
          type="button"
        >
          {saved ? "已保存" : "保存设置"}
        </button>
      </section>
    </main>
  );
}
