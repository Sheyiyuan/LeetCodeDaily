import type { DashboardState, MessageResponse } from "../shared/messages";
import { useCallback, useEffect, useState } from "react";

const EMPTY: DashboardState = {
  account: null,
  stats: null,
  pendingCount: 0,
  failedCount: 0,
  lastSuccessfulRefreshAt: null,
  error: null,
};

async function sendDashboardMessage(
  type: "dashboard-read" | "dashboard-refresh" | "retry-all",
): Promise<DashboardState> {
  const response =
    (await chrome.runtime.sendMessage({
      type,
    })) as MessageResponse<DashboardState>;
  if (!response.ok || !response.data) {
    throw new Error(response.error ?? "读取状态失败");
  }
  return response.data;
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/4 p-3">
      <div className="text-xs text-white/45">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}

export function App() {
  const [state, setState] = useState(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (refresh: boolean) => {
    setLoading(true);
    try {
      setState(
        await sendDashboardMessage(
          refresh ? "dashboard-refresh" : "dashboard-read",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const retry = useCallback(async () => {
    setLoading(true);
    try {
      setState(await sendDashboardMessage("retry-all"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  return (
    <main className="w-[360px] p-4">
      <header className="flex items-center justify-between">
        <div>
          <p className="m-0 text-xs font-medium tracking-[0.18em] text-orange-400 uppercase">
            leetcode.cn
          </p>
          <h1 className="m-0 mt-1 text-xl font-semibold">LeetCodeDaily</h1>
        </div>
        <button
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 hover:bg-white/10"
          disabled={loading}
          onClick={() => void load(true)}
          type="button"
        >
          {loading ? "同步中" : "刷新"}
        </button>
      </header>

      <section className="mt-5 rounded-3xl border border-white/8 bg-white/4 p-4">
        <div className="flex items-center gap-3">
          {state.account?.avatarUrl ? (
            <img
              alt=""
              className="size-10 rounded-full"
              src={state.account.avatarUrl}
            />
          ) : (
            <div className="grid size-10 place-items-center rounded-full bg-orange-500/15 text-orange-400">
              LC
            </div>
          )}
          <div>
            <div className="text-sm font-medium">
              {state.account?.isSignedIn
                ? state.account.username
                : "尚未登录力扣中国站"}
            </div>
            <div className="mt-1 text-xs text-white/40">
              {state.lastSuccessfulRefreshAt
                ? `更新于 ${new Date(state.lastSuccessfulRefreshAt).toLocaleTimeString()}`
                : "等待首次同步"}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          <StatCard
            color="text-white"
            label="全部"
            value={state.stats?.total ?? 0}
          />
          <StatCard
            color="text-emerald-400"
            label="简单"
            value={state.stats?.easy ?? 0}
          />
          <StatCard
            color="text-amber-400"
            label="中等"
            value={state.stats?.medium ?? 0}
          />
          <StatCard
            color="text-rose-400"
            label="困难"
            value={state.stats?.hard ?? 0}
          />
        </div>
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
          <div className="text-xs text-white/45">等待处理</div>
          <div className="mt-1 text-2xl font-semibold">
            {state.pendingCount}
          </div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
          <div className="text-xs text-white/45">需要重试</div>
          <div className="mt-1 text-2xl font-semibold text-rose-400">
            {state.failedCount}
          </div>
        </div>
      </section>

      {state.error ? (
        <div className="mt-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs leading-5 text-rose-200">
          {state.error}
        </div>
      ) : null}

      {state.failedCount > 0 ? (
        <button
          className="mt-3 w-full rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-100 hover:bg-rose-500/15"
          disabled={loading}
          onClick={() => void retry()}
          type="button"
        >
          立即重试失败任务
        </button>
      ) : null}

      <button
        className="mt-4 w-full rounded-2xl bg-orange-500 px-4 py-3 text-sm font-semibold text-black hover:bg-orange-400"
        onClick={() => void chrome.runtime.openOptionsPage()}
        type="button"
      >
        GitHub 与同步设置
      </button>
    </main>
  );
}
