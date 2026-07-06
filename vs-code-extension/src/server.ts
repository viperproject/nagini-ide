/**
  * Copyright (c) 2026 ETH Zurich
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import { logOutputChannel } from './extensionState';
import { getNaginiServerCommandArgs, VerificationState } from './verificationState';
import { getSettings } from './utils';

const SERVER_TIMEOUT: number = 12*60*60*1000;

interface ServerSession {
    process: cp.ChildProcess;
    stdout: string;
    stderr: string;
    failed: boolean;
    killed: boolean;
    finished: boolean;
    serverStartedSuccessfully: boolean;
    ready: Promise<void>;
    resolveReady: () => void;
    rejectReady: (error: Error) => void;
    termination: Promise<void>;
    resolveTermination: () => void;
}

export class Server {
    private session: ServerSession | undefined;
    private startingPromise: Promise<void> | undefined;

    private async start(verificationState: VerificationState, naginiPath: string): Promise<void> {
        logOutputChannel.info('Server starting...');

        const settings: { boogieExecutablePath: string | undefined; verificationTimeout: number | undefined; additionalArguments: string[]; } = getSettings();
        const serverArgs: string[] = getNaginiServerCommandArgs(verificationState, settings);

        const session: ServerSession = (() => {
            let resolveReady!: () => void;
            let rejectReady!: (error: Error) => void;
            let resolveTermination!: () => void;
            const ready: Promise<void> = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
            const termination: Promise<void> = new Promise<void>(resolve => { resolveTermination = resolve; });
            return {
                process: cp.spawn(naginiPath, serverArgs, { timeout: SERVER_TIMEOUT }),
                stdout: '',
                stderr: '',
                failed: false,
                killed: false,
                finished: false,
                serverStartedSuccessfully: false,
                ready,
                resolveReady,
                rejectReady,
                termination,
                resolveTermination,
            };
        })();
        this.session = session;

        logOutputChannel.info(`Server process ${session.process.pid} started with command: ${session.process.spawnargs.join(' ')}`);

        session.process.stdout?.on('data', (data: Buffer) => {
            session.stdout += data.toString();
            if (!session.killed && !session.serverStartedSuccessfully && session.stdout.includes('Server started successfully')) {
                logOutputChannel.info(`Server process stdout: ${session.stdout.toString().trim()}`);
                session.serverStartedSuccessfully = true;
                session.resolveReady();
            }
        });
        session.process.stderr?.on('data', (data: Buffer) => { session.stderr += data.toString(); });
        session.process.on('error', (error: Error) => {
            session.stderr = error.message;
            session.failed = true;
        });
        session.process.on('close', (code: number | null, signal: string | null) => {
            session.stdout = session.stdout.trim();
            session.stderr = session.stderr.trim();
            if (session.failed) {
                logOutputChannel.error(`Server process failed to spawn. Reason: ${session.stderr}`);
                vscode.window.showErrorMessage(`Server process failed to spawn: ${session.stderr}`);
            } else if (session.killed) {
                logOutputChannel.info(`Server process ${session.process.pid} finished. Result: Interruption`);
            } else if (code !== 0) {
                logOutputChannel.error(`Server process failed. Reason: process exited with code ${code} and signal ${signal}\nstdout:\n${session.stdout}\nstderr:\n${session.stderr}`);
                vscode.window.showErrorMessage(`Server process failed: process exited with code ${code} and signal ${signal}`);
            } else {
                logOutputChannel.info('Server process finished');
            }
            finalizeServerSession(session);
            logOutputChannel.info('Server finished');
        });

        return session.ready;
    }

    async ensureRunning(verificationState: VerificationState, naginiPath: string): Promise<void> {
        if (this.session && !this.session.killed && !this.session.finished) {
            return this.session.ready;
        }
        if (!this.startingPromise) {
            this.startingPromise = this.stop()
                .then(() => this.start(verificationState, naginiPath))
                .finally(() => { this.startingPromise = undefined; });
        }
        return this.startingPromise;
    }

    async stop(): Promise<void> {
        const session: ServerSession | undefined = this.session;
        if (!session || session.finished) { return; }
        if (!session.killed) {
            session.killed = true;
            session.process.kill();
            await session.termination;
            logOutputChannel.info(`Server process ${session.process.pid} stopped`);
        }
    }
}

function finalizeServerSession(session: ServerSession): void {
    session.finished = true;
    if (!session.serverStartedSuccessfully) {
        const reason: string = session.failed
            ? session.stderr
            : session.killed
                ? 'Server was stopped before it finished starting'
                : 'Server process exited before it finished starting';
        session.rejectReady(new Error(reason));
    }
    session.resolveTermination();
}
