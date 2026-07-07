/**
  * Copyright (c) 2026 ETH Zurich
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  */

import * as vscode from 'vscode';
import { SyntaxHighlighter } from './syntaxHighlighter';
import { VerificationState, Status } from './verificationState';
import { checkNaginiInstallation } from './utils';

export let diagnosticCollection: vscode.DiagnosticCollection;
export let logOutputChannel: vscode.LogOutputChannel;
export let toggleModeButton: vscode.StatusBarItem;
export let selectBackendButton: vscode.StatusBarItem;
export let stopVerificationButton: vscode.StatusBarItem;
export let statusItem: vscode.StatusBarItem;
export let syntaxHighlighter: SyntaxHighlighter;

export function initializeState(context: vscode.ExtensionContext): void {
    diagnosticCollection = vscode.languages.createDiagnosticCollection('Nagini');
    logOutputChannel = vscode.window.createOutputChannel('Nagini', { log: true });
    toggleModeButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 7);
    selectBackendButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 6);
    stopVerificationButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 5);
    statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 4);
    syntaxHighlighter = new SyntaxHighlighter();

    context.subscriptions.push(
        diagnosticCollection,
        logOutputChannel,
        toggleModeButton,
        selectBackendButton,
        stopVerificationButton,
        statusItem,
        syntaxHighlighter
    );

    toggleModeButton.tooltip = 'Nagini: Toggle Server/Direct Mode';
    toggleModeButton.command = 'nagini.toggleMode';
    selectBackendButton.tooltip = 'Nagini: Select the Backend Verifier';
    selectBackendButton.command = 'nagini.selectBackend';
    stopVerificationButton.text = '$(x) Stop';
    stopVerificationButton.tooltip = 'Nagini: Stop the Current Verification Process';
    stopVerificationButton.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    stopVerificationButton.command = 'nagini.stopVerification';
    statusItem.tooltip = 'Nagini: Status';
}

export function updateToggleModeButton(verificationState: VerificationState): void {
    toggleModeButton.text = verificationState.serverMode ? 'Server' : 'Direct';
}

export function updateSelectBackendButton(verificationState: VerificationState): void {
    selectBackendButton.text =
        verificationState.activeBackend === 'silicon' ? 'SE' :
        verificationState.activeBackend === 'carbon' ? 'VCG' :
        '???';
}

export function updateStatusItem(text: string, status?: Status): void {
    statusItem.text = text;
    switch (status) {
        case undefined:
            break;
        case 'idle':
            statusItem.color = undefined;
            statusItem.backgroundColor = undefined;
            break;
        case 'running':
            statusItem.color = undefined;
            statusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            break;
        case 'success':
            statusItem.color = new vscode.ThemeColor('terminal.ansiBrightGreen');
            statusItem.backgroundColor = undefined;
            break;
        case 'failure':
            statusItem.color = undefined;
            statusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            break;
        case 'error':
            statusItem.color = undefined;
            statusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            break;
        default:
            logOutputChannel.error(`Status Bar update failed. Reason: invalid status ${status}`);
            break;
    }
}

export async function welcome(naginiPath: string): Promise<void>  {
    updateStatusItem(await checkNaginiInstallation(naginiPath) ? 'Nagini is ready' : 'Nagini is not installed', 'idle');
    showStatusBar();
}

export function showStatusBar(): void {
    toggleModeButton.show();
    selectBackendButton.show();
    statusItem.show();
}

export function hideStatusBar(): void {
    toggleModeButton.hide();
    selectBackendButton.hide();
    stopVerificationButton.hide();
    statusItem.hide();
}
