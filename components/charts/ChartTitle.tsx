"use client";
/**
 * A chart's title. Owner: UI person.
 * "leaks" titles are in italics (team call: it reads like your own thought),
 * but an emoji at the end stays upright — browsers would otherwise slant it.
 */
import type { ChartSpec } from "@/lib/types";

const TRAILING_EMOJI = /\s*(\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*)$/u;

export function ChartTitle({ spec }: { spec: ChartSpec }) {
  if (spec.type !== "leaks") return <>{spec.title}</>;
  const m = spec.title.match(TRAILING_EMOJI);
  const text = m ? spec.title.slice(0, m.index) : spec.title;
  return (
    <>
      <span className="italic">{text}</span>
      {m && <span className="not-italic"> {m[1]}</span>}
    </>
  );
}
