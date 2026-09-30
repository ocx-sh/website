import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
  // C-125 stories, rendered only by `pages/stories/[...id].astro`. A collection, not a glob import:
  // `render(entry)` gives each story page its own story's CSS; a glob import in one dynamic route
  // links every story's CSS into every story page. Frontmatter is validated by `parseFrontmatter`.
  stories: defineCollection({
    loader: glob({
      pattern: '**/*.mdx',
      base: './src/stories',
      generateId: ({ entry }) => entry.replace(/\.mdx$/, ''),
    }),
  }),
};
