# Nagini IDE

[![License: MPL 2.0](https://img.shields.io/badge/License-MPL%202.0-brightgreen.svg)](./LICENSE)

This VS Code extension provides interactive IDE features for verifying Python programs with the [Nagini verifier](https://www.pm.inf.ethz.ch/research/nagini.html).

## Requirements

The requirements for the Nagini verifier can be found here: [https://github.com/marcoeilers/nagini](https://github.com/marcoeilers/nagini).

Note that the installation command uses pip to install the Nagini verifier.

## Installation Instructions

### Option 1 - Download the extension from GitHub

1. Download the extension from the GitHub Actions workflow run artifacts
2. Install the extension manually in VS Code via `Install from VSIX...` or by executing:
```bash
code --install-extension path/to/nagini-ide.vsix
```

### Option 2 - Build the extension from source

```bash
git clone --recurse-submodules https://github.com/viperproject/nagini-ide.git
cd nagini-ide/vs-code-extension
npm ci
npx vsce package -o nagini-ide.vsix
code --install-extension nagini-ide.vsix
```

### Option 3 - Run the extension in the Extension Development Host

```bash
git clone --recurse-submodules https://github.com/viperproject/nagini-ide.git
cd nagini-ide/vs-code-extension
npm ci
```
Then, press `F5` in VS Code to start the Extension Development Host.
