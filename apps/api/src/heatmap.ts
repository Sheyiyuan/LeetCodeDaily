import type { Env } from "./env";

export type HeatmapTheme = "auto" | "light" | "dark";

export interface ActivityRow {
  local_date: string;
  accepted_submission_count: number;
  distinct_problem_count: number;
}

interface HeatmapDocumentInput {
  login: string;
  year: number;
  rows: ActivityRow[];
  updatedAt: string | null;
  theme: HeatmapTheme;
  endDate?: string;
}

const LIGHT_COLORS = {
  background: "#ffffff",
  primary: "#24292f",
  secondary: "#57606a",
  muted: "#6e7781",
  levels: ["#ebedf0", "#ffd8bf", "#ff9f7a", "#f05a3c", "#b42318"],
};
const DARK_COLORS = {
  background: "#0d1117",
  primary: "#f0f6fc",
  secondary: "#8b949e",
  muted: "#6e7681",
  levels: ["#2d1b1b", "#6e241b", "#a83a25", "#e85d3f", "#ff8a65"],
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function activityLevel(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

function dateAtUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function cssVariables(colors: typeof LIGHT_COLORS): string {
  return [
    `--background:${colors.background}`,
    `--primary:${colors.primary}`,
    `--secondary:${colors.secondary}`,
    `--muted:${colors.muted}`,
    ...colors.levels.map((color, index) => `--level-${index}:${color}`),
  ].join(";");
}

function themeStyle(theme: HeatmapTheme): string {
  const initial = theme === "dark" ? DARK_COLORS : LIGHT_COLORS;
  const media =
    theme === "auto"
      ? `@media (prefers-color-scheme:dark){:root{${cssVariables(DARK_COLORS)}}}`
      : "";
  return `<style>:root{${cssVariables(initial)}}${media}</style>`;
}

function statusSvg(title: string, message: string, theme: HeatmapTheme): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="120" role="img" aria-label="${escapeXml(message)}">
  <title>${escapeXml(message)}</title>
  ${themeStyle(theme)}
  <rect width="820" height="120" rx="8" fill="var(--background)"/>
  <text x="24" y="50" fill="var(--primary)" font-family="system-ui,sans-serif" font-size="17" font-weight="600">${escapeXml(title)}</text>
  <text x="24" y="78" fill="var(--secondary)" font-family="system-ui,sans-serif" font-size="13">${escapeXml(message)}</text>
</svg>`;
}

export function renderHeatmapDocument(input: HeatmapDocumentInput): string {
  const counts = new Map(input.rows.map((row) => [row.local_date, row.distinct_problem_count]));
  const acceptedTotal = input.rows.reduce((sum, row) => sum + row.accepted_submission_count, 0);
  const rolling = Boolean(input.endDate);
  const lastDay = input.endDate
    ? new Date(`${input.endDate}T00:00:00Z`)
    : dateAtUtc(input.year, 11, 31);
  const firstDay = input.endDate ? new Date(lastDay) : dateAtUtc(input.year, 0, 1);
  if (input.endDate) firstDay.setUTCDate(firstDay.getUTCDate() - 364);
  const gridStart = new Date(firstDay);
  gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());
  const gridEnd = new Date(lastDay);
  if (!rolling) gridEnd.setUTCDate(gridEnd.getUTCDate() + (6 - gridEnd.getUTCDay()));

  const cell = 20;
  const gap = 3;
  const left = 64;
  const top = 30;
  const cells: string[] = [];

  for (let date = new Date(gridStart); date <= gridEnd; date.setUTCDate(date.getUTCDate() + 1)) {
    const week = Math.floor((date.getTime() - gridStart.getTime()) / (7 * 24 * 60 * 60 * 1_000));
    const day = date.getUTCDay();
    const inWindow = rolling
      ? date >= firstDay && date <= lastDay
      : date.getUTCFullYear() === input.year;
    const count = inWindow ? (counts.get(dateKey(date)) ?? 0) : 0;
    cells.push(
      `<rect class="activity-cell" x="${left + week * (cell + gap)}" y="${top + day * (cell + gap)}" width="${cell}" height="${cell}" rx="2" fill="var(--level-${activityLevel(count)})" opacity="${inWindow ? 1 : 0}"/>`,
    );
  }

  const monthLabelStart = new Date(firstDay);
  monthLabelStart.setUTCDate(1);
  if (rolling && monthLabelStart < firstDay) {
    monthLabelStart.setUTCMonth(monthLabelStart.getUTCMonth() + 1);
  }
  const monthLabels: string[] = [];
  for (
    let first = new Date(monthLabelStart);
    first <= lastDay;
    first.setUTCMonth(first.getUTCMonth() + 1)
  ) {
    const month = MONTHS[first.getUTCMonth()];
    const week = Math.floor((first.getTime() - gridStart.getTime()) / (7 * 24 * 60 * 60 * 1_000));
    monthLabels.push(
      `<text x="${left + week * (cell + gap)}" y="19" fill="var(--secondary)" font-family="system-ui,sans-serif" font-size="16">${month}</text>`,
    );
  }
  const summary = acceptedTotal > 0 ? `${acceptedTotal} accepted` : "No activity yet";
  const updated = input.updatedAt
    ? new Date(input.updatedAt).toISOString().slice(0, 10)
    : "not synced";
  const period = input.endDate ? `${dateKey(firstDay)} to ${dateKey(lastDay)}` : String(input.year);
  const ariaLabel = `${input.login} LeetCode activity for ${period}: ${summary}; Updated ${updated}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1360" height="196" viewBox="0 0 1360 196" role="img" aria-label="${escapeXml(ariaLabel)}">
  <title>${escapeXml(ariaLabel)}</title>
  ${themeStyle(input.theme)}
  <rect width="1360" height="196" fill="var(--background)"/>
  ${monthLabels.join("")}
  <text x="16" y="${top + 1 * (cell + gap) + 15}" fill="var(--secondary)" font-family="system-ui,sans-serif" font-size="16">Mon</text>
  <text x="16" y="${top + 3 * (cell + gap) + 15}" fill="var(--secondary)" font-family="system-ui,sans-serif" font-size="16">Wed</text>
  <text x="16" y="${top + 5 * (cell + gap) + 15}" fill="var(--secondary)" font-family="system-ui,sans-serif" font-size="16">Fri</text>
  ${cells.join("")}
</svg>`;
}

export async function renderHeatmap(
  login: string,
  year: number,
  theme: HeatmapTheme,
  env: Env,
  rolling = false,
): Promise<Response> {
  const account = await env.DB.prepare(
    `SELECT a.github_user_id, a.current_login, h.public_enabled,
            COALESCE(h.timezone, 'UTC') AS timezone, h.updated_at
       FROM github_login_aliases AS alias
       JOIN github_accounts AS a
         ON a.github_user_id = alias.github_user_id
      LEFT JOIN heatmap_settings AS h
         ON h.github_user_id = a.github_user_id
      WHERE alias.normalized_login = ? COLLATE NOCASE`,
  )
    .bind(login.toLowerCase())
    .first<{
      github_user_id: number;
      current_login: string;
      public_enabled: number | null;
      timezone: string;
      updated_at: string | null;
    }>();

  if (!account) return new Response("Not found", { status: 404 });
  if (account.public_enabled !== 1) {
    return svgResponse(
      statusSvg(`${account.current_login} · LeetCode Activity`, "Heatmap is not public.", theme),
      300,
    );
  }

  const lastDate = rolling
    ? new Date(`${dateKeyInTimeZone(new Date(), account.timezone)}T00:00:00Z`)
    : dateAtUtc(year, 11, 31);
  const firstDate = new Date(lastDate);
  if (rolling) firstDate.setUTCDate(firstDate.getUTCDate() - 364);
  else firstDate.setUTCMonth(0, 1);
  const rows = await env.DB.prepare(
    `SELECT local_date, accepted_submission_count, distinct_problem_count
       FROM daily_activity
      WHERE github_user_id = ?
        AND local_date BETWEEN ? AND ?
      ORDER BY local_date`,
  )
    .bind(account.github_user_id, dateKey(firstDate), dateKey(lastDate))
    .all<ActivityRow>();

  return svgResponse(
    renderHeatmapDocument({
      login: account.current_login,
      year,
      rows: rows.results,
      updatedAt: account.updated_at,
      theme,
      ...(rolling ? { endDate: dateKey(lastDate) } : {}),
    }),
    300,
  );
}

export function renderHeatmapError(theme: HeatmapTheme): Response {
  return svgResponse(
    statusSvg("LeetCode Activity", "Heatmap is temporarily unavailable.", theme),
    30,
  );
}

function svgResponse(svg: string, maxAgeSeconds: number): Response {
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAgeSeconds}`,
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
