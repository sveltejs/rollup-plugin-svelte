import { basename, extname } from 'path';
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

			let name = basename( id ).replace( extname( id ), '' );
			name = `${name[0].toUpperCase()}${name.slice( 1 )}`;

			return compile( code, {
				name,
				filename: id,
				css: options.css
			});
		}
	};
}
