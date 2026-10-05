// Vitest `globalSetup`: the dist-reading tests share one `site/dist`, built here before any worker
// starts so no test's own timeout covers the build or the wait on another run's lock.
import { buildSite } from './build-site.ts';

export default buildSite;
