# astro-playground

A scratch Astro site for trying things out against real services. Two
integrations are wired up:

- **VGZ design-system web components** — the `cvgz-ds-*` custom elements, loaded
  from the CDN and used on real pages.
- **Contentful** — content pulled in at build time through Astro's content layer
  and rendered as static HTML.

The site is fully static. There is no adapter and no server output, so `dist/`
deploys to any static host.

## Getting started

Requires Node ≥ 22.12 and pnpm.

```sh
pnpm install
cp .env.example .env   # then fill in your Contentful credentials
pnpm dev               # http://localhost:4200
```

Without a `.env`, the build stops immediately and names the missing variable —
the Contentful pages cannot render without it.

## Commands

| Command                   | What it does                                                  |
| :------------------------ | :------------------------------------------------------------ |
| `pnpm dev`                | Dev server on **:4200** (preview API — drafts included)       |
| `pnpm build`              | Static build to `./dist/` (delivery API — published only)     |
| `pnpm preview`            | Serve the build on **:4200**                                  |
| `pnpm contentful:inspect` | Print the space's content types and field IDs                 |
| `pnpm astro ...`          | Astro CLI (`astro add`, `astro check`, …)                     |

Both `dev` and `preview` are pinned to port 4200, so only one can run at a time.
Stop the other with `astro dev stop` / `astro preview stop`.

To check a production build, run `pnpm build && pnpm preview` — opening
`dist/**/index.html` directly over `file://` does **not** work, because ES
modules will not load and root-absolute asset paths do not resolve.

## Pages

| Route              | Source                        | What it exercises                          |
| :----------------- | :---------------------------- | :----------------------------------------- |
| `/`                | `src/pages/index.astro`       | Default Astro welcome page                 |
| `/web-components`  | `src/pages/web-components.astro` | DS component gallery, brand/theme switcher |
| `/blog`            | `src/pages/blog/index.astro`  | Contentful posts, listed with `cvgz-ds-news` |
| `/blog/<slug>`     | `src/pages/blog/[id].astro`   | One page per entry, rich text rendered     |

## Design-system web components

The four CDN assets (fonts, brand tokens, CSS utilities, components bundle) are
declared once in `src/layouts/Layout.astro`. That layout takes props:

```astro
<Layout title="…" brand="vgz" theme="light">
```

`brand` picks the token stylesheet — `vgz`, `unive`, `zekur`, or `iza`. `theme`
sets `data-theme` on `<html>`. `/web-components` can switch both at runtime.

The components script carries `is:inline` so Astro leaves the remote URL alone
instead of trying to bundle it, and so it stays first in `<head>`.

### Finding a component's API

There are no published docs for these components, so read the bundles:

```sh
# every element and its pinned version (92 of them)
curl -s https://tst.cdn.vgz.nl/ui-assets/ds/components/v/latest/index.js \
  | grep -oE 'cvgz-ds-[a-z-]+/v/[0-9.]+' | sort -u

# one component's real attributes
curl -s https://tst.cdn.vgz.nl/ui-assets/ds/components/cvgz-ds-button/v/1.3.0/cvgz-ds-button.js \
  | grep -oE 'attribute:"[a-z-]+"' | sort -u
```

Worth knowing, because guessing gets it wrong:

- `cvgz-ds-news` builds its own anchor from a **`link`** attribute, not `href`,
  and only shows its image when **`data-image`** is set.
- `cvgz-ds-date` is a date **input**, not a date display.
- Icon names are partial and Dutch-flavoured. Present: `arrow-right`,
  `arrow-left`, `chevron-left/right`, `calender`, `clock`, `warning-s`,
  `error-s`, `success-s`. Absent: `calendar`, `external-link`, `user`, `info-s`.
- Typography utilities are plain classes (`.cvgz-ds-h1`, `.cvgz-ds-intro`,
  `.cvgz-ds-label--small`). Injected HTML can't carry them, so rich text is
  styled from the underlying tokens instead.

This is the **test** CDN (`tst.cdn.vgz.nl`) and the components bundle is
documented as dev-environment only. Do not ship it to production as-is.

## Contentful

A custom content-layer loader (`src/loaders/contentful.ts`) syncs entries into
Astro's content store, so pages use typed local queries rather than calling the
API themselves:

```ts
const posts = await getCollection('blog');
```

```
src/loaders/contentful.ts   loader: pagination, digest caching, preview/delivery
src/content.config.ts       the `blog` collection + Zod schema
src/lib/rich-text.ts        rich-text document -> HTML
scripts/contentful-inspect.mjs   prints the content model
```

`blog` is just the local collection name; the content type it fetches is `post`,
set via `contentType` in `src/content.config.ts`. The two do not need to match.

The schema covers the `post` type (`title`, `slug`, `content`, `excerpt`,
`coverImage`, `date`, `author`, `externalUrl`) and the linked `author` entry.
After changing the model in Contentful, run `pnpm contentful:inspect` and
reconcile the schema — a mismatch fails the build with a named Zod error rather
than rendering blank pages.

### Behaviour to know about

- **Dev vs build.** With `CONTENTFUL_PREVIEW_TOKEN` set, `pnpm dev` uses the
  preview API and shows drafts; builds always use the delivery API. Drafts that
  don't satisfy the schema are skipped with a warning in dev, but a schema
  failure during a build is fatal — published content should be valid.
- **Sorting.** `getCollection()` returns entries ordered by id, *not* in the
  order the loader queried them. Sort explicitly in the page.
- **Caching.** Entries carry a content digest, so unchanged ones are skipped on
  rebuild. Deleting `node_modules/.astro` forces a full re-sync — don't do it
  while a dev server is running, or that server will serve an empty collection
  until restarted.
- **Rebuilds.** Content is fetched at build time, so publishing in Contentful
  needs a rebuild. Point a Contentful webhook at your host to automate it.
- **Locales.** `title` and `content` are localized in the model, but only the
  default locale is fetched. Multi-locale would need a `locale` param and a
  decision on how to shape the collections.

## Environment variables

Validated by `env.schema` in `astro.config.mjs`; `.env` is gitignored.

| Variable                    | Required | Purpose                                  |
| :-------------------------- | :------- | :--------------------------------------- |
| `CONTENTFUL_SPACE_ID`       | yes      | Target space                             |
| `CONTENTFUL_DELIVERY_TOKEN` | yes      | Published content (builds)                |
| `CONTENTFUL_PREVIEW_TOKEN`  | no       | Drafts in `pnpm dev`                     |
| `CONTENTFUL_ENVIRONMENT`    | no       | Defaults to `master`                     |

Tokens live in Contentful under Settings → API keys.

## Reference

- [Astro docs](https://docs.astro.build) ·
  [content loaders](https://docs.astro.build/en/reference/content-loader-reference/) ·
  [typed env](https://docs.astro.build/en/guides/environment-variables/)
- [Contentful delivery API](https://www.contentful.com/developers/docs/references/content-delivery-api/)
- Agent-facing notes: [`AGENTS.md`](./AGENTS.md)
