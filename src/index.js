import { extname } from 'path';
import { compile } from 'svelte';
import { createFilter } from 'rollup-pluginutils';

export default function svelte ( options = {} ) {
	const filter = createFilter( options.include, options.exclude );

	const extensions = options.extensions || [ '.html', '.svelte' ];

	return {
		name: 'svelte',

		transform ( code, id ) {
			if ( !filter( id ) ) return null;
			if ( !~extensions.indexOf( extname( id ) ) ) return null;

			return compile( code );
		}
	};
}
