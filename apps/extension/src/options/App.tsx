import {
  Check,
  Clipboard,
  Cloud,
  Code2,
  ExternalLink,
  FolderGit2,
  GitBranch,
  Globe2,
  Moon,
  Save,
  Sun,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type {
  ExtensionSettings,
  GitHubAuthState,
  MessageResponse,
} from "../shared/messages";
import { useTheme } from "../shared/use-theme";

const FALLBACK: ExtensionSettings = {
  timezone: "Asia/Shanghai",
  githubRepository: null,
  githubBranch: "main",
  githubRootDirectory: "solutions",
  heatmapPublicEnabled: false,
};

const EMPTY_GITHUB: GitHubAuthState = {
  connected: false,
  login: null,
  sessionExpiresAt: null,
  heatmapUrl: null,
};

function repositoryIsValid(value: string | null): boolean {
  return value === null || /^[^/\s]+\/[^/\s]+$/.test(value);
}

function timezoneIsValid(value: string): boolean {
  try {
    new Intl.DateTimeFormat("zh-CN", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function App() {
  const [settings, setSettings] = useState(FALLBACK);
  const [github, setGithub] = useState(EMPTY_GITHUB);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, toggleTheme] = useTheme();

  useEffect(() => {
    void Promise.all([
      chrome.runtime.sendMessage({ type: "settings-read" }),
      chrome.runtime.sendMessage({ type: "github-auth-read" }),
    ])
      .then(
        ([settingsResponse, authResponse]: [
          MessageResponse<ExtensionSettings>,
          MessageResponse<GitHubAuthState>,
        ]) => {
          if (settingsResponse.ok && settingsResponse.data) setSettings(settingsResponse.data);
          if (authResponse.ok && authResponse.data) setGithub(authResponse.data);
          if (!settingsResponse.ok) setError(settingsResponse.error ?? "设置读取失败");
          else if (!authResponse.ok) setError(authResponse.error ?? "GitHub 状态读取失败");
        },
      )
      .finally(() => setLoading(false));
  }, []);

  const validationError = useMemo(() => {
    if (!timezoneIsValid(settings.timezone)) return "请输入有效的 IANA 时区";
    if (!repositoryIsValid(settings.githubRepository)) return "仓库格式应为 owner/repository";
    if (!settings.githubBranch.trim()) return "分支不能为空";
    return null;
  }, [settings]);

  async function toggleGitHub(): Promise<void> {
    setAuthBusy(true);
    setError(null);
    try {
      const response = (await chrome.runtime.sendMessage({
        type: github.connected ? "github-disconnect" : "github-connect",
      })) as MessageResponse<GitHubAuthState>;
      if (!response.ok) throw new Error(response.error ?? "GitHub 操作失败");
      setGithub(response.data ?? EMPTY_GITHUB);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "GitHub 操作失败");
    } finally {
      setAuthBusy(false);
    }
  }

  async function deleteAccount(): Promise<void> {
    if (!window.confirm("将删除服务端账户、热力图数据和本地记录，且无法撤销。")) return;
    setAuthBusy(true);
    setError(null);
    try {
      const response = (await chrome.runtime.sendMessage({
        type: "github-delete-account",
      })) as MessageResponse<undefined>;
      if (!response.ok) throw new Error(response.error ?? "删除账户失败");
      setGithub(EMPTY_GITHUB);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除账户失败");
    } finally {
      setAuthBusy(false);
    }
  }

  async function save(): Promise<void> {
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    const normalized: ExtensionSettings = {
      ...settings,
      timezone: settings.timezone.trim(),
      githubRepository: settings.githubRepository?.trim() || null,
      githubBranch: settings.githubBranch.trim(),
      githubRootDirectory: settings.githubRootDirectory.trim(),
    };
    const response = (await chrome.runtime.sendMessage({
      type: "settings-write",
      payload: normalized,
    })) as MessageResponse<undefined>;
    if (!response.ok) {
      setError(response.error ?? "保存失败");
      return;
    }
    setSettings(normalized);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1_500);
  }

  async function copyHeatmapUrl(): Promise<void> {
    if (!github.heatmapUrl) return;
    await navigator.clipboard.writeText(github.heatmapUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <main className="options-shell">
      <header className="options-header">
        <div className="options-brand">
          <span className="brand-mark large"><Code2 size={20} /></span>
          <span>
            <strong>LeetCodeDaily</strong>
            <small>leetcode.cn 自动同步</small>
          </span>
        </div>
        <button
          aria-label={theme === "dark" ? "切换到浅色" : "切换到深色"}
          className="icon-button"
          onClick={toggleTheme}
          title={theme === "dark" ? "浅色模式" : "深色模式"}
          type="button"
        >
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </header>

      <div className="options-title">
        <p>设置</p>
        <h1>同步与账户</h1>
      </div>

      {error ? <div className="error-banner wide"><TriangleAlert size={15} />{error}</div> : null}

      <section className="settings-section" aria-labelledby="github-section-heading">
        <div className="settings-section-heading">
          <FolderGit2 size={18} />
          <div>
            <h2 id="github-section-heading">GitHub</h2>
            <p>账户连接与目标仓库</p>
          </div>
        </div>
        <div className="settings-content">
          <div className="connection-row">
            <span className={`connection-state ${github.connected ? "connected" : ""}`}>
              {github.connected ? <Check size={15} /> : <Cloud size={15} />}
            </span>
            <div>
              <strong>{github.connected ? `已连接 @${github.login}` : "尚未连接 GitHub"}</strong>
              <small>{github.connected ? "GitHub App 授权有效" : "连接后可同步题解仓库"}</small>
            </div>
            <button className="secondary-button" disabled={authBusy} onClick={() => void toggleGitHub()} type="button">
              {authBusy ? "处理中" : github.connected ? "断开" : "连接 GitHub"}
            </button>
          </div>

          <div className="field-grid single">
            <label>
              <span>目标仓库</span>
              <div className="input-with-icon">
                <FolderGit2 size={15} />
                <input
                  disabled={loading}
                  onChange={(event) => setSettings({ ...settings, githubRepository: event.target.value || null })}
                  placeholder="owner/repository"
                  spellCheck={false}
                  value={settings.githubRepository ?? ""}
                />
              </div>
            </label>
          </div>
          <div className="field-grid">
            <label>
              <span>分支</span>
              <div className="input-with-icon"><GitBranch size={15} /><input onChange={(event) => setSettings({ ...settings, githubBranch: event.target.value })} value={settings.githubBranch} /></div>
            </label>
            <label>
              <span>根目录</span>
              <div className="input-with-icon"><Code2 size={15} /><input onChange={(event) => setSettings({ ...settings, githubRootDirectory: event.target.value })} placeholder="solutions" value={settings.githubRootDirectory} /></div>
            </label>
          </div>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="activity-section-heading">
        <div className="settings-section-heading">
          <Globe2 size={18} />
          <div>
            <h2 id="activity-section-heading">活动</h2>
            <p>统计时区与公开热力图</p>
          </div>
        </div>
        <div className="settings-content">
          <label className="full-field">
            <span>统计时区</span>
            <input onChange={(event) => setSettings({ ...settings, timezone: event.target.value })} spellCheck={false} value={settings.timezone} />
          </label>

          <div className="toggle-row">
            <div>
              <strong>公开刷题热力图</strong>
              <small>允许 GitHub Profile 读取固定 SVG 地址</small>
            </div>
            <button
              aria-checked={settings.heatmapPublicEnabled}
              aria-label="公开刷题热力图"
              className={`switch ${settings.heatmapPublicEnabled ? "on" : ""}`}
              onClick={() => setSettings({ ...settings, heatmapPublicEnabled: !settings.heatmapPublicEnabled })}
              role="switch"
              type="button"
            ><span /></button>
          </div>

          {github.heatmapUrl ? (
            <div className="url-row">
              <code>{github.heatmapUrl}</code>
              <button aria-label="复制热力图地址" className="icon-button" onClick={() => void copyHeatmapUrl()} title="复制地址" type="button">
                {copied ? <Check size={15} /> : <Clipboard size={15} />}
              </button>
              <a aria-label="打开热力图" className="icon-button" href={github.heatmapUrl} rel="noreferrer" target="_blank" title="打开热力图"><ExternalLink size={15} /></a>
            </div>
          ) : null}
        </div>
      </section>

      {github.connected ? (
        <section className="settings-section danger-section" aria-labelledby="data-section-heading">
          <div className="settings-section-heading">
            <Trash2 size={18} />
            <div><h2 id="data-section-heading">账户数据</h2><p>永久删除云端活动与本地记录</p></div>
          </div>
          <div className="settings-content danger-content">
            <span>此操作无法撤销</span>
            <button className="danger-button" disabled={authBusy} onClick={() => void deleteAccount()} type="button"><Trash2 size={14} />删除账户数据</button>
          </div>
        </section>
      ) : null}

      <footer className="save-bar">
        <span>{validationError ?? (saved ? "设置已保存" : "")}</span>
        <button className="primary-button" disabled={loading || Boolean(validationError)} onClick={() => void save()} type="button">
          {saved ? <Check size={16} /> : <Save size={16} />}{saved ? "已保存" : "保存设置"}
        </button>
      </footer>
    </main>
  );
}
