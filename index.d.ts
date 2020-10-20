import { Plugin, RollupWarning } from 'rollup';
import { PreprocessorGroup } from 'svelte/types/compiler/preprocess';

interface Css {
  code: any;
  map: any;
}

declare class CssWriter {
  code: string;
  filename: string;
  map: {
    version: number;
    file?: boolean;
    sources: string[];
    sourcesContent: string[];
    names: any[];
    mappings: string;
  };
  warn: RollupWarning;
  emit(fileName: string, source: string): void;
  write(dest: string, map?: boolean): void;
  toString(): string;
}

interface Svelte {
  compile: any;
  preprocess: any;
  version: number | string;
}

type CssEmitter = (css: CssWriter) => any;

interface Options {
  /**
   * By default, all .svelte and .html files are compiled
   * @default ['.html', '.svelte']
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
   * By default, the client-side compiler is used. You
   * can also use the server-side rendering compiler
   */
  generate?: 'dom' | 'ssr' | false;

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
   * Emit CSS as "files" for other plugins to process
   * @default false
   */
  emitCss?: boolean;

  /**
   * Extract CSS into a separate file (recommended).
   */
  css?: false | CssEmitter;


  /**
   * Compile Svelte components to custom elements (aka web components).
   * @default false
   */
  customElement?: boolean;

  /**
   * Pass in a specific version of Svelte.
   */
  svelte?: Svelte;

  /**
   * let Rollup handle all other warnings normally
   */
  onwarn?: (
    warning: RollupWarning,
    handler: (w: RollupWarning | string) => void
  ) => void;
}

export default function svelte(options?: Options): Plugin;
