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

const pluginOptions = {
	include: true,
	exclude: true,
	extensions: true
};

export default function svelte ( options = {} ) {
	const filter = createFilter( options.include, options.exclude );

	const extensions = options.extensions || [ '.html', '.svelte' ];

	const fixedOptions = {};

	Object.keys( options ).forEach( key => {
		// add all options except include, exclude, extensions
		if ( pluginOptions[ key ] ) return;
		fixedOptions[ key ] = options[ key ];
	});

	fixedOptions.format = 'es';
	fixedOptions.shared = require.resolve( 'svelte/shared.js' );
	fixedOptions.onerror = err => {
		let message = ( err.loc ? `(${err.loc.line}:${err.loc.column}) ` : '' ) + err.message;
		if ( err.frame ) message += `\n${err.frame}`;

		const err2 = new Error( message );
		err2.stack = err.stack;

		throw err2;
	};

	// handle CSS extraction
	if ( 'css' in options ) {
		if ( typeof options.css !== 'function' && typeof options.css !== 'boolean' ) {
			throw new Error( 'options.css must be a boolean or a function' );
		}
	}

	let css = options.css && typeof options.css === 'function' ? options.css : null;
	const cssLookup = new Map();

	if ( css ) {
		fixedOptions.css = false;
	}

	return {
		name: 'svelte',

		transform ( code, id ) {
			if ( !filter( id ) ) return null;
			if ( !~extensions.indexOf( extname( id ) ) ) return null;

			const compiled = compile( code, Object.assign( {}, fixedOptions, {
				name: capitalize( sanitize( id ) ),
				filename: id
			}));

			if ( css ) cssLookup.set( id, compiled.css );

			return compiled;
		},

		ongenerate () {
			if ( css ) {
				// write out CSS file. TODO would be nice if there was a
				// a more idiomatic way to do this in Rollup
				let result = '';
				for ( let chunk of cssLookup.values() ) {
					result += chunk;
				}

				css( result );
			}
		}
	};
}
