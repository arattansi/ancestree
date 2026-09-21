/**
 * The font size (px) that lets a single line of text fit its box. Text that
 * already fits keeps `max`; wider text scales down in proportion, rounded
 * down to the half pixel, but never below `min` (past that it truncates).
 *
 * @param available the box's inner width
 * @param natural the text's width when set at `max`
 */
export function fitFontSize(
  available: number,
  natural: number,
  max: number,
  min: number,
): number {
  if (natural <= available || natural <= 0 || available <= 0) return max;
  const scaled = Math.floor(((max * available) / natural) * 2) / 2;
  return Math.max(min, Math.min(max, scaled));
}
