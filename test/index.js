const fs = require('fs');
const path = require('path');
const sander = require('sander');
const assert = require('assert');
const rollup = require('rollup');
const { SourceMapConsumer } = require('source-map');
const { getLocator } = require('locate-character');

const plugin = require('..');

describe('rollup-plugin-svelte', () => {
	it('resolves using pkg.svelte', () => {
		const { resolveId } = plugin();
		assert.equal(
			resolveId('widget', path.resolve('test/foo/main.js')),
			path.resolve('test/node_modules/widget/src/Widget.html')
		);
	});

	it('resolves using pkg.svelte.root', () => {
		const { resolveId } = plugin();
		assert.equal(
			resolveId('widgets/Foo.html', path.resolve('test/foo/main.js')),
			path.resolve('test/node_modules/widgets/src/Foo.html')
		);
	});

	it('ignores built-in modules', () => {
		const { resolveId } = plugin();
		assert.equal(
			resolveId('path', path.resolve('test/foo/main.js')),
			null
		);
	});

	it('ignores esm modules that do not export package.json', () => {
		const { resolveId } = plugin();
		assert.equal(
			resolveId('esm-no-pkg-export', path.resolve('test/foo/main.js')),
			null
		);
	});

	it('resolves esm module that exports package.json', () => {
		const { resolveId } = plugin();
		assert.equal(
			resolveId('esm-component', path.resolve('test/foo/main.js')),
			path.resolve('test/node_modules/esm-component/src/Component.svelte')
		);
	});

	it('ignores virtual modules', () => {
		const { resolveId } = plugin();
		assert.equal(
			resolveId('path', path.resolve('\0some-plugin-generated-module')),
			null
		);
	});

	it('supports component name assignment', async () => {
		const { transform } = plugin();
		const index = await transform('', 'index.svelte');

		assert.notEqual(index.code.indexOf('class Index extends SvelteComponent'), -1);

		const card = await transform('', 'card/index.svelte');
		assert.equal(card.code.indexOf('class Index extends SvelteComponent'), -1);
		assert.notEqual(card.code.indexOf('class Card extends SvelteComponent'), -1);
	});

	it('creates a {code, map, dependencies} object, excluding the AST etc', async () => {
		const { transform } = plugin();
		const compiled = await transform('', 'test.html')
		assert.deepEqual(Object.keys(compiled), ['code', 'map', 'dependencies']);
	});

	it('generates a CSS sourcemap', async () => {
		sander.rimrafSync('test/sourcemap-test/dist');
		sander.mkdirSync('test/sourcemap-test/dist');

		let css;

		const bundle = await rollup.rollup({
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
			file: 'test/sourcemap-test/dist/bundle.js',
			globals: { 'svelte/internal': 'svelte' }
		});

		const smc = await new SourceMapConsumer(css.map);
		const locator = getLocator(css.code);

		const generatedFooLoc = locator('.foo');
		const originalFooLoc = smc.originalPositionFor({
			line: generatedFooLoc.line + 1,
			column: generatedFooLoc.column
		});

		assert.deepEqual(
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

		assert.deepEqual(
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

	it('squelches CSS warnings if css: false', () => {
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

	it('preprocesses components', async () => {
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

		assert.equal(code.indexOf('__REPLACEME__'), -1, 'content not modified');
		assert.notEqual(code.indexOf('file: test.html'), -1, 'filename not replaced');
		assert.deepEqual(dependencies, ['foo']);
	});

	it('emits a CSS file', async () => {
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

		assert.equal(loc.source, 'Input.html');
		assert.equal(loc.line, 4);
		assert.equal(loc.column, 3);
	});

	it('properly escapes CSS paths', async () => {
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

		assert.equal(loc.source, 'Input.html');
		assert.equal(loc.line, 4);
		assert.equal(loc.column, 3);
	});

	it('intercepts warnings', async () => {
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

		assert.deepEqual(warnings.map(w => w.code), ['a11y-hidden', 'a11y-distracting-elements']);
		assert.deepEqual(handled.map(w => w.code), ['a11y-hidden']);
	});

	it('bundles CSS deterministically', async () => {
		sander.rimrafSync('test/deterministic-css/dist');
		sander.mkdirSync('test/deterministic-css/dist');

		let css;

		const bundle = await rollup.rollup({
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
			globals: { 'svelte/internal': 'svelte' }
		});

		assert.equal(
			fs.readFileSync('test/deterministic-css/dist/bundle.css', 'utf-8'),
			fs.readFileSync('test/deterministic-css/expected/bundle.css', 'utf-8')
		);
	});

	it('handles filenames that happen to contain .svelte', async () => {
		sander.rimrafSync('test/filename-test/dist');
		sander.mkdirSync('test/filename-test/dist');

		try {
			const bundle = await rollup.rollup({
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
				globals: { 'svelte/internal': 'svelte' }
			});
		} catch (err) {
			console.log(err);
			throw err;
		}

		assert.equal(
			fs.readFileSync('test/filename-test/dist/bundle.css', 'utf-8'),
			fs.readFileSync('test/filename-test/expected/bundle.css', 'utf-8')
		);
	});
});
