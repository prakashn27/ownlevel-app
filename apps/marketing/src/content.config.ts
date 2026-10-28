import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

// One file per locale: industries/en/<key>.md, industries/fr/<key>.md
const industries = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/industries" }),
  schema: z.object({
    translationKey: z.string(),
    locale: z.enum(["en", "fr"]),
    slug: z.string(),
    title: z.string(),
    description: z.string(),
    headline: z.string(),
    subhead: z.string(),
    features: z.array(z.object({ title: z.string(), body: z.string() })),
  }),
});

export const collections = { blog, industries };
