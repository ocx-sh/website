// The two font tools ship no types; only generate-fonts.mjs and test/fonts.test.ts use them.
declare module 'wawoff2' {
  const wawoff2: {
    compress(data: Uint8Array): Promise<Uint8Array>;
    decompress(data: Uint8Array): Promise<Uint8Array>;
  };
  export default wawoff2;
}
declare module 'subset-font' {
  export default function subsetFont(
    font: Uint8Array,
    text: string,
    options?: {
      targetFormat?: 'sfnt' | 'truetype' | 'woff' | 'woff2';
      keepFeatures?: string[];
      preserveNameIds?: number[];
      dropTables?: string[];
    },
  ): Promise<Buffer>;
}
