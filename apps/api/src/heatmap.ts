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
}

const LIGHT_COLORS = {
  background: "#ffffff",
  primary: "#24292f",
  secondary: "#57606a",
  muted: "#6e7781",
  levels: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
};
const DARK_COLORS = {
  background: "#0d1117",
  primary: "#f0f6fc",
  secondary: "#8b949e",
  muted: "#6e7681",
  levels: ["#21262d", "#0e4429", "#006d32", "#26a641", "#39d353"],
};
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

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

function statusSvg(
  title: string,
  message: string,
  theme: HeatmapTheme,
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="120" role="img" aria-label="${escapeXml(message)}">
  <title>${escapeXml(message)}</title>
  ${themeStyle(theme)}
  <rect width="820" height="120" rx="8" fill="var(--background)"/>
  <text x="24" y="50" fill="var(--primary)" font-family="system-ui,sans-serif" font-size="17" font-weight="600">${escapeXml(title)}</text>
  <text x="24" y="78" fill="var(--secondary)" font-family="system-ui,sans-serif" font-size="13">${escapeXml(message)}</text>
</svg>`;
}

export function renderHeatmapDocument(input: HeatmapDocumentInput): string {
  const counts = new Map(
    input.rows.map((row) => [row.local_date, row.distinct_problem_count]),
  );
  const acceptedTotal = input.rows.reduce(
    (sum, row) => sum + row.accepted_submission_count,
    0,
  );
  const firstDay = dateAtUtc(input.year, 0, 1);
  const lastDay = dateAtUtc(input.year, 11, 31);
  const gridStart = new Date(firstDay);
  gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());
  const gridEnd = new Date(lastDay);
  gridEnd.setUTCDate(gridEnd.getUTCDate() + (6 - gridEnd.getUTCDay()));

  const cell = 11;
  const gap = 3;
  const left = 44;
  const top = 58;
  const cells: string[] = [];

  for (
    let date = new Date(gridStart);
    date <= gridEnd;
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const week = Math.floor(
      (date.getTime() - gridStart.getTime()) / (7 * 24 * 60 * 60 * 1_000),
    );
    const day = date.getUTCDay();
    const inYear = date.getUTCFullYear() === input.year;
    const count = inYear ? (counts.get(dateKey(date)) ?? 0) : 0;
    cells.push(
      `<rect class="activity-cell" x="${left + week * (cell + gap)}" y="${top + day * (cell + gap)}" width="${cell}" height="${cell}" rx="2" fill="var(--level-${activityLevel(count)})" opacity="${inYear ? 1 : 0}"/>`,
    );
  }

  const monthLabels = MONTHS.map((month, index) => {
    const first = dateAtUtc(input.year, index, 1);
    const week = Math.floor(
      (first.getTime() - gridStart.getTime()) / (7 * 24 * 60 * 60 * 1_000),
    );
    return `<text x="${left + week * (cell + gap)}" y="48" fill="var(--secondary)" font-family="system-ui,sans-serif" font-size="10">${month}</text>`;
  }).join("");
  const updated = input.updatedAt
    ? new Date(input.updatedAt).toISOString().slice(0, 10)
    : "not synced";
  const summary =
    acceptedTotal > 0 ? `${acceptedTotal} accepted` : "No activity yet";
  const ariaLabel = `${input.login} LeetCode activity for ${input.year}: ${summary}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="188" role="img" aria-label="${escapeXml(ariaLabel)}">
  <title>${escapeXml(ariaLabel)}</title>
  ${themeStyle(input.theme)}
  <rect width="820" height="188" rx="8" fill="var(--background)"/>
  <text x="24" y="28" fill="var(--primary)" font-family="system-ui,sans-serif" font-size="16" font-weight="600">${escapeXml(input.login)} · LeetCode Activity</text>
  <text x="796" y="28" text-anchor="end" fill="var(--secondary)" font-family="system-ui,sans-serif" font-size="12">${input.year} · ${summary}</text>
  ${monthLabels}
  <text x="24" y="84" fill="var(--secondary)" font-family="system-ui,sans-serif" font-size="10">Mon</text>
  <text x="24" y="112" fill="var(--secondary)" font-family="system-ui,sans-serif" font-size="10">Wed</text>
  <text x="24" y="140" fill="var(--secondary)" font-family="system-ui,sans-serif" font-size="10">Fri</text>
  ${cells.join("")}
  <text x="24" y="174" fill="var(--muted)" font-family="system-ui,sans-serif" font-size="10">Updated ${updated}</text>
  <text x="700" y="174" fill="var(--muted)" font-family="system-ui,sans-serif" font-size="10">Less</text>
  ${Array.from({ length: 5 }, (_, index) => `<rect x="${730 + index * 14}" y="165" width="10" height="10" rx="2" fill="var(--level-${index})"/>`).join("")}
</svg>`;
}

export async function renderHeatmap(
  login: string,
  year: number,
  theme: HeatmapTheme,
  env: Env,
): Promise<Response> {
  const account = await env.DB.prepare(
    `SELECT a.github_user_id, a.current_login, h.public_enabled, h.updated_at
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
      updated_at: string | null;
    }>();

  if (!account) return new Response("Not found", { status: 404 });
  if (account.public_enabled !== 1) {
    return svgResponse(
      statusSvg(
        `${account.current_login} · LeetCode Activity`,
        "Heatmap is not public.",
        theme,
      ),
      300,
    );
  }

  const rows = await env.DB.prepare(
    `SELECT local_date, accepted_submission_count, distinct_problem_count
       FROM daily_activity
      WHERE github_user_id = ?
        AND local_date BETWEEN ? AND ?
      ORDER BY local_date`,
  )
    .bind(account.github_user_id, `${year}-01-01`, `${year}-12-31`)
    .all<ActivityRow>();

  return svgResponse(
    renderHeatmapDocument({
      login: account.current_login,
      year,
      rows: rows.results,
      updatedAt: account.updated_at,
      theme,
    }),
    300,
  );
}

export function renderHeatmapError(theme: HeatmapTheme): Response {
  return svgResponse(
    statusSvg(
      "LeetCode Activity",
      "Heatmap is temporarily unavailable.",
      theme,
    ),
    30,
  );
}

function svgResponse(
  svg: string,
  maxAgeSeconds: number,
): Response {
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAgeSeconds}`,
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
