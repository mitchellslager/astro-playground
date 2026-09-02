import type { Loader, LoaderContext } from 'astro/loaders';
import { createClient, type ContentfulClientApi, type Entry, type EntrySkeletonType } from 'contentful';
import {
	CONTENTFUL_DELIVERY_TOKEN,
	CONTENTFUL_ENVIRONMENT,
	CONTENTFUL_PREVIEW_TOKEN,
	CONTENTFUL_SPACE_ID,
} from 'astro:env/server';

/** Contentful caps `getEntries` at 1000, but 100 keeps responses small. */
const PAGE_SIZE = 100;

export interface ContentfulLoaderOptions {
	/** Content type ID, e.g. `blogPost`. */
	contentType: string;
	/** Field to use as the entry id. Defaults to the Contentful `sys.id`. */
	idField?: string;
	/** How deep to resolve linked entries and assets (Contentful allows 0–10). */
	include?: number;
	/** Extra `getEntries` query params, e.g. `{ order: ['-fields.publishDate'] }`. */
	query?: Record<string, unknown>;
	/**
	 * Reshape a raw entry before schema validation. Return the object your
	 * collection schema expects. Defaults to `entry.fields` plus `sys` dates.
	 */
	transform?: (entry: Entry<EntrySkeletonType>) => Record<string, unknown>;
}

/**
 * Use the preview API in dev so unpublished entries show up, and the delivery
 * API for builds so only published content is deployed. Falls back to the
 * delivery token when no preview token is configured.
 */
function makeClient(): { client: ContentfulClientApi<undefined>; usePreview: boolean } {
	const usePreview = import.meta.env.DEV && Boolean(CONTENTFUL_PREVIEW_TOKEN);

	const client = createClient({
		space: CONTENTFUL_SPACE_ID,
		environment: CONTENTFUL_ENVIRONMENT,
		accessToken: usePreview ? CONTENTFUL_PREVIEW_TOKEN! : CONTENTFUL_DELIVERY_TOKEN,
		host: usePreview ? 'preview.contentful.com' : 'cdn.contentful.com',
	});

	return { client, usePreview };
}

const defaultTransform = (entry: Entry<EntrySkeletonType>): Record<string, unknown> => ({
	...entry.fields,
	createdAt: entry.sys.createdAt,
	updatedAt: entry.sys.updatedAt,
});

/**
 * The Contentful SDK throws errors whose `message` is a large JSON blob, which
 * buries the cause in build output. Translate the three common ones into
 * something actionable and rethrow anything unrecognised untouched.
 */
function explainError(error: unknown, contentType: string, usePreview: boolean): Error {
	if (!(error instanceof Error)) return new Error(String(error));

	let details: { status?: number; details?: { errors?: Array<{ name?: string }> } } = {};
	try {
		details = JSON.parse(error.message);
	} catch {
		return error;
	}

	const hint = (message: string) => new Error(`Contentful: ${message}`, { cause: error });

	if (details.details?.errors?.some((e) => e.name === 'unknownContentType')) {
		return hint(
			`content type "${contentType}" does not exist in this space/environment. ` +
				`Run \`pnpm contentful:inspect\` to list the real content type IDs, then update src/content.config.ts.`
		);
	}
	if (error.name === 'AccessTokenInvalid' || details.status === 401) {
		const variable = usePreview ? 'CONTENTFUL_PREVIEW_TOKEN' : 'CONTENTFUL_DELIVERY_TOKEN';
		return hint(`access token rejected (401). Check ${variable} in .env.`);
	}
	if (details.status === 404) {
		return hint(
			'space or environment not found (404). Check CONTENTFUL_SPACE_ID and CONTENTFUL_ENVIRONMENT in .env.'
		);
	}
	return error;
}

export function contentfulLoader(options: ContentfulLoaderOptions): Loader {
	const { contentType, idField, include = 2, query = {}, transform = defaultTransform } = options;

	return {
		name: `contentful:${contentType}`,
		load: async ({ store, meta, logger, parseData, generateDigest }: LoaderContext) => {
			const { client, usePreview } = makeClient();
			const seen = new Set<string>();
			let skip = 0;
			let total = 0;
			let changed = 0;
			let skipped = 0;

			// Paginate until we've walked the whole content type. `store.set()`
			// returns false when the digest is unchanged, so untouched entries
			// cost nothing on rebuilds.
			while (true) {
				let page;
				try {
					page = await client.getEntries({
						// `query` first: pagination and content_type are ours to
						// control, so they must not be overridable by a caller.
						...query,
						content_type: contentType,
						include,
						limit: PAGE_SIZE,
						skip,
					});
				} catch (error) {
					throw explainError(error, contentType, usePreview);
				}

				// Contentful reports links it could not resolve (usually an
				// unpublished target) rather than failing the request. Surface
				// them, because dependent required fields will fail validation.
				for (const linkError of page.errors ?? []) {
					const { linkType, id } = linkError?.details ?? {};
					logger.warn(
						`Unresolvable ${linkType ?? 'link'}${id ? ` "${id}"` : ''} — the target is probably unpublished.`
					);
				}

				for (const entry of page.items) {
					const id = idField
						? String((entry.fields as Record<string, unknown>)[idField])
						: entry.sys.id;

					if (!id || id === 'undefined') {
						logger.warn(`Skipping entry ${entry.sys.id}: no value for id field "${idField}"`);
						continue;
					}

					// Drafts are legitimately incomplete, so a schema failure on
					// the preview API is expected and must not break `astro dev`.
					// On the delivery API it means published content is broken,
					// which should fail the build.
					let data;
					try {
						data = await parseData({ id, data: transform(entry) });
					} catch (error) {
						if (!usePreview) throw error;
						const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
						logger.warn(`Skipping draft "${id}" — does not satisfy the schema yet (${reason})`);
						skipped++;
						continue;
					}

					seen.add(id);
					if (store.set({ id, data, digest: generateDigest(data) })) changed++;
				}

				total = page.total;
				skip += PAGE_SIZE;
				if (skip >= total) break;
			}

			// Drop entries deleted or unpublished in Contentful since the last run.
			// (A future refinement is client.sync() with a stored nextSyncToken —
			// meta is where that token would live.)
			for (const id of store.keys()) {
				if (!seen.has(id)) store.delete(id);
			}

			meta.set('lastSync', new Date().toISOString());
			const via = usePreview ? 'preview' : 'delivery';
			logger.info(
				`Loaded ${total - skipped}/${total} ${contentType} entries via ${via} API ` +
					`(${changed} changed${skipped ? `, ${skipped} draft(s) skipped` : ''})`
			);
		},
	};
}
