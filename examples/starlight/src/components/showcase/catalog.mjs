// Local data for the async List demo (C-251, S-111): no network. A page answers after `delay` ms
// (the demo's `data-delay`), and `fail` rejects it, so every state can be reached by hand.
export const CATALOG = [
  { value: 'cmake', label: 'cmake', description: 'Cross-platform build system generator', meta: '3.31.6' },
  { value: 'ninja', label: 'ninja', description: 'Small build system focused on speed', meta: '1.12.1' },
  { value: 'bazel', label: 'bazel', description: 'Fast, scalable multi-language builds', meta: '8.1.0' },
  { value: 'clang', label: 'clang', description: 'C language family frontend for LLVM', meta: '19.1.7' },
  { value: 'gcc', label: 'gcc', description: 'The GNU Compiler Collection', meta: '14.2.0' },
  { value: 'meson', label: 'meson', description: 'Build system designed to be fast and friendly', meta: '1.7.0' },
  { value: 'node', label: 'node', description: 'JavaScript runtime built on V8', meta: '22.14.0' },
  { value: 'python', label: 'python', description: 'The Python interpreter', meta: '3.13.2' },
  { value: 'rust', label: 'rust', description: 'Toolchain for the Rust language', meta: '1.85.0' },
  { value: 'zig', label: 'zig', description: 'Compiler and toolchain for Zig and C', meta: '0.14.0' },
];
export const PAGE_SIZE = 4;

/**
 * One page, as the demo's `ocx:list:fetch` handler answers it.
 * @param {{ cursor: string | null, filter: string, sort: { direction: string } | null, signal?: AbortSignal | undefined }} request
 * @param {{ delay: number, fail: boolean }} options
 * @returns {Promise<{ items: typeof CATALOG, cursor?: string }>}
 */
export function page({ cursor, filter, sort, signal }, { delay, fail }) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (fail) return reject(new Error('The catalog is offline (demo).'));
      const rows = CATALOG.filter((p) => p.label.includes(filter.trim().toLowerCase()));
      if (sort?.direction === 'descending') rows.reverse();
      const start = Number(cursor ?? 0);
      const end = start + PAGE_SIZE;
      resolve({ items: rows.slice(start, end), ...(end < rows.length && { cursor: String(end) }) });
    }, delay);
    signal?.addEventListener('abort', () => clearTimeout(timer), { once: true });
  });
}
