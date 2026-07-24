import type { Problem } from "@leetcode-daily/domain";
import sanitizeHtml from "sanitize-html";

import { languageExtension, normalizeLanguage } from "./languages";

export interface ReadmeSolution {
  language: string;
  submissionId: string;
  submittedAt: string;
}

export interface ProblemReadmeInput {
  problem: Problem;
  solutions: ReadmeSolution[];
  includeProblemContent?: boolean;
}

interface Metadata {
  schemaVersion: 1;
  site: "leetcode.cn";
  problemId: string;
  frontendId: string;
  titleSlug: string;
  languages: Record<
    string,
    {
      fileName: string;
      submissionId: string;
      submittedAt: string;
    }
  >;
}

function absoluteLeetCodeUrl(value: string): string {
  try {
    const url = new URL(value, "https://leetcode.cn");
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function sanitizeProblemHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "code",
      "pre",
      "ul",
      "ol",
      "li",
      "blockquote",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "sup",
      "sub",
      "img",
      "a",
      "hr",
    ],
    allowedAttributes: {
      a: ["href", "title"],
      img: ["src", "alt", "title", "width", "height"],
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
    },
    allowedSchemes: ["http", "https"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tagName, attributes) => ({
        tagName: "a",
        attribs: {
          ...attributes,
          href: absoluteLeetCodeUrl(attributes.href ?? ""),
        },
      }),
      img: (_tagName, attributes) => ({
        tagName: "img",
        attribs: {
          ...attributes,
          src: absoluteLeetCodeUrl(attributes.src ?? ""),
        },
      }),
    },
    exclusiveFilter(frame) {
      return (
        (frame.tag === "a" && !frame.attribs.href) ||
        (frame.tag === "img" && !frame.attribs.src)
      );
    },
  }).trim();
}

function metadataFor(input: ProblemReadmeInput): Metadata {
  const languages: Metadata["languages"] = {};
  for (const solution of input.solutions) {
    const language = normalizeLanguage(solution.language);
    languages[language] = {
      fileName: `solution.${languageExtension(language)}`,
      submissionId: solution.submissionId,
      submittedAt: solution.submittedAt,
    };
  }
  return {
    schemaVersion: 1,
    site: "leetcode.cn",
    problemId: input.problem.questionId,
    frontendId: input.problem.frontendId,
    titleSlug: input.problem.titleSlug,
    languages,
  };
}

export function generateProblemReadme(input: ProblemReadmeInput): string {
  const { problem } = input;
  const title = problem.translatedTitle?.trim() || problem.title;
  const content =
    problem.translatedContentHtml?.trim() || problem.contentHtml.trim();
  const tags = problem.topicTags
    .map((tag) => tag.translatedName?.trim() || tag.name)
    .join(" · ");
  const solutionLines = input.solutions
    .map((solution) => {
      const fileName = `solution.${languageExtension(solution.language)}`;
      return `- [${solution.language}](${fileName}) · ${solution.submittedAt}`;
    })
    .join("\n");
  const metadata = JSON.stringify(metadataFor(input)).replaceAll("--", "—");

  const problemContent =
    input.includeProblemContent === false
      ? []
      : ["", "## 题目描述", "", sanitizeProblemHtml(content)];

  return [
    `# ${problem.frontendId}. ${title}`,
    "",
    `> 难度：${problem.difficulty}  `,
    `> 标签：${tags || "—"}  `,
    `> [查看力扣中国站原题](${problem.canonicalUrl})`,
    ...problemContent,
    "",
    "## 已同步解答",
    "",
    solutionLines || "尚无已同步解答。",
    "",
    `<!-- leetcode-daily:meta ${metadata} -->`,
    "",
  ].join("\n");
}
