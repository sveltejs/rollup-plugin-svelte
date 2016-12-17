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
				css: options.css,
				generate: options.generate,
				format: 'es',

				onerror ( err ) {
					let message = ( err.loc ? `(${err.loc.line}:${err.loc.column}) ` : '' ) + err.message;
					if ( err.frame ) message += `\n${err.frame}`;

					const err2 = new Error( message );
					err2.stack = err.stack;

					throw err2;
				}
			});
		}
	};
}
