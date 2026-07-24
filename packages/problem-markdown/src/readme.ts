import type { Problem } from "@leetcode-daily/domain";
import sanitizeHtml from "sanitize-html";

export interface ProblemReadmeInput {
  problem: Problem;
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

function decodeHtmlEntities(value: string): string {
  const entities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(
    /&(#x[\da-f]+|#\d+|[a-z]+);/gi,
    (entity, name: string) => {
      if (name.toLowerCase().startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
      }
      if (name.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
      }
      return entities[name.toLowerCase()] ?? entity;
    },
  );
}

function appendNewline(value: string): string {
  return `${value.replace(/[ \t]+$/g, "")}\n`;
}

/** Converts the sanitized LeetCode HTML into readable text without headings or links. */
export function problemHtmlToPlainText(html: string): string {
  const tokens = sanitizeProblemHtml(html).match(/<[^>]*>|[^<]+/g) ?? [];
  let output = "";
  let strongDepth = 0;
  let emphasisDepth = 0;
  let codeDepth = 0;

  for (const token of tokens) {
    if (!token.startsWith("<")) {
      output += decodeHtmlEntities(token.replace(/\s+/g, " "));
      continue;
    }

    const tag = token.match(/^<\/?\s*([a-z0-9]+)/i)?.[1]?.toLowerCase();
    if (!tag) continue;
    const closing = /^<\//.test(token);

    if (closing) {
      if (tag === "strong" || tag === "b") {
        if (strongDepth > 0) output += "**";
        strongDepth = Math.max(0, strongDepth - 1);
      } else if (tag === "em" || tag === "i") {
        if (emphasisDepth > 0) output += "*";
        emphasisDepth = Math.max(0, emphasisDepth - 1);
      } else if (tag === "code") {
        if (codeDepth > 0) output += "`";
        codeDepth = Math.max(0, codeDepth - 1);
      } else if (["p", "div", "li", "tr", "blockquote", "pre"].includes(tag)) {
        output = appendNewline(output);
      }
      continue;
    }

    if (tag === "br") {
      output = appendNewline(output);
    } else if (tag === "strong" || tag === "b") {
      output += "**";
      strongDepth += 1;
    } else if (tag === "em" || tag === "i") {
      output += "*";
      emphasisDepth += 1;
    } else if (tag === "code") {
      output += "`";
      codeDepth += 1;
    } else if (["p", "div", "li", "tr", "blockquote", "pre"].includes(tag)) {
      if (output && !output.endsWith("\n")) output = appendNewline(output);
    }
  }

  return output
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function generateProblemReadme(input: ProblemReadmeInput): string {
  const { problem } = input;
  const title = problem.translatedTitle?.trim() || problem.title;
  const content =
    problem.translatedContentHtml?.trim() || problem.contentHtml.trim();
  return `**${title}**\n\n${problemHtmlToPlainText(content)}\n`;
}
