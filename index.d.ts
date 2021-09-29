import { Plugin, RollupWarning } from 'rollup';
import { PreprocessorGroup } from 'svelte/types/compiler/preprocess';
import { CompileOptions } from 'svelte/types/compiler/interfaces';

type Arrayable<T> = T | T[];

type WarningHandler = (warning: RollupWarning | string) => void;

/**
 * Since Rollup bundles as ESM, we don't allow compilation to be CJS.
 * You can instead configure Rollup to build your whole bundle as non-ESM
 * using the `format` option on `output`.
 * See: https://github.com/sveltejs/rollup-plugin-svelte/issues/190#issuecomment-930298165
 */
type OverridenModuleFormat = "esm"
type OverridenCompileOptions = Omit<CompileOptions, "format"> & { format?: OverridenModuleFormat }

interface Options {
  /** One or more minimatch patterns */
  include: Arrayable<string>;

  /** One or more minimatch patterns */
  exclude: Arrayable<string>;

  /**
   * By default, all ".svelte" files are compiled
   * @default ['.svelte']
   */
  extensions: string[];

  /**
   * Optionally, preprocess components with svelte.preprocess:
   * @see https://svelte.dev/docs#svelte_preprocess
   */
  preprocess: Arrayable<PreprocessorGroup>;
  // {
  //   style: ({ content }) => {
  //     return transformStyles(content);
  //   }
  // },

  /** Emit Svelte styles as virtual CSS files for other plugins to process. */
  emitCss: boolean;

  /** Options passed to `svelte.compile` method. */
  compilerOptions: OverridenCompileOptions;

  /** Custom warnings handler; defers to Rollup as default. */
  onwarn(warning: RollupWarning, handler: WarningHandler): void;
}

export default function svelte(options?: Partial<Options>): Plugin;
