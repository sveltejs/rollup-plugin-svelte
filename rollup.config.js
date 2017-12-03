import buble from 'rollup-plugin-buble';
import pkg from './package.json';

export default {
	input: 'src/index.js',
	output: [
		{ file: pkg.main, format: 'cjs' },
		{ file: pkg.module, format: 'es' }
	],
	external: ['path', 'rollup-pluginutils', 'svelte', 'require-relative'],
	plugins: [
		buble({
			target: { node: 4 }
		})
	]
};
