import type { Rule } from "eslint";

// Case-insensitive, backward-looking phrases that mark a comment as
// narrating how the code came to be (debugging history, a past design,
// what a prior version did) rather than stating what the code does now.
// This is a syntactic proxy for a semantic rule (SKILL.md's Comment
// Discipline) — it catches the clearest, most common tells, not every
// violation, and can false-positive on a legitimate comment that happens
// to use one of these words for another reason. Advisory (warn), not a
// precise gate like the other mechanical checks.
const NARRATIVE_MARKERS = [
  "adversarial testing",
  "we found",
  "found that",
  "turns out",
  "used to be",
  "previously",
  "originally",
  "discovered",
  "after debugging",
  "the bug was",
  "this used to",
] as const;

function findMarker(text: string): string | undefined {
  const lower = text.toLowerCase();
  return NARRATIVE_MARKERS.find((marker) => lower.includes(marker));
}

/**
 * Advisory backstop for SKILL.md's Comment Discipline: flags a comment that
 * reads as PR/debugging narrative rather than a feature or an invariant —
 * see NARRATIVE_MARKERS above for the specific phrases it looks for. The
 * actual judgment — is this comment restating the code, or documenting a
 * real constraint — stays with the LLM; this only catches the lexical tell
 * of narrating the past tense.
 */
export const noNarrativeComment: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: {
      narrative: "comment reads as history (\"{{marker}}\") — state the present-tense feature or invariant instead (see SKILL.md Comment Discipline).",
    },
  },
  create(context): Rule.RuleListener {
    return {
      Program(): void {
        context.sourceCode.getAllComments().forEach((comment) => {
          const marker = findMarker(comment.value);
          if (marker && comment.loc) {
            context.report({ loc: comment.loc, messageId: "narrative", data: { marker } });
          }
        });
      },
    };
  },
};
