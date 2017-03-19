import { basename, extname } from 'path';
import { compile } from 'svelte';
import { createFilter } from 'rollup-pluginutils';

function sanitize ( input ) {
	return basename( input )
		.replace( extname( input ), '' )
		.replace( /[^a-zA-Z_$0-9]+/g, '_' )
		.replace( /^_/, '' )
		.replace( /_$/, '' )
		.replace( /^(\d)/, '_$1' );
}

function capitalize ( str ) {
	return str[0].toUpperCase() + str.slice( 1 );
}

export default function svelte ( options = {} ) {
	const filter = createFilter( options.include, options.exclude );

	const extensions = options.extensions || [ '.html', '.svelte' ];

	return {
		name: 'svelte',

		transform ( code, id ) {
			if ( !filter( id ) ) return null;
			if ( !~extensions.indexOf( extname( id ) ) ) return null;

			const name = capitalize( sanitize( id ) );

			return compile( code, {
				name,
				filename: id,
				css: options.css,
				generate: options.generate,
				format: 'es',
				shared: require.resolve( 'svelte/shared.js' ),

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
