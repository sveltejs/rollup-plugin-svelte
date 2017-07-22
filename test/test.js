const path = require('path');
const sander = require('sander');
const assert = require('assert');
const rollup = require('rollup');
const { SourceMapConsumer } = require('source-map');
const { getLocator } = require('locate-character');

const plugin = require('../dist/rollup-plugin-svelte.cjs.js');

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

	it('creates a {code, map} object, excluding the AST etc', () => {
		const { transform } = plugin();
		const compiled = transform('', 'test.html');
		assert.deepEqual(Object.keys(compiled), ['code', 'map']);
	});

	it('generates a CSS sourcemap', () => {
		sander.rimrafSync('test/sourcemap-test/dist');
		sander.mkdirSync('test/sourcemap-test/dist');

		return rollup.rollup({
			entry: 'test/sourcemap-test/src/main.js',
			plugins: [
				plugin({
					cascade: false,
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
				dest: 'test/sourcemap-test/dist/bundle.js'
			});
		});
	});
});
