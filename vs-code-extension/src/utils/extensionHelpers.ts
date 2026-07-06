/**
  * Copyright (c) 2026 ETH Zurich
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  */

import * as vscode from 'vscode';

export function getSettings(): { boogieExecutablePath: string | undefined; verificationTimeout: number | undefined; additionalArguments: string[] } {
    // Resolve the configuration against the active document so that folder-scoped values (in
    // multi-root workspaces) are read from the same scope the Settings UI writes them to.
    const resource: vscode.Uri | undefined = vscode.window.activeTextEditor?.document.uri;
    const configuration: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('nagini', resource);
    let boogieExecutablePath: string | undefined = configuration.get<string>('paths.boogieExecutable');
    let verificationTimeout: number | undefined = configuration.get<number>('verification.timeout');
    const additionalArguments: string[] = configuration.get<string[]>('verification.additionalArguments') ?? [];
    if (verificationTimeout === undefined) {
        verificationTimeout = 60000;
    } else if (verificationTimeout === 0) {
        verificationTimeout = undefined;
    } else {
        verificationTimeout *= 1000;
    }
    return { boogieExecutablePath, verificationTimeout, additionalArguments };
}
