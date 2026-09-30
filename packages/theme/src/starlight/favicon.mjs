/// <reference path="../icons/svg-raw.d.ts" />
// Default favicon endpoint, injected at `/favicon.svg` (Starlight's default
// `favicon`) only when the consumer ships none: serves the theme logo.
import logo from '../logo.svg?raw';

export const GET = () => new Response(logo, { headers: { 'Content-Type': 'image/svg+xml' } });
