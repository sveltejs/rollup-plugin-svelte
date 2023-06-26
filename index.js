const path = require('path');
const fs = require('fs');
const { resolve } = require('resolve.exports');
const { createFilter } = require('@rollup/pluginutils');
const { compile, preprocess, VERSION } = require('svelte/compiler');

const PREFIX = '[rollup-plugin-svelte]';

const plugin_options = new Set([
	'emitCss',
	'exclude',
	'extensions',
	'include',
	'onwarn',
	'preprocess',
]);

let warned = false;

/**
 * @param [options] {Partial<import('.').Options>}
 * @returns {import('rollup').Plugin}
 */
module.exports = function (options = {}) {
	const { compilerOptions = {}, ...rest } = options;
	const extensions = rest.extensions || ['.svelte'];
	const filter = createFilter(rest.include, rest.exclude);

	if (VERSION[0] === '3') {
		compilerOptions.format = 'esm';
	}

	for (const key in rest) {
		if (plugin_options.has(key)) continue;
		console.warn(
			`${PREFIX} Unknown "${key}" option. Please use "compilerOptions" for any Svelte compiler configuration.`
		);
	}

	// [filename]:[chunk]
	const cache_emit = new Map();
	const { onwarn, emitCss = true } = rest;

	if (emitCss) {
		const [majorVer] = VERSION.split('.');
		const cssOptionValue = majorVer > 3 ? 'external' : false;
		if (compilerOptions.css) {
			console.warn(
				`${PREFIX} Forcing \`"compilerOptions.css": ${
					typeof cssOptionValue === 'string' ? `"${cssOptionValue}"` : cssOptionValue
				}\` because "emitCss" was truthy.`
			);
		}
		compilerOptions.css = cssOptionValue;
	}

	return {
		name: 'svelte',

		/**
		 * Resolve an import's full filepath.
		 */
		async resolveId(importee, importer, options) {
			if (cache_emit.has(importee)) return importee;
			if (!importer || importee[0] === '.' || importee[0] === '\0' || path.isAbsolute(importee))
				return null;

			// if this is a bare import, see if there's a valid pkg.svelte
			const parts = importee.split('/');

			let name = parts.shift();
			if (name && name[0] === '@') {
				name += `/${parts.shift()}`;
			}

			const entry = parts.join('/') || '.';

			let pkg;
			let dir;

			let search_dir = importer;
			while (search_dir !== (search_dir = path.dirname(search_dir))) {
				dir = path.join(search_dir, 'node_modules', name);
				const file = path.join(dir, 'package.json');
				if (fs.existsSync(file)) {
					pkg = JSON.parse(fs.readFileSync(file, 'utf-8'));
					break;
				}
			}

			if (!pkg) return;

			// resolve pkg.svelte first for backwards compatibility
			// we should resolve it after exports longer-term
			if (entry === '.' && pkg.svelte) {
				return path.resolve(dir, pkg.svelte);
			}

			const resolved = await this.resolve(importee, importer, { skipSelf: true, ...options });

			// if we can't resolve this import without the `svelte` condition, warn the user
			if (!resolved) {
				try {
					resolve(pkg, entry, { conditions: ['svelte'] });

					if (!warned) {
						console.error(
							"\n\u001B[1m\u001B[31mWARNING: Your @rollup/plugin-node-resolve configuration's 'exportConditions' array should include 'svelte'. See https://github.com/sveltejs/rollup-plugin-svelte#svelte-exports-condition for more information\u001B[39m\u001B[22m\n"
						);
						warned = true;
					}
				} catch (e) {
					// do nothing, this isn't a Svelte library
				}
			}
		},

		/**
		 * Returns CSS contents for a file, if ours
		 */
		load(id) {
			return cache_emit.get(id) || null;
		},

		/**
		 * Transforms a `.svelte` file into a `.js` file.
		 * NOTE: If `emitCss`, append static `import` to virtual CSS file.
		 */
		async transform(code, id) {
			if (!filter(id)) return null;

			const extension = path.extname(id);
			if (!~extensions.indexOf(extension)) return null;

			const dependencies = [];
			const filename = path.relative(process.cwd(), id);
			const svelte_options = { ...compilerOptions, filename };

			if (rest.preprocess) {
				const processed = await preprocess(code, rest.preprocess, { filename });
				if (processed.dependencies) dependencies.push(...processed.dependencies);
				if (processed.map) svelte_options.sourcemap = processed.map;
				code = processed.code;
			}

			const compiled = compile(code, svelte_options);

			(compiled.warnings || []).forEach((warning) => {
				if (!emitCss && warning.code === 'css-unused-selector') return;
				if (onwarn) onwarn(warning, this.warn);
				else this.warn(warning);
			});

			if (emitCss && compiled.css.code) {
				const fname = id.replace(new RegExp(`\\${extension}$`), '.css');
				compiled.js.code += `\nimport ${JSON.stringify(fname)};\n`;
				cache_emit.set(fname, compiled.css);
			}

			if (this.addWatchFile) {
				dependencies.forEach(this.addWatchFile);
			} else {
				compiled.js.dependencies = dependencies;
			}

			return compiled.js;
		},
	};
};
