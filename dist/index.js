"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const action_1 = require("./action");
const program = new commander_1.Command();
const pkg = require('../package.json');
program
    .version(pkg.version)
    .option('--dry-run')
    .requiredOption('--css <css>', 'glob pattern for all css/scss files in the project')
    .requiredOption('--js <js>', 'glob pattern for all js/ts files in the project')
    .option('--quotes <quotes>', 'style of quotes to use (single, double, auto), optional', undefined)
    .option('--importIdentifier, --import-identifier <importIdentifier>', 'import identifier to use (import styles from), default: styles', 'styles')
    .option('--moduleCssPrefix, --module-css-prefix <moduleCssPrefix>', 'css-module extension suffix (.module.css), default: module', 'module')
    .action(action_1.writeAction);
program.parse(process.argv);
