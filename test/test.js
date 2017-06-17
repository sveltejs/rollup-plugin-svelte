const path = require('path');
const assert = require('assert');

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

	it('creates a {code, map} object, excluding the AST etc', () => {
		const { transform } = plugin();
		const compiled = transform('', 'test.html');
		assert.deepEqual(Object.keys(compiled), ['code', 'map']);
	});
});
