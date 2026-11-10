// Minimal sfnt readers shared by generate-fonts.mjs and test/fonts.test.ts: the cmap codepoints and the
// name IDs of a TrueType/OpenType buffer. Formats 4 and 12 are the only cmap subtables Plex ships.
/** @param {Buffer} buf @returns {Map<string, { offset: number, length: number }>} */
const tables = (buf) => {
  /** @type {Map<string, { offset: number, length: number }>} */
  const out = new Map();
  for (let i = 0, n = buf.readUInt16BE(4); i < n; i++) {
    const at = 12 + i * 16;
    out.set(buf.toString('latin1', at, at + 4), {
      offset: buf.readUInt32BE(at + 8),
      length: buf.readUInt32BE(at + 12),
    });
  }
  return out;
};

/** Codepoint to glyph ID for every codepoint the font maps to a glyph other than .notdef. @param {Buffer} buf @returns {Map<number, number>} */
const cmapGlyphs = (buf) => {
  const cmap = tables(buf).get('cmap');
  if (!cmap) throw new Error('no cmap table');
  const base = cmap.offset;
  /** @type {Map<number, number>} */
  const map = new Map();
  for (let i = 0, n = buf.readUInt16BE(base + 2); i < n; i++) {
    const platform = buf.readUInt16BE(base + 4 + i * 8);
    const sub = base + buf.readUInt32BE(base + 8 + i * 8);
    if (platform !== 0 && platform !== 3) continue;
    const format = buf.readUInt16BE(sub);
    if (format === 12) {
      for (let g = 0, ng = buf.readUInt32BE(sub + 12); g < ng; g++) {
        const at = sub + 16 + g * 12;
        const [lo, hi, gid] = [buf.readUInt32BE(at), buf.readUInt32BE(at + 4), buf.readUInt32BE(at + 8)];
        for (let c = lo; c <= hi; c++) if (gid + (c - lo) !== 0) map.set(c, gid + (c - lo));
      }
    } else if (format === 4) {
      const segs = buf.readUInt16BE(sub + 6) / 2;
      const ends = sub + 14;
      const starts = ends + segs * 2 + 2;
      const deltas = starts + segs * 2;
      const ranges = deltas + segs * 2;
      for (let s = 0; s < segs; s++) {
        const [end, start, delta, ro] = [
          buf.readUInt16BE(ends + s * 2),
          buf.readUInt16BE(starts + s * 2),
          buf.readInt16BE(deltas + s * 2),
          buf.readUInt16BE(ranges + s * 2),
        ];
        for (let c = start; c <= end && c < 0xffff; c++) {
          const raw = ro === 0 ? c : buf.readUInt16BE(ranges + s * 2 + ro + (c - start) * 2);
          const gid = ro !== 0 && raw === 0 ? 0 : (raw + delta) & 0xffff;
          if (gid !== 0) map.set(c, gid);
        }
      }
    }
  }
  return map;
};

/** Every Unicode codepoint the font maps to a glyph other than .notdef. @param {Buffer} buf @returns {number[]} */
export const cmapCodepoints = (buf) => [...cmapGlyphs(buf).keys()].sort((a, b) => a - b);

/** Codepoints whose glyph has no outline (zero contours: spaces, zero-width marks). @param {Buffer} buf @returns {number[]} */
export const emptyOutlineCodepoints = (buf) => {
  const t = tables(buf);
  const [head, loca, glyf] = [t.get('head'), t.get('loca'), t.get('glyf')];
  if (!head || !loca || !glyf) throw new Error('no glyf outlines');
  const long = buf.readInt16BE(head.offset + 50) === 1;
  /** @param {number} g */
  const offset = (g) => (long ? buf.readUInt32BE(loca.offset + g * 4) : buf.readUInt16BE(loca.offset + g * 2) * 2);
  /** @param {number} g */
  const empty = (g) => offset(g + 1) === offset(g) || buf.readInt16BE(glyf.offset + offset(g)) === 0;
  return [...cmapGlyphs(buf)]
    .filter(([, g]) => empty(g))
    .map(([c]) => c)
    .sort((a, b) => a - b);
};

/** The name IDs present in the font's `name` table. @param {Buffer} buf @returns {Set<number>} */
export const nameIds = (buf) => {
  const name = tables(buf).get('name');
  if (!name) return new Set();
  /** @type {Set<number>} */
  const ids = new Set();
  for (let i = 0, n = buf.readUInt16BE(name.offset + 2); i < n; i++)
    ids.add(buf.readUInt16BE(name.offset + 6 + i * 12 + 6));
  return ids;
};

/** The GSUB and GPOS feature tags a font declares. @param {Buffer} buf @returns {Set<string>} */
export const layoutFeatures = (buf) => {
  /** @type {Set<string>} */
  const tags = new Set();
  const t = tables(buf);
  for (const name of ['GSUB', 'GPOS']) {
    const tab = t.get(name);
    if (!tab) continue;
    const list = tab.offset + buf.readUInt16BE(tab.offset + 6);
    for (let i = 0, n = buf.readUInt16BE(list); i < n; i++)
      tags.add(buf.toString('latin1', list + 2 + i * 6, list + 6 + i * 6));
  }
  return tags;
};
