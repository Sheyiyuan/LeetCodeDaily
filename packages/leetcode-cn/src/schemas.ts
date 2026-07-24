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
  difficulty: z.enum(["All", "Easy", "Medium", "Hard"]),
  count: z.number().int().nonnegative(),
});

export const solvedStatsDataSchema = z.object({
  matchedUser: z
    .object({
      submitStats: z.object({
        acSubmissionNum: z.array(submissionCountSchema),
      }),
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
