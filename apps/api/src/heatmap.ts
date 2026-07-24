import type { Env } from "./env";

interface ActivityRow {
  local_date: string;
  distinct_problem_count: number;
}

const COLORS = ["#25262a", "#9be9a8", "#40c463", "#30a14e", "#216e39"];

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

function disabledSvg(login: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="120" role="img" aria-label="LeetCode activity is private">
  <rect width="760" height="120" rx="14" fill="#101114"/>
  <text x="24" y="52" fill="#eff1f6" font-family="system-ui,sans-serif" font-size="18" font-weight="600">${escapeXml(login)} · LeetCode Activity</text>
  <text x="24" y="80" fill="#8b8e98" font-family="system-ui,sans-serif" font-size="13">Heatmap is not public.</text>
</svg>`;
}

export async function renderHeatmap(
  login: string,
  year: number,
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

  if (!account) {
    return new Response("Not found", { status: 404 });
  }
  if (account.public_enabled !== 1) {
    return svgResponse(disabledSvg(account.current_login), 300);
  }

  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const rows = await env.DB.prepare(
    `SELECT local_date, distinct_problem_count
       FROM daily_activity
      WHERE github_user_id = ?
        AND local_date BETWEEN ? AND ?
      ORDER BY local_date`,
  )
    .bind(account.github_user_id, start, end)
    .all<ActivityRow>();

  const counts = new Map(
    rows.results.map((row) => [row.local_date, row.distinct_problem_count]),
  );
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  const firstDay = dateAtUtc(year, 0, 1);
  const lastDay = dateAtUtc(year, 11, 31);
  const gridStart = new Date(firstDay);
  gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());

  const cell = 11;
  const gap = 3;
  const left = 44;
  const top = 48;
  const cells: string[] = [];

  for (
    let date = new Date(gridStart);
    date <= lastDay;
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const week = Math.floor(
      (date.getTime() - gridStart.getTime()) / (7 * 24 * 60 * 60 * 1_000),
    );
    const day = date.getUTCDay();
    const key = dateKey(date);
    const count = date.getUTCFullYear() === year ? (counts.get(key) ?? 0) : 0;
    const opacity = date.getUTCFullYear() === year ? 1 : 0;
    cells.push(
      `<rect x="${left + week * (cell + gap)}" y="${top + day * (cell + gap)}" width="${cell}" height="${cell}" rx="2" fill="${COLORS[activityLevel(count)]}" opacity="${opacity}"/>`,
    );
  }

  const updated = account.updated_at
    ? new Date(account.updated_at).toISOString().slice(0, 10)
    : "—";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="178" role="img" aria-label="${escapeXml(account.current_login)} LeetCode activity for ${year}">
  <rect width="820" height="178" rx="14" fill="#101114"/>
  <text x="24" y="28" fill="#eff1f6" font-family="system-ui,sans-serif" font-size="16" font-weight="600">${escapeXml(account.current_login)} · LeetCode Activity</text>
  <text x="796" y="28" text-anchor="end" fill="#8b8e98" font-family="system-ui,sans-serif" font-size="12">${year} · ${total} solved</text>
  <text x="24" y="74" fill="#8b8e98" font-family="system-ui,sans-serif" font-size="10">Mon</text>
  <text x="24" y="102" fill="#8b8e98" font-family="system-ui,sans-serif" font-size="10">Wed</text>
  <text x="24" y="130" fill="#8b8e98" font-family="system-ui,sans-serif" font-size="10">Fri</text>
  ${cells.join("")}
  <text x="24" y="162" fill="#686b73" font-family="system-ui,sans-serif" font-size="10">Updated ${updated}</text>
  <text x="700" y="162" fill="#686b73" font-family="system-ui,sans-serif" font-size="10">Less</text>
  ${COLORS.map((color, index) => `<rect x="${730 + index * 14}" y="153" width="10" height="10" rx="2" fill="${color}"/>`).join("")}
</svg>`;

  return svgResponse(svg, 300);
}

function svgResponse(svg: string, maxAgeSeconds: number): Response {
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
