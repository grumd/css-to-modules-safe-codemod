import fs from 'fs';
import path from 'path';
import glob from 'fast-glob';

import { walkAst, parseScss, parseJs } from '../action';

interface Metadata {
  css: string;
  js: string;
  testTitle: string;
}

const getDirectories = (source: string) =>
  fs
    .readdirSync(source, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

const testsMetadata = getDirectories(path.join(__dirname, 'cases')).map((testDir) => ({
  metadata: JSON.parse(
    fs.readFileSync(path.join(__dirname, 'cases', testDir, 'metadata.json')).toString()
  ) as Metadata,
  testDir: testDir,
}));

const runAction = async ({ testDir, metadata }: { testDir: string; metadata: Metadata }) => {
  // read input
  const inputDir = path.join(__dirname, 'cases', testDir, 'input');
  const outputDir = path.join(__dirname, 'cases', testDir, 'output');
  const cssFilesIn = await glob(metadata.css, { cwd: inputDir });
  const jsFilesIn = await glob(metadata.js, { cwd: inputDir });

  const css = cssFilesIn.map((cssFile) => ({
    ast: parseScss(path.join(inputDir, cssFile)),
    file: cssFile,
  }));
  const js = jsFilesIn.map((jsFile) => ({
    ast: parseJs(path.join(inputDir, jsFile)),
    file: jsFile,
  }));

  // run codemod
  const { jsFiles: jsFilesMod, cssFiles: cssFilesMod, moveFiles } = walkAst({ css, js, quotes: 'single' });

  // compare output
  const cssFilesOut = await glob(metadata.css, { cwd: outputDir });
  const jsFilesOut = await glob(metadata.js, { cwd: outputDir });

  const cssOut = cssFilesOut.map((cssFile) => {
    const renamed = moveFiles.find((f) => f.newPath === cssFile);
    return {
      content: fs.readFileSync(path.resolve(outputDir, cssFile)).toString(),
      file: renamed ? renamed.file : cssFile,
    };
  });
  const jsOut = jsFilesOut.map((jsFile) => ({
    content: fs.readFileSync(path.resolve(outputDir, jsFile)).toString(),
    file: jsFile,
  }));

  // Check if output matches input
  [
    ...cssOut.map((cssOutFile) => {
      return {
        out: cssOutFile.content,
        outFile: cssOutFile.file,
        mod: cssFilesMod.find(({ file }) => file === cssOutFile.file),
      };
    }),
    ...jsOut.map((jsOutFile) => {
      return {
        out: jsOutFile.content,
        outFile: jsOutFile.file,
        mod: jsFilesMod.find(({ file }) => file === jsOutFile.file),
      };
    }),
  ].forEach(({ out, mod }) => {
    // Output file is found in the walkAst output
    expect(mod).toBeDefined();
    // And the content of these files is identical
    expect(mod?.content).toEqual(out);
  });
};

testsMetadata.forEach(({ metadata, testDir }) => {
  test(`[${testDir}]\n      ${metadata.testTitle}`, () => {
    return runAction({ testDir, metadata });
  });
});
