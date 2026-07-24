export const USER_STATUS_QUERY = /* GraphQL */ `
  query globalData {
    userStatus {
      isSignedIn
      username
      avatar
    }
  }
`;

export const QUESTION_QUERY = /* GraphQL */ `
  query questionData($titleSlug: String!) {
    question(titleSlug: $titleSlug) {
      questionId
      questionFrontendId
      title
      translatedTitle
      titleSlug
      difficulty
      content
      translatedContent
      topicTags {
        name
        translatedName
        slug
      }
    }
  }
`;

// Requires authenticated validation on leetcode.cn before release.
export const SOLVED_STATS_QUERY = /* GraphQL */ `
  query userProfileUserQuestionProgressV2($userSlug: String!) {
    userProfileUserQuestionProgressV2(userSlug: $userSlug) {
      numAcceptedQuestions {
        difficulty
        count
      }
    }
  }
`;

// Requires authenticated validation on leetcode.cn before release.
export const SUBMISSION_DETAIL_QUERY = /* GraphQL */ `
  query submissionDetail($submissionId: ID!) {
    submissionDetail(submissionId: $submissionId) {
      id
      code
      lang
      timestamp
      statusDisplay
      question {
        questionId
        questionFrontendId
        titleSlug
      }
    }
  }
`;

export const SUBMISSION_LIST_QUERY = /* GraphQL */ `
  query submissionList(
    $offset: Int!
    $limit: Int!
    $lastKey: String
    $questionSlug: String!
    $status: SubmissionStatusEnum
  ) {
    submissionList(
      offset: $offset
      limit: $limit
      lastKey: $lastKey
      questionSlug: $questionSlug
      status: $status
    ) {
      lastKey
      hasNext
      submissions {
        id
        statusDisplay
        lang
        timestamp
      }
    }
  }
`;
