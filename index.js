const path = require('path');
const fs = require('fs');
const { createFilter } = require('@rollup/pluginutils');
const { compile, preprocess } = require('svelte/compiler');

const PREFIX = '[rollup-plugin-svelte]';

const plugin_options = new Set([
	'emitCss',
	'exclude',
	'extensions',
	'include',
	'onwarn',
	'preprocess'
]);

/**
 * @param [options] {Partial<import('.').Options>}
 * @returns {import('rollup').Plugin}
 */
module.exports = function (options = {}) {
	const { compilerOptions = {}, ...rest } = options;
	const extensions = rest.extensions || ['.svelte'];
	const filter = createFilter(rest.include, rest.exclude);

	compilerOptions.format = 'esm';

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
		if (compilerOptions.css) {
			console.warn(
				`${PREFIX} Forcing \`"compilerOptions.css": false\` because "emitCss" was truthy.`
			);
		}
		compilerOptions.css = false;
	}

	return {
		name: 'svelte',

		/**
		 * Resolve an import's full filepath.
		 */
		resolveId(importee, importer) {
			if (cache_emit.has(importee)) return importee;
			if (
				!importer ||
				importee[0] === '.' ||
				importee[0] === '\0' ||
				path.isAbsolute(importee)
			)
				return null;

			// if this is a bare import, see if there's a valid pkg.svelte
			const parts = importee.split('/');

			let name = parts.shift();
			if (name && name[0] === '@') {
				name += `/${parts.shift()}`;
			}

			if (parts.length > 0) return;

			let search_dir = importer;
			while (search_dir !== (search_dir = path.dirname(search_dir))) {
				const dir = path.join(search_dir, 'node_modules', name);
				const file = path.join(dir, 'package.json');
				if (fs.existsSync(file)) {
					const pkg = JSON.parse(fs.readFileSync(file, 'utf-8'));
					if (pkg.svelte) {
						return path.resolve(dir, pkg.svelte);
					}
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
				if (processed.dependencies)
					dependencies.push(...processed.dependencies);
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
		}
	};
};
