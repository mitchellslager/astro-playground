// @ts-check
import { defineConfig, envField } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	env: {
		schema: {
			CONTENTFUL_SPACE_ID: envField.string({ context: 'server', access: 'secret' }),
			CONTENTFUL_DELIVERY_TOKEN: envField.string({ context: 'server', access: 'secret' }),
			// Only needed to preview unpublished entries in `astro dev`.
			CONTENTFUL_PREVIEW_TOKEN: envField.string({
				context: 'server',
				access: 'secret',
				optional: true,
			}),
			CONTENTFUL_ENVIRONMENT: envField.string({
				context: 'server',
				access: 'secret',
				default: 'master',
			}),
		},
	},
});
