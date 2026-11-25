import type { ReactNode } from "react";

/**
 * Renders a translated string with light inline markup:
 * `**bold**` becomes a medium-weight span and `` `code` `` a monospace span.
 */
export function Rich({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|`(.+?)`/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1] !== undefined) {
      parts.push(
        <span key={match.index} className="font-medium">
          {match[1]}
        </span>,
      );
    } else {
      parts.push(
        <span key={match.index} className="font-mono text-xs">
          {match[2]}
        </span>,
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
