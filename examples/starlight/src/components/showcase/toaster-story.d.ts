// StoryToaster imports the toaster glue under a query: Vite then bundles a private copy for story
// pages, instead of splitting toaster.mjs out of Search.astro's every-page chunk (one more request
// on every page, measured as Lighthouse performance 0.99 on several pages).
declare module '@ocx-sh/theme/toaster?story' {
  export * from '@ocx-sh/theme/toaster';
}
// The same for the CycleButton listener (StoryCycleButton), which Search.astro's chunk also holds.
declare module '@ocx-sh/theme/cycle-button?story' {
  export * from '@ocx-sh/theme/cycle-button';
}
