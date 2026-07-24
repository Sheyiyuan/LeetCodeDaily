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
  it("uses Chinese content and embeds versioned machine metadata", () => {
    const readme = generateProblemReadme({
      problem,
      solutions: [
        {
          language: "C++",
          submissionId: "123",
          submittedAt: "2026-07-24T01:00:00.000Z",
        },
      ],
    });
    expect(readme).toContain("# 1. 两数之和");
    expect(readme).toContain("中文题目");
    expect(readme).not.toContain("English");
    expect(readme).toContain("leetcode-daily:meta");
    expect(readme).toContain('"schemaVersion":1');
  });

  it("omits the problem body while keeping the source link and solutions", () => {
    const readme = generateProblemReadme({
      problem,
      solutions: [
        {
          language: "python3",
          submissionId: "123",
          submittedAt: "2026-07-24T01:00:00.000Z",
        },
      ],
      includeProblemContent: false,
    });

    expect(readme).not.toContain("## 题目描述");
    expect(readme).not.toContain("中文题目");
    expect(readme).toContain("查看力扣中国站原题");
    expect(readme).toContain("solution.py");
    expect(readme).toContain("leetcode-daily:meta");
  });
});

describe("generateSolutionFile", () => {
  it("adds human-readable metadata without changing the code body", () => {
    const result = generateSolutionFile(
      {
        language: "python3",
        problemUrl: problem.canonicalUrl,
        submissionId: "123",
        submittedAt: "2026-07-24T01:00:00.000Z",
      },
      "class Solution:\n    pass\n",
    );
    expect(result.fileName).toBe("solution.py");
    expect(result.content).toContain("# Submission: 123");
    expect(result.content).toContain("class Solution:\n    pass");
  });
});
