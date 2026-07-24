import { z } from "zod";

const graphQlErrorSchema = z.object({
  message: z.string(),
});

export const graphQlEnvelopeSchema = z.object({
  data: z.unknown().nullish(),
  errors: z.array(graphQlErrorSchema).optional(),
});

export const userStatusDataSchema = z.object({
  userStatus: z.object({
    isSignedIn: z.boolean(),
    username: z.string(),
    realName: z.string().nullable(),
    avatar: z.string().nullable(),
  }),
});

const topicTagSchema = z.object({
  name: z.string(),
  translatedName: z.string().nullable(),
  slug: z.string(),
});

export const questionDataSchema = z.object({
  question: z
    .object({
      questionId: z.string(),
      questionFrontendId: z.string(),
      title: z.string(),
      translatedTitle: z.string().nullable(),
      titleSlug: z.string(),
      difficulty: z.enum(["Easy", "Medium", "Hard"]),
      content: z.string(),
      translatedContent: z.string().nullable(),
      topicTags: z.array(topicTagSchema),
    })
    .nullable(),
});

const submissionCountSchema = z.object({
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  count: z.number().int().nonnegative(),
});

export const solvedStatsDataSchema = z.object({
  userProfileUserQuestionProgressV2: z
    .object({
      numAcceptedQuestions: z.array(submissionCountSchema),
    })
    .nullable(),
});

export const submissionDetailDataSchema = z.object({
  submissionDetail: z
    .object({
      id: z.string(),
      code: z.string(),
      lang: z.string(),
      timestamp: z.number().int(),
      statusDisplay: z.string(),
      question: z.object({
        questionId: z.string(),
        questionFrontendId: z.string(),
        titleSlug: z.string(),
      }),
    })
    .nullable(),
});

export const solvedProblemListSchema = z.object({
  user_name: z.string(),
  stat_status_pairs: z.array(
    z.object({
      status: z.string().nullable(),
      stat: z.object({
        question_id: z.number().int(),
        question__title_slug: z.string(),
        frontend_question_id: z.string(),
      }),
    }),
  ),
});

export const submissionListDataSchema = z.object({
  submissionList: z.object({
    lastKey: z.string().nullable(),
    hasNext: z.boolean(),
    submissions: z.array(
      z.object({
        id: z.string(),
        statusDisplay: z.string(),
        lang: z.string(),
        // LeetCode.cn currently serializes this Unix timestamp as a string.
        timestamp: z.coerce.number().int(),
      }),
    ),
  }),
});
