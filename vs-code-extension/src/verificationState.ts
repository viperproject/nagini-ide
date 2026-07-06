/**
  * Copyright (c) 2026 ETH Zurich
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import { Server } from './server';

type Backend = 'silicon' | 'carbon';
export type Status = 'idle' | 'running' | 'success' | 'failure' | 'error';

export interface VerificationState {
    serverMode: boolean;
    activeBackend: Backend;
    server: Server;
    activeVerificationSession: VerificationSession | undefined;
}

export interface VerificationSession {
    process: cp.ChildProcess;
    stdout: string;
    stderr: string;
    failed: boolean;
    interrupted: boolean;
    termination: Promise<void>;
    resolveTermination: () => void;
}

export function initializeState(): VerificationState {
    const serverMode: boolean = true;
    const activeBackend: Backend = 'silicon';
    const server: Server = new Server();
    const activeVerificationSession: VerificationSession | undefined = undefined;
    return { serverMode, activeBackend, server, activeVerificationSession };
}

export function getNaginiCommandArgs(verificationState: VerificationState, fileName: string, settings: { boogieExecutablePath: string | undefined; additionalArguments: string[] }, select?: string): string[] {
    const backend: Backend = verificationState.activeBackend;
    const boogiePath: string | undefined = settings.boogieExecutablePath;
    return [
        '--ide-mode',
        '--verifier', backend,
        ...(backend === 'carbon' && boogiePath ? ['--boogie', boogiePath] : []),
        ...(select ? [`--select=${select}`] : []),
        ...settings.additionalArguments,
        fileName
    ];
}

export function getNaginiServerCommandArgs(verificationState: VerificationState, settings: { boogieExecutablePath: string | undefined; additionalArguments: string[] }): string[] {
    const backend: Backend = verificationState.activeBackend;
    const boogiePath: string | undefined = settings.boogieExecutablePath;
    return [
        '--server',
        '--ide-mode',
        '--verifier', backend,
        ...(backend === 'carbon' && boogiePath ? ['--boogie', boogiePath] : []),
        ...settings.additionalArguments,
        'nonexistent.py'
    ];
}

export function getNaginiClientCommandArgs(fileName: string, select?: string): string[] {
    return [
        fileName,
        ...(select ? [`--select=${select}`] : [])
    ];
}
