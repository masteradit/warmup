/** Tiny className joiner. No dependency — keeps the bundle lean. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
