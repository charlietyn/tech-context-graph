const { rmSync } = require('node:fs');
const { resolve } = require('node:path');

const projectRoot = resolve(__dirname, '..');
const outputDirectory = resolve(projectRoot, 'dist');

if (!outputDirectory.startsWith(`${projectRoot}\\`) && !outputDirectory.startsWith(`${projectRoot}/`)) {
  throw new Error(`Refusing to remove a path outside the project: ${outputDirectory}`);
}

rmSync(outputDirectory, { recursive: true, force: true });
