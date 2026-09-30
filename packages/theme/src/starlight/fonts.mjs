// Italic faces load with `font-display: optional` (owner decision 2026-09-28): they never block first
// paint and never swap in later (no flicker); prose emphasis uses the italic when cached, else the
// browser's synthesized oblique. Astro's `display` is per family, so the fontsource provider is
// wrapped to set it on the italic faces only; the upright faces keep Astro's default `swap`.

/** @template {import('astro').FontProvider} P @param {P} provider @returns {P} */
export function italicOptional(provider) {
  return {
    ...provider,
    async resolveFont(options) {
      const result = await provider.resolveFont(options);
      return (
        result && {
          ...result,
          fonts: result.fonts.map((face) => (face.style === 'italic' ? { ...face, display: 'optional' } : face)),
        }
      );
    },
  };
}
