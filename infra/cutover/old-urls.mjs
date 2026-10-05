// CLI entry of `task bunny:old-urls`; the crawl lives in `seed.mjs`.
import { main } from './seed.mjs';

process.exitCode = await main({
  argv: process.argv.slice(2),
  env: process.env,
  out: (line) => console.log(line),
  err: (line) => console.error(line),
});
