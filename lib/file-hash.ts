/** SHA-256 of file contents as lowercase hex (64 chars). Browser-safe. */
export async function sha256HexFromFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function isSha256Hex(s: string): boolean {
  return /^[a-f0-9]{64}$/i.test(s);
}
