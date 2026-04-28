const enc = new TextEncoder();
const dec = new TextDecoder();

export async function deriveAesKey(password: string, salt: Uint8Array) {
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return await crypto.subtle.deriveKey(
    {name: "PBKDF2", salt, iterations: 250_000, hash: "SHA-256"},
    keyMaterial,
    {name: "AES-GCM", length: 256},
    false,
    ["encrypt", "decrypt"]
  );
}

export function randomBytes(len: number): Uint8Array {
  const b = new Uint8Array(len);
  crypto.getRandomValues(b);
  return b;
}

export function toB64(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data));
}

export function fromB64(data: string): Uint8Array {
  const raw = atob(data);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function encryptText(plaintext: string, password: string) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveAesKey(password, salt);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({name: "AES-GCM", iv}, key, enc.encode(plaintext)));
  return {
    salt: toB64(salt),
    iv: toB64(iv),
    ciphertext: toB64(ciphertext),
  };
}

export async function decryptText(
  payload: {salt: string; iv: string; ciphertext: string},
  password: string
): Promise<string> {
  const key = await deriveAesKey(password, fromB64(payload.salt));
  const plaintext = await crypto.subtle.decrypt(
    {name: "AES-GCM", iv: fromB64(payload.iv)},
    key,
    fromB64(payload.ciphertext)
  );
  return dec.decode(plaintext);
}
