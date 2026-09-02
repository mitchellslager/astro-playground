import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import type { Document } from '@contentful/rich-text-types';
import { contentfulLoader } from './loaders/contentful';

/**
 * A resolved Contentful asset, flattened to the bits a template needs.
 * Contentful returns protocol-relative URLs, so force https.
 */
const contentfulAsset = z
	.object({
		fields: z.object({
			title: z.string().optional(),
			description: z.string().optional(),
			file: z.object({
				url: z.string(),
				contentType: z.string().optional(),
				details: z
					.object({
						image: z.object({ width: z.number(), height: z.number() }).optional(),
					})
					.optional(),
			}),
		}),
	})
	.transform((asset) => ({
		url: asset.fields.file.url.startsWith('//')
			? `https:${asset.fields.file.url}`
			: asset.fields.file.url,
		title: asset.fields.title ?? '',
		description: asset.fields.description ?? '',
		contentType: asset.fields.file.contentType,
		width: asset.fields.file.details?.image?.width,
		height: asset.fields.file.details?.image?.height,
	}));

/** The linked `author` entry, resolved via the loader's `include` depth. */
const contentfulAuthor = z
	.object({
		fields: z.object({
			name: z.string(),
			picture: contentfulAsset,
		}),
	})
	.transform((author) => ({
		name: author.fields.name,
		picture: author.fields.picture,
	}));

/**
 * RichText fields arrive as a JSON document. Validate the outer shape only —
 * the renderer walks the node tree itself.
 */
const richTextDocument = z.custom<Document>(
	(value) => typeof value === 'object' && value !== null && 'nodeType' in value,
	{ message: 'Expected a Contentful rich-text document' }
);

/** Matches the `post` content type. `pnpm contentful:inspect` prints the model. */
const blog = defineCollection({
	loader: contentfulLoader({
		contentType: 'post',
		// `slug` is required in the model, so it's safe as the entry id / route.
		idField: 'slug',
		// post -> author (1) -> author.picture asset (2)
		include: 2,
		query: { order: ['-fields.date'] },
	}),
	schema: z.object({
		title: z.string(),
		slug: z.string(),
		content: richTextDocument,
		excerpt: z.string(),
		coverImage: contentfulAsset,
		date: z.coerce.date(),
		author: contentfulAuthor,
		// The only optional field in the model.
		externalUrl: z.string().optional(),
		createdAt: z.coerce.date(),
		updatedAt: z.coerce.date(),
	}),
});

export const collections = { blog };
