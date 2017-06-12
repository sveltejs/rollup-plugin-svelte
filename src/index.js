import fs from 'fs';
import path from 'path';
import relative from 'require-relative';
import { compile } from 'svelte';
import { createFilter } from 'rollup-pluginutils';

function sanitize ( input ) {
	return path.basename( input )
		.replace( path.extname( input ), '' )
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

function tryRequire ( id ) {
	try {
		return require( id );
	} catch ( err ) {
		return null;
	}
}

function exists ( file ) {
	try {
		fs.statSync( file );
		return true;
	} catch ( err ) {
		if ( err.code === 'ENOENT' ) return false;
		throw err;
	}
}

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

		resolveId ( importee, importer ) {
			if ( !importer || path.isAbsolute( importee ) || importee[0] === '.' ) return null;

			// if this is a bare import, see if there's a valid pkg.svelte
			const parts = importee.split('/');
			let name = parts.shift();
			if ( name[0] === '@' ) name += `/${parts.shift()}`;

			const resolved = relative.resolve( `${name}/package.json`, path.dirname( importer ) );
			const pkg = tryRequire( resolved );
			if ( !pkg ) return null;

			const dir = path.dirname(resolved);

			if ( parts.length === 0 ) {
				// use pkg.svelte
				if ( pkg.svelte ) {
					return path.resolve(dir, pkg.svelte);
				}
			} else {
				if ( pkg['svelte.root'] ) {
					const sub = path.resolve(dir, pkg['svelte.root'], parts.join('/'));
					if ( exists( sub ) ) return sub;
				}
			}
		},

		transform ( code, id ) {
			if ( !filter( id ) ) return null;
			if ( !~extensions.indexOf( path.extname( id ) ) ) return null;

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
					result += chunk || '';
				}

				css( result );
			}
		}
	};
}
