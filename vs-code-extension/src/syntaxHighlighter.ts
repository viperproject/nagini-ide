/**
  * Copyright (c) 2026 ETH Zurich
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  */

import * as vscode from 'vscode';

const KEYWORDS: Map<string, string[]> = new Map([
    ['adt',                    ['ADT']],
    ['contracts.wrapper',      ['Requires', 'Ensures', 'Exsures', 'Invariant', 'Decreases']],
    ['contracts.quantifier',   ['Exists', 'Forall', 'Forall2', 'Forall3', 'Forall4', 'Forall5', 'Forall6']],
    ['contracts.predicate',    ['bytearray_pred', 'dict_pred', 'list_pred', 'set_pred']],
    ['contracts.decorator',    ['AllLow', 'ContractOnly', 'Ghost', 'GhostReturns', 'Inline', 'Opaque', 'Predicate', 'PreservesLow', 'Pure']],
    ['contracts.function',     ['Acc', 'ARP', 'Assert', 'Assume', 'Declassify', 'Fold', 'Implies', 'isNaN', 'Let', 'Low', 'LowEvent', 'LowExit', 'LowVal', 'MayCreate', 'MaySet', 'Old', 'PByteSeq', 'PMultiset', 'Previous', 'PSet', 'PSeq', 'RaisedException', 'Rd', 'RD_PRED', 'Refute', 'Result', 'ResultT', 'Reveal', 'TerminatesSif', 'ToByteSeq', 'ToMS', 'ToSeq', 'Unfold', 'Unfolding', 'Wildcard']],
    ['io_builtins',            ['End', 'Eval', 'Gap', 'Join', 'NoOp', 'SetVar', 'Split', 'end_io', 'eval_io', 'gap_io', 'join_io', 'no_op_io', 'set_var_io', 'split_io']],
    ['io_contracts',           ['GetGhostOutput', 'IOExists', 'IOExists1', 'IOExists10', 'IOExists11', 'IOExists12', 'IOExists13', 'IOExists14', 'IOExists15', 'IOExists2', 'IOExists3', 'IOExists4', 'IOExists5', 'IOExists6', 'IOExists7', 'IOExists8', 'IOExists9', 'IOForall', 'Open', 'Place', 'Terminates', 'TerminationMeasure', 'ctoken', 'token']],
    ['io_contracts.decorator', ['IOOperation']],
    ['lock',                   ['Lock']],
    ['obligations',            ['Level', 'LevelType', 'MustRelease', 'MustTerminate', 'WaitLevel']],
    ['thread',                 ['Joinable', 'MayStart', 'Thread', 'ThreadPost', 'arg', 'getARP', 'getArg', 'getMethod', 'getOld']]
]);

export class SyntaxHighlighter implements vscode.Disposable {
    private readonly decorations: Map<string, vscode.TextEditorDecorationType>;
    private readonly subscriptions: vscode.Disposable[];
    private debounceTimer: NodeJS.Timeout | undefined;

    constructor() {
        this.decorations = new Map([...KEYWORDS.keys()].map(key => [
            key,
            vscode.window.createTextEditorDecorationType({
                color: new vscode.ThemeColor('nagini.' + key)
            })
        ]));
        this.subscriptions = [
            vscode.window.onDidChangeActiveTextEditor((editor: vscode.TextEditor | undefined) => {
                if (editor?.document.languageId === 'python') {
                    this.highlight(editor);
                }
            }),
            vscode.window.onDidChangeVisibleTextEditors((editors: readonly vscode.TextEditor[]) => {
                for (const editor of editors) {
                    if (editor.document.languageId === 'python') {
                        this.highlight(editor);
                    }
                }
            }),
            vscode.workspace.onDidChangeTextDocument((event: vscode.TextDocumentChangeEvent) => {
                if (event.document.languageId === 'python') {
                    const editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
                    if (editor?.document === event.document) {
                        clearTimeout(this.debounceTimer);
                        this.debounceTimer = setTimeout(() => this.highlight(editor), 200);
                    }
                }
            })
        ];
    }

    highlight(editor?: vscode.TextEditor): void {
        if (!editor) { return; }

        const document: vscode.TextDocument = editor.document;
        const text: string = document.getText();
        const masked: string = maskStringsAndComments(text);

        for (const [key, decoration] of this.decorations) {
            const keywords: string[] | undefined = KEYWORDS.get(key);
            if (!keywords) { continue; }
            const includeAt: boolean = key.endsWith('decorator');
            const ranges: vscode.Range[] = findRanges(document, masked, keywords, includeAt);
            editor.setDecorations(decoration, ranges);
        }
    }

    dispose(): void {
        clearTimeout(this.debounceTimer);
        for (const decoration of this.decorations.values()) { decoration.dispose(); }
        for (const subscription of this.subscriptions) { subscription.dispose(); }
    }
}

function maskStringsAndComments(text: string): string {
    const mask: string[] = text.split('');
    let i: number = 0;
    const n: number = text.length;

    while (i < n) {
        if (text[i] === '#') {
            while (i < n && text[i] !== '\n') {
                mask[i++] = ' ';
            }
            continue;
        }

        let qi: number = i;
        while (qi < n && 'rRbBfFuU'.includes(text[qi])) {
            qi++;
        }

        if (qi < n && (text[qi] === '"' || text[qi] === "'")) {
            i = qi;
            const q: string = text[i];

            if (i + 2 < n && text[i + 1] === q && text[i + 2] === q) {
                mask[i] = mask[i + 1] = mask[i + 2] = ' ';
                i += 3;
                while (i < n) {
                    if (i + 2 < n && text[i] === q && text[i + 1] === q && text[i + 2] === q) {
                        mask[i] = mask[i + 1] = mask[i + 2] = ' ';
                        i += 3;
                        break;
                    }
                    if (text[i] !== '\n') {
                        mask[i] = ' ';
                    }
                    i++;
                }
                continue;
            }

            mask[i++] = ' ';
            while (i < n && text[i] !== '\n') {
                if (text[i] === '\\') {
                    mask[i++] = ' ';
                    if (i < n) {
                        mask[i++] = ' ';
                    }
                    continue;
                }
                if (text[i] === q) {
                    mask[i++] = ' ';
                    break;
                }
                mask[i++] = ' ';
            }
            continue;
        }
        i++;
    }

    return mask.join('');
}

function findRanges(document: vscode.TextDocument, masked_text: string, keywords: string[], includeAt: boolean = false): vscode.Range[] {
    const ranges: vscode.Range[] = [];
    for (const keyword of keywords) {
        const regExp: RegExp = new RegExp(`\\b${keyword}\\b`, 'g');
        let match: RegExpExecArray | null;
        while ((match = regExp.exec(masked_text)) !== null) {
            const hasAt: boolean = includeAt && match.index > 0 && masked_text[match.index - 1] === '@';
            const start: vscode.Position = document.positionAt(match.index - (hasAt ? 1 : 0));
            const end: vscode.Position = document.positionAt(match.index + match[0].length);
            ranges.push(new vscode.Range(start, end));
        }
    }
    return ranges;
}
