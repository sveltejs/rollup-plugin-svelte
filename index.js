const path = require('path');
const relative = require('require-relative');
const { createFilter } = require('rollup-pluginutils');
const { compile, preprocess } = require('svelte/compiler');
const { encode, decode } = require('sourcemap-codec');

const PREFIX = '[rollup-plugin-svelte]';
const pkg_export_errors = new Set();

const plugin_options = new Set([
	'include', 'exclude', 'extensions',
	'preprocess', 'onwarn',
	'emitCss', 'css',
]);

function to_entry_css(bundle) {
	for (let file in bundle) {
		let { name } = path.parse(file);
		return name + '.css';
	}
}

class CssWriter {
	constructor(context, bundle, isDev, code, map) {
		this.code = code;
		this.filename = to_entry_css(bundle);

		this.map = map && {
			version: 3,
			file: null,
			sources: map.sources,
			sourcesContent: map.sourcesContent,
			names: [],
			mappings: encode(map.mappings)
		};

		this.warn = context.warn;
		this.emit = (name, source) => context.emitFile({
			type: 'asset', name, source
		});

		this.sourcemap = (file, mapping) => {
			const ref = this.emit(file, this.code);
			const filename = context.getFileName(ref); // may be "assets/[name][ext]"

			const mapfile = `${filename}.map`; // may be "assets/[name][ext]"
			const toRelative = src => path.relative(path.dirname(file), src);

			if (bundle[filename]) {
				// use `basename` because files are siblings
				// aka, avoid `sourceMappingURL=assets/bundle.css.map` from `assets/bundle.css`
				bundle[filename].source += `\n/*# sourceMappingURL=${path.basename(mapfile)} */`;
			} else {
				// This should not ever happen, but just in case...
				return this.warn(`Missing "${filename}" ("${file}") in bundle; skipping sourcemap!`);
			}

			const source = JSON.stringify({
				...mapping,
				file: path.basename(filename), //=> sibling file
				sources: mapping.sources.map(toRelative),
			}, null, isDev ? 2 : 0);

			// use `fileName` to prevent additional Rollup hashing
			context.emitFile({ type: 'asset', fileName: mapfile, source });
		};
	}

	write(dest = this.filename, map = !!this.map) {
		if (map && this.map) {
			this.sourcemap(dest, this.map);
		} else {
			this.emit(dest, this.code);
		}
	}

	toString() {
		this.warn('[DEPRECATION] As of rollup-plugin-svelte@3, the argument to the `css` function is an object, not a string — use `css.write(file)`. Consult the documentation for more information: https://github.com/rollup/rollup-plugin-svelte');
		return this.code;
	}
}

/**
 * @param [options] {Partial<import('.').Options>}
 * @returns {import('rollup').Plugin}
 */
module.exports = function (options = {}) {
	const { compilerOptions={}, ...rest } = options;
	const extensions = rest.extensions || ['.svelte'];
	const filter = createFilter(rest.include, rest.exclude);

	compilerOptions.format = 'esm';
	const isDev = !!compilerOptions.dev;

	for (let key in rest) {
		if (plugin_options.has(key)) continue;
		console.warn(`${PREFIX} Unknown "${key}" option. Please use \`compilerOptions\` for any Svelte compiler configuration.`);
	}

	const css_cache = new Map(); // [filename]:[chunk]
	const { css, emitCss, onwarn } = rest;

	const ctype = typeof css;
	const toWrite = ctype === 'function' && css;
	if (css != null && !toWrite && ctype !== 'boolean') {
		throw new Error('options.css must be a boolean or a function');
	}

	// block svelte's inline CSS if writer
	const external_css = !!(toWrite || emitCss);
	if (external_css) compilerOptions.css = false;

	return {
		name: 'svelte',

		/**
		 * Resolve an import's full filepath.
		 */
		resolveId(importee, importer) {
			if (css_cache.has(importee)) return importee;
			if (!importer || importee[0] === '.' || importee[0] === '\0' || path.isAbsolute(importee)) return null;

			// if this is a bare import, see if there's a valid pkg.svelte
			const parts = importee.split('/');

			let dir, pkg, name = parts.shift();
			if (name[0] === '@') {
				name += `/${parts.shift()}`;
			}

			try {
				const file = `${name}/package.json`;
				const resolved = relative.resolve(file, path.dirname(importer));
				dir = path.dirname(resolved);
				pkg = require(resolved);
			} catch (err) {
				if (err.code === 'MODULE_NOT_FOUND') return null;
				if (err.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
					pkg_export_errors.add(name);
					return null;
				}
				throw err;
			}

			// use pkg.svelte
			if (parts.length === 0 && pkg.svelte) {
				return path.resolve(dir, pkg.svelte);
			}
		},

		/**
		 * Returns CSS contents for a file, if ours
		 */
		load(id) {
			return css_cache.get(id) || null;
		},

		/**
		 * Transforms a `.svelte` file into a `.js` file.
		 * NOTE: If `emitCss: true`, appends a static `import` for virtual CSS file.
		 */
		async transform(code, id) {
			if (!filter(id)) return null;

			const extension = path.extname(id);
			if (!~extensions.indexOf(extension)) return null;

			const dependencies = [];
			const filename = path.relative(process.cwd(), id);

			if (options.preprocess) {
				const processed = await preprocess(code, options.preprocess, { filename });
				if (processed.dependencies) dependencies.push(...processed.dependencies);
				code = processed.code;
			}

			const compiled = compile(code, { ...compilerOptions, filename });

			(compiled.warnings || []).forEach(warning => {
				if (!css && !emitCss && warning.code === 'css-unused-selector') return;
				if (onwarn) onwarn(warning, this.warn);
				else this.warn(warning);
			});

			if (external_css && compiled.css.code) {
				const fname = id.replace(new RegExp(`\\${extension}$`), '.css');

				if (emitCss) {
					compiled.js.code += `\nimport ${JSON.stringify(fname)};\n`;
					compiled.css.code += `\n/*# sourceMappingURL=${compiled.css.map.toUrl()} */`;
				}

				css_cache.set(fname, compiled.css);
			}

			if (this.addWatchFile) {
				dependencies.forEach(this.addWatchFile);
			} else {
				compiled.js.dependencies = dependencies;
			}

			return compiled.js;
		},

		/**
		 * Write to CSS file if given `options.css` function.
		 * TODO: is there a better way to concat/append into Rollup asset?
		 */
		generateBundle(config, bundle) {
			if (pkg_export_errors.size > 0) {
				console.warn(`\n${PREFIX} The following packages did not export their \`package.json\` file so we could not check the \`svelte\` field. If you had difficulties importing svelte components from a package, then please contact the author and ask them to export the package.json file.\n`);
				console.warn(Array.from(pkg_export_errors, s => `- ${s}`).join('\n') + '\n');
			}

			if (!toWrite) return;

			let result = '';
			const sources = [];
			const sourcesContent = config.sourcemapExcludeSources ? null : [];
			const mappings = [];

			[...css_cache.keys()].sort().forEach(file => {
				const chunk = css_cache.get(file);
				if (!chunk.code) return;

				result += chunk.code + '\n';

				if (config.sourcemap && chunk.map) {
					const len = sources.length;
					sources.push(chunk.map.sources[0]);
					if (sourcesContent) sourcesContent.push(chunk.map.sourcesContent[0]);

					const decoded = decode(chunk.map.mappings);

					if (len > 0) {
						decoded.forEach(line => {
							line.forEach(segment => {
								segment[1] = len;
							});
						});
					}

					mappings.push(...decoded);
				}
			});

			const sourceMap = config.sourcemap && { sources, sourcesContent, mappings };
			toWrite(new CssWriter(this, bundle, isDev, result, sourceMap));
		}
	};
};
