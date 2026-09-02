import { documentToHtmlString } from '@contentful/rich-text-html-renderer';
import { BLOCKS, INLINES, type Document } from '@contentful/rich-text-types';

const escapeAttr = (value: unknown) =>
	String(value ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');

/** Contentful asset URLs are protocol-relative. */
const assetUrl = (url: string) => (url.startsWith('//') ? `https:${url}` : url);

/**
 * `documentToHtmlString` renders text and marks out of the box but drops
 * embedded assets and entries, so those need explicit handlers.
 */
export function renderRichText(document: Document | undefined): string {
	if (!document) return '';

	return documentToHtmlString(document, {
		renderNode: {
			[BLOCKS.EMBEDDED_ASSET]: (node) => {
				const asset = node.data?.target;
				const file = asset?.fields?.file;
				// Unresolved link (include depth too shallow) — render nothing
				// rather than a broken image.
				if (!file?.url) return '';

				const alt = escapeAttr(asset.fields.description || asset.fields.title);
				const url = assetUrl(file.url);

				if (!String(file.contentType ?? '').startsWith('image/')) {
					return `<p><a href="${escapeAttr(url)}">${alt || 'Download'}</a></p>`;
				}

				const { width, height } = file.details?.image ?? {};
				const size = width && height ? ` width="${width}" height="${height}"` : '';
				return `<figure><img src="${escapeAttr(`${url}?w=1280&fm=webp`)}" alt="${alt}"${size} loading="lazy" /></figure>`;
			},

			[BLOCKS.EMBEDDED_ENTRY]: (node) => {
				const entry = node.data?.target;
				const { title, slug } = entry?.fields ?? {};
				if (!title) return '';
				return slug
					? `<p><a href="/blog/${escapeAttr(slug)}/">${escapeAttr(title)}</a></p>`
					: `<p>${escapeAttr(title)}</p>`;
			},

			[INLINES.ENTRY_HYPERLINK]: (node, next) => {
				const slug = node.data?.target?.fields?.slug;
				const label = next(node.content);
				return slug ? `<a href="/blog/${escapeAttr(slug)}/">${label}</a>` : label;
			},

			[INLINES.ASSET_HYPERLINK]: (node, next) => {
				const url = node.data?.target?.fields?.file?.url;
				const label = next(node.content);
				return url ? `<a href="${escapeAttr(assetUrl(url))}">${label}</a>` : label;
			},

			[INLINES.HYPERLINK]: (node, next) => {
				const uri = String(node.data?.uri ?? '');
				const external = /^https?:\/\//.test(uri);
				const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
				return `<a href="${escapeAttr(uri)}"${attrs}>${next(node.content)}</a>`;
			},
		},
	});
}
