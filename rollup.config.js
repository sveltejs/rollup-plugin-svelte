import typescript from 'rollup-plugin-typescript2';
import pkg from './package.json';

export default [
	{
		input: 'index.ts',
		output: {
			file: 'index.js'
		},
		plugins: [typescript()],
		external: [...require('module').builtinModules, ...Object.keys(pkg.dependencies)]
	}
];
