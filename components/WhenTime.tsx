import type { Lang } from "@/types";
import { fmtWhen, kstStamp } from "@/lib/format";

/** A story's absolute KST time ("10월 14일 14:05"); `at` is the edition's generatedAt (decides the year). Hover shows the exact KST stamp. `dateOnly` + `wrap` give phrases like "10월 4일 생성". */
export default function WhenTime({ iso, at, lang, wrap, dateOnly }: { iso: string; at: string; lang: Lang; wrap?: (label: string) => string; dateOnly?: boolean }) {
  const label = fmtWhen(iso, at, lang, dateOnly);
  if (!label) return null;
  return (
    <time dateTime={iso} title={kstStamp(iso)}>
      {wrap ? wrap(label) : label}
    </time>
  );
}
