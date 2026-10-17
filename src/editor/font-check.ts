/** Detects whether a font family is installed by comparing rendered text widths. */
export function isFontInstalled(family: string): boolean {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return true;
  const sample = 'mmmmmmmmmmlli1WΣ∫√∂xyz';
  return ['monospace', 'serif', 'sans-serif'].some((fallback) => {
    ctx.font = `72px ${fallback}`;
    const base = ctx.measureText(sample).width;
    ctx.font = `72px "${family}", ${fallback}`;
    return ctx.measureText(sample).width !== base;
  });
}
