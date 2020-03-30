import { Plugin, RollupWarning } from 'rollup';

interface PreprocessOptions extends Record<string, (...args: any[]) => void> {}

interface Css {
  code: any;
  map: any;
}

class CssWriter {
  code: string;
  map: {
    version: number;
    file?: boolean;
    sources: string[];
    sourcesContent: string[];
    names: any[];
    mappings: string;
  };
  warn: RollupWarning;
  write(dest: string, map: boolean): void;
  toString(): string;
}

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
  // this isn't used yet in plugin
  // generate?: 'ssr';

  /**
   * Optionally, preprocess components with svelte.preprocess:
   * https://svelte.dev/docs#svelte_preprocess
   */
  preprocess?: PreprocessOptions;
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
  css?: (css: CssWriter) => any;

  /**
   * let Rollup handle all other warnings normally
   */
  onwarn?: (
    warning: RollupWarning,
    handler: (w: RollupWarning | string) => void
  ) => void;
}

export default function svelte(options: Options): Plugin;
