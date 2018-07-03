# rollup-plugin-svelte changelog

## 4.2.1

* Fix `emitCss` with style-less components ([#34](https://github.com/rollup/rollup-plugin-svelte/pull/34))

## 4.2.0

* Add `emitCss` option ([#32](https://github.com/rollup/rollup-plugin-svelte/pull/32))

## 4.1.0

* Support Svelte 1.60 and above ([#29](https://github.com/rollup/rollup-plugin-svelte/pull/29))

## 4.0.0

* Move `svelte` to `peerDependencies` ([#25](https://github.com/rollup/rollup-plugin-svelte/issues/25))

## 3.3.0

* Pass ID as `filename` to `preprocess` ([#24](https://github.com/rollup/rollup-plugin-svelte/pull/24))

## 3.2.0

* Support `preprocess` option ([#21](https://github.com/rollup/rollup-plugin-svelte/issues/21))
* Ignore unused CSS selector warnings if `css: false` ([#17](https://github.com/rollup/rollup-plugin-svelte/issues/17))

## 3.1.0

* Allow `shared` option to override default ([#16](https://github.com/rollup/rollup-plugin-svelte/pull/16))
* Use `this.warn` and `this.error`, so Rollup can handle failures

## 3.0.1

* `svelte` should be a dependency, not a devDependency...

## 3.0.0

* CSS sourcemaps ([#14](https://github.com/rollup/rollup-plugin-svelte/issues/14))

## 2.0.3

* Ignore virtual modules ([#13](https://github.com/rollup/rollup-plugin-svelte/issues/13))

## 2.0.2

* Only include `code` and `map` in object passed to Rollup

## 2.0.1

* Prevent import of built-in modules from blowing up the resolver

## 2.0.0

* Add support for `pkg.svelte` and `pkg['svelte.root']`

## 1.8.1

* Handle components without `<style>` tags when concatenating CSS

## 1.8.0

* Allow `options.css` to be a function that is called with extracted CSS when bundle is generated

## 1.7.0

* Pass all options through to Svelte (e.g. `dev`)

## 1.6.1

* Capitalize component names correctly

## 1.6.0

* Update Svelte
* Use shared helpers

## 1.3.1

* Sanitize constructor names

## 1.3.0

* Update Svelte
* Add support for `generate: 'ssr'`
* Enforce `es` format

## 1.2.5

* Update Svelte
* Include code frame in error message

## 1.2.0

* Update Svelte
* Support `css` and `filename` options

## 1.0.0

* Update Svelte

## 0.3.0

* Update Svelte

## 0.2.0

* Update Svelte
* Set `options.name` to basename of file

## 0.1.1

* Update Svelte

## 0.1.0

* Update Svelte
* Install missing `rollup-pluginutils` dependency

## 0.0.2

* First release
