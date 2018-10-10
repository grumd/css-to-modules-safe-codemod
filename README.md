# styled-components-codemods

Automatic codemods to upgrade your styled-components code to newer versions.

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

### Codemods

#### v4

In version 4 of `styled-components` the `Component.extends` API will be removed in favor of only using `styled(Component)`. This codemod replaces all `.extends` calls to equivalent `styled()` calls instead. Furthermore, the injectGlobal API has been upgraded to slot into React's lifecycle more naturally. It refactors all `injectGlobal` calls, and warns you where they are, so you can export them and include them when rendering.

##### Limitations

There is no way to distinguish whether `.extend` identifier is related to `styled-components` or any other library/prototype etc. If you know that there is another `.extend` function in your project that is not related to `styled-components` be aware and revert these instances manually.

> Be aware that `.extend` used in combination with `.withComponent` can give you a different result than `styled(WithComponentedComponent)`. Refer to this [issue](https://github.com/styled-components/styled-components/issues/1956) to understand the difference.

##### Example

<details>

  <summary>Code Before</summary>

```javascript
StyledComponent.extend``;

StyledComponent.extend`
  color: red;
`;

StyledComponent.extend({ color: "red" });

StyledComponent.extend;

StyledComponent.extend``.extend;

StyledComponent.extend({ color: red }).extend;

styled.div``.extend``;

styled.div`
  color: red;
`.extend`color: blue;`;

styled.div({ color: "red" }).extend({ color: "blue" });

StyledComponent.withComponent("div").extend``;

StyledComponent.withComponent("div").extend`color: red;`;

StyledComponent.withComponent("div").extend();

StyledComponent.withComponent("div").extend({ color: red });

StyledComponent.extend()
  .extend()
  .extend().extend``;

StyledComponent.extend``.extend().extend``.extend``;
```

</details>

<details>

  <summary>Code after</summary>

```javascript
import styled, { css } from "styled-components";

styled(StyledComponent)``;

styled(StyledComponent)`
  color: red;
`;

styled(StyledComponent)({ color: "red" });

styled(StyledComponent);

styled(styled(StyledComponent)``);

styled(styled(StyledComponent)({ color: red }));

styled(styled.div``)``;

styled(
  styled.div`
    color: red;
  `
)`
  color: blue;
`;

styled(styled.div({ color: "red" }))({ color: "blue" });

styled(StyledComponent.withComponent("div"))``;

styled(StyledComponent.withComponent("div"))`
  color: red;
`;

styled(StyledComponent.withComponent("div"))();

styled(StyledComponent.withComponent("div"))({ color: red });

styled(styled(styled(styled(StyledComponent)())())())``;

styled(styled(styled(styled(StyledComponent)``)())``)``;
```

</details>
