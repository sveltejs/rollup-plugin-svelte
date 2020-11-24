import * as path from 'path';
import * as relative from 'require-relative';
import { createFilter } from 'rollup-pluginutils';
import { compile, preprocess } from 'svelte/compiler';
import type { Plugin, PluginImpl, RollupWarning } from 'rollup';
import type { CompileOptions } from 'svelte/types/compiler/interfaces';
import type { PreprocessorGroup } from 'svelte/types/compiler/preprocess';

const PREFIX = '[rollup-plugin-svelte]';
const pkg_export_errors = new Set();

const plugin_options = new Set([
	'emitCss',
	'exclude',
	'extensions',
	'include',
	'onwarn',
	'preprocess'
]);

type Arrayable<T> = T | T[];
type WarningHandler = (warning: RollupWarning | string) => void;

export interface Options {
  /** One or more minimatch patterns */
  include?: Arrayable<string>;

  /** One or more minimatch patterns */
  exclude?: Arrayable<string>;

  /**
   * By default, all ".svelte" files are compiled
   * @default ['.svelte']
   */
  extensions?: string[];

  /**
   * Optionally, preprocess components with svelte.preprocess:
   * @see https://svelte.dev/docs#svelte_preprocess
   */
  preprocess?: Arrayable<PreprocessorGroup>;
  // {
  //   style: ({ content }) => {
  //     return transformStyles(content);
  //   }
  // },

  /** Emit Svelte styles as virtual CSS files for other plugins to process. */
  emitCss?: boolean;

  /** Options passed to `svelte.compile` method. */
  compilerOptions?: CompileOptions;

  /** Custom warnings handler; defers to Rollup as default. */
  onwarn?: (warning: RollupWarning, handler: WarningHandler) => void;
}


const plugin_factory: PluginImpl<Options> = function (options = {}) {
	const { compilerOptions={}, ...rest } = options;
	const extensions = rest.extensions || ['.svelte'];
	const filter = createFilter(rest.include, rest.exclude);

	compilerOptions.format = 'esm';

	for (const key in rest) {
		if (plugin_options.has(key)) continue;
		console.warn(`${PREFIX} Unknown "${key}" option. Please use "compilerOptions" for any Svelte compiler configuration.`);
	}

	// [filename]:[chunk]
	const cache_emit = new Map;
	const { onwarn, emitCss=true } = rest;

	if (emitCss) {
		if (compilerOptions.css) {
			console.warn(`${PREFIX} Forcing \`"compilerOptions.css": false\` because "emitCss" was truthy.`);
		}
		compilerOptions.css = false;
	}

	const plugin_svelte: Plugin = {
		name: 'svelte',

		/**
		 * Resolve an import's full filepath.
		 */
		resolveId(importee, importer) {
			if (cache_emit.has(importee)) return importee;
			if (!importer || importee[0] === '.' || importee[0] === '\0' || path.isAbsolute(importee)) return null;

			// if this is a bare import, see if there's a valid pkg.svelte
			const parts = importee.split('/');

			let dir, pkg, name = parts.shift();
			if (name && name[0] === '@') {
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
			return cache_emit.get(id) || null;
		},

		/**
		 * Transforms a `.svelte` file into a `.js` file.
		 * NOTE: If `emitCss`, append static `import` to virtual CSS file.
		 */
		async transform(this, code, id) {
			if (!filter(id)) return null;

			const extension = path.extname(id);
			if (!~extensions.indexOf(extension)) return null;

			const dependencies = [];
			const filename = path.relative(process.cwd(), id);

			let map;
			if (rest.preprocess) {
				const processed = await preprocess(code, rest.preprocess, { filename });
				if (processed.dependencies) dependencies.push(...processed.dependencies);
				if (processed.map) map = processed.map;
				code = processed.code;
			}

			const compiled = compile(code, { ...compilerOptions, filename, sourcemap: map });

			(compiled.warnings || []).forEach(warning => {
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

		/**
		 * All resolutions done; display warnings wrt `package.json` access.
		 */
		generateBundle() {
			if (pkg_export_errors.size > 0) {
				console.warn(`\n${PREFIX} The following packages did not export their \`package.json\` file so we could not check the "svelte" field. If you had difficulties importing svelte components from a package, then please contact the author and ask them to export the package.json file.\n`);
				console.warn(Array.from(pkg_export_errors, s => `- ${s}`).join('\n') + '\n');
			}
		}
	};
	return plugin_svelte;
};

export default plugin_factory;
