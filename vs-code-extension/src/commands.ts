/**
  * Copyright (c) 2026 ETH Zurich
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { diagnosticCollection, logOutputChannel, stopVerificationButton } from './extensionState';
import { updateToggleModeButton, updateSelectBackendButton, updateStatusItem } from './extensionState';
import { VerificationState, VerificationSession, getNaginiCommandArgs, getNaginiClientCommandArgs } from './verificationState';
import { checkNaginiInstallation, getNaginiPathFromEditor, getPythonPath, getSettings, parseDurationFromOutput, parseErrorsFromOutput } from './utils';

let selectEnvironmentQueue: Promise<void> = Promise.resolve();
export async function selectEnvironment(context: vscode.ExtensionContext, verificationState: VerificationState): Promise<void> {
    logOutputChannel.info('Environment selection registered');

    let activeEditor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    if (!activeEditor) {
        logOutputChannel.info('Environment selection cancelled. Reason: no active editor');
        vscode.window.showErrorMessage('Environment selection cancelled: no active editor');
        return;
    }
    let naginiPath: string;

    selectEnvironmentQueue = selectEnvironmentQueue.finally(async () => {
        logOutputChannel.info('Environment selection starting...');
        if (verificationState.serverMode) { await verificationState.server.stop(); }

        let retry: boolean;
        do {
            retry = false;

            await vscode.commands.executeCommand('python.setInterpreter');

            activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                logOutputChannel.info('Environment selection cancelled. Reason: no active editor');
                vscode.window.showErrorMessage('Environment selection cancelled: no active editor');
                return;
            }
            naginiPath = await getNaginiPathFromEditor(activeEditor);

            if (await checkNaginiInstallation(naginiPath)) {
                updateStatusItem('Nagini is ready', 'idle');
            } else {
                updateStatusItem('Nagini is not installed', 'idle');

                const select: string = 'Select another environment';
                const install: string = 'Install Nagini in the current environment';
                const instruction: string | undefined = await vscode.window.showQuickPick([select, install]);
                switch (instruction) {
                    case undefined:
                        logOutputChannel.info('Environment selection interaction failed. Reason: cancelled by user');
                        break;
                    case select:
                        retry = true;
                        break;
                    case install:
                        await installNagini(context, verificationState);
                        break;
                    default:
                        logOutputChannel.error(`Environment selection interaction failed. Reason: invalid instruction ${instruction}`);
                        break;
                }
            }
        } while (retry);

        if (verificationState.serverMode && await checkNaginiInstallation(naginiPath)) {
            try {
                await verificationState.server.ensureRunning(verificationState, naginiPath);
            } catch (error: Error | unknown) {
                logOutputChannel.error(`Server failed to start: ${(error as Error).message}`);
                vscode.window.showErrorMessage(`Server failed to start: ${(error as Error).message}`);
            }
        }
        logOutputChannel.info(`Environment selection finished. Current Python path: ${await getPythonPath(activeEditor.document.uri)}`);
    });
    await selectEnvironmentQueue;
}

let installNaginiQueue: Promise<void> = Promise.resolve();
export async function installNagini(context: vscode.ExtensionContext, verificationState: VerificationState): Promise<void> {
    logOutputChannel.info('Nagini installation registered');

    const activeEditor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    if (!activeEditor) {
        logOutputChannel.info('Nagini installation cancelled. Reason: no active editor');
        vscode.window.showErrorMessage('Nagini installation cancelled: no active editor');
        return;
    }
    const pythonPath: string = await getPythonPath(activeEditor.document.uri);
    const naginiPath: string = await getNaginiPathFromEditor(activeEditor);

    installNaginiQueue = installNaginiQueue.finally(async () => {
        logOutputChannel.info('Nagini installation starting...');
        if (verificationState.serverMode) { await verificationState.server.stop(); }

        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Nagini installation in progress" }, async () => {
            await new Promise<void>(resolve => {
                const process: cp.ChildProcess = cp.spawn(pythonPath, ['-m', 'pip', 'install', './nagini[server]'], { cwd: context.extensionPath });
                logOutputChannel.info(`Nagini installation process ${process.pid} started with command: ${process.spawnargs.join(' ')}`);
                let stdout: string = '';
                let stderr: string = '';
                let failed: boolean = false;
                process.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
                process.on('error', (error: Error) => {
                    stderr = error.message;
                    failed = true;
                });
                process.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });
                process.on('close', async (code: number | null, signal: string | null) => {
                    stdout = stdout.trim();
                    stderr = stderr.trim();
                    if (failed) {
                        logOutputChannel.error(`Nagini installation process failed to spawn. Reason: ${stderr}`);
                        vscode.window.showErrorMessage(`Nagini installation process failed to spawn: ${stderr}`);
                    } else if (code !== 0) {
                        logOutputChannel.error(`Nagini installation process exited with code ${code} and signal ${signal}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
                        vscode.window.showErrorMessage(`Nagini installation process exited with code ${code} and signal ${signal}`);
                    } else {
                        updateStatusItem('Nagini is ready', 'idle');
                        logOutputChannel.info(`Nagini installation process finished. Result: Success\nstdout:\n${stdout}\nstderr:\n${stderr}`);
                        vscode.window.showInformationMessage('Nagini installation succeeded');
                        if (verificationState.serverMode && await checkNaginiInstallation(naginiPath)) {
                            try {
                                await verificationState.server.ensureRunning(verificationState, naginiPath);
                            } catch (error: Error | unknown) {
                                logOutputChannel.error(`Server failed to start: ${(error as Error).message}`);
                                vscode.window.showErrorMessage(`Server failed to start: ${(error as Error).message}`);
                            }
                        }
                    }
                    logOutputChannel.info('Nagini installation finished');
                    resolve();
                });
            });
        });
    });
    await installNaginiQueue;
}

let toggleModeQueue: Promise<void> = Promise.resolve();
export async function toggleMode(verificationState: VerificationState): Promise<void> {
    logOutputChannel.info('Mode toggle registered');

    const activeEditor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    if (!activeEditor) {
        logOutputChannel.info('Mode toggle cancelled. Reason: no active editor');
        vscode.window.showErrorMessage('Mode toggle cancelled: no active editor');
        return;
    }
    const naginiPath: string = await getNaginiPathFromEditor(activeEditor);
    if (!await checkNaginiInstallation(naginiPath)) {
        logOutputChannel.info('Mode toggle cancelled. Reason: Nagini is not installed');
        showErrorMessageWithAction('Mode toggle');
        return;
    }

    toggleModeQueue = toggleModeQueue.finally(async () => {
        logOutputChannel.info('Mode toggle starting...');
        if (verificationState.serverMode) { await verificationState.server.stop(); }

        verificationState.serverMode = !verificationState.serverMode;
        updateToggleModeButton(verificationState);

        if (verificationState.serverMode) {
            try {
                await verificationState.server.ensureRunning(verificationState, naginiPath);
            } catch (error: Error | unknown) {
                logOutputChannel.error(`Server failed to start: ${(error as Error).message}`);
                vscode.window.showErrorMessage(`Server failed to start: ${(error as Error).message}`);
            }
        }
        logOutputChannel.info(`Mode toggle finished. Current mode: ${verificationState.serverMode ? 'Server' : 'Local'}`);
    });
    await toggleModeQueue;
}

let selectBackendQueue: Promise<void> = Promise.resolve();
export async function selectBackend(verificationState: VerificationState): Promise<void> {
    logOutputChannel.info('Backend selection registered');

    const activeEditor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    if (!activeEditor) {
        logOutputChannel.info('Backend selection cancelled. Reason: no active editor');
        vscode.window.showErrorMessage('Backend selection cancelled: no active editor');
        return;
    }
    const naginiPath: string = await getNaginiPathFromEditor(activeEditor);
    if (!await checkNaginiInstallation(naginiPath)) {
        logOutputChannel.info('Backend selection cancelled. Reason: Nagini is not installed');
        showErrorMessageWithAction('Backend selection');
        return;
    }

    selectBackendQueue = selectBackendQueue.finally(async () => {
        logOutputChannel.info('Backend selection starting...');
        if (verificationState.serverMode) { await verificationState.server.stop(); }

        const silicon: string = 'Symbolic Execution (Silicon)';
        const carbon: string = 'Verification Condition Generation (Carbon)';
        const instruction: string | undefined = await vscode.window.showQuickPick([silicon, carbon], { placeHolder: ' Select the verification backend' });
        switch (instruction) {
            case undefined:
                logOutputChannel.info('Backend selection interaction failed. Reason: cancelled by user');
                break;
            case silicon:
                verificationState.activeBackend = 'silicon';
                break;
            case carbon:
                verificationState.activeBackend = 'carbon';
                break;
            default:
                logOutputChannel.error(`Backend selection interaction failed. Reason: invalid instruction ${instruction}`);
                break;
        }
        updateSelectBackendButton(verificationState);

        if (verificationState.serverMode) {
            try {
                await verificationState.server.ensureRunning(verificationState, naginiPath);
            } catch (error: Error | unknown) {
                logOutputChannel.error(`Server failed to start: ${(error as Error).message}`);
                vscode.window.showErrorMessage(`Server failed to start: ${(error as Error).message}`);
            }
        }
        logOutputChannel.info(`Backend selection finished. Current backend: ${verificationState.activeBackend}`);
    });
    await selectBackendQueue;
}

let startVerificationQueue: Promise<void> = Promise.resolve();
export async function startVerification(verificationState: VerificationState): Promise<void> {
    logOutputChannel.info('Verification registered');

    const activeEditor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    if (!activeEditor) {
        logOutputChannel.info('Verification cancelled. Reason: no active editor');
        vscode.window.showErrorMessage('Verification cancelled: no active editor');
        return;
    }
    const naginiPath: string = await getNaginiPathFromEditor(activeEditor, false);
    const naginiClientPath: string = await getNaginiPathFromEditor(activeEditor, true);
    if (!await checkNaginiInstallation(naginiPath)) {
        logOutputChannel.info('Verification cancelled. Reason: Nagini is not installed');
        showErrorMessageWithAction('Verification');
        return;
    }

    startVerificationQueue = startVerificationQueue.finally(async () => {
        await stopVerification(verificationState);

        logOutputChannel.info('Verification starting...');

        const settings: { boogieExecutablePath: string | undefined; verificationTimeout: number | undefined; } = getSettings();
        const uri: vscode.Uri = activeEditor.document.uri;
        const file: string = uri.fsPath;
        const fileName: string = path.basename(file);
        const args: string[] = getNaginiCommandArgs(verificationState, file, settings);
        const clientArgs: string[] = getNaginiClientCommandArgs(file);

        diagnosticCollection.delete(uri);

        if (verificationState.serverMode) {
            updateStatusItem(`Nagini is starting the server $(loading~spin)`, 'idle');
            try {
                await verificationState.server.ensureRunning(verificationState, naginiPath);
            } catch (error: Error | unknown) {
                logOutputChannel.error(`Server failed to start: ${(error as Error).message}`);
                updateStatusItem(`$(x) Nagini failed to start the server`, 'error');
                vscode.window.showErrorMessage(`Server failed to start: ${(error as Error).message}`);
                logOutputChannel.info(`Verification finished`);
                return;
            }
        }

        stopVerificationButton.show();
        updateStatusItem(`Nagini is verifying ${fileName} $(loading~spin)`, 'running');

        const session: VerificationSession = (() => {
            let resolveTermination!: () => void;
            const termination: Promise<void> = new Promise<void>(resolve => { resolveTermination = resolve; });
            return {
                process: verificationState.serverMode
                    ? cp.spawn(naginiClientPath, clientArgs, { timeout: settings.verificationTimeout })
                    : cp.spawn(naginiPath, args, { timeout: settings.verificationTimeout }),
                stdout: '',
                stderr: '',
                failed: false,
                interrupted: false,
                termination,
                resolveTermination,
            };
        })();
        verificationState.activeVerificationSession = session;

        logOutputChannel.info(`Verification process ${session.process.pid} for ${fileName} started with command: ${session.process.spawnargs.join(' ')}`);

        session.process.stdout?.on('data', (data: Buffer) => { session.stdout += data.toString(); });
        session.process.stderr?.on('data', (data: Buffer) => { session.stderr += data.toString(); });
        session.process.on('error', (error: Error) => {
            session.stderr = error.message;
            session.failed = true;
        });
        session.process.on('close', () => {
            stopVerificationButton.hide();
            session.stdout = session.stdout.trim();
            session.stderr = session.stderr.trim();
            if (session.failed) {
                logOutputChannel.error(`Verification process ${session.process.pid} for ${fileName} failed to spawn. Reason: ${session.stderr}`);
                vscode.window.showErrorMessage(`Verification process for ${fileName} failed to spawn: ${session.stderr}`);
                updateStatusItem(`$(x) Nagini failed to start verifying ${fileName}`, 'error');
            } else if (session.interrupted) {
                logOutputChannel.info(`Verification process ${session.process.pid} for ${fileName} finished. Result: Interruption`);
                updateStatusItem('Nagini was interrupted', 'idle');
            } else if (session.stdout.startsWith('Translation failed')) {
                logOutputChannel.info(`Verification process ${session.process.pid} for ${fileName} finished. Result: Translation failed\nstdout:\n${session.stdout}\nstderr:\n${session.stderr}`);
                updateStatusItem(`$(x) Nagini failed to translate ${fileName}`, 'failure');
            } else if (session.stdout.startsWith('Verification failed')) {
                const duration: number = parseDurationFromOutput(session.stdout);
                const diagnostics: vscode.Diagnostic[] = parseErrorsFromOutput(fileName, session.stdout, 'Nagini');
                diagnosticCollection.set(uri, diagnostics);
                logOutputChannel.info(`Verification process ${session.process.pid} for ${fileName} finished. Result: Verification failed\nstdout:\n${session.stdout}\nstderr:\n${session.stderr}`);
                updateStatusItem(`$(x) Nagini failed to verify ${fileName} (${duration}s) with ${diagnostics.length} ${diagnostics.length === 1 ? 'error' : 'errors'}`, 'failure');
            } else if (session.stdout.startsWith('Verification successful')) {
                const duration: number = parseDurationFromOutput(session.stdout);
                logOutputChannel.info(`Verification process ${session.process.pid} for ${fileName} finished. Result: Success\nstdout:\n${session.stdout}\nstderr:\n${session.stderr}`);
                updateStatusItem(`$(check) Nagini verified ${fileName} (${duration}s)`, 'success');
            } else {
                logOutputChannel.info(`Verification process ${session.process.pid} for ${fileName} finished. Result: Timeout\nstdout:\n${session.stdout}\nstderr:\n${session.stderr}`);
                updateStatusItem('$(x) Nagini timed out', 'error');
            }
            finalizeVerificationSession(verificationState, session);
            logOutputChannel.info(`Verification finished`);
        });
    });
    await startVerificationQueue;
}

let stopVerificationQueue: Promise<void> = Promise.resolve();
export async function stopVerification(verificationState: VerificationState): Promise<void> {
    stopVerificationQueue = stopVerificationQueue.finally(async () => {
        const session: VerificationSession | undefined = verificationState.activeVerificationSession;
        if (!session) { return; }
        if (!session.interrupted) {
            session.interrupted = true;
            session.process.kill();
            await session.termination;
            logOutputChannel.info(`Verification process ${session.process.pid} stopped.`);
        }
    });
    await stopVerificationQueue;
}

function finalizeVerificationSession(verificationState: VerificationState, session: VerificationSession): void {
    verificationState.activeVerificationSession = undefined;
    session.resolveTermination();
}

async function showErrorMessageWithAction(context: string): Promise<void> {
    const message: string = `${context} cancelled: Nagini is not installed. Please select another virtual environment or install Nagini in the current environment.`;
    const select: string = 'Select';
    const install: string = 'Install';
    const selection: string | undefined = await vscode.window.showErrorMessage(message, select, install);
    switch (selection) {
        case select:
            vscode.commands.executeCommand('nagini.selectEnvironment');
            break;
        case install:
            vscode.commands.executeCommand('nagini.installNagini');
            break;
    }
}
