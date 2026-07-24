export interface EncryptionKeySource {
  TOKEN_ENCRYPTION_KEY?: string;
  TOKEN_ENCRYPTION_KEY_RING?: string;
}

export interface EncryptionKeyRing {
  activeVersion: number;
  keys: ReadonlyMap<number, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEncodedAes256Key(value: string): boolean {
  try {
    return atob(value).length === 32;
  } catch {
    return false;
  }
}

export function readEncryptionKeyRing(
  env: EncryptionKeySource,
): EncryptionKeyRing {
  if (!env.TOKEN_ENCRYPTION_KEY_RING) {
    if (!env.TOKEN_ENCRYPTION_KEY) {
      throw new Error("Token encryption key is not configured");
    }
    if (!isEncodedAes256Key(env.TOKEN_ENCRYPTION_KEY)) {
      throw new Error("TOKEN_ENCRYPTION_KEY must encode 32 bytes");
    }
    return {
      activeVersion: 1,
      keys: new Map([[1, env.TOKEN_ENCRYPTION_KEY]]),
    };
  }

  let input: unknown;
  try {
    input = JSON.parse(env.TOKEN_ENCRYPTION_KEY_RING);
  } catch {
    throw new Error("TOKEN_ENCRYPTION_KEY_RING must be valid JSON");
  }
  if (!isRecord(input) || !Number.isInteger(input.activeVersion)) {
    throw new Error("TOKEN_ENCRYPTION_KEY_RING has an invalid activeVersion");
  }
  const activeVersion = Number(input.activeVersion);
  if (activeVersion < 1 || !isRecord(input.keys)) {
    throw new Error("TOKEN_ENCRYPTION_KEY_RING has an invalid key map");
  }

  const keys = new Map<number, string>();
  for (const [versionText, encodedKey] of Object.entries(input.keys)) {
    const version = Number(versionText);
    if (
      !Number.isInteger(version) ||
      version < 1 ||
      String(version) !== versionText ||
      typeof encodedKey !== "string" ||
      !isEncodedAes256Key(encodedKey)
    ) {
      throw new Error("TOKEN_ENCRYPTION_KEY_RING contains an invalid key");
    }
    keys.set(version, encodedKey);
  }
  if (!keys.has(activeVersion)) {
    throw new Error("TOKEN_ENCRYPTION_KEY_RING is missing its active key");
  }
  return { activeVersion, keys };
}

export function encryptionKeyForVersion(
  ring: EncryptionKeyRing,
  version: number,
): string {
  const key = ring.keys.get(version);
  if (!key) throw new Error(`Encryption key version ${version} is unavailable`);
  return key;
}
