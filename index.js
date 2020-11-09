const path = require('path');
const { existsSync } = require('fs');
const relative = require('require-relative');
const { createFilter } = require('rollup-pluginutils');
const { encode, decode } = require('sourcemap-codec');

const pkg_export_errors = new Set();

const to_major = str => Number(str[0]);

function autoload() {
	const pkg = require('svelte/package.json');
	const version = to_major(pkg.version);

	const { compile, preprocess } = require(version >= 3 ? 'svelte/compiler' : 'svelte');
	return { compile, preprocess, version };
}

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
	emitCss: true,
	preprocess: true,

	// legacy — we might want to remove/change these in a future version
	onwarn: true,
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
		if (err.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
			pkg_export_errors.add(pkg.replace(/\/package.json$/, ''));
			return null;
		}
		throw err;
	}
}

class CssWriter {
	constructor(code, filename, map, warn, toAsset) {
		this.code = code;
		this.filename = filename;
		this.emit = toAsset;
		this.warn = warn;
		this.map = {
			version: 3,
			file: null,
			sources: map.sources,
			sourcesContent: map.sourcesContent,
			names: [],
			mappings: map.mappings
		};
	}

	write(dest = this.filename, map = true) {
		const basename = path.basename(dest);

		if (map) {
			this.emit(dest, `${this.code}\n/*# sourceMappingURL=${basename}.map */`);
			this.emit(`${dest}.map`, JSON.stringify({
				version: 3,
				file: basename,
				sources: this.map.sources.map(source => path.relative(path.dirname(dest), source)),
				sourcesContent: this.map.sourcesContent,
				names: [],
				mappings: this.map.mappings
			}, null, 2));
		} else {
			this.emit(dest, this.code);
		}
	}

	toString() {
		this.warn('[DEPRECATION] As of rollup-plugin-svelte@3, the argument to the `css` function is an object, not a string — use `css.write(file)`. Consult the documentation for more information: https://github.com/rollup/rollup-plugin-svelte');
		return this.code;
	}
}

module.exports = function (options = {}) {
	let { compile, preprocess, version } = options.svelte || autoload();
	if (typeof version === 'string') version = to_major(version);

	const filter = createFilter(options.include, options.exclude);
	const extensions = options.extensions || ['.html', '.svelte'];

	const fixed_options = {};

	Object.keys(options).forEach(key => {
		// add all options except include, exclude, extensions, and shared
		if (pluginOptions[key]) return;
		fixed_options[key] = options[key];
	});

	if (version >= 3) {
		fixed_options.format = 'esm';
		fixed_options.sveltePath = options.sveltePath || 'svelte';
	} else {
		fixed_options.format = 'es';
		fixed_options.shared = require.resolve(options.shared || 'svelte/shared.js');
	}

	// handle CSS extraction
	if ('css' in options) {
		if (typeof options.css !== 'function' && typeof options.css !== 'boolean') {
			throw new Error('options.css must be a boolean or a function');
		}
	}

	let css = options.css && typeof options.css === 'function'
		? options.css
		: null;

	// A map from css filename to css contents
	// If css: true we output all contents
	// If emitCss: true we virtually resolve these imports
	const cssLookup = new Map();

	if (css || options.emitCss) {
		fixed_options.css = false;
	}

	return {
		name: 'svelte',

		/**
		 * Returns CSS contents for an id
		 */
		load(id) {
			if (!cssLookup.has(id)) return null;
			return cssLookup.get(id);
		},

		/**
		 * Returns id for import
		 */
		resolveId(importee, importer) {
			if (cssLookup.has(importee)) { return importee; }
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
					// TODO remove this. it's weird and unnecessary
					const sub = path.resolve(dir, pkg['svelte.root'], parts.join('/'));
					if (existsSync(sub)) return sub;
				}
			}
		},

		/**
		 * Transforms a .svelte file into a .js file
		 * Adds a static import for virtual css file when emitCss: true
		 */
		transform(code, id) {
			if (!filter(id)) return null;

			const extension = path.extname(id);

			if (!~extensions.indexOf(extension)) return null;

			const dependencies = [];
			let preprocessPromise;
			if (options.preprocess) {
				if (version < 3) {
					const preprocessOptions = {};
					for (const key in options.preprocess) {
						preprocessOptions[key] = (...args) => {
							return Promise.resolve(options.preprocess[key](...args)).then(
								resp => {
									if (resp && resp.dependencies) {
										dependencies.push(...resp.dependencies);
									}
									return resp;
								}
							);
						};
					}
					preprocessPromise = preprocess(
						code,
						Object.assign(preprocessOptions, { filename: id })
					).then(code => code.toString());
				} else {
					preprocessPromise = preprocess(code, options.preprocess, {
						filename: id
					}).then(processed => {
						if (processed.dependencies) {
							dependencies.push(...processed.dependencies);
						}
						return processed.toString();
					});
				}
			} else {
				preprocessPromise = Promise.resolve(code);
			}

			return preprocessPromise.then(code => {
				let warnings = [];

				const base_options = version < 3
					? {
						onwarn: warning => warnings.push(warning)
					}
					: {};

				const compiled = compile(
					code,
					Object.assign(base_options, fixed_options, {
						filename: id
					}, version >= 3 ? null : {
						name: capitalize(sanitize(id))
					})
				);

				if (version >= 3) warnings = compiled.warnings || compiled.stats.warnings;

				warnings.forEach(warning => {
					if ((!options.css && !options.emitCss) && warning.code === 'css-unused-selector') return;

					if (options.onwarn) {
						options.onwarn(warning, warning => this.warn(warning));
					} else {
						this.warn(warning);
					}
				});

				if ((css || options.emitCss) && compiled.css.code) {
					let fname = id.replace(new RegExp(`\\${extension}$`), '.css');

					if (options.emitCss) {
						const source_map_comment = `/*# sourceMappingURL=${compiled.css.map.toUrl()} */`;
						compiled.css.code += `\n${source_map_comment}`;

						compiled.js.code += `\nimport ${JSON.stringify(fname)};\n`;
					}

					cssLookup.set(fname, compiled.css);
				}

				if (this.addWatchFile) {
					dependencies.forEach(dependency => this.addWatchFile(dependency));
				} else {
					compiled.js.dependencies = dependencies;
				}

				return compiled.js;
			});
		},
		/**
		 * If css: true then outputs a single file with all CSS bundled together
		 */
		generateBundle(options, bundle) {
			if (css) {
				// TODO would be nice if there was a more idiomatic way to do this in Rollup
				let result = '';

				const mappings = [];
				const sources = [];
				const sourcesContent = [];

				const chunks = Array.from(cssLookup.keys()).sort().map(key => cssLookup.get(key));

				for (let chunk of chunks) {
					if (!chunk.code) continue;
					result += chunk.code + '\n';

					if (chunk.map) {
						const i = sources.length;
						sources.push(chunk.map.sources[0]);
						sourcesContent.push(chunk.map.sourcesContent[0]);

						const decoded = decode(chunk.map.mappings);

						if (i > 0) {
							decoded.forEach(line => {
								line.forEach(segment => {
									segment[1] = i;
								});
							});
						}

						mappings.push(...decoded);
					}
				}

				const filename = Object.keys(bundle)[0].split('.').shift() + '.css';

				const writer = new CssWriter(result, filename, {
					sources,
					sourcesContent,
					mappings: encode(mappings)
				}, this.warn, (fileName, source) => {
					this.emitFile({ type: 'asset', fileName, source });
				});

				css(writer);
			}

			if (pkg_export_errors.size < 1) return;

			console.warn('\nrollup-plugin-svelte: The following packages did not export their `package.json` file so we could not check the `svelte` field. If you had difficulties importing svelte components from a package, then please contact the author and ask them to export the package.json file.\n');
			console.warn(Array.from(pkg_export_errors).map(s => `- ${s}`).join('\n') + '\n');
		}
	};
};
