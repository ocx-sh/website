# Deploy failure modes

You loaded this file because a deploy failed, or you need to know what a
visitor sees after a partial deploy.

| Case | Behaviour | Site afterwards | Fix |
|---|---|---|---|
| Repo owns no claim, `path` not owned, or empty `storage-key` | Exit 1 at step 1, zero requests | Unchanged | Add the claim (theme release), fix `path`, or check the environment secret is visible to the job (`environment: ocx.sh`, running on `main` or a tag the environment allows) |
| Link or layout check fails | Exit 1 at step 2, problems listed, zero writes | Unchanged | Run `npx ocx-site check --dist dist` locally and fix each listed link or file |
| Missing `index.html` or Pagefind entry | Exit 1 at step 2 | Unchanged | Build the right directory; keep Pagefind on for a `search: true` claim |
| Bad key (401 on the listing) | Exit 1 at step 3 | Unchanged | Ask the owner to rotate `BUNNY_STORAGE_KEY` |
| Upload fails after three tries in phase 1 | Exit 1, no phase 2, no prune | Old pages with old assets, plus some new assets: consistent | Re-run the workflow |
| Upload fails in phase 2 | Exit 1, no prune | Each page is old or new, and every page's assets exist | Re-run the workflow |
| Delete fails during prune | Exit 1, names the files | Consistent; stale pages linger until the next deploy | Re-run the workflow |
| Two deploys of the same repo | Serialized by the `concurrency` group | | Keep the group and `cancel-in-progress: false` |

Rollback: redeploy the previous release (dispatch the workflow on the older
tag). Deploys never delete assets, so older pages stay whole.

Geo-replication across Bunny's storage regions can lag by seconds. A page
fetched in that window may miss a just-uploaded asset; it heals on its own.
