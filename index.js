const fs = require('fs');
const path = require('path');
const relative = require('require-relative');
const { version } = require('svelte/package.json');
const { createFilter } = require('rollup-pluginutils');
const { encode, decode } = require('sourcemap-codec');

const major_version = +version[0];

const { compile, preprocess } = major_version >= 3
	? require('svelte/compiler.js')
	: require('svelte');

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

function mkdirp(dir) {
	const parent = path.dirname(dir);
	if (parent === dir) return;

	mkdirp(parent);

	try {
		fs.mkdirSync(dir);
	} catch (err) {
		if (err.code !== 'EEXIST') throw err;
	}
}

class CssWriter {
	constructor (code, map) {
		this.code = code;
		this.map = {
			version: 3,
			file: null,
			sources: map.sources,
			sourcesContent: map.sourcesContent,
			names: [],
			mappings: map.mappings
		};
	}

	write(dest, map) {
		dest = path.resolve(dest);
		mkdirp(path.dirname(dest));

		const basename = path.basename(dest);

		if (map !== false) {
			fs.writeFileSync(dest, `${this.code}\n/*# sourceMappingURL=${basename}.map */`);
			fs.writeFileSync(`${dest}.map`, JSON.stringify({
				version: 3,
				file: basename,
				sources: this.map.sources.map(source => path.relative(path.dirname(dest), source)),
				sourcesContent: this.map.sourcesContent,
				names: [],
				mappings: this.map.mappings
			}, null, '  '));
		} else {
			fs.writeFileSync(dest, this.code);
		}
	}

	toString() {
		console.log('[DEPRECATION] As of rollup-plugin-svelte@3, the argument to the `css` function is an object, not a string — use `css.write(file)`. Consult the documentation for more information: https://github.com/rollup/rollup-plugin-svelte'); // eslint-disable-line no-console
		return this.code;
	}
}

module.exports = function svelte(options = {}) {
	const filter = createFilter(options.include, options.exclude);

	const extensions = options.extensions || ['.html', '.svelte'];

	const fixedOptions = {};

	Object.keys(options).forEach(key => {
		// add all options except include, exclude, extensions, and shared
		if (pluginOptions[key]) return;
		fixedOptions[key] = options[key];
	});

	fixedOptions.format = major_version >= 3 ? 'esm' : 'es';
	fixedOptions.shared = require.resolve(options.shared || (major_version >= 3 ? 'svelte/internal.js' : 'svelte/shared.js'));

	// handle CSS extraction
	if ('css' in options) {
		if (typeof options.css !== 'function' && typeof options.css !== 'boolean') {
			throw new Error('options.css must be a boolean or a function');
		}
	}

	let css = options.css && typeof options.css === 'function'
		? options.css
		: null;

	const cssLookup = new Map();

	if (css || options.emitCss) {
		fixedOptions.css = false;
	}

	if (options.onwarn) {
		fixedOptions.onwarn = options.onwarn;
	}

	return {
		name: 'svelte',

		load(id) {
			if (!cssLookup.has(id)) return null;
			return cssLookup.get(id);
		},

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
					if (exists(sub)) return sub;
				}
			}
		},

		transform(code, id) {
			if (!filter(id)) return null;

			const extension = path.extname(id);

			if (!~extensions.indexOf(extension)) return null;

			const dependencies = [];
			let preprocessPromise;
			if (options.preprocess) {
				const preprocessOptions = {};
				for (const key in options.preprocess) {
					preprocessOptions[key] = (...args) => {
						return Promise.resolve(options.preprocess[key](...args)).then(resp => {
							if (resp && resp.dependencies) {
								dependencies.push(...resp.dependencies);
							}
							return resp;
						});
					};
				}
				preprocessPromise = preprocess(code, Object.assign(preprocessOptions, { filename: id })).then(code => code.toString());
			} else {
				preprocessPromise = Promise.resolve(code);
			}

			return preprocessPromise.then(code => {
				const compiled = compile(
					code,
					Object.assign({}, {
						onwarn: warning => {
							if ((options.css || !options.emitCss) && warning.code === 'css-unused-selector') return;
							this.warn(warning);
						}
					}, fixedOptions, {
						name: capitalize(sanitize(id)),
						filename: id
					})
				);

				if ((css || options.emitCss) && compiled.css.code) {
					let fname = id.replace(extension, '.css');

					if (options.emitCss) {
						const source_map_comment = `/*# sourceMappingURL=${compiled.css.map.toUrl()} */`;
						compiled.css.code += `\n${source_map_comment}`;

						compiled.js.code += `\nimport ${JSON.stringify(fname)};\n`;
					}

					cssLookup.set(fname, compiled.css);
				}

				compiled.js.dependencies = dependencies;

				return compiled.js;
			});
		},
		ongenerate() {
			if (css) {
				// write out CSS file. TODO would be nice if there was a
				// a more idiomatic way to do this in Rollup
				let result = '';

				const mappings = [];
				const sources = [];
				const sourcesContent = [];

				for (let chunk of cssLookup.values()) {
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

				const writer = new CssWriter(result, {
					sources,
					sourcesContent,
					mappings: encode(mappings)
				});

				css(writer);
			}
		}
	};
};
