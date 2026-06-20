export async function sha256(str: string): Promise<string> {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export function avatarUrl(name: string): string {
  const encoded = encodeURIComponent(name.trim().replace(/\s+/g, " "));
  const colors = ["6c63ff", "f093fb", "00c896", "54a0ff", "ffa502", "ff4757"];
  const color = colors[name.charCodeAt(0) % colors.length];
  return `https://ui-avatars.com/api/?name=${encoded}&background=${color}&color=fff&size=80`;
}
