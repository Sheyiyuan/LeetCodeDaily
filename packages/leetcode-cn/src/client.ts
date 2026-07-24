import {
  LEETCODE_SITE,
  submissionKey,
  type AccountStatus,
  type Problem,
  type SolvedStats,
  type Submission,
} from "@leetcode-daily/domain";
import type { z } from "zod";

import { LeetCodeApiError } from "./errors";
import {
  QUESTION_QUERY,
  SOLVED_STATS_QUERY,
  SUBMISSION_DETAIL_QUERY,
  USER_STATUS_QUERY,
} from "./queries";
import {
  graphQlEnvelopeSchema,
  questionDataSchema,
  solvedStatsDataSchema,
  submissionDetailDataSchema,
  userStatusDataSchema,
} from "./schemas";

const ENDPOINT = "https://leetcode.cn/graphql/";

export interface LeetCodeCnClientOptions {
  fetch?: typeof fetch;
}

export class LeetCodeCnClient {
  readonly endpoint = ENDPOINT;
  private readonly fetchImpl: typeof fetch;

  constructor(options: LeetCodeCnClientOptions = {}) {
    this.fetchImpl = options.fetch ?? fetch;
  }

  async getAccountStatus(): Promise<AccountStatus> {
    const data = await this.request(
      "globalData",
      USER_STATUS_QUERY,
      {},
      userStatusDataSchema,
    );
    const { userStatus } = data;
    return {
      site: LEETCODE_SITE,
      isSignedIn: userStatus.isSignedIn,
      username: userStatus.username || null,
      avatarUrl: userStatus.avatar,
      observedAt: new Date().toISOString(),
    };
  }

  async getQuestion(titleSlug: string): Promise<Problem> {
    const data = await this.request(
      "questionData",
      QUESTION_QUERY,
      { titleSlug },
      questionDataSchema,
    );
    if (!data.question) {
      throw new LeetCodeApiError(
        "INVALID_RESPONSE",
        `Question not found: ${titleSlug}`,
        false,
      );
    }
    const question = data.question;
    return {
      site: LEETCODE_SITE,
      questionId: question.questionId,
      frontendId: question.questionFrontendId,
      title: question.title,
      translatedTitle: question.translatedTitle,
      titleSlug: question.titleSlug,
      difficulty: question.difficulty,
      contentHtml: question.content,
      translatedContentHtml: question.translatedContent,
      topicTags: question.topicTags,
      canonicalUrl: `https://leetcode.cn/problems/${question.titleSlug}/`,
    };
  }

  async getSolvedStats(username: string): Promise<SolvedStats> {
    const data = await this.request(
      "userProfileUserQuestionProgressV2",
      SOLVED_STATS_QUERY,
      { userSlug: username },
      solvedStatsDataSchema,
    );
    if (!data.userProfileUserQuestionProgressV2) {
      throw new LeetCodeApiError(
        "INVALID_RESPONSE",
        `User not found: ${username}`,
        false,
      );
    }

    const counts = new Map(
      data.userProfileUserQuestionProgressV2.numAcceptedQuestions.map((item) => [
        item.difficulty,
        item.count,
      ]),
    );
    return {
      total: [...counts.values()].reduce((sum, count) => sum + count, 0),
      easy: counts.get("EASY") ?? 0,
      medium: counts.get("MEDIUM") ?? 0,
      hard: counts.get("HARD") ?? 0,
      observedAt: new Date().toISOString(),
    };
  }

  async getSubmissionDetail(submissionId: string): Promise<Submission> {
    const data = await this.request(
      "submissionDetail",
      SUBMISSION_DETAIL_QUERY,
      { submissionId },
      submissionDetailDataSchema,
    );
    if (!data.submissionDetail) {
      throw new LeetCodeApiError(
        "INVALID_RESPONSE",
        `Submission not found: ${submissionId}`,
        false,
      );
    }
    if (data.submissionDetail.statusDisplay !== "Accepted") {
      throw new LeetCodeApiError(
        "INVALID_RESPONSE",
        `Submission ${submissionId} is not Accepted`,
        false,
      );
    }

    const detail = data.submissionDetail;
    return {
      key: submissionKey(detail.id),
      site: LEETCODE_SITE,
      submissionId: detail.id,
      problemId: detail.question.questionId,
      frontendId: detail.question.questionFrontendId,
      titleSlug: detail.question.titleSlug,
      status: "Accepted",
      language: detail.lang,
      submittedAt: new Date(detail.timestamp * 1_000).toISOString(),
      code: detail.code,
    };
  }

  private async request<TSchema extends z.ZodType>(
    operationName: string,
    query: string,
    variables: Record<string, unknown>,
    schema: TSchema,
  ): Promise<z.output<TSchema>> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ operationName, query, variables }),
      });
    } catch (cause) {
      throw new LeetCodeApiError(
        "HTTP_ERROR",
        "Unable to reach leetcode.cn",
        true,
        { cause },
      );
    }

    if (!response.ok) {
      throw new LeetCodeApiError(
        "HTTP_ERROR",
        `leetcode.cn returned HTTP ${response.status}`,
        response.status === 429 || response.status >= 500,
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (cause) {
      throw new LeetCodeApiError(
        "INVALID_JSON",
        "leetcode.cn returned invalid JSON",
        true,
        { cause },
      );
    }

    const envelope = graphQlEnvelopeSchema.safeParse(json);
    if (!envelope.success) {
      throw new LeetCodeApiError(
        "INVALID_RESPONSE",
        "Unexpected GraphQL envelope from leetcode.cn",
        true,
        { cause: envelope.error },
      );
    }
    if (envelope.data.errors?.length) {
      throw new LeetCodeApiError(
        "GRAPHQL_ERROR",
        envelope.data.errors.map((error) => error.message).join("; "),
        true,
      );
    }

    const parsed = schema.safeParse(envelope.data.data);
    if (!parsed.success) {
      throw new LeetCodeApiError(
        "INVALID_RESPONSE",
        `Unexpected ${operationName} response from leetcode.cn`,
        true,
        { cause: parsed.error },
      );
    }
    return parsed.data;
  }
}
