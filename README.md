# css-to-modules-safe-codemod

Automatic codemod to upgrade from CSS/SCSS to CSS-Modules.

## Installation

Thanks to `npx` no installation is needed, just run the command below!

## Usage

```sh
Usage: npx styled-components-codemods [options] [command]

Options:

  -V, --version                                  output the version number
  -h, --help                                     output usage information

Commands:

  v4 [...files]                                  Run all v4 codemods
  v4-extendToStyled [...files]                   Run just the extendToStyled codemod
  v4-injectGlobalToCreateGlobalStyle [...files]  Run just the injectGlobalToCreateGlobalStyle codemod

Examples:

  $ styled-components-codemods v4-extendToStyled src/components/Box.js src/components/Button.js
  $ styled-components-codemods v4 src/**/*.js (this will only work if your terminal expands globs)
```
