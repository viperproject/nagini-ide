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
import { checkNaginiInstallation, getNaginiPathFromEditor, getPythonPath, getPythonVersion, isGlobalPythonEnvironment, isPipAvailable, getSettings, parseDurationFromOutput, parseErrorsFromOutput, MINIMUM_NAGINI_VERSION_STRING } from './utils';

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

            if (await checkNaginiInstallation(activeEditor.document.uri)) {
                updateStatusItem('Nagini is ready', 'idle');
            } else {
                updateStatusItem('Nagini is not installed or is outdated', 'idle');

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

        if (verificationState.serverMode && await checkNaginiInstallation(activeEditor.document.uri)) {
            try {
                await verificationState.server.ensureRunning(verificationState, naginiPath);
            } catch (error: Error | unknown) {
                await handleServerStartFailure(verificationState, error);
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
    const version: { major: number; minor: number } | undefined = await getPythonVersion(activeEditor.document.uri);
    logOutputChannel.info(`Nagini installation: resolved Python version ${version ? `${version.major}.${version.minor}` : '<unknown>'}`);
    if (version && !isSupportedPythonVersion(version)) {
        const versionString: string = `${version.major}.${version.minor}`;
        logOutputChannel.info(`Nagini installation cancelled. Reason: unsupported Python version ${versionString}`);
        const select: string = 'Select Environment';
        const selection: string | undefined = await vscode.window.showErrorMessage(
            `Nagini installation cancelled: Python ${versionString} is not supported. Nagini requires Python ${SUPPORTED_PYTHON_RANGE}. Please select a compatible environment.`,
            select
        );
        if (selection === select) {
            vscode.commands.executeCommand('nagini.selectEnvironment');
        }
        return;
    }
    if (version === undefined) {
        logOutputChannel.warn(`Could not determine the Python version before installing Nagini; proceeding. Nagini requires Python ${SUPPORTED_PYTHON_RANGE}.`);
    }

    if (!await isPipAvailable(activeEditor.document.uri)) {
        logOutputChannel.info('Nagini installation cancelled. Reason: pip is not available in the selected environment');
        const select: string = 'Select Environment';
        const selection: string | undefined = await vscode.window.showErrorMessage(
            'Nagini installation cancelled: the selected Python environment does not have pip available. ' +
            'Please select an environment that has pip installed.',
            select
        );
        if (selection === select) {
            vscode.commands.executeCommand('nagini.selectEnvironment');
        }
        return;
    }

    if (await isGlobalPythonEnvironment(activeEditor.document.uri) === true) {
        logOutputChannel.info('Nagini installation: the selected interpreter is a global/system Python, not a virtual environment');
        const select: string = 'Select Environment';
        const installAnyway: string = 'Install Anyway';
        const selection: string | undefined = await vscode.window.showWarningMessage(
            'Nagini would be installed into a global/system Python interpreter rather than a virtual environment. ' +
            'On many systems pip refuses this (externally managed environment), and it can interfere with system packages. ' +
            'It is strongly recommended to select or create a virtual environment first.',
            { modal: true },
            select,
            installAnyway
        );
        if (selection === select) {
            vscode.commands.executeCommand('nagini.selectEnvironment');
            return;
        }
        if (selection !== installAnyway) {
            logOutputChannel.info('Nagini installation cancelled. Reason: user declined installing into a global interpreter');
            return;
        }
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
                    } else if (/externally[- ]managed[- ]environment/i.test(`${stdout}\n${stderr}`)) {
                        logOutputChannel.error(`Nagini installation failed: the selected Python installation is externally managed.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
                        const select: string = 'Select Environment';
                        vscode.window.showErrorMessage(
                            'Nagini installation failed: this Python installation is externally managed, so pip cannot install into it. ' +
                            'Please select or create a virtual environment and try again.',
                            select
                        ).then((selection: string | undefined) => {
                            if (selection === select) {
                                vscode.commands.executeCommand('nagini.selectEnvironment');
                            }
                        });
                    } else if (code !== 0) {
                        logOutputChannel.error(`Nagini installation process exited with code ${code} and signal ${signal}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
                        vscode.window.showErrorMessage(`Nagini installation process exited with code ${code} and signal ${signal}`);
                    } else {
                        updateStatusItem('Nagini is ready', 'idle');
                        logOutputChannel.info(`Nagini installation process finished. Result: Success\nstdout:\n${stdout}\nstderr:\n${stderr}`);
                        vscode.window.showInformationMessage('Nagini installation succeeded');
                        if (verificationState.serverMode && await checkNaginiInstallation(activeEditor.document.uri)) {
                            try {
                                await verificationState.server.ensureRunning(verificationState, naginiPath);
                            } catch (error: Error | unknown) {
                                await handleServerStartFailure(verificationState, error);
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
    if (!await checkNaginiInstallation(activeEditor.document.uri)) {
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
                await handleServerStartFailure(verificationState, error);
            }
        }
        logOutputChannel.info(`Mode toggle finished. Current mode: ${verificationState.serverMode ? 'Server' : 'Direct'}`);
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
    if (!await checkNaginiInstallation(activeEditor.document.uri)) {
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
                await handleServerStartFailure(verificationState, error);
            }
        }
        logOutputChannel.info(`Backend selection finished. Current backend: ${verificationState.activeBackend}`);
    });
    await selectBackendQueue;
}

let startVerificationQueue: Promise<void> = Promise.resolve();
export async function startVerification(verificationState: VerificationState, select?: string): Promise<void> {
    logOutputChannel.info(select ? `Verification registered (selection: ${select})` : 'Verification registered');

    const activeEditor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    if (!activeEditor) {
        logOutputChannel.info('Verification cancelled. Reason: no active editor');
        vscode.window.showErrorMessage('Verification cancelled: no active editor');
        return;
    }
    const naginiPath: string = await getNaginiPathFromEditor(activeEditor, false);
    const naginiClientPath: string = await getNaginiPathFromEditor(activeEditor, true);
    if (!await checkNaginiInstallation(activeEditor.document.uri)) {
        logOutputChannel.info('Verification cancelled. Reason: Nagini is not installed');
        showErrorMessageWithAction('Verification');
        return;
    }

    startVerificationQueue = startVerificationQueue.finally(async () => {
        await stopVerification(verificationState);

        logOutputChannel.info('Verification starting...');

        const settings: { boogieExecutablePath: string | undefined; verificationTimeout: number | undefined; additionalArguments: string[]; } = getSettings();
        logOutputChannel.info(`Verification settings read. Backend: ${verificationState.activeBackend}, Boogie path: ${settings.boogieExecutablePath ?? '<unset>'}`);

        if (verificationState.activeBackend === 'carbon' && !settings.boogieExecutablePath?.trim()) {
            logOutputChannel.info('Verification cancelled. Reason: the VCG (Carbon) backend requires a Boogie executable, but none is configured');
            updateStatusItem('$(x) Nagini needs a Boogie path for VCG', 'error');
            const openSettings: string = 'Open Settings';
            const selectBackend: string = 'Select Backend';
            const selection: string | undefined = await vscode.window.showErrorMessage(
                'The VCG (Carbon) backend requires a Boogie executable, but none is configured. Set the "nagini.paths.boogieExecutable" setting, or switch to the SE (Silicon) backend.',
                openSettings,
                selectBackend
            );
            if (selection === openSettings) {
                vscode.commands.executeCommand('workbench.action.openSettings', 'nagini.paths.boogieExecutable');
            } else if (selection === selectBackend) {
                vscode.commands.executeCommand('nagini.selectBackend');
            }
            logOutputChannel.info('Verification finished');
            return;
        }

        const uri: vscode.Uri = activeEditor.document.uri;
        const file: string = uri.fsPath;
        const fileName: string = path.basename(file);
        const args: string[] = getNaginiCommandArgs(verificationState, file, settings, select);
        const clientArgs: string[] = getNaginiClientCommandArgs(file, select);

        diagnosticCollection.delete(uri);

        if (verificationState.serverMode) {
            updateStatusItem(`Nagini is starting the server $(loading~spin)`, 'idle');
            try {
                await verificationState.server.ensureRunning(verificationState, naginiPath);
            } catch (error: Error | unknown) {
                updateStatusItem(`$(x) Nagini failed to start the server`, 'error');
                await handleServerStartFailure(verificationState, error);
                logOutputChannel.info(`Verification finished`);
                return;
            }
        }

        stopVerificationButton.show();
        updateStatusItem(`Nagini is verifying ${select ? `${select} in ${fileName}` : fileName} $(loading~spin)`, 'running');

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
            } else if (stdoutHasResultLine(session.stdout, 'Translation failed')) {
                const diagnostics: vscode.Diagnostic[] = parseErrorsFromOutput(fileName, session.stdout, 'Nagini');
                diagnosticCollection.set(uri, diagnostics);
                logOutputChannel.info(`Verification process ${session.process.pid} for ${fileName} finished. Result: Translation failed\nstdout:\n${session.stdout}\nstderr:\n${session.stderr}`);
                updateStatusItem(`$(x) Nagini failed to translate ${fileName} with ${diagnostics.length} ${diagnostics.length === 1 ? 'error' : 'errors'}`, 'failure');
            } else if (stdoutHasResultLine(session.stdout, 'Verification failed')) {
                const duration: number = parseDurationFromOutput(session.stdout);
                const diagnostics: vscode.Diagnostic[] = parseErrorsFromOutput(fileName, session.stdout, 'Nagini');
                diagnosticCollection.set(uri, diagnostics);
                logOutputChannel.info(`Verification process ${session.process.pid} for ${fileName} finished. Result: Verification failed\nstdout:\n${session.stdout}\nstderr:\n${session.stderr}`);
                updateStatusItem(`$(x) Nagini failed to verify ${fileName} (${duration}s) with ${diagnostics.length} ${diagnostics.length === 1 ? 'error' : 'errors'}`, 'failure');
            } else if (stdoutHasResultLine(session.stdout, 'Verification successful')) {
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

export async function verifyFunction(verificationState: VerificationState): Promise<void> {
    logOutputChannel.info('Function verification registered');

    const activeEditor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    if (!activeEditor) {
        logOutputChannel.info('Function verification cancelled. Reason: no active editor');
        vscode.window.showErrorMessage('Function verification cancelled: no active editor');
        return;
    }

    const select: string | undefined = await getSelectionName(activeEditor);
    if (!select) {
        logOutputChannel.info('Function verification cancelled. Reason: no function or method at the cursor');
        vscode.window.showErrorMessage('Nagini: place the cursor inside a function or method to verify it');
        return;
    }

    await startVerification(verificationState, select);
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

// Reports a failure to start the Nagini server. When the failure is a port conflict (another
// server is already bound to the socket), offers to disable server mode so verification can
// still run with a separate Nagini process per file.
export async function handleServerStartFailure(verificationState: VerificationState, error: Error | unknown): Promise<void> {
    const message: string = (error as Error).message;
    logOutputChannel.error(`Server failed to start: ${message}`);
    if (/address already in use|EADDRINUSE/i.test(message)) {
        const disable: string = 'Disable Server Mode';
        const selection: string | undefined = await vscode.window.showErrorMessage(
            'Nagini could not start its server because its port (127.0.0.1:5555) is already in use, ' +
            'most likely because another Nagini server is already running on this machine. ' +
            'You can disable server mode to verify each file with a separate Nagini process instead.',
            disable
        );
        if (selection === disable && verificationState.serverMode) {
            await verificationState.server.stop();
            verificationState.serverMode = false;
            updateToggleModeButton(verificationState);
            logOutputChannel.info('Server mode disabled by user after a port conflict.');
        }
    } else {
        vscode.window.showErrorMessage(`Server failed to start: ${message}`);
    }
}

// Nagini supports Python 3.12 through 3.14 (inclusive).
const MIN_SUPPORTED_PYTHON: { major: number; minor: number } = { major: 3, minor: 12 };
const MAX_SUPPORTED_PYTHON: { major: number; minor: number } = { major: 3, minor: 14 };
const SUPPORTED_PYTHON_RANGE: string = `${MIN_SUPPORTED_PYTHON.major}.${MIN_SUPPORTED_PYTHON.minor}–${MAX_SUPPORTED_PYTHON.major}.${MAX_SUPPORTED_PYTHON.minor}`;

export function isSupportedPythonVersion(version: { major: number; minor: number }): boolean {
    const atLeastMin: boolean = version.major > MIN_SUPPORTED_PYTHON.major ||
        (version.major === MIN_SUPPORTED_PYTHON.major && version.minor >= MIN_SUPPORTED_PYTHON.minor);
    const atMostMax: boolean = version.major < MAX_SUPPORTED_PYTHON.major ||
        (version.major === MAX_SUPPORTED_PYTHON.major && version.minor <= MAX_SUPPORTED_PYTHON.minor);
    return atLeastMin && atMostMax;
}

// Resolves the Nagini --select name for the definition under the cursor, using the symbol
// tree from the Python language server. Returns the innermost enclosing function/method,
// prefixed by its enclosing class if any ('Class.method' or 'function') — the forms Nagini's
// --select matches. Returns undefined if the cursor is not inside a function or method.
async function getSelectionName(editor: vscode.TextEditor): Promise<string | undefined> {
    const symbols: vscode.DocumentSymbol[] | undefined = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider', editor.document.uri);
    if (!symbols) { return undefined; }

    const position: vscode.Position = editor.selection.active;
    const chain: vscode.DocumentSymbol[] = [];
    let level: vscode.DocumentSymbol[] = symbols;
    for (;;) {
        const node: vscode.DocumentSymbol | undefined = level.find((symbol: vscode.DocumentSymbol) => symbol.range.contains(position));
        if (!node) { break; }
        chain.push(node);
        level = node.children;
    }

    const isDefinition = (kind: vscode.SymbolKind): boolean =>
        kind === vscode.SymbolKind.Function || kind === vscode.SymbolKind.Method;
    const target: vscode.DocumentSymbol | undefined = [...chain].reverse().find((symbol: vscode.DocumentSymbol) => isDefinition(symbol.kind));
    if (!target) { return undefined; }

    const enclosingClass: vscode.DocumentSymbol | undefined = chain.find((symbol: vscode.DocumentSymbol) => symbol.kind === vscode.SymbolKind.Class);
    return enclosingClass ? `${enclosingClass.name}.${target.name}` : target.name;
}

// Nagini prints its result marker ('Translation failed', 'Verification failed',
// 'Verification successful') on its own line, but flags such as --verbose,
// --print-viper or --benchmark emit additional output before it. Scan every line for
// the marker instead of only checking the start of stdout, so those flags don't cause
// a run to be misreported as a timeout.
function stdoutHasResultLine(stdout: string, marker: string): boolean {
    return stdout.split('\n').some((line: string) => line.startsWith(marker));
}

async function showErrorMessageWithAction(context: string): Promise<void> {
    const message: string = `${context} cancelled: Nagini is not installed or is outdated (version ${MINIMUM_NAGINI_VERSION_STRING} or newer is required). Please select another virtual environment or install Nagini in the current environment.`;
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
