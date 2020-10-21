import { Plugin, RollupWarning, SourceMap as Mapping } from 'rollup';
import { PreprocessorGroup } from 'svelte/types/compiler/preprocess';
import { CompileOptions } from 'svelte/types/compiler/interfaces';

type SourceMap = Omit<Mapping, 'toString' | 'toUrl'>;

declare class CssWriter {
  code: string;
  filename: string;
  map: false | SourceMap;
  warn: RollupWarning;
  write(file: string, map?: boolean): void;
  emit(name: string, source: string): string;
  sourcemap(file: string, sourcemap: SourceMap): void;
  toString(): string;
}

type CssEmitter = (css: CssWriter) => any;

interface Options extends CompileOptions {
  /**
   * By default, all ".svelte" files are compiled
   * @default ['.svelte']
   */
  extensions?: string[];

  /**
   * You can restrict which files are compiled
   * using `include` and `exclude`
   * @typedef {string} InclureAndExclude
   */

  /**
   * @type {IncludeAndExclude}
   */
  include?: string;

  /**
   * @type {IncludeAndExclude}
   */
  exclude?: string;

  /**
   * Optionally, preprocess components with svelte.preprocess:
   * https://svelte.dev/docs#svelte_preprocess
   */
  preprocess?: PreprocessorGroup | PreprocessorGroup[];
  // {
  //   style: ({ content }) => {
  //     return transformStyles(content);
  //   }
  // },

  /**
   * Add extra code for development and debugging purposes.
   * @default false
   */
  dev?: boolean;

  /**
   * Emit CSS as "files" for other plugins to process
   * @default false
   */
  emitCss?: boolean;

  /**
   * Extract CSS into a separate file (recommended).
   */
  css?: false | CssEmitter;

  /**
   * let Rollup handle all other warnings normally
   */
  onwarn?: (
    warning: RollupWarning,
    handler: (w: RollupWarning | string) => void
  ) => void;
}

export default function svelte(options?: Options): Plugin;
