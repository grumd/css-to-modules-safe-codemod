"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.walkAst = exports.parseJs = exports.parseScss = exports.writeAction = void 0;
const lodash_1 = __importDefault(require("lodash"));
const path_1 = __importDefault(require("path"));
const camelcase_1 = __importDefault(require("camelcase"));
const fs_1 = __importDefault(require("fs"));
const fast_glob_1 = __importDefault(require("fast-glob"));
const postcss_selector_parser_1 = __importDefault(require("postcss-selector-parser"));
const postcss_scss_1 = __importDefault(require("postcss-scss"));
const recast = __importStar(require("recast"));
const babelTs = __importStar(require("recast/parsers/babel-ts"));
const ast_types_1 = require("ast-types");
const types_1 = require("@babel/types");
const parseScss = (filePath) => postcss_scss_1.default.parse(fs_1.default.readFileSync(filePath), { from: filePath });
exports.parseScss = parseScss;
const parseJs = (filePath) => recast.parse(fs_1.default.readFileSync(filePath).toString(), { parser: babelTs });
exports.parseJs = parseJs;
const recastPrintOptions = {
    quote: 'single',
};
const writeAction = async (opts) => {
    console.debug(opts);
    const cssFiles = await (0, fast_glob_1.default)(opts.css);
    const jsFiles = await (0, fast_glob_1.default)(opts.js);
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
            fs_1.default.writeFileSync(file.file, file.content);
        });
        result.moveFiles.forEach(({ file, newPath }) => {
            fs_1.default.renameSync(file, newPath);
        });
    }
    else {
        console.debug(result);
    }
    console.info('Done!');
};
exports.writeAction = writeAction;
const walkAst = ({ css, js, importIdentifier = 'styles', quotes = null, moduleCssPrefix = 'module', }) => {
    const classes = {};
    const moveFiles = [];
    const importIdentifiers = {};
    const convertedCssFiles = {};
    for (const { file, ast } of css) {
        ast.walkRules((node) => {
            if (node.type === 'rule') {
                for (const selector of node.selectors) {
                    (0, postcss_selector_parser_1.default)((selectorAst) => {
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
                            }
                            else {
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
    const renameCssToModule = (fileName) => fileName.replace(/(\.(sc|c)ss)/, `.${moduleCssPrefix}$1`);
    const classesToConvert = lodash_1.default.pickBy(classes, (cls) => {
        const uniqueFiles = lodash_1.default.uniqBy(cls.cssFiles, (file) => file.filePath);
        return (uniqueFiles.length === 1
        // uniqueFiles[0].isRootSelector &&
        // uniqueFiles[0].isRootClassInSelector
        );
    });
    const convertCssToModule = (cls, word) => {
        if (cls.cssFiles.length > 1) {
            throw new Error(`The same class "${word}" was found in more than one css file: \n${cls.cssFiles
                .map((f) => f.filePath)
                .join('\n')}`);
        }
        for (const file of cls.cssFiles) {
            file.cssAst.walkRules((node) => {
                node.selectors = node.selectors.map((selector) => {
                    return (0, postcss_selector_parser_1.default)((selectorAst) => {
                        selectorAst.walkClasses((classSelector) => {
                            if (classSelector.value === word) {
                                const cls = classes[word];
                                // console.log(cls);
                                const newWord = (0, camelcase_1.default)(word);
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
    const getNewUniqueIdentifier = (ast) => {
        // Recording all identifiers in an AST
        const usedIdentifiers = [];
        (0, ast_types_1.visit)(ast, {
            visitIdentifier(nodePath) {
                // eslint-disable-next-line
                const parentType = nodePath.parentPath?.value.type;
                if ([
                    'VariableDeclaration',
                    'ImportSpecifier',
                    'ImportDefaultSpecifier',
                    'FunctionDeclaration',
                ].includes(parentType)) {
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
    const getImportId = (cls, jsAst) => {
        const jsFileName = cls.jsFiles?.find((jf) => jf.jsAst === jsAst)?.filePath;
        const cssFileName = cls.cssFiles[0].filePath;
        if (!jsFileName || !cssFileName) {
            throw new Error(`Cant find or create a new import identifier for:\n` + JSON.stringify(cls, null, 2));
        }
        const key = `${jsFileName}//${cssFileName}`;
        if (!importIdentifiers[key]) {
            importIdentifiers[key] = getNewUniqueIdentifier(jsAst);
        }
        return importIdentifiers[key];
    };
    const modifyCssImport = (cls, jsAst) => {
        // Adding an import with new identifier
        const identifier = getImportId(cls, jsAst);
        let hasFoundImport = false;
        (0, ast_types_1.visit)(jsAst, {
            visitImportDefaultSpecifier(nodePath) {
                if (nodePath.node.local?.name === identifier) {
                    hasFoundImport = true;
                }
                this.traverse(nodePath);
            },
            visitImportDeclaration(nodePath) {
                const node = nodePath.node;
                const cssFileName = path_1.default.basename(cls.cssFiles[0].filePath);
                if (typeof node.source.value === 'string' &&
                    !node.specifiers?.length &&
                    node.source.value.endsWith(cssFileName)) {
                    node.specifiers = [ast_types_1.builders.importDefaultSpecifier(ast_types_1.builders.identifier(identifier))];
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
            const jsFileFolder = path_1.default.dirname(jsFilePath);
            const cssRelativePath = renameCssToModule('./' + path_1.default.relative(jsFileFolder, cls.cssFiles[0].filePath));
            const defaultImport = ast_types_1.builders.importDeclaration([ast_types_1.builders.importDefaultSpecifier(ast_types_1.builders.identifier(identifier))], ast_types_1.builders.stringLiteral.from({
                value: cssRelativePath,
                extra: {
                    rawValue: cssRelativePath,
                    raw: quotes === 'single' ? `'${cssRelativePath}'` : `"${cssRelativePath}"`,
                },
            }));
            // to make TS happy
            if ((0, types_1.isImportDeclaration)(defaultImport))
                jsAst.program.body.unshift(defaultImport);
        }
    };
    const checkWords = (words, jsFile, jsAst) => {
        return words.map((word) => {
            const cls = classesToConvert[word];
            if (cls) {
                cls.jsFiles = [...(cls.jsFiles || []), { filePath: jsFile, jsAst }];
                convertCssToModule(cls, word);
                return {
                    matched: true,
                    word,
                };
            }
            else {
                return {
                    matched: false,
                    word,
                }; // this word didn't match any css classes
            }
        });
    };
    const wordsResultModifyCssImports = (wordsResult, jsAst) => {
        return wordsResult.map((wordResult) => {
            if (wordResult.matched) {
                modifyCssImport(classes[wordResult.word], jsAst);
            }
        });
    };
    const wordsResultToTemplateLiteral = (wordsResult, jsAst) => {
        // Create template literal parameters
        const quasis = [];
        const expressions = [];
        let textQuasi = '';
        for (let i = 0; i < wordsResult.length; i++) {
            const { word, matched } = wordsResult[i];
            if (!matched) {
                textQuasi += word + ' ';
            }
            else {
                const cls = classes[word];
                const identifier = getImportId(cls, jsAst);
                quasis.push(ast_types_1.builders.templateElement({ raw: textQuasi, cooked: null }, false));
                expressions.push(ast_types_1.builders.memberExpression(ast_types_1.builders.identifier(identifier), ast_types_1.builders.identifier(cls.newClassName ?? '')));
                textQuasi = ' ';
            }
            if (i === wordsResult.length - 1) {
                quasis.push(ast_types_1.builders.templateElement({ raw: textQuasi.slice(0, -1), cooked: null }, false));
            }
        }
        return [quasis, expressions];
    };
    for (const { file, ast } of js) {
        (0, ast_types_1.visit)(ast, {
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
                                    ...node.expressions.slice(0, index),
                                    ...expressions,
                                    ...node.expressions.slice(index),
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
                    replacement = ast_types_1.builders.memberExpression(ast_types_1.builders.identifier(identifier), ast_types_1.builders.identifier(cls.newClassName ?? ''));
                }
                else if (words.length > 1) {
                    const [quasis, expressions] = wordsResultToTemplateLiteral(wordsResult, ast);
                    replacement = ast_types_1.builders.templateLiteral(quasis, expressions);
                }
                if (replacement) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    if (nodePath.parentPath.value.type === 'JSXAttribute') {
                        nodePath.replace(ast_types_1.builders.jsxExpressionContainer(replacement));
                    }
                    else {
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
                (0, postcss_selector_parser_1.default)((selectorAst) => {
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
            postcss_scss_1.default.stringify(x.ast, (result) => {
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
exports.walkAst = walkAst;
