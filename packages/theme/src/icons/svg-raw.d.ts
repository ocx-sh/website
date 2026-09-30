// Vite `?raw`: a file's text (the logo SVG, read by Header.astro and favicon.mjs).
declare module '*.svg?raw' {
  const svg: string;
  export default svg;
}
