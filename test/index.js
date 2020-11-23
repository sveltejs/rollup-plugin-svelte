const fs = require('fs');
const path = require('path');
const { test } = require('uvu');
const assert = require('uvu/assert');
const { SourceMapConsumer } = require('source-map');
const { rollup } = require('rollup');
const sander = require('sander');

const plugin = require('..');

test('resolves using pkg.svelte', () => {
	const { resolveId } = plugin();
	assert.is(
		resolveId('widget', path.resolve('test/foo/main.js')),
		path.resolve('test/node_modules/widget/src/Widget.svelte')
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
	const compiled = await transform('', 'test.svelte');
	assert.equal(Object.keys(compiled), ['code', 'map', 'dependencies']);
});

test('respects `sourcemapExcludeSources` Rollup option', async () => {
	sander.rimrafSync('test/sourcemap-test/dist');
	sander.mkdirSync('test/sourcemap-test/dist');

	const bundle = await rollup({
		input: 'test/sourcemap-test/src/main.js',
		plugins: [ plugin({ emitCss: false }) ],
		external: ['svelte/internal']
	});

	const { output } = await bundle.generate({
		format: 'iife',
		sourcemap: true,
		sourcemapExcludeSources: true,
		file: 'test/sourcemap-test/dist/bundle.js',
		globals: { 'svelte/internal': 'svelte' },
		assetFileNames: '[name][extname]',
	});

	const { map } = output[0];

	assert.ok(map);
	assert.is(map.file, 'bundle.js');
	assert.is(map.sources.length, 1);
	assert.is(map.sources[0], '../src/main.js');
	assert.is(map.sourcesContent, null);
});

test('squelches "unused CSS" warnings if `emitCss: false`', () => {
	const { transform } = plugin({
		emitCss: false
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
	`, 'test.svelte');
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
	`, 'test.svelte');

	assert.is(code.indexOf('__REPLACEME__'), -1, 'content not modified');
	assert.is.not(code.indexOf('file: test.svelte'), -1, 'filename not replaced');
	assert.equal(dependencies, ['foo']);
});

test('emits a CSS file', async () => {
	const { load, transform } = plugin();

	const transformed = await transform(`<h1>Hello!</h1>

	<style>
		h1 {
			color: red;
		}
	</style>`, `path/to/Input.svelte`);

	assert.ok(transformed.code.indexOf(`import "path/to/Input.css";`) !== -1);

	const css = load('path/to/Input.css');

	const smc = await new SourceMapConsumer(css.map);

	const loc = smc.originalPositionFor({
		line: 1,
		column: 0
	});

	assert.is(loc.source, 'Input.svelte');
	assert.is(loc.line, 4);
	assert.is(loc.column, 2);
});

test('properly escapes CSS paths', async () => {
	const { load, transform } = plugin();

	const transformed = await transform(`<h1>Hello!</h1>

	<style>
		h1 {
			color: red;
		}
	</style>`, `path\\t'o\\Input.svelte`);

	assert.ok(transformed.code.indexOf(`import "path\\\\t'o\\\\Input.css";`) !== -1);

	const css = load(`path\\t'o\\Input.css`);

	const smc = await new SourceMapConsumer(css.map);

	const loc = smc.originalPositionFor({
		line: 1,
		column: 0
	});

	assert.is(loc.source, 'Input.svelte');
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
	`, 'test.svelte');

	assert.equal(warnings.map(w => w.code), ['a11y-hidden', 'a11y-distracting-elements']);
	assert.equal(handled.map(w => w.code), ['a11y-hidden']);
});

test('handles filenames that happen to contain ".svelte"', async () => {
	sander.rimrafSync('test/filename-test/dist');
	sander.mkdirSync('test/filename-test/dist');

	try {
		const bundle = await rollup({
			input: 'test/filename-test/src/foo.svelte.dev/main.js',
			plugins: [
				{
					async resolveId(id) {
						if (/A\.svelte/.test(id)) {
							await new Promise(f => setTimeout(f, 50));
						}
					}
				},
				plugin({
					emitCss: true
				}),
				{
					transform(code, id) {
						if (/\.css$/.test(id)) {
							this.emitFile({
								type: 'asset',
								name: 'bundle.css',
								source: code,
							});
							return '';
						}
					}
				}
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

	assert.is(
		fs.readFileSync('test/filename-test/dist/bundle.css', 'utf8'),
		'h1.svelte-bt9zrl{color:red}'
	);
});

test('ignores ".html" extension by default', async () => {
	sander.rimrafSync('test/node_modules/widget/dist');
	sander.mkdirSync('test/node_modules/widget/dist');

	try {
		const bundle = await rollup({
			input: 'test/node_modules/widget/index.js',
			external: ['svelte/internal'],
			plugins: [plugin()]
		});

		await bundle.write({
			format: 'iife',
			file: 'test/node_modules/widget/dist/bundle.js',
			globals: { 'svelte/internal': 'svelte' },
			assetFileNames: '[name].[ext]',
			sourcemap: true,
		});

		assert.unreachable('should have thrown PARSE_ERROR');
	} catch (err) {
		assert.is(err.code, 'PARSE_ERROR');
		assert.match(err.message, 'Note that you need plugins to import files that are not JavaScript');
		assert.match(err.loc.file, /widget[\\\/]+src[\\\/]+Widget.html$/);
	}
});

test('allows ".html" extension if configured', async () => {
	sander.rimrafSync('test/node_modules/widget/dist');
	sander.mkdirSync('test/node_modules/widget/dist');

	try {
		const bundle = await rollup({
			input: 'test/node_modules/widget/index.js',
			external: ['svelte/internal'],
			plugins: [
				plugin({
					extensions: ['.html']
				})
			]
		});

		await bundle.write({
			format: 'iife',
			file: 'test/node_modules/widget/dist/bundle.js',
			globals: { 'svelte/internal': 'svelte' },
			assetFileNames: '[name].[ext]',
			sourcemap: true,
		});
	} catch (err) {
		console.log(err);
		throw err;
	}

	assert.ok(fs.existsSync('test/node_modules/widget/dist/bundle.js'));
	assert.ok(fs.existsSync('test/node_modules/widget/dist/bundle.js.map'));
});

test.run();
