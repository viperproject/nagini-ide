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
    const executable: string = process.platform === 'win32'
        ? (serverMode ? 'nagini_client.exe' : 'nagini.exe')
        : (serverMode ? 'nagini_client' : 'nagini');
    const scriptsDirectories: string[] = await getPythonScriptsDirectories(pythonPath);
    const candidates: string[] = scriptsDirectories.map((directory: string) => path.join(directory, executable));
    // Prefer a location that actually contains the executable; pip may install into the user
    // scripts directory (a --user install) when the interpreter's site-packages is not writeable.
    return candidates.find((candidate: string) => fs.existsSync(candidate)) ?? candidates[0];
}

// Returns the interpreter's default scripts directory and, when available, the per-user scripts
// directory, so that both regular and --user installs of Nagini can be located.
async function getPythonScriptsDirectories(pythonPath: string): Promise<string[]> {
    const script: string = [
        'import sysconfig, json',
        'dirs = [sysconfig.get_path("scripts")]',
        'try:',
        '    dirs.append(sysconfig.get_path("scripts", sysconfig.get_preferred_scheme("user")))',
        'except Exception:',
        '    pass',
        'print(json.dumps(dirs))'
    ].join('\n');
    return new Promise((resolve: (value: string[]) => void, reject: (reason: Error) => void) => {
        const process: cp.ChildProcess = cp.spawn(pythonPath, ['-c', script]);
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
            if (code !== 0) {
                reject(new Error(`Python process \'${pythonPath} ${process.spawnargs.join(' ')}\' failed with code ${code} and signal ${signal}: ${stderr}`));
                return;
            }
            let directories: string[];
            try {
                directories = (JSON.parse(stdout) as string[]).filter((directory: string) => typeof directory === 'string' && directory.length > 0);
            } catch {
                directories = stdout ? [stdout] : [];
            }
            // De-duplicate while preserving order (default scripts directory first).
            resolve(directories.filter((directory: string, index: number) => directories.indexOf(directory) === index));
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

export async function isGlobalPythonEnvironment(uri: vscode.Uri): Promise<boolean | undefined> {
    const api: PythonExtension = await PythonExtension.api();
    const envPath: EnvironmentPath = api.environments.getActiveEnvironmentPath(uri);
    const resolvedEnv: ResolvedEnvironment | undefined = await api.environments.resolveEnvironment(envPath);
    if (resolvedEnv === undefined) { return undefined; }
    // `environment` is populated for virtual/conda/etc. environments and is undefined for
    // global or system interpreters.
    return resolvedEnv.environment === undefined;
}

export async function getPythonVersion(uri: vscode.Uri): Promise<{ major: number; minor: number } | undefined> {
    // Query the interpreter directly rather than trusting the Python extension's reported
    // version metadata, which can be stale or wrong for some environments.
    let pythonPath: string;
    try {
        pythonPath = await getPythonPath(uri);
    } catch {
        return undefined;
    }
    return new Promise((resolve: (value: { major: number; minor: number } | undefined) => void) => {
        const process: cp.ChildProcess = cp.spawn(pythonPath, ['-c', 'import sys; print(sys.version_info[0], sys.version_info[1])']);
        let stdout: string = '';
        process.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
        process.on('error', () => resolve(undefined));
        process.on('close', (code: number | null) => {
            const match: RegExpMatchArray | null = stdout.trim().match(/^(\d+)\s+(\d+)/);
            if (code !== 0 || !match) {
                resolve(undefined);
                return;
            }
            resolve({ major: parseInt(match[1]), minor: parseInt(match[2]) });
        });
    });
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
