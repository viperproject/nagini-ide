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
- `Nagini: Toggle Mode`: switch between Server mode (a persistent Nagini server) and Direct mode (a separate Nagini process per verification)
- `Nagini: Select Backend`: select the backend verifier
- `Nagini: Start Verification`: start a new verification process
- `Nagini: Verify Function at Cursor`: verify only the function or method at the cursor position
- `Nagini: Stop Verification`: stop the current verification process

### Settings

This extension provides the following settings:

- `nagini.paths.boogieExecutable`: specify the path of the Boogie executable used by Carbon
- `nagini.verification.timeout`: specify the time limit for a verification process
- `nagini.verification.additionalArguments`: specify additional command-line arguments passed to Nagini during verification (each list item is one argument)

## Troubleshooting

### Orphaned server process

Occasionally, Nagini's server process may continue running after the extension is deactivated or VS Code is closed. 
If this happens, it needs to be terminated manually.
