import temml from 'temml';

/** Macros MathLive may emit that Temml does not know, plus our own shortcuts. */
const MACROS: Record<string, string> = {
  '\\differentialD': '\\mathrm{d}',
  '\\exponentialE': '\\mathrm{e}',
  '\\imaginaryI': '\\mathrm{i}',
  '\\imaginaryJ': '\\mathrm{j}',
  '\\arc': '\\overset{\\frown}{#1}',
  '\\R': '\\mathbb{R}',
  '\\N': '\\mathbb{N}',
  '\\Z': '\\mathbb{Z}',
  '\\Q': '\\mathbb{Q}',
  '\\C': '\\mathbb{C}',
};

/** Removes editor-only markup (empty placeholders) from LaTeX. */
export function cleanLatex(latex: string): string {
  return latex.replace(/\\placeholder(\[[^\]]*\])?\{[^}]*\}/g, '{}').trim();
}

/** Cleans LaTeX produced by the editor so it is safe to hand to Temml. */
export function normalizeLatex(latex: string): string {
  return cleanLatex(latex)
    .replace(/\^\s*\{\s*\\circ\s*\}|\^\s*\\circ\b/g, '\\degree ')
    // Temml renders \overset as a superscript; \stackrel (same argument order) stacks properly.
    .replace(/\\overset(?![a-zA-Z])/g, '\\stackrel')
    .trim();
}

/** LaTeX -> MathML <math> element (throws on invalid input). */
export function latexToMathml(latex: string, display = false): string {
  return temml.renderToString(normalizeLatex(latex), {
    xml: true,
    displayMode: display,
    throwOnError: true,
    macros: { ...MACROS },
  });
}
