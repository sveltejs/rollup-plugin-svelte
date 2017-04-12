# rollup-plugin-svelte

Compile Svelte components.


## Installation

```bash
npm install --save-dev rollup-plugin-svelte
```


## Usage

```js
// rollup.config.js
import * as fs from 'fs';
import svelte from 'rollup-plugin-svelte';

export default {
  entry: 'src/main.js',
  dest: 'public/bundle.js',
  format: 'iife',
  plugins: [
    svelte({
      // By default, all .html and .svelte files are compiled
      extensions: [ '.my-custom-extension' ],

      // You can restrict which files are compiled
      // using `include` and `exclude`
      include: 'src/components/**/*.html',

      // By default, the client-side compiler is used. You
      // can also use the server-side rendering compiler
      generate: 'ssr',

      // Extract CSS into a separate file (recommended).
      // See note below
      css: function ( css ) {
        fs.writeFileSync( 'public/main.css', css );
      }
    })
  ]
}
```


## Extracting CSS

If your Svelte components contain `<style>` tags, by default the compiler will add JavaScript that injects those styles into the page when the component is rendered. That's not ideal, because it adds weight to your JavaScript, prevents styles from being fetched in parallel with your code, and can even cause CSP violations.

A better option is to extract the CSS into a separate file. Using the `css` option as shown above would cause a `public/main.css` file to be generated each time the bundle is built (or rebuilt, if you're using rollup-watch), with the normal scoping rules applied.

Alternatively, if you're handling styles in some other way and just want to prevent the CSS being added to your JavaScript bundle, use `css: false`.


## License

MIT
