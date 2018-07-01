import fs from 'fs';
import path from 'path';
import relative from 'require-relative';
import { compile, preprocess } from 'svelte';
import { createFilter } from 'rollup-pluginutils';

function sanitize(input) {
	return path
		.basename(input)
		.replace(path.extname(input), '')
		.replace(/[^a-zA-Z_$0-9]+/g, '_')
		.replace(/^_/, '')
		.replace(/_$/, '')
		.replace(/^(\d)/, '_$1');
}

function capitalize(str) {
	return str[0].toUpperCase() + str.slice(1);
}

const pluginOptions = {
	include: true,
	exclude: true,
	extensions: true,
	shared: true
};

function tryRequire(id) {
	try {
		return require(id);
	} catch (err) {
		return null;
	}
}

function tryResolve(pkg, importer) {
	try {
		return relative.resolve(pkg, importer);
	} catch (err) {
		if (err.code === 'MODULE_NOT_FOUND') return null;
		throw err;
	}
}

function exists(file) {
	try {
		fs.statSync(file);
		return true;
	} catch (err) {
		if (err.code === 'ENOENT') return false;
		throw err;
	}
}

export default function svelte(options = {}) {
	const filter = createFilter(options.include, options.exclude);

	const extensions = options.extensions || ['.html', '.svelte'];

	const fixedOptions = {};

	Object.keys(options).forEach(key => {
		// add all options except include, exclude, extensions, and shared
		if (pluginOptions[key]) return;
		fixedOptions[key] = options[key];
	});

	fixedOptions.format = 'es';
	fixedOptions.shared = require.resolve(options.shared || 'svelte/shared.js');

	// handle CSS extraction
	if ('emitCss' in options) {
		if (typeof options.emitCss !== 'boolean') {
			throw new Error('options.emitCss must be a boolean');
		}
	}
	let cssBuffer = new Map();

	if (options.onwarn) {
		fixedOptions.onwarn = options.onwarn;
	}

	return {
		name: 'svelte',

		load(id) {
			if (!cssBuffer.has(id)) return null;
			return cssBuffer.get(id);
		},

		resolveId(importee, importer) {
			if (cssBuffer.has(importee)) { return importee; }
			if (!importer || importee[0] === '.' || importee[0] === '\0' || path.isAbsolute(importee))
				return null;

			// if this is a bare import, see if there's a valid pkg.svelte
			const parts = importee.split('/');
			let name = parts.shift();
			if (name[0] === '@') name += `/${parts.shift()}`;

			const resolved = tryResolve(
				`${name}/package.json`,
				path.dirname(importer)
			);
			if (!resolved) return null;
			const pkg = tryRequire(resolved);
			if (!pkg) return null;

			const dir = path.dirname(resolved);

			if (parts.length === 0) {
				// use pkg.svelte
				if (pkg.svelte) {
					return path.resolve(dir, pkg.svelte);
				}
			} else {
				if (pkg['svelte.root']) {
					const sub = path.resolve(dir, pkg['svelte.root'], parts.join('/'));
					if (exists(sub)) return sub;
				}
			}
		},

		transform(code, id) {
			if (!filter(id)) return null;
			if (!~extensions.indexOf(path.extname(id))) return null;

			return (options.preprocess ? preprocess(code, Object.assign({}, options.preprocess, { filename : id })) : Promise.resolve(code)).then(code => {
				const compiled = compile(
					code.toString(),
					Object.assign({}, {
						onwarn: warning => {
							if (!options.emitCss && warning.code === 'css-unused-selector') return;
							this.warn(warning);
						},
						onerror: error => this.error(error)
					}, fixedOptions, {
						name: capitalize(sanitize(id)),
						filename: id
					})
				);

				let bundle = {
					code: compiled.js ? compiled.js.code : compiled.code,
					map: compiled.js ? compiled.js.map : compiled.map
				};

				if (options.emitCss) {
					// handle pre- and post-1.60 signature
					const css_code = typeof compiled.css === 'string' ? compiled.css : compiled.css && compiled.css.code;
					const css_map = compiled.css && compiled.css.map || compiled.cssMap;

					let fname = id.replace('.html', '.scss');
					cssBuffer.set(fname, { code: css_code, map: css_map });
					bundle.code += `\nimport '${fname}';\n`;
				}

				return bundle;
			});
		}
	};
}
