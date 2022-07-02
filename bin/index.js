#!/usr/bin/env node
'use strict';

const _ = require('lodash');
const util = require('util');
const fs = require('fs');
const glob = require('fast-glob');
const { Command } = require('commander');
const selectorParser = require('postcss-selector-parser');
const postcssScss = require('postcss-scss');
const recast = require('recast');
const { visit } = require('ast-types');

const program = new Command();

const pkg = require('../package.json');

program.version(pkg.version);

// const log = obj => console.log(util.inspect(obj, { showHidden: false, depth: null, colors: true }));

const parseScss = (path) => postcssScss.parse(fs.readFileSync(path), { from: path });
const parseJs = (path) =>
  recast.parse(fs.readFileSync(path), { parser: require('recast/parsers/babel-ts') });

program
  .option('--dry-run')
  .option('--css <css>')
  .option('--js <js>')
  .action(async (opts) => {
    const cssFiles = await glob(opts.css);
    const jsFiles = await glob(opts.js);

    const classes = {};

    for (const cssFile of cssFiles) {
      const root = parseScss(cssFile);
      root.walkRules((node) => {
        if (node.type === 'rule') {
          for (const selector of node.selectors) {
            selectorParser((selectorAst) => {
              selectorAst.walkClasses((classSelector) => {
                const selectorValue = classSelector.value;
                if (!classes[selectorValue]) {
                  classes[selectorValue] = { className: selectorValue, files: [] };
                }
                classes[selectorValue].files.push({
                  filePath: cssFile,
                  isRootSelector: node.parent === root,
                  isRootClassInSelector: classSelector.sourceIndex === 0,
                });
              });
            }).processSync(selector);
          }
        }
      });
    }

    // const classNames = Object.keys(classes).map(cls => classes[cls]);

    const globalClassesCount = _.sumBy(_.keys(classes), (name) => {
      const cls = classes[name];
      const globalCls = cls.files.find((file) => file.isRootSelector);
      return cls.files.length > 1 && !globalCls;
    });
    const globalRootClassesCount = _.sumBy(_.keys(classes), (name) => {
      const cls = classes[name];
      const globalCls = cls.files.find((file) => file.isRootSelector);
      return cls.files.length > 1 && !!globalCls;
    });
    const localRootClasses = _.pickBy(classes, (cls) => {
      return (
        cls.files.length === 1 && cls.files[0].isRootSelector && cls.files[0].isRootClassInSelector
      );
    });

    console.log('Reused selectors', globalClassesCount);
    console.log('Reused selectors, that are root selectors in some files', globalRootClassesCount);
    console.log('Local root selectors', _.keys(localRootClasses).length);

    const checkString = (str, jsFile) => {
      const words = str.split(' ');
      for (const word of words) {
        const cls = localRootClasses[word];
        if (cls) {
          cls.jsPaths = [...(cls.jsPaths || []), jsFile];
        }
      }
    };

    for (const jsFile of jsFiles) {
      // console.log(jsFile);
      const root = parseJs(jsFile);
      // console.log(root);
      visit(root, {
        visitTemplateLiteral(path) {
          const node = path.node;
          if (node.quasis?.length) {
            for (const quasi of node.quasis) {
              if (typeof quasi?.value?.raw === 'string') {
                checkString(quasi.value.raw, jsFile);
              }
            }
          }
          return false;
        },
        visitStringLiteral(path) {
          const words = path.node.value.split(' ');
          for (const word of words) {
            checkString(word, jsFile);
          }
          return false;
        },
      });
    }

    const grouped = _.groupBy(localRootClasses, (cls) => {
      if (!cls.jsPaths || cls.jsPaths.length === 0) {
        return 'zero';
      } else if (cls.jsPaths.length === 1) {
        return 'one';
      } else {
        return 'many';
      }
    });

    console.log('Selectors used in <n> JS files:');
    console.log({
      zero: grouped.zero.length,
      one: grouped.one.length,
      many: grouped.many.length,
    });

    console.log(grouped.many);
  });

program.parse(process.argv);
