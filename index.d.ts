import { Plugin, RollupWarning, SourceMap as Mapping } from 'rollup';
import { PreprocessorGroup } from 'svelte/types/compiler/preprocess';
import { CompileOptions } from 'svelte/types/compiler/interfaces';

type Arrayable<T> = T | T[];
type SourceMap = Omit<Mapping, 'toString' | 'toUrl'>;

type WarningHandler = (warning: RollupWarning | string) => void;

declare class CssWriter {
  code: string;
  filename: string;
  warn: WarningHandler;
  map: false | SourceMap;
  write(file: string, map?: boolean): void;
  emit(name: string, source: string): string;
  sourcemap(file: string, sourcemap: SourceMap): void;
  toString(): string;
}

type CssEmitter = (css: CssWriter) => any;

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
}

export default function svelte(options?: Partial<Options>): Plugin;
