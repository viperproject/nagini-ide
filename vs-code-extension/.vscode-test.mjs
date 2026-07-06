import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
    files: 'out/test/**/*.test.js',
    // Our extension declares ms-python.python as a dependency, so VS Code needs it present
    // to load the extension under test even though the current tests don't activate it.
    installExtensions: ['ms-python.python'],
    mocha: {
        ui: 'bdd',
        timeout: 20000
    }
});
