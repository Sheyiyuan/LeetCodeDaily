const EXTENSIONS: Record<string, string> = {
  bash: "sh",
  c: "c",
  "c++": "cpp",
  "c++17": "cpp",
  "c++20": "cpp",
  "c#": "cs",
  cpp: "cpp",
  csharp: "cs",
  dart: "dart",
  elixir: "ex",
  erlang: "erl",
  golang: "go",
  java: "java",
  javascript: "js",
  kotlin: "kt",
  mysql: "sql",
  mssql: "sql",
  oracle: "sql",
  php: "php",
  python: "py",
  python3: "py",
  racket: "rkt",
  ruby: "rb",
  rust: "rs",
  scala: "scala",
  swift: "swift",
  typescript: "ts",
};

export function normalizeLanguage(language: string): string {
  return language.trim().toLowerCase().replaceAll(/\s+/g, "-");
}

export function languageExtension(language: string): string {
  const normalized = normalizeLanguage(language);
  return EXTENSIONS[normalized] ?? "txt";
}

function commentPrefix(extension: string): string {
  return ["py", "rb", "sh", "sql", "rkt"].includes(extension) ? "#" : "//";
}

export interface SolutionHeader {
  language: string;
  titleSlug: string;
  problemUrl: string;
  submittedAt: string;
}

function safeTitleSlug(value: string): string {
  return (
    value
      .trim()
      .replaceAll(/[^a-zA-Z0-9._-]+/g, "-")
      .replaceAll(/^-+|-+$/g, "") || "solution"
  );
}

export function formatAcceptedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
  }).format(date);
}

export function generateSolutionFile(
  header: SolutionHeader,
  code: string,
): { fileName: string; content: string } {
  const extension = languageExtension(header.language);
  const prefix = commentPrefix(extension);
  const lines = [
    `${prefix} Problem: ${header.problemUrl}`,
    `${prefix} Accepted at: ${formatAcceptedAt(header.submittedAt)}`,
  ];
  return {
    fileName: `${safeTitleSlug(header.titleSlug)}.${extension}`,
    content: `${lines.join("\n")}\n\n${code.replace(/\s+$/, "")}\n`,
  };
}
