/**
  * Copyright (c) 2026 ETH Zurich
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { parseErrorsFromOutput, parseDurationFromOutput } from '../utils';

describe('parseErrorsFromOutput', () => {
    it('parses a verification error attributed by basename, ignoring the path prefix', () => {
        const output: string = [
            'Verification failed',
            'Errors:',
            'sub/dir/test.py:9:12:9:14: error: Fold might fail. Might not hold.'
        ].join('\n');
        const diagnostics: vscode.Diagnostic[] = parseErrorsFromOutput('test.py', output, 'Nagini');

        assert.strictEqual(diagnostics.length, 1);
        const diagnostic: vscode.Diagnostic = diagnostics[0];
        assert.strictEqual(diagnostic.range.start.line, 8);       // 1-based line 9 -> 0-based 8
        assert.strictEqual(diagnostic.range.start.character, 11); // 1-based col 12 -> 0-based 11
        assert.strictEqual(diagnostic.range.end.line, 8);
        assert.strictEqual(diagnostic.range.end.character, 13);
        assert.ok(diagnostic.message.startsWith('Fold might fail.'));
        assert.strictEqual(diagnostic.source, 'Nagini');
        assert.strictEqual(diagnostic.severity, vscode.DiagnosticSeverity.Error);
    });

    it('parses a bare basename (verification error format)', () => {
        const output: string = 'test.py:1:1:1:5: error: Something might fail.';
        const diagnostics: vscode.Diagnostic[] = parseErrorsFromOutput('test.py', output, 'Nagini');
        assert.strictEqual(diagnostics.length, 1);
    });

    it('ignores errors that belong to a different file', () => {
        const output: string = 'other.py:1:1:1:2: error: Not our file.';
        const diagnostics: vscode.Diagnostic[] = parseErrorsFromOutput('test.py', output, 'Nagini');
        assert.strictEqual(diagnostics.length, 0);
    });

    it('collects multiple errors and skips non-matching lines', () => {
        const output: string = [
            'Translation failed',
            'vscode-ws/test.py:10:16:10:20: error: Type error: incompatible return value',
            'some unrelated log line',
            'vscode-ws/test.py:12:16:12:19: error: Type error: incompatible return value'
        ].join('\n');
        const diagnostics: vscode.Diagnostic[] = parseErrorsFromOutput('test.py', output, 'Nagini');
        assert.strictEqual(diagnostics.length, 2);
        assert.strictEqual(diagnostics[0].range.start.line, 9);
        assert.strictEqual(diagnostics[1].range.start.line, 11);
    });
});

describe('parseDurationFromOutput', () => {
    it('extracts a fractional duration', () => {
        assert.strictEqual(parseDurationFromOutput('Verification took 3.14 seconds.'), 3.14);
    });

    it('extracts an integer duration', () => {
        assert.strictEqual(parseDurationFromOutput('Verification took 7 seconds.'), 7);
    });

    it('returns -1 when no duration is present', () => {
        assert.strictEqual(parseDurationFromOutput('Verification successful'), -1);
    });
});
