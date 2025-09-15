const fs = require('fs');
const path = require('path');
const { test } = require('uvu');
const assert = require('uvu/assert');
const { SourceMapConsumer } = require('source-map');
const { rollup } = require('rollup');
const { VERSION } = require('svelte/compiler');
const plugin = require('..');

const isSvelte5Plus = Number(VERSION.split('.')[0]) >= 5;

const context = {
	resolve: () => 'resolved',
};

test('resolves using pkg.svelte', async () => {
	const p = plugin();
	assert.is(
		await p.resolveId.call(context, 'widget', path.resolve('test/foo/main.js')),
		path.resolve('test/node_modules/widget/src/Widget.svelte')
	);
});

test('ignores built-in modules', async () => {
	const p = plugin();
	assert.is(await p.resolveId.call(context, 'path', path.resolve('test/foo/main.js')), undefined);
});

test('ignores esm modules that do not export package.json', async () => {
	const p = plugin();
	assert.is(
		await p.resolveId.call(context, 'esm-no-pkg-export', path.resolve('test/foo/main.js')),
		undefined
	);
});

test('resolves esm module that exports package.json', async () => {
	const p = plugin();
	assert.is(
		await p.resolveId.call(context, 'esm-component', path.resolve('test/foo/main.js')),
		path.resolve('test/node_modules/esm-component/src/Component.svelte')
	);
});

test('ignores virtual modules', async () => {
	const p = plugin();
	assert.is(
		await p.resolveId.call(context, 'path', path.resolve('\0some-plugin-generated-module')),
		undefined
	);
});

test('supports component name assignment', async () => {
	const p = plugin();
	const index = await p.transform('', 'index.svelte');

	assert.ok(
		index.code.includes(isSvelte5Plus ? 'function Index(' : 'class Index extends SvelteComponent')
	);

	const card = await p.transform('', 'card/index.svelte');
	assert.not.ok(
		card.code.includes(isSvelte5Plus ? 'function Index(' : 'class Index extends SvelteComponent')
	);
	assert.ok(
		card.code.includes(isSvelte5Plus ? 'function Card(' : 'class Card extends SvelteComponent')
	);
});

test('creates a {code, map, dependencies} object, excluding the AST etc', async () => {
	const p = plugin();
	const compiled = await p.transform('', 'test.svelte');
	assert.equal(Object.keys(compiled), ['code', 'map', 'dependencies']);
});

test('respects `sourcemapExcludeSources` Rollup option', async () => {
	fs.rmSync('test/sourcemap-test/dist', { recursive: true, force: true });
	fs.mkdirSync('test/sourcemap-test/dist', { recursive: true });

	const bundle = await rollup({
		input: 'test/sourcemap-test/src/main.js',
		plugins: [plugin({ emitCss: false })],
		external: ['svelte/internal', 'svelte/internal/client', 'svelte/internal/disclose-version'],
	});

	const { output } = await bundle.generate({
		format: 'iife',
		sourcemap: true,
		sourcemapExcludeSources: true,
		file: 'test/sourcemap-test/dist/bundle.js',
		globals: {
			'svelte/internal': 'svelte', // Svelte 3/4
			'svelte/internal/client': 'svelte', // Svelte 5+
			'svelte/internal/discloseVersion': 'discloseVersion', // Svelte 4+
		},
		assetFileNames: '[name][extname]',
	});

	const { map } = output[0];

	assert.ok(map);
	assert.is(map.file, 'bundle.js');
	if (isSvelte5Plus) {
		// Svelte 5 has less mappings right now, maybe we can make it so that it has all three sources referenced at some point
		assert.is(map.sources.length, 2);
		assert.ok(map.sources.includes('../src/main.js'));
		assert.ok(map.sources.includes('../src/Foo.svelte'));
	} else {
		assert.is(map.sources.length, 3);
		assert.ok(map.sources.includes('../src/main.js'));
		assert.ok(map.sources.includes('../src/Foo.svelte'));
		assert.ok(map.sources.includes('../src/Bar.svelte'));
	}
	assert.is(map.sourcesContent, null);
});

test('injects CSS with `emitCss: false', async () => {
	const p = plugin({emitCss: false});

	const transformed = await p.transform(
		`
			<h1>Hello!</h1>

			<style>
				h1 {
					color: red;
				}
			</style>
		`,
		'test.svelte'
	);

	assert.ok(transformed.code.includes('color:red'));
});

test('squelches "unused CSS" warnings if `emitCss: false`', () => {
	const p = plugin({
		emitCss: false,
	});

	p.transform.call(
		{
			warn: (warning) => {
				throw new Error(warning.message);
			},
		},
		`
		<div></div>
		<style>
			.unused {
				color: red;
			}
		</style>
	`,
		'test.svelte'
	);
});

test('preprocesses components', async () => {
	const p = plugin({
		preprocess: {
			markup: ({ content, filename }) => {
				return {
					code: content.replace('__REPLACEME__', 'replaced').replace('__FILENAME__', filename),
					dependencies: ['foo'],
				};
			},
			style: () => null,
		},
	});

	const { code, dependencies } = await p.transform(
		`
		<h1>Hello __REPLACEME__!</h1>
		<h2>file: __FILENAME__</h2>
		<style>h1 { color: red; }</style>
	`,
		'test.svelte'
	);

	assert.is(code.indexOf('__REPLACEME__'), -1, 'content not modified');
	assert.is.not(code.indexOf('file: test.svelte'), -1, 'filename not replaced');
	assert.equal(dependencies, ['foo']);
});

test('emits a CSS file', async () => {
	const p = plugin();

	const transformed = await p.transform(
		`<h1>Hello!</h1>

	<style>
		h1 {
			color: red;
		}
	</style>`,
		`path/to/Input.svelte`
	);

	assert.ok(transformed.code.includes(`import "path/to/Input.css";`));

	const css = p.load('path/to/Input.css');
	const smc = await new SourceMapConsumer(css.map);

	const loc = smc.originalPositionFor({
		line: isSvelte5Plus ? 2 : 1,
		column: isSvelte5Plus ? 2 : 0,
	});

	assert.is(loc.source, 'Input.svelte');
	assert.is(loc.line, 4);
	assert.is(loc.column, 2);
});

test('properly escapes CSS paths', async () => {
	const p = plugin();

	const transformed = await p.transform(
		`<h1>Hello!</h1>

	<style>
		h1 {
			color: red;
		}
	</style>`,
		`path\\t'o\\Input.svelte`
	);

	assert.ok(transformed.code.indexOf(`import "path\\\\t'o\\\\Input.css";`) !== -1);

	const css = p.load(`path\\t'o\\Input.css`);

	const smc = await new SourceMapConsumer(css.map);

	const loc = smc.originalPositionFor({
		line: isSvelte5Plus ? 2 : 1,
		column: isSvelte5Plus ? 2 : 0,
	});

	assert.is(loc.source, 'Input.svelte');
	assert.is(loc.line, 4);
	assert.is(loc.column, 2);
});

test('intercepts warnings', async () => {
	const warnings = [];
	const handled = [];

	const p = plugin({
		onwarn(warning, handler) {
			warnings.push(warning);

			if (warning.code === 'a11y-hidden' || warning.code === 'a11y_hidden') {
				handler(warning);
			}
		},
	});

	await p.transform.call(
		{
			warn: (warning) => {
				handled.push(warning);
			},
		},
		`
		<h1 aria-hidden="true">Hello world!</h1>
		<marquee>wheee!!!</marquee>
	`,
		'test.svelte'
	);

	assert.equal(
		warnings.map((w) => w.code),
		isSvelte5Plus
			? ['a11y_hidden', 'a11y_distracting_elements']
			: ['a11y-hidden', 'a11y-distracting-elements']
	);
	assert.equal(
		handled.map((w) => w.code),
		isSvelte5Plus ? ['a11y_hidden'] : ['a11y-hidden']
	);
});

test('handles filenames that happen to contain ".svelte"', async () => {
	fs.rmSync('test/filename-test/dist', { recursive: true, force: true });
	fs.mkdirSync('test/filename-test/dist', { recursive: true });

	try {
		const bundle = await rollup({
			input: 'test/filename-test/src/foo.svelte.dev/main.js',
			plugins: [
				{
					async resolveId(id) {
						if (/A\.svelte/.test(id)) {
							await new Promise((f) => setTimeout(f, 50));
						}
					},
				},
				plugin({
					emitCss: true,
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
					},
				},
			],
			external: ['svelte/internal', 'svelte/internal/client', 'svelte/internal/disclose-version'],
		});

		await bundle.write({
			format: 'iife',
			file: 'test/filename-test/dist/bundle.js',
			globals: {
				'svelte/internal': 'svelte', // Svelte 3/4
				'svelte/internal/client': 'svelte', // Svelte 5+
				'svelte/internal/discloseVersion': 'discloseVersion', // Svelte 4+
			},
			assetFileNames: '[name].[ext]',
			sourcemap: true,
		});
	} catch (err) {
		console.log(err);
		throw err;
	}

	assert.match(
		fs.readFileSync('test/filename-test/dist/bundle.css', 'utf8'),
		/h1\.svelte-[_a-zA-Z0-9-]+\s*{\s*color:\s*red;?\s*}/
	);
});

// Needs Svelte 5
test('handles ".svelte.ts/js" files', async () => {
	if (!isSvelte5Plus) return;

	fs.rmSync('test/filename-test2/dist', { recursive: true, force: true });
	fs.mkdirSync('test/filename-test2/dist', { recursive: true });

	try {
		const bundle = await rollup({
			input: 'test/filename-test2/src/main.js',
			plugins: [plugin({})],
			external: ['svelte/internal/client', 'svelte/internal/disclose-version'],
		});

		await bundle.write({
			format: 'iife',
			file: 'test/filename-test2/dist/bundle.js',
			globals: {
				'svelte/internal/client': 'svelte',
				'svelte/internal/discloseVersion': 'discloseVersion',
			},
			assetFileNames: '[name].[ext]',
			sourcemap: true,
		});
	} catch (err) {
		console.log(err);
		throw err;
	}

	assert.not(fs.readFileSync('test/filename-test2/dist/bundle.js', 'utf8').includes('$state'));
});

test('ignores ".html" extension by default', async () => {
	fs.rmSync('test/node_modules/widget/dist', { recursive: true, force: true });
	fs.mkdirSync('test/node_modules/widget/dist', { recursive: true });

	try {
		const bundle = await rollup({
			input: 'test/node_modules/widget/index.js',
			external: ['svelte/internal'],
			plugins: [plugin()],
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
	fs.rmSync('test/node_modules/widget/dist', { recursive: true, force: true });
	fs.mkdirSync('test/node_modules/widget/dist', { recursive: true });

	try {
		const bundle = await rollup({
			input: 'test/node_modules/widget/index.js',
			external: ['svelte/internal', 'svelte/internal/client', 'svelte/internal/disclose-version'],
			plugins: [
				plugin({
					extensions: ['.html'],
				}),
			],
		});

		await bundle.write({
			format: 'iife',
			file: 'test/node_modules/widget/dist/bundle.js',
			globals: {
				'svelte/internal': 'svelte', // Svelte 3/4
				'svelte/internal/client': 'svelte', // Svelte 5+
				'svelte/internal/discloseVersion': 'discloseVersion', // Svelte 4+
			},
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
