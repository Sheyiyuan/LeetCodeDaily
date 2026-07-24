import { activityLevel } from "@leetcode-daily/domain";
import {
  Check,
  Code2,
  ExternalLink,
  Moon,
  RefreshCw,
  RotateCcw,
  Settings,
  Sun,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  ActivityDaySummary,
  DashboardState,
  GitHubAuthState,
  MessageResponse,
} from "../shared/messages";
import { useTheme } from "../shared/use-theme";

const EMPTY: DashboardState = {
  account: null,
  stats: null,
  activityDays: [],
  todayLocalDate: new Date().toISOString().slice(0, 10),
  pendingCount: 0,
  failedCount: 0,
  lastSuccessfulRefreshAt: null,
  error: null,
};

const EMPTY_GITHUB: GitHubAuthState = {
  connected: false,
  login: null,
  sessionExpiresAt: null,
  heatmapUrl: null,
};

async function sendDashboardMessage(
  type: "dashboard-read" | "dashboard-refresh" | "retry-all",
): Promise<DashboardState> {
  const response = (await chrome.runtime.sendMessage({ type })) as MessageResponse<DashboardState>;
  if (!response.ok || !response.data) {
    throw new Error(response.error ?? "读取状态失败");
  }
  return response.data;
}

function previousDates(endDate: string, count: number): string[] {
  const end = new Date(`${endDate}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (count - index - 1));
    return date.toISOString().slice(0, 10);
  });
}

function ActivityGrid({ days, today }: { days: ActivityDaySummary[]; today: string }) {
  const activityByDate = useMemo(() => new Map(days.map((day) => [day.localDate, day])), [days]);
  const dates = useMemo(() => previousDates(today, 30), [today]);
  const acceptedCount = dates.reduce(
    (total, date) => total + (activityByDate.get(date)?.acceptedSubmissionCount ?? 0),
    0,
  );

  return (
    <section className="panel activity-panel" aria-labelledby="activity-heading">
      <div className="section-heading">
        <h2 id="activity-heading">近 30 天</h2>
        <div className="activity-legend">
          <strong>{acceptedCount}</strong>
          <span>次通过</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <span className={`activity-cell level-${level}`} key={level} />
          ))}
        </div>
      </div>
      <div className="activity-grid" style={{ gridTemplateColumns: "repeat(10, minmax(0, 1fr))" }}>
        {dates.map((date) => {
          const day = activityByDate.get(date);
          const distinct = day?.distinctProblemCount ?? 0;
          const accepted = day?.acceptedSubmissionCount ?? 0;
          return (
            <span
              aria-label={`${date}：${accepted} 次通过，${distinct} 道题`}
              className={`activity-cell level-${activityLevel(distinct)}`}
              key={date}
              role="img"
              title={`${date} · ${accepted} 次通过 · ${distinct} 道题`}
            />
          );
        })}
      </div>
      <div className="activity-dates" aria-hidden="true">
        <span>{dates[0]?.slice(5).replace("-", "/")}</span>
        <span>{today.slice(5).replace("-", "/")}</span>
      </div>
    </section>
  );
}

export function App() {
  const [state, setState] = useState(EMPTY);
  const [github, setGithub] = useState(EMPTY_GITHUB);
  const [loading, setLoading] = useState(true);
  const [clientError, setClientError] = useState<string | null>(null);
  const [theme, toggleTheme] = useTheme();

  const load = useCallback(async (refresh: boolean) => {
    setLoading(true);
    setClientError(null);
    try {
      const [dashboard, githubResponse] = await Promise.all([
        sendDashboardMessage(refresh ? "dashboard-refresh" : "dashboard-read"),
        chrome.runtime.sendMessage({ type: "github-auth-read" }) as Promise<
          MessageResponse<GitHubAuthState>
        >,
      ]);
      setState(dashboard);
      if (githubResponse.ok && githubResponse.data) setGithub(githubResponse.data);
    } catch (cause) {
      setClientError(cause instanceof Error ? cause.message : "刷新失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const retry = useCallback(async () => {
    setLoading(true);
    setClientError(null);
    try {
      setState(await sendDashboardMessage("retry-all"));
    } catch (cause) {
      setClientError(cause instanceof Error ? cause.message : "重试失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  const signedIn = state.account?.isSignedIn === true;
  const displayName = signedIn ? state.account?.username : "LeetCodeDaily";
  const username = state.account?.username?.trim() || github.login;
  const updatedAt = state.lastSuccessfulRefreshAt
    ? new Date(state.lastSuccessfulRefreshAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const visibleError =
    clientError?.trim() ||
    state.error?.trim() ||
    (state.failedCount > 0 ? `${state.failedCount} 项任务失败，请点击重试查看原因` : null);

  return (
    <main className="popup-shell">
      <header className="popup-header">
        <a
          className="profile-link"
          href={
            signedIn && state.account?.username
              ? `https://leetcode.cn/u/${encodeURIComponent(state.account.username)}`
              : "https://leetcode.cn/"
          }
          rel="noreferrer"
          target="_blank"
        >
          {state.account?.avatarUrl ? (
            <img alt="" className="avatar" src={state.account.avatarUrl} />
          ) : (
            <span className="brand-mark">
              <Code2 size={17} />
            </span>
          )}
          <span>
            <strong>{displayName}</strong>
            <small>
              {signedIn ? `leetcode.cn${updatedAt ? ` · ${updatedAt}` : ""}` : "仅连接力扣中国站"}
            </small>
          </span>
        </a>
        <div className="header-actions">
          <button
            aria-label="刷新"
            className="icon-button"
            disabled={loading}
            onClick={() => void load(true)}
            title="刷新"
            type="button"
          >
            <RefreshCw className={loading ? "spin" : ""} size={16} />
          </button>
          <button
            aria-label={theme === "dark" ? "切换到浅色" : "切换到深色"}
            className="icon-button"
            onClick={toggleTheme}
            title={theme === "dark" ? "浅色模式" : "深色模式"}
            type="button"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            aria-label="设置"
            className="icon-button"
            onClick={() => void chrome.runtime.openOptionsPage()}
            title="设置"
            type="button"
          >
            <Settings size={16} />
          </button>
        </div>
      </header>

      {!signedIn && !loading ? (
        <a
          className="notice-row"
          href="https://leetcode.cn/accounts/login/"
          rel="noreferrer"
          target="_blank"
        >
          <span>登录力扣中国站后显示刷题数据</span>
          <ExternalLink size={14} />
        </a>
      ) : null}

      <section className="panel stats-panel" aria-label="已解决题目统计">
        <div className="total-stat">
          <span>已解决</span>
          <strong>{loading && !state.stats ? "-" : (state.stats?.total ?? 0)}</strong>
        </div>
        <div className="difficulty-stats">
          <span>
            <strong className="easy">{state.stats?.easy ?? 0}</strong>简单
          </span>
          <span>
            <strong className="medium">{state.stats?.medium ?? 0}</strong>中等
          </span>
          <span>
            <strong className="hard">{state.stats?.hard ?? 0}</strong>困难
          </span>
        </div>
      </section>

      <ActivityGrid days={state.activityDays} today={state.todayLocalDate} />

      <section className="panel sync-panel" aria-labelledby="sync-heading">
        <div className="section-heading">
          <h2 id="sync-heading">同步状态</h2>
          {state.failedCount > 0 ? (
            <button
              className="small-command danger"
              disabled={loading}
              onClick={() => void retry()}
              type="button"
            >
              <RotateCcw size={13} />
              重试
            </button>
          ) : null}
        </div>
        <div className="status-list">
          <div>
            <span className={`status-icon ${github.connected ? "success" : "muted"}`}>
              {github.connected ? <Check size={13} /> : <Code2 size={13} />}
            </span>
            <span>GitHub</span>
            <strong>{github.connected ? username : "未连接"}</strong>
          </div>
          {state.failedCount > 0 ? (
            <div>
              <span className="status-icon failure">
                <TriangleAlert size={13} />
              </span>
              <span>提交失败</span>
              <strong>{state.failedCount} 项</strong>
            </div>
          ) : null}
        </div>
        {visibleError ? (
          <p className="sync-error-message">
            <TriangleAlert size={13} />
            <span>{visibleError}</span>
          </p>
        ) : null}
      </section>

      <button
        className="settings-row"
        onClick={() => void chrome.runtime.openOptionsPage()}
        type="button"
      >
        <span>
          <Settings size={15} />
          GitHub 与同步设置
        </span>
        <ExternalLink size={14} />
      </button>
    </main>
  );
}
