/** `?open=<id>` on an edition page: the story whose dialog should open on arrival. */
export function openParam(search: string): string | null {
  return new URLSearchParams(search).get("open") || null;
}

/** The query string without `open`, ready for history.replaceState (`?a=b`, or "" when nothing is left). */
export function withoutOpen(search: string): string {
  const p = new URLSearchParams(search);
  p.delete("open");
  const s = p.toString();
  return s ? `?${s}` : "";
}
