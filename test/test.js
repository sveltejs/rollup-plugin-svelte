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

	it('ignores virtual modules', () => {
		const { resolveId } = plugin();
		assert.equal(
			resolveId('path', path.resolve('\0some-plugin-generated-module')),
			null
		);
	});

	it('supports component name assignment', () => {
		const { transform } = plugin();
		return transform('', 'index.svelte').then(({ code }) => {
			assert.notEqual(code.indexOf('class Index extends SvelteComponent'), -1);

			return transform('', 'card/index.svelte');
		}).then(({ code }) => {
			assert.equal(code.indexOf('class Index extends SvelteComponent'), -1);
			assert.notEqual(code.indexOf('class Card extends SvelteComponent'), -1);
		});
	});

	it('creates a {code, map, dependencies} object, excluding the AST etc', () => {
		const { transform } = plugin();
		return transform('', 'test.html').then(compiled => {
			assert.deepEqual(Object.keys(compiled), ['code', 'map', 'dependencies']);
		});
	});

	it('generates a CSS sourcemap', () => {
		sander.rimrafSync('test/sourcemap-test/dist');
		sander.mkdirSync('test/sourcemap-test/dist');

		return rollup.rollup({
			input: 'test/sourcemap-test/src/main.js',
			plugins: [
				plugin({
					css: css => {
						css.write('test/sourcemap-test/dist/bundle.css');

						const smc = new SourceMapConsumer(css.map);
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
								source: path.resolve('test/sourcemap-test/src/Foo.html'),
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
								source: path.resolve('test/sourcemap-test/src/Bar.html'),
								line: 4,
								column: 1,
								name: null
							}
						);
					}
				})
			]
		}).then(bundle => {
			return bundle.write({
				format: 'iife',
				file: 'test/sourcemap-test/dist/bundle.js'
			});
		});
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

	it('preprocesses components', () => {
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

		return transform(`
			<h1>Hello __REPLACEME__!</h1>
			<h2>file: __FILENAME__</h2>
			<style>h1 { color: red; }</style>
		`, 'test.html').then(({ code, dependencies }) => {
			assert.equal(code.indexOf('__REPLACEME__'), -1, 'content not modified');
			assert.notEqual(code.indexOf('file: test.html'), -1, 'filename not replaced');
			assert.deepEqual(dependencies, ['foo']);
		});
	});

	it('emits a CSS file', () => {
		const { load, transform } = plugin({
			emitCss: true
		});

		return transform(`<h1>Hello!</h1>

		<style>
			h1 {
				color: red;
			}
		</style>`, `path/to/Input.html`).then(transformed => {
			assert.ok(transformed.code.indexOf(`import "path/to/Input.css";`) !== -1);

			const css = load('path/to/Input.css');

			const smc = new SourceMapConsumer(css.map);

			const loc = smc.originalPositionFor({
				line: 1,
				column: 0
			});

			assert.equal(loc.source, 'path/to/Input.html');
			assert.equal(loc.line, 4);
			assert.equal(loc.column, 3);
		});
	});

	it('properly escapes CSS paths', () => {
		const { load, transform } = plugin({
			emitCss: true
		});

		return transform(`<h1>Hello!</h1>

		<style>
			h1 {
				color: red;
			}
		</style>`, `path\\t'o\\Input.html`).then(transformed => {
			assert.ok(transformed.code.indexOf(`import "path\\\\t'o\\\\Input.css";`) !== -1);

			const css = load(`path\\t'o\\Input.css`);

			const smc = new SourceMapConsumer(css.map);

			const loc = smc.originalPositionFor({
				line: 1,
				column: 0
			});

			assert.equal(loc.source, `path/t'o/Input.html`);
			assert.equal(loc.line, 4);
			assert.equal(loc.column, 3);
		});
	});

	it('intercepts warnings', () => {
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

		return transform.call({
			warn: warning => {
				handled.push(warning);
			}
		}, `
			<h1 aria-hidden>Hello world!</h1>
			<marquee>wheee!!!</marquee>
		`, 'test.html').then(() => {
			assert.deepEqual(warnings.map(w => w.code), ['a11y-hidden', 'a11y-distracting-elements']);
			assert.deepEqual(handled.map(w => w.code), ['a11y-hidden']);
		});
	});
});
