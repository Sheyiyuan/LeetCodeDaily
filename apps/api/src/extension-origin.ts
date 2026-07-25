const CHROME_EXTENSION_ORIGIN = /^chrome-extension:\/\/([a-p]{32})$/;

export function allowedExtensionOrigins(env: { ALLOWED_EXTENSION_ORIGIN: string }): string[] {
  return env.ALLOWED_EXTENSION_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => CHROME_EXTENSION_ORIGIN.test(origin));
}

export function isAllowedExtensionOrigin(
  origin: string | null,
  env: { ALLOWED_EXTENSION_ORIGIN: string },
): boolean {
  return origin !== null && allowedExtensionOrigins(env).includes(origin);
}

export function isAllowedChromiumAppRedirect(
  value: unknown,
  env: { ALLOWED_EXTENSION_ORIGIN: string },
): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    const match = url.hostname.match(/^([a-p]{32})\.chromiumapp\.org$/);
    return (
      url.protocol === "https:" &&
      match?.[1] !== undefined &&
      isAllowedExtensionOrigin(`chrome-extension://${match[1]}`, env)
    );
  } catch {
    return false;
  }
}
