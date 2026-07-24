export type Env = Cloudflare.Env & {
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  TOKEN_ENCRYPTION_KEY?: string;
};
