# Nagini IDE

[![License: MPL 2.0](https://img.shields.io/badge/License-MPL%202.0-brightgreen.svg)](./LICENSE)

This VS Code extension provides interactive IDE features for verifying Python programs with the [Nagini verifier](https://www.pm.inf.ethz.ch/research/nagini.html).

## Requirements

The requirements for the Nagini verifier can be found here: [https://github.com/marcoeilers/nagini](https://github.com/marcoeilers/nagini).

Note that the installation command uses pip to install the Nagini verifier.

## Features

### Commands

This extension provides the following commands:

- `Nagini: Select Environment`: select a Python environment
- `Nagini: Install Nagini`: install Nagini from source
- `Nagini: Toggle Mode`: activate/deactivate server mode
- `Nagini: Select Backend`: select the backend verifier
- `Nagini: Start Verification`: start a new verification process
- `Nagini: Stop Verification`: stop the current verification process

### Settings

This extension provides the following settings:

- `nagini.paths.boogieExecutable`: specify the path of the Boogie executable used by Carbon
- `nagini.verification.timeout`: specify the time limit for a verification process

## Troubleshooting

### Orphaned server process

Nagini's server process may continue running after the extension is deactivated 
or VS Code is closed. If this happens, it needs to be terminated manually.
