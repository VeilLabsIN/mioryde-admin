import { Fragment } from "react";

/**
 * Renders an answer's light markup.
 *
 * ## Why not a markdown library
 *
 * Two reasons, and the second is the real one.
 *
 * The output here is narrow and known: paragraphs, `**bold**`, and occasional
 * `- ` bullets. That is a dozen lines of code against a dependency that brings
 * a parser, a plugin system and a renderer for tables, images and raw HTML the
 * answers never contain.
 *
 * More importantly, a markdown renderer that handles raw HTML is an injection
 * surface, and this text has two sources that are not the repository: a model,
 * and staff notes typed into a box. Neither should ever be able to put an
 * element on the page. This builds React nodes from plain strings — there is no
 * `dangerouslySetInnerHTML` and no HTML parsing anywhere in the path, so the
 * worst a hostile note can do is display asterisks.
 *
 * ## Why it exists at all
 *
 * Without it the retrieval fallback renders `**How do payouts work?**` with the
 * asterisks visible, which reads as a bug in the assistant on the very screen
 * where it most needs to look reliable.
 */
export function AnswerText({ text }: { text: string }) {
  // Blank-line separated blocks. `---` is the fallback's separator between
  // entries and becomes an actual rule.
  const blocks = text.split(/\n{2,}/).filter((b) => b.trim().length > 0);

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const trimmed = block.trim();

        if (/^-{3,}$/.test(trimmed)) {
          return <hr key={i} className="border-line" />;
        }

        const lines = trimmed.split("\n");
        const isList = lines.every((l) => /^\s*[-*]\s+/.test(l));

        if (isList) {
          return (
            <ul key={i} className="space-y-1.5">
              {lines.map((line, j) => (
                <li key={j} className="flex gap-2 text-body leading-relaxed text-fg-soft">
                  <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-accent" />
                  <span>{inline(line.replace(/^\s*[-*]\s+/, ""))}</span>
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={i} className="text-body leading-relaxed text-fg-soft">
            {inline(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

/**
 * `**bold**` inside a line, and nothing else.
 *
 * Split on the delimiter rather than matched with a regex that could catch
 * across a paragraph — an unclosed `**` should render as literal asterisks, not
 * bold the rest of the answer.
 */
function inline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, i) => {
    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    if (bold) {
      return (
        <strong key={i} className="font-medium text-fg">
          {bold[1]}
        </strong>
      );
    }
    // Newlines inside a paragraph are soft wraps in the source, not breaks.
    return <Fragment key={i}>{part}</Fragment>;
  });
}
