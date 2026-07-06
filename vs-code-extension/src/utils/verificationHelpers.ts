/**
  * Copyright (c) 2026 ETH Zurich
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { PythonExtension, EnvironmentPath, ResolvedEnvironment } from '@vscode/python-extension';

export async function checkNaginiInstallation(naginiPath: string): Promise<boolean> {
    return fs.existsSync(naginiPath);
}

export async function getNaginiPathFromEditor(editor: vscode.TextEditor, serverMode: boolean = false): Promise<string> {
    const uri: vscode.Uri = editor.document.uri;
    const pythonPath: string = await getPythonPath(uri);
    return getNaginiPath(pythonPath, serverMode);
}

async function getNaginiPath(pythonPath: string, serverMode: boolean = false): Promise<string> {
    const scriptsDirectory: string = await getPythonScriptsDirectory(pythonPath);
    if (process.platform === 'win32') {
        return path.join(scriptsDirectory, serverMode ? 'nagini_client.exe' : 'nagini.exe');
    } else {
        return path.join(scriptsDirectory, serverMode ? 'nagini_client' : 'nagini');
    }
}

async function getPythonScriptsDirectory(pythonPath: string): Promise<string> {
    return new Promise((resolve: (value: string) => void, reject: (reason: Error) => void) => {
        const process: cp.ChildProcess = cp.spawn(pythonPath, ['-c', 'import sysconfig; print(sysconfig.get_path(\'scripts\'))']);
        let stdout: string = '';
        let stderr: string = '';
        process.stdout?.on('data', (data: Buffer) => stdout += data.toString());
        process.stderr?.on('data', (data: Buffer) => stderr += data.toString());
        process.on('error', (error: Error) => {
            reject(new Error(`Python process \'${pythonPath} ${process.spawnargs.join(' ')}\' failed to spawn. Reason: ${error.message}`));
        });
        process.on('close', (code: number | null, signal: string | null) => {
            stdout = stdout.trim();
            stderr = stderr.trim();
            if (code === 0) {
                resolve(stdout);
            } else {
                reject(new Error(`Python process \'${pythonPath} ${process.spawnargs.join(' ')}\' failed with code ${code} and signal ${signal}: ${stderr}`));
            }
        });
    });
}

export async function getPythonPath(uri: vscode.Uri): Promise<string> {
    const api: PythonExtension = await PythonExtension.api();
    const envPath: EnvironmentPath = api.environments.getActiveEnvironmentPath(uri);
    const resolvedEnv: ResolvedEnvironment | undefined = await api.environments.resolveEnvironment(envPath);
    const pythonPath: string | undefined = resolvedEnv?.executable?.uri?.fsPath;
    if (!pythonPath) { throw new Error(`No Python interpreter selected for ${uri.fsPath}`); }
    return pythonPath;
}

export function parseDurationFromOutput(message: string): number {
    const regExp: RegExp = /Verification took (\d+(?:\.\d+)?) seconds\./;
    const match: RegExpExecArray | null = regExp.exec(message);
    return match ? parseFloat(match[1]) : -1;
}

export function parseErrorsFromOutput(fileName: string, message: string, source: string): vscode.Diagnostic[] {
    // Nagini prefixes each error line with the file it reported the argument as, which may be
    // a bare basename (verification errors) or a relative/absolute path (translation errors).
    // Match any leading path and compare by basename so both forms are attributed to the file.
    const regExp: RegExp = /^(.+):(\d+):(\d+):(\d+):(\d+): error: (.+)$/;
    const diagnostics: vscode.Diagnostic[] = [];
    const lines: string[] = message.split("\n");
    for (const line of lines) {
        const match: RegExpExecArray | null = regExp.exec(line);
        if (match && path.basename(match[1]) === fileName) {
            const startLine: number = parseInt(match[2]);
            const startCol: number = parseInt(match[3]);
            const endLine: number = parseInt(match[4]);
            const endCol: number = parseInt(match[5]);
            const error: string = match[6];
            const startPos: vscode.Position = new vscode.Position(startLine-1, startCol-1);
            const endPos: vscode.Position = new vscode.Position(endLine-1, endCol-1);
            const range: vscode.Range = new vscode.Range(startPos, endPos);
            const diagnostic: vscode.Diagnostic = new vscode.Diagnostic(range, error, vscode.DiagnosticSeverity.Error);
            diagnostic.source = source;
            diagnostics.push(diagnostic);
        }
    }
    return diagnostics;
}
