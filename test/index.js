const fs = require('fs');
const path = require('path');
const { test } = require('uvu');
const assert = require('uvu/assert');
const { SourceMapConsumer } = require('source-map');
const { getLocator } = require('locate-character');
const { rollup } = require('rollup');
const sander = require('sander');

const plugin = require('..');

// TODO(lukeed) do this within uvu?
const normalize = file => fs.readFileSync(file, 'utf8').replace(/\r?\n/g, '\n');

test('resolves using pkg.svelte', () => {
	const { resolveId } = plugin();
	assert.is(
		resolveId('widget', path.resolve('test/foo/main.js')),
		path.resolve('test/node_modules/widget/src/Widget.html')
	);
});

test('resolves using pkg.svelte.root', () => {
	const { resolveId } = plugin();
	assert.is(
		resolveId('widgets/Foo.html', path.resolve('test/foo/main.js')),
		path.resolve('test/node_modules/widgets/src/Foo.html')
	);
});

test('ignores built-in modules', () => {
	const { resolveId } = plugin();
	assert.ok(
		resolveId('path', path.resolve('test/foo/main.js')) == null
	);
});

test('ignores esm modules that do not export package.json', () => {
	const { resolveId } = plugin();
	assert.ok(
		resolveId('esm-no-pkg-export', path.resolve('test/foo/main.js')) == null
	);
});

test('resolves esm module that exports package.json', () => {
	const { resolveId } = plugin();
	assert.is(
		resolveId('esm-component', path.resolve('test/foo/main.js')),
		path.resolve('test/node_modules/esm-component/src/Component.svelte')
	);
});

test('ignores virtual modules', () => {
	const { resolveId } = plugin();
	assert.ok(
		resolveId('path', path.resolve('\0some-plugin-generated-module')) == null
	);
});

test('supports component name assignment', async () => {
	const { transform } = plugin();
	const index = await transform('', 'index.svelte');

	assert.is.not(index.code.indexOf('class Index extends SvelteComponent'), -1);

	const card = await transform('', 'card/index.svelte');
	assert.is(card.code.indexOf('class Index extends SvelteComponent'), -1);
	assert.is.not(card.code.indexOf('class Card extends SvelteComponent'), -1);
});

test('creates a {code, map, dependencies} object, excluding the AST etc', async () => {
	const { transform } = plugin();
	const compiled = await transform('', 'test.html');
	assert.equal(Object.keys(compiled), ['code', 'map', 'dependencies']);
});

test('does not generate a CSS sourcemap by default', async () => {
	sander.rimrafSync('test/sourcemap-test/dist');
	sander.mkdirSync('test/sourcemap-test/dist');

	let css;

	const bundle = await rollup({
		input: 'test/sourcemap-test/src/main.js',
		plugins: [
			plugin({
				css: value => {
					css = value;
					css.write('bundle.css');
				}
			})
		],
		external: ['svelte/internal']
	});

	await bundle.write({
		format: 'iife',
		sourcemap: false,
		file: 'test/sourcemap-test/dist/bundle.js',
		globals: { 'svelte/internal': 'svelte' },
		assetFileNames: '[name][extname]',
	});

	assert.not.match(css.code, 'sourceMappingURL');
	assert.is(css.map, false);
});

test('can generate a CSS sourcemap – a la Rollup config', async () => {
	sander.rimrafSync('test/sourcemap-test/dist');
	sander.mkdirSync('test/sourcemap-test/dist');

	let css;

	const bundle = await rollup({
		input: 'test/sourcemap-test/src/main.js',
		plugins: [
			plugin({
				css: value => {
					css = value;
					css.write('test/sourcemap-test/dist/bundle.css');
				}
			})
		],
		external: ['svelte/internal']
	});

	await bundle.write({
		format: 'iife',
		sourcemap: true,
		file: 'test/sourcemap-test/dist/bundle.js',
		globals: { 'svelte/internal': 'svelte' },
		assetFileNames: '[name][extname]',
	});

	const smc = await new SourceMapConsumer(css.map);
	const locator = getLocator(css.code);

	const generatedFooLoc = locator('.foo');
	const originalFooLoc = smc.originalPositionFor({
		line: generatedFooLoc.line + 1,
		column: generatedFooLoc.column
	});

	assert.equal(
		{
			source: originalFooLoc.source.replace(/\//g, path.sep),
			line: originalFooLoc.line,
			column: originalFooLoc.column,
			name: originalFooLoc.name
		},
		{
			source: 'Foo.html',
			line: 5,
			column: 1,
			name: null
		}
	);

	const generatedBarLoc = locator('.bar');
	const originalBarLoc = smc.originalPositionFor({
		line: generatedBarLoc.line + 1,
		column: generatedBarLoc.column
	});

	assert.equal(
		{
			source: originalBarLoc.source.replace(/\//g, path.sep),
			line: originalBarLoc.line,
			column: originalBarLoc.column,
			name: originalBarLoc.name
		},
		{
			source: 'Bar.html',
			line: 4,
			column: 1,
			name: null
		}
	);
});

test('respects `sourcemapExcludeSources` Rollup option', async () => {
	sander.rimrafSync('test/sourcemap-test/dist');
	sander.mkdirSync('test/sourcemap-test/dist');

	let css;

	const bundle = await rollup({
		input: 'test/sourcemap-test/src/main.js',
		plugins: [
			plugin({
				css: value => {
					css = value;
					css.write('test/sourcemap-test/dist/bundle.css');
				}
			})
		],
		external: ['svelte/internal']
	});

	await bundle.write({
		format: 'iife',
		sourcemap: true,
		sourcemapExcludeSources: true,
		file: 'test/sourcemap-test/dist/bundle.js',
		globals: { 'svelte/internal': 'svelte' },
		assetFileNames: '[name][extname]',
	});

	assert.ok(css.map);
	assert.is(css.map.sources.length, 0);
	assert.is(css.map.sourcesContent.length, 0);
});

test('produces readable sourcemap output when `dev` is truthy', async () => {
	sander.rimrafSync('test/sourcemap-test/dist');
	sander.mkdirSync('test/sourcemap-test/dist');

	let css;

	const bundle = await rollup({
		input: 'test/sourcemap-test/src/main.js',
		plugins: [
			plugin({
				dev: true,
				css: value => {
					css = value;
					css.write('bundle.css');
				}
			})
		],
		external: ['svelte/internal']
	});

	await bundle.write({
		format: 'iife',
		sourcemap: true,
		file: 'test/sourcemap-test/dist/bundle.js',
		globals: { 'svelte/internal': 'svelte' },
		assetFileNames: '[name].[ext]'
	});

	const content = fs.readFileSync('test/sourcemap-test/dist/bundle.css.map', 'utf-8');
	assert.is(content.includes('\n'), true);
});

test('squelches CSS warnings if css: false', () => {
	const { transform } = plugin({
		css: false
	});

	transform.call({
		warn: warning => {
			throw new Error(warning.message);
		}
	}, `
		<div></div>
		<style>
			.unused {
				color: red;
			}
		</style>
	`, 'test.html');
});

test('preprocesses components', async () => {
	const { transform } = plugin({
		preprocess: {
			markup: ({ content, filename }) => {
				return {
					code: content
						.replace('__REPLACEME__', 'replaced')
						.replace('__FILENAME__', filename),
					dependencies: ['foo'],
				};
			},
			style: () => null,
		}
	});

	const { code, dependencies } = await transform(`
		<h1>Hello __REPLACEME__!</h1>
		<h2>file: __FILENAME__</h2>
		<style>h1 { color: red; }</style>
	`, 'test.html');

	assert.is(code.indexOf('__REPLACEME__'), -1, 'content not modified');
	assert.is.not(code.indexOf('file: test.html'), -1, 'filename not replaced');
	assert.equal(dependencies, ['foo']);
});

test('emits a CSS file', async () => {
	const { load, transform } = plugin({
		emitCss: true
	});

	const transformed = await transform(`<h1>Hello!</h1>

	<style>
		h1 {
			color: red;
		}
	</style>`, `path/to/Input.html`);

	assert.ok(transformed.code.indexOf(`import "path/to/Input.css";`) !== -1);

	const css = load('path/to/Input.css');

	const smc = await new SourceMapConsumer(css.map);

	const loc = smc.originalPositionFor({
		line: 1,
		column: 0
	});

	assert.is(loc.source, 'Input.html');
	assert.is(loc.line, 4);
	assert.is(loc.column, 2);
});

test('properly escapes CSS paths', async () => {
	const { load, transform } = plugin({
		emitCss: true
	});

	const transformed = await transform(`<h1>Hello!</h1>

	<style>
		h1 {
			color: red;
		}
	</style>`, `path\\t'o\\Input.html`);

	assert.ok(transformed.code.indexOf(`import "path\\\\t'o\\\\Input.css";`) !== -1);

	const css = load(`path\\t'o\\Input.css`);

	const smc = await new SourceMapConsumer(css.map);

	const loc = smc.originalPositionFor({
		line: 1,
		column: 0
	});

	assert.is(loc.source, 'Input.html');
	assert.is(loc.line, 4);
	assert.is(loc.column, 2);
});

test('intercepts warnings', async () => {
	const warnings = [];
	const handled = [];

	const { transform } = plugin({
		onwarn(warning, handler) {
			warnings.push(warning);

			if (warning.code === 'a11y-hidden') {
				handler(warning);
			}
		}
	});

	await transform.call({
		warn: warning => {
			handled.push(warning);
		}
	}, `
		<h1 aria-hidden>Hello world!</h1>
		<marquee>wheee!!!</marquee>
	`, 'test.html');

	assert.equal(warnings.map(w => w.code), ['a11y-hidden', 'a11y-distracting-elements']);
	assert.equal(handled.map(w => w.code), ['a11y-hidden']);
});

test('bundles CSS deterministically', async () => {
	sander.rimrafSync('test/deterministic-css/dist');
	sander.mkdirSync('test/deterministic-css/dist');

	let css;

	const bundle = await rollup({
		input: 'test/deterministic-css/src/main.js',
		plugins: [
			{
				resolveId: async (id) => {
					if (/A\.svelte/.test(id)) {
						await new Promise(f => setTimeout(f, 50));
					}
				}
			},
			plugin({
				css: value => {
					css = value;
					css.write('bundle.css');
				}
			})
		],
		external: ['svelte/internal']
	});

	await bundle.write({
		format: 'iife',
		file: 'test/deterministic-css/dist/bundle.js',
		globals: { 'svelte/internal': 'svelte' },
		assetFileNames: '[name].[ext]',
		sourcemap: true,
	});

	assert.fixture(
		normalize('test/deterministic-css/dist/bundle.css'),
		normalize('test/deterministic-css/expected/bundle.css')
	);
});

test('respects `assetFileNames` Rollup format', async () => {
	sander.rimrafSync('test/deterministic-css/dist');
	sander.mkdirSync('test/deterministic-css/dist');

	let css;

	const bundle = await rollup({
		input: 'test/deterministic-css/src/main.js',
		plugins: [
			{
				resolveId: async (id) => {
					if (/A\.svelte/.test(id)) {
						await new Promise(f => setTimeout(f, 50));
					}
				}
			},
			plugin({
				css: value => {
					css = value;
					css.write('bundle.css');
				}
			})
		],
		external: ['svelte/internal']
	});

	await bundle.write({
		format: 'iife',
		file: 'test/deterministic-css/dist/bundle.js',
		globals: { 'svelte/internal': 'svelte' },
	});

	const files = await sander.readdir('test/deterministic-css/dist/assets');
	assert.is(files.length, 1, 'produced 1 file output');
	assert.match(files[0], /^bundle-(\w+)\.css$/);
});

test('ensures sourcemap and original files point to each other\'s hashed filenames', async () => {
	sander.rimrafSync('test/deterministic-css/dist/assets');
	sander.mkdirSync('test/deterministic-css/dist/assets');

	let css;

	const bundle = await rollup({
		input: 'test/deterministic-css/src/main.js',
		plugins: [
			{
				resolveId: async (id) => {
					if (/A\.svelte/.test(id)) {
						await new Promise(f => setTimeout(f, 50));
					}
				}
			},
			plugin({
				css: value => {
					css = value;
					css.write('bundle.css');
				}
			})
		],
		external: ['svelte/internal']
	});

	await bundle.write({
		format: 'iife',
		file: 'test/deterministic-css/dist/bundle.js',
		globals: { 'svelte/internal': 'svelte' },
		sourcemap: true,
	});

	const assets = path.resolve('test/deterministic-css/dist/assets');

	const files = await sander.readdir(assets);
	assert.is(files.length, 2, 'produced 2 file outputs');

	const [file, sourcemap] = files;
	assert.match(file, /^bundle-(\w+)\.css$/);
	assert.match(sourcemap, /^bundle-(\w+)\.css\.map$/);

	const data1 = fs.readFileSync(path.join(assets, file), 'utf-8');
	const data2 = fs.readFileSync(path.join(assets, sourcemap), 'utf-8');

	assert.match(data1, `sourceMappingURL=${sourcemap}`, 'file has `sourcemap` reference');
	assert.match(data2, `"file":"${file}"`, 'sourcemap has `file` reference');
});

test('handles filenames that happen to contain .svelte', async () => {
	sander.rimrafSync('test/filename-test/dist');
	sander.mkdirSync('test/filename-test/dist');

	try {
		const bundle = await rollup({
			input: 'test/filename-test/src/foo.svelte.dev/main.js',
			plugins: [
				{
					resolveId: async (id) => {
						if (/A\.svelte/.test(id)) {
							await new Promise(f => setTimeout(f, 50));
						}
					}
				},
				plugin({
					css: value => {
						css = value;
						css.write('bundle.css');
					}
				})
			],
			external: ['svelte/internal']
		});

		await bundle.write({
			format: 'iife',
			file: 'test/filename-test/dist/bundle.js',
			globals: { 'svelte/internal': 'svelte' },
			assetFileNames: '[name].[ext]',
			sourcemap: true,
		});
	} catch (err) {
		console.log(err);
		throw err;
	}

	assert.fixture(
		normalize('test/filename-test/dist/bundle.css'),
		normalize('test/filename-test/expected/bundle.css')
	);
});

test.run();
