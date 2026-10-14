import type { Lang } from "@/types";
import { kstStamp, relTime } from "@/lib/format";

/** A story's time: relative within a day of the edition, else the date; hover shows the exact KST time. `wrap` turns the label into a phrase ("10월 4일 생성"). */
export default function RelTime({ iso, at, lang, wrap }: { iso: string; at: string; lang: Lang; wrap?: (label: string) => string }) {
  const label = relTime(iso, at, lang);
  if (!label) return null;
  return (
    <time dateTime={iso} title={kstStamp(iso)}>
      {wrap ? wrap(label) : label}
    </time>
  );
}
