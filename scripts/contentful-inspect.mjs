/**
 * Prints the content model of your Contentful space so schemas in
 * src/content.config.ts can be written against what actually exists.
 *
 *   pnpm contentful:inspect
 */
import { createClient } from 'contentful';

const { CONTENTFUL_SPACE_ID, CONTENTFUL_DELIVERY_TOKEN, CONTENTFUL_ENVIRONMENT } = process.env;

if (!CONTENTFUL_SPACE_ID || !CONTENTFUL_DELIVERY_TOKEN) {
	console.error('Missing CONTENTFUL_SPACE_ID or CONTENTFUL_DELIVERY_TOKEN. Copy .env.example to .env first.');
	process.exit(1);
}

const client = createClient({
	space: CONTENTFUL_SPACE_ID,
	environment: CONTENTFUL_ENVIRONMENT ?? 'master',
	accessToken: CONTENTFUL_DELIVERY_TOKEN,
});

const { items } = await client.getContentTypes();

if (items.length === 0) {
	console.log('No content types found in this space/environment.');
}

for (const type of items) {
	const { total } = await client.getEntries({ content_type: type.sys.id, limit: 0 });
	console.log(`\n${type.name}  —  id: ${type.sys.id}  (${total} entr${total === 1 ? 'y' : 'ies'})`);
	console.log('  display field:', type.displayField);
	for (const field of type.fields) {
		const kind = field.type === 'Link' ? `Link<${field.linkType}>` : field.type;
		const items = field.items ? `<${field.items.linkType ?? field.items.type}>` : '';
		const flags = [field.required ? 'required' : null, field.localized ? 'localized' : null]
			.filter(Boolean)
			.join(', ');
		console.log(`  - ${field.id}: ${kind}${items}${flags ? `  [${flags}]` : ''}`);
	}
}
