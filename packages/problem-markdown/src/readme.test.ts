import { describe, expect, it } from "vitest";

import type { Problem } from "@leetcode-daily/domain";
import {
  generateProblemReadme,
  generateSolutionFile,
  sanitizeProblemHtml,
} from ".";

const problem: Problem = {
  site: "leetcode.cn",
  questionId: "1",
  frontendId: "1",
  title: "Two Sum",
  translatedTitle: "两数之和",
  titleSlug: "two-sum",
  difficulty: "Easy",
  contentHtml: "<p>English</p>",
  translatedContentHtml:
    '<p onclick="steal()">中文题目</p><img src="/uploads/example.png" onerror="steal()"><script>alert(1)</script>',
  topicTags: [
    { slug: "array", name: "Array", translatedName: "数组" },
  ],
  canonicalUrl: "https://leetcode.cn/problems/two-sum/",
};

describe("sanitizeProblemHtml", () => {
  it("keeps safe content and external image references", () => {
    const result = sanitizeProblemHtml(
      '<p onclick="x()">正文</p><img src="/uploads/a.png"><iframe src="https://bad.test"></iframe>',
    );
    expect(result).toContain("<p>正文</p>");
    expect(result).toContain('src="https://leetcode.cn/uploads/a.png"');
    expect(result).not.toContain("onclick");
    expect(result).not.toContain("iframe");
  });

  it("removes unsafe URL schemes", () => {
    const result = sanitizeProblemHtml(
      '<img src="javascript:alert(1)"><a href="data:text/html,bad">bad</a>',
    );
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("data:");
  });
});

describe("generateProblemReadme", () => {
  it("keeps only the Chinese title and plain problem description", () => {
    const readme = generateProblemReadme({
      problem,
    });
    expect(readme).toBe("**两数之和**\n\n中文题目\n");
    expect(readme).not.toContain("#");
    expect(readme).not.toContain("English");
    expect(readme).not.toContain("solution");
    expect(readme).not.toContain("查看力扣中国站原题");
  });

  it("converts safe HTML blocks and inline emphasis to readable text", () => {
    const readme = generateProblemReadme({
      problem: {
        ...problem,
        translatedContentHtml:
          "<p>给定 <strong>nums</strong>。</p><p>示例：<em>target</em> = 9</p><ul><li>返回下标</li></ul>",
      },
    });
    expect(readme).toContain("给定 **nums**。");
    expect(readme).toContain("示例：*target* = 9");
    expect(readme).toContain("返回下标");
    expect(readme).not.toContain("<p>");
  });
});

describe("generateSolutionFile", () => {
  it("adds human-readable metadata without changing the code body", () => {
    const result = generateSolutionFile(
      {
        language: "python3",
        titleSlug: problem.titleSlug,
        problemUrl: problem.canonicalUrl,
        submittedAt: "2026-07-24T01:00:00.000Z",
      },
      "class Solution:\n    pass\n",
    );
    expect(result.fileName).toBe("two-sum.py");
    expect(result.content).toContain("# Problem: https://leetcode.cn/problems/two-sum/");
    expect(result.content).toContain("# Accepted at: ");
    expect(result.content).not.toContain("Submission:");
    expect(result.content).not.toContain("LeetCodeDaily");
    expect(result.content).toContain("class Solution:\n    pass");
  });
});
