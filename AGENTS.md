## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Contentful

Content is pulled into Astro's content layer by a custom loader
(`src/loaders/contentful.ts`) and exposed as a typed collection, so pages query
it with `getCollection('blog')` instead of calling the API directly.

Setup: `cp .env.example .env` and fill in the space ID and delivery token
(Contentful → Settings → API keys). A missing variable fails the build by name.

- `pnpm contentful:inspect` prints the space's content types and field IDs.
  The schema in `src/content.config.ts` matches the `post` type (title, slug,
  content, excerpt, coverImage, date, author, externalUrl) and the linked
  `author` type. Re-run it after changing the model in Contentful.
- `pnpm dev` uses the preview API when `CONTENTFUL_PREVIEW_TOKEN` is set, so
  drafts show up locally; builds always use the delivery API (published only).
- Entries are fetched at build time, so the site stays fully static. Content
  changes need a rebuild — wire a Contentful webhook to your host to automate it.
