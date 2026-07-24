export type LeetCodeErrorCode =
  | "HTTP_ERROR"
  | "INVALID_JSON"
  | "GRAPHQL_ERROR"
  | "INVALID_RESPONSE"
  | "SIGNED_OUT";

export class LeetCodeApiError extends Error {
  constructor(
    public readonly code: LeetCodeErrorCode,
    message: string,
    public readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "LeetCodeApiError";
  }
}
