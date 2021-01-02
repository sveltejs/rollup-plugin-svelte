import { Plugin, RollupWarning } from 'rollup';
import { PreprocessorGroup } from 'svelte/types/compiler/preprocess';
import { CompileOptions } from 'svelte/types/compiler/interfaces';

type Arrayable<T> = T | T[];

type WarningHandler = (warning: RollupWarning | string) => void;

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
  compilerOptions: CompileOptions;

  /** Custom warnings handler; defers to Rollup as default. */
  onwarn(warning: RollupWarning, handler: WarningHandler): void;

  /** Enable/configure HMR */
  hot?: {
    /**
     * Enable state preservation when a component is updated by HMR for every
     * components.
     * @default false
     */
    preserveState: boolean;

    /**
     * If this string appears anywhere in your component's code, then local
     * state won't be preserved, even when noPreserveState is false.
     * @default '@hmr:reset'
     */
    noPreserveStateKey: string;

    /**
     * If this string appears next to a `let` variable, the value of this
     * variable will be preserved accross HMR updates.
     * @default '@hmr:keep'
     */
     preserveStateKey: string;

    /**
     * Prevent doing a full reload on next HMR update after fatal error.
     * @default false
     */
     noReload: boolean;

     /**
      * Try to recover after runtime errors in component init.
      * @default true
      */
     optimistic: boolean;

     noDisableCss: boolean;
     injectCss: boolean;
     cssEjectDelay: number;
  }
}

export default function svelte(options?: Partial<Options>): Plugin;
