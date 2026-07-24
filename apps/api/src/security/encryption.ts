function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64Decode(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function ownedBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

async function importKey(encodedKey: string): Promise<CryptoKey> {
  const raw = base64Decode(encodedKey);
  if (raw.byteLength !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return crypto.subtle.importKey("raw", ownedBuffer(raw), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptSecret(
  plaintext: string,
  encodedKey: string,
): Promise<{ ciphertext: string; nonce: string }> {
  const key = await importKey(encodedKey);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ownedBuffer(nonce) },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    ciphertext: base64Encode(new Uint8Array(ciphertext)),
    nonce: base64Encode(nonce),
  };
}

export async function decryptSecret(
  ciphertext: string,
  nonce: string,
  encodedKey: string,
): Promise<string> {
  const key = await importKey(encodedKey);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ownedBuffer(base64Decode(nonce)) },
    key,
    ownedBuffer(base64Decode(ciphertext)),
  );
  return new TextDecoder().decode(plaintext);
}
