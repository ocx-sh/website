// The live header's fragment (r10), rendered once from the theme's own components. Not a page: the
// build step in `shell-fragment.mjs` files it under `/_shell/v1/<rev>/` and deletes this output.
import type { APIRoute } from 'astro';
import { renderShell } from '@ocx-sh/theme/shell-render';

export const GET: APIRoute = async () =>
  new Response(await renderShell(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
