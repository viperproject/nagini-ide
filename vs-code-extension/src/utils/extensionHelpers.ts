/**
  * Copyright (c) 2026 ETH Zurich
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  */

import * as vscode from 'vscode';

export function getSettings(): { boogieExecutablePath: string | undefined; verificationTimeout: number | undefined; additionalArguments: string[] } {
    let boogieExecutablePath: string | undefined = vscode.workspace.getConfiguration('nagini').get<string>('paths.boogieExecutable');
    let verificationTimeout: number | undefined = vscode.workspace.getConfiguration('nagini').get<number>('verification.timeout');
    const additionalArguments: string[] = vscode.workspace.getConfiguration('nagini').get<string[]>('verification.additionalArguments') ?? [];
    if (verificationTimeout === undefined) {
        verificationTimeout = 60000;
    } else if (verificationTimeout === 0) {
        verificationTimeout = undefined;
    } else {
        verificationTimeout *= 1000;
    }
    return { boogieExecutablePath, verificationTimeout, additionalArguments };
}
