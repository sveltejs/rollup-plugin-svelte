import buble from 'rollup-plugin-buble';

export default {
	entry: 'src/index.js',
	plugins: [ buble() ],
	targets: [
		{ dest: 'dist/rollup-plugin-svelte.cjs.js', format: 'cjs' },
		{ dest: 'dist/rollup-plugin-svelte.es.js', format: 'es' }
	]
};
