// Prints the canonical name of the preview site a workflow input names (a name or a slug), or nothing for an
// empty input. An unknown site exits 1, so a dispatch cannot build and then skip every deploy.
import { findSite } from './sites.mjs';

const arg = process.argv[2] ?? '';
process.stdout.write(arg ? findSite(arg).name : '');
