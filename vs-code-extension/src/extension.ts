/**
  * Copyright (c) 2026 ETH Zurich
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  */

import * as vscode from 'vscode';
import * as commands from './commands';
import * as extState from './extensionState';
import * as verState from './verificationState';
import { logOutputChannel, syntaxHighlighter } from './extensionState';
import { checkNaginiInstallation, getNaginiPathFromEditor } from './utils';

let _verificationState: verState.VerificationState;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    extState.initializeState(context);

    logOutputChannel.info('Nagini activation starting...');

    _verificationState = verState.initializeState();

    extState.updateToggleModeButton(_verificationState);
    extState.updateSelectBackendButton(_verificationState);
    extState.updateStatusItem('Hello from Nagini');
    extState.showStatusBar();

    const activeEditor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
    if (activeEditor?.document.languageId === 'python') {
        const naginiPath: string = await getNaginiPathFromEditor(activeEditor);
        await extState.welcome(naginiPath);
        syntaxHighlighter.highlight(activeEditor);
        if (_verificationState.serverMode && await checkNaginiInstallation(naginiPath)) {
            try {
                await _verificationState.server.ensureRunning(_verificationState, naginiPath);
            } catch (error: Error | unknown) {
                logOutputChannel.error(`Server failed to start: ${(error as Error).message}`);
                vscode.window.showErrorMessage(`Server failed to start: ${(error as Error).message}`);
            }
        }
    }

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(async (editor: vscode.TextEditor | undefined) => {
            if (editor?.document.languageId === 'python') {
                const naginiPath: string = await getNaginiPathFromEditor(editor);
                await extState.welcome(naginiPath);
            } else {
                await commands.stopVerification(_verificationState);
                extState.hideStatusBar();
            }
        }),
        vscode.workspace.onDidChangeConfiguration(async (event: vscode.ConfigurationChangeEvent) => {
            if (event.affectsConfiguration('nagini.paths.boogieExecutable') || event.affectsConfiguration('nagini.verification.additionalArguments')) {
                if (_verificationState.serverMode) {
                    logOutputChannel.info('Configuration change registered (Nagini command-line settings). Stopping server...');
                    await _verificationState.server.stop();
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('nagini.selectEnvironment', async () => {
            await commands.selectEnvironment(context, _verificationState);
        }),
        vscode.commands.registerCommand('nagini.installNagini', async () => {
            await commands.installNagini(context, _verificationState);
        }),
        vscode.commands.registerCommand('nagini.toggleMode', async () => {
            await commands.toggleMode(_verificationState);
        }),
        vscode.commands.registerCommand('nagini.selectBackend', async () => {
            await commands.selectBackend(_verificationState);
        }),
        vscode.commands.registerCommand('nagini.startVerification', async () => {
            await commands.startVerification(_verificationState);
        }),
        vscode.commands.registerCommand('nagini.verifyFunction', async () => {
            await commands.verifyFunction(_verificationState);
        }),
        vscode.commands.registerCommand('nagini.stopVerification', async () => {
            await commands.stopVerification(_verificationState);
        })
    );

    logOutputChannel.info('Nagini activation finished');
}

export async function deactivate(): Promise<void> {
    if (_verificationState?.serverMode) { await _verificationState.server.stop(); }
}
