import _ from 'lodash';
import path from 'path';
import camelCase from 'camelcase';
import fs from 'fs';
import glob from 'fast-glob';
import selectorParser from 'postcss-selector-parser';
import postcssScss from 'postcss-scss';
import * as recast from 'recast';
import * as babelTs from 'recast/parsers/babel-ts';
import { visit, builders as b } from 'ast-types';
import type { namedTypes as NT } from 'ast-types';
import type * as K from 'ast-types/gen/kinds';
import type { Root as CssAst } from 'postcss';
import type { File as JsAst } from '@babel/types';
import { isImportDeclaration } from '@babel/types';

const parseScss = (filePath: string): CssAst =>
  postcssScss.parse(fs.readFileSync(filePath), { from: filePath });
const parseJs = (filePath: string): JsAst =>
  recast.parse(fs.readFileSync(filePath).toString(), { parser: babelTs });

const recastPrintOptions = {
  quote: 'single',
} as const;

interface BaseParams {
  quotes?: 'single' | 'double' | 'auto' | null;
  importIdentifier?: string;
  moduleCssPrefix?: string;
}

interface WalkParams extends BaseParams {
  css: {
    ast: CssAst;
    file: string;
  }[];
  js: {
    ast: JsAst;
    file: string;
  }[];
}

interface ActionParams extends BaseParams {
  css: string;
  js: string;
  dryRun?: boolean;
}

const writeAction = async (opts: ActionParams): Promise<void> => {
  console.debug(opts);

  const cssFiles = await glob(opts.css);
  const jsFiles = await glob(opts.js);

  console.info('Reading and parsing files...');

  const css = cssFiles.map((cssFile) => ({
    ast: parseScss(cssFile),
    file: cssFile,
  }));
  const js = jsFiles.map((jsFile) => ({
    ast: parseJs(jsFile),
    file: jsFile,
  }));

  console.info('Walking through the AST...');

  const result = walkAst({ css, js });

  if (!opts.dryRun) {
    console.info('Rewriting files...');

    [...result.jsFiles, ...result.cssFiles].forEach((file) => {
      fs.writeFileSync(file.file, file.content);
    });
    result.moveFiles.forEach(({ file, newPath }) => {
      fs.renameSync(file, newPath);
    });
  } else {
    console.debug(result);
  }

  console.info('Done!');
};

interface WordMatching {
  matched: boolean;
  word: string;
}

interface ClassNameCssFile {
  filePath: string;
  cssAst: CssAst;
  isRootSelector: boolean;
  isRootClassInSelector: boolean;
}

interface ClassNameJsFile {
  filePath: string;
  jsAst: JsAst;
}

interface ClassInfo {
  className: string;
  newClassName?: string;
  jsFiles?: ClassNameJsFile[];
  cssFiles: ClassNameCssFile[];
}

const walkAst = ({
  css,
  js,
  importIdentifier = 'styles',
  quotes = null,
  moduleCssPrefix = 'module',
}: WalkParams) => {
  const classes: Record<string, ClassInfo> = {};
  const moveFiles: { file: string; newPath: string }[] = [];
  const importIdentifiers: { [key: string]: string } = {};
  const convertedCssFiles: { [key: string]: { cssAst: CssAst } } = {};

  for (const { file, ast } of css) {
    ast.walkRules((node) => {
      if (node.type === 'rule') {
        for (const selector of node.selectors) {
          selectorParser((selectorAst) => {
            selectorAst.walkClasses((classSelector) => {
              const selectorValue = classSelector.value;
              if (!classes[selectorValue]) {
                classes[selectorValue] = { className: selectorValue, cssFiles: [] };
              }
              const sameCssFile = classes[selectorValue].cssFiles.find((f) => f.filePath === file);
              const isRootSelector = node.parent === ast;
              const isRootClassInSelector = classSelector.sourceIndex === 0;
              if (sameCssFile) {
                // If the same class is encountered 2+ times in the same css file
                // If at least one class is not root, this is false
                sameCssFile.isRootSelector = sameCssFile.isRootSelector && isRootSelector;
                sameCssFile.isRootClassInSelector =
                  sameCssFile.isRootClassInSelector && isRootClassInSelector;
              } else {
                classes[selectorValue].cssFiles.push({
                  filePath: file,
                  cssAst: ast,
                  isRootSelector,
                  isRootClassInSelector,
                });
              }
            });
          }).processSync(selector);
        }
      }
    });
  }

  const renameCssToModule = (fileName: string): string =>
    fileName.replace(/(\.(sc|c)ss)/, `.${moduleCssPrefix}$1`);

  const classesToConvert = _.pickBy(classes, (cls) => {
    const uniqueFiles = _.uniqBy(cls.cssFiles, (file) => file.filePath);
    return (
      uniqueFiles.length === 1
      // uniqueFiles[0].isRootSelector &&
      // uniqueFiles[0].isRootClassInSelector
    );
  });

  const convertCssToModule = (cls: ClassInfo, word: string): void => {
    if (cls.cssFiles.length > 1) {
      throw new Error(
        `The same class "${word}" was found in more than one css file: \n${cls.cssFiles
          .map((f) => f.filePath)
          .join('\n')}`
      );
    }

    for (const file of cls.cssFiles) {
      file.cssAst.walkRules((node) => {
        node.selectors = node.selectors.map((selector) => {
          return selectorParser((selectorAst) => {
            selectorAst.walkClasses((classSelector) => {
              if (classSelector.value === word) {
                const cls = classes[word];
                // console.log(cls);
                const newWord = camelCase(word);
                // const newSelector = hasChildrenSelectors ? `${newWord} :global` : newWord;
                classSelector.setPropertyWithoutEscape('value', newWord);
                cls.newClassName = newWord;

                if (!convertedCssFiles[file.filePath]) {
                  moveFiles.push({
                    file: file.filePath,
                    newPath: renameCssToModule(file.filePath),
                  });
                  convertedCssFiles[file.filePath] = {
                    cssAst: file.cssAst,
                  };
                }
              }
            });
          }).processSync(selector);
        });
      });
    }
  };

  const getNewUniqueIdentifier = (ast: JsAst): string => {
    // Recording all identifiers in an AST
    const usedIdentifiers: string[] = [];
    visit(ast, {
      visitIdentifier(nodePath) {
        // eslint-disable-next-line
        const parentType: string = nodePath.parentPath?.value.type;
        if (
          [
            'VariableDeclaration',
            'ImportSpecifier',
            'ImportDefaultSpecifier',
            'FunctionDeclaration',
          ].includes(parentType)
        ) {
          usedIdentifiers.push(nodePath.node.name);
        }
        this.traverse(nodePath);
      },
    });

    // Finding a unique identifier
    const prefix = importIdentifier;
    let suffix = 1;
    let newIdentifierName = prefix;
    while (usedIdentifiers.includes(newIdentifierName)) {
      newIdentifierName = prefix + (++suffix).toString();
    }

    return newIdentifierName;
  };

  const getImportId = (cls: ClassInfo, jsAst: JsAst): string => {
    const jsFileName = cls.jsFiles?.find((jf) => jf.jsAst === jsAst)?.filePath;
    const cssFileName = cls.cssFiles[0].filePath;
    if (!jsFileName || !cssFileName) {
      throw new Error(
        `Cant find or create a new import identifier for:\n` + JSON.stringify(cls, null, 2)
      );
    }
    const key = `${jsFileName}//${cssFileName}`;
    if (!importIdentifiers[key]) {
      importIdentifiers[key] = getNewUniqueIdentifier(jsAst);
    }
    return importIdentifiers[key];
  };

  const modifyCssImport = (cls: ClassInfo, jsAst: JsAst): void => {
    // Adding an import with new identifier
    const identifier = getImportId(cls, jsAst);

    let hasFoundImport = false;

    visit(jsAst, {
      visitImportDefaultSpecifier(nodePath) {
        if (nodePath.node.local?.name === identifier) {
          hasFoundImport = true;
        }
        this.traverse(nodePath);
      },
      visitImportDeclaration(nodePath) {
        const node = nodePath.node;
        const cssFileName = path.basename(cls.cssFiles[0].filePath);
        if (
          typeof node.source.value === 'string' &&
          !node.specifiers?.length &&
          node.source.value.endsWith(cssFileName)
        ) {
          node.specifiers = [b.importDefaultSpecifier(b.identifier(identifier))];
          node.source.value = renameCssToModule(node.source.value);
          hasFoundImport = true;
        }
        this.traverse(nodePath);
      },
    });

    if (!hasFoundImport) {
      // add a new import if it wasn't already in the file
      const jsFilePath = cls.jsFiles?.find((jf) => jf.jsAst === jsAst)?.filePath;
      if (!jsFilePath) {
        throw new Error(`Can't find the js file path for ${cls.className}`);
      }
      const jsFileFolder = path.dirname(jsFilePath);
      const cssRelativePath = renameCssToModule(
        './' + path.relative(jsFileFolder, cls.cssFiles[0].filePath)
      );

      const defaultImport = b.importDeclaration(
        [b.importDefaultSpecifier(b.identifier(identifier))],
        b.stringLiteral.from({
          value: cssRelativePath,
          extra: {
            rawValue: cssRelativePath,
            raw: quotes === 'single' ? `'${cssRelativePath}'` : `"${cssRelativePath}"`,
          },
        })
      );
      // to make TS happy
      if (isImportDeclaration(defaultImport)) jsAst.program.body.unshift(defaultImport);
    }
  };

  const checkWords = (words: string[], jsFile: string, jsAst: JsAst): WordMatching[] => {
    return words.map((word) => {
      const cls = classesToConvert[word];
      if (cls) {
        cls.jsFiles = [...(cls.jsFiles || []), { filePath: jsFile, jsAst }];
        convertCssToModule(cls, word);
        return {
          matched: true,
          word,
        };
      } else {
        return {
          matched: false,
          word,
        }; // this word didn't match any css classes
      }
    });
  };

  const wordsResultModifyCssImports = (wordsResult: WordMatching[], jsAst: JsAst) => {
    return wordsResult.map((wordResult) => {
      if (wordResult.matched) {
        modifyCssImport(classes[wordResult.word], jsAst);
      }
    });
  };

  const wordsResultToTemplateLiteral = (
    wordsResult: WordMatching[],
    jsAst: JsAst
  ): [NT.TemplateElement[], NT.MemberExpression[]] => {
    // Create template literal parameters
    const quasis: NT.TemplateElement[] = [];
    const expressions: NT.MemberExpression[] = [];
    let textQuasi = '';
    for (let i = 0; i < wordsResult.length; i++) {
      const { word, matched } = wordsResult[i];
      if (!matched) {
        textQuasi += word + ' ';
      } else {
        const cls = classes[word];
        const identifier = getImportId(cls, jsAst);

        quasis.push(b.templateElement({ raw: textQuasi, cooked: null }, false));
        expressions.push(
          b.memberExpression(b.identifier(identifier), b.identifier(cls.newClassName ?? ''))
        );
        textQuasi = ' ';
      }
      if (i === wordsResult.length - 1) {
        quasis.push(b.templateElement({ raw: textQuasi.slice(0, -1), cooked: null }, false));
      }
    }

    return [quasis, expressions];
  };

  for (const { file, ast } of js) {
    visit(ast, {
      visitTemplateLiteral(nodePath) {
        const node = nodePath.node;
        if (node.quasis?.length) {
          for (const quasi of node.quasis) {
            const quasiRaw = quasi?.value?.raw;
            if (typeof quasiRaw === 'string') {
              const words = quasiRaw.split(' ');
              const wordsResult = checkWords(words, file, ast);

              if (wordsResult.some((res) => res.matched)) {
                wordsResultModifyCssImports(wordsResult, ast);

                const [quasis, expressions] = wordsResultToTemplateLiteral(wordsResult, ast);
                const index = node.quasis.indexOf(quasi);
                node.quasis = [
                  ...node.quasis.slice(0, index),
                  ...quasis,
                  ...node.quasis.slice(index + 1),
                ];
                node.expressions = [
                  ...(node.expressions.slice(0, index) as K.ExpressionKind[]),
                  ...expressions,
                  ...(node.expressions.slice(index) as K.ExpressionKind[]),
                ];
              }
            }
          }
        }

        this.traverse(nodePath);
      },
      visitStringLiteral(nodePath) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (nodePath.parentPath?.value?.type === 'MemberExpression') {
          this.traverse(nodePath);
          return;
        }

        const text = nodePath.node.value;
        const words = text.split(' ');
        const wordsResult = checkWords(words, file, ast);
        if (!wordsResult.some((res) => res.matched)) {
          this.traverse(nodePath);
          return;
        }

        wordsResultModifyCssImports(wordsResult, ast);

        let replacement = null;

        if (wordsResult.length === 1) {
          // Replace the entire string with a member expression
          const cls = classes[wordsResult[0].word];
          const identifier = getImportId(cls, ast);

          replacement = b.memberExpression(
            b.identifier(identifier),
            b.identifier(cls.newClassName ?? '')
          );
        } else if (words.length > 1) {
          const [quasis, expressions] = wordsResultToTemplateLiteral(wordsResult, ast);
          replacement = b.templateLiteral(quasis, expressions);
        }

        if (replacement) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          if (nodePath.parentPath.value.type === 'JSXAttribute') {
            nodePath.replace(b.jsxExpressionContainer(replacement));
          } else {
            nodePath.replace(replacement);
          }
        }

        this.traverse(nodePath);
      },
    });
  }

  Object.keys(convertedCssFiles).forEach((filePath) => {
    const { cssAst } = convertedCssFiles[filePath];
    // Convert all non-modules classes into :global
    cssAst.walkRules((node) => {
      node.selectors = node.selectors.map((selector) => {
        selectorParser((selectorAst) => {
          // selectorAst.walkIds()
          selectorAst.walkClasses((classSelector) => {
            const name = classSelector.value;
            const cls = classes[name];
            if (cls && !cls.newClassName) {
              console.log(name);
              selector = selector.replace(`.${name}`, `:global(.${name})`);
            }
          });
        }).processSync(selector);
        return selector;
      });
    });
  });

  return {
    jsFiles: js.map((x) => ({
      content: recast.print(x.ast, { quote: quotes }).code,
      file: x.file,
    })),
    cssFiles: css.map((x) => {
      let code = '';
      postcssScss.stringify(x.ast, (result) => {
        code += result;
      });
      return {
        content: code,
        file: x.file,
      };
    }),
    moveFiles,
  };
};

export { writeAction, parseScss, parseJs, walkAst };
