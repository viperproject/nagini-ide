/**
  * Copyright (c) 2026 ETH Zurich
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  */

import * as assert from 'assert';
import {
    initializeState,
    getNaginiCommandArgs,
    getNaginiServerCommandArgs,
    getNaginiClientCommandArgs,
    VerificationState
} from '../verificationState';

const noExtraSettings: { boogieExecutablePath: string | undefined; additionalArguments: string[] } = {
    boogieExecutablePath: undefined,
    additionalArguments: []
};

describe('getNaginiCommandArgs (local mode)', () => {
    it('builds the default Silicon invocation', () => {
        const state: VerificationState = initializeState();
        state.activeBackend = 'silicon';
        assert.deepStrictEqual(
            getNaginiCommandArgs(state, 'file.py', noExtraSettings),
            ['--ide-mode', '--verifier', 'silicon', 'file.py']
        );
    });

    it('adds --boogie only for the Carbon backend when a path is set', () => {
        const state: VerificationState = initializeState();
        state.activeBackend = 'carbon';
        assert.deepStrictEqual(
            getNaginiCommandArgs(state, 'file.py', { boogieExecutablePath: '/opt/boogie', additionalArguments: [] }),
            ['--ide-mode', '--verifier', 'carbon', '--boogie', '/opt/boogie', 'file.py']
        );
    });

    it('appends --select and additional arguments before the file, in order', () => {
        const state: VerificationState = initializeState();
        state.activeBackend = 'silicon';
        assert.deepStrictEqual(
            getNaginiCommandArgs(state, 'file.py', { boogieExecutablePath: undefined, additionalArguments: ['--counterexample'] }, 'Foo.bar'),
            ['--ide-mode', '--verifier', 'silicon', '--select=Foo.bar', '--counterexample', 'file.py']
        );
    });
});

describe('getNaginiServerCommandArgs (server start)', () => {
    it('builds the server invocation with the dummy positional file', () => {
        const state: VerificationState = initializeState();
        state.activeBackend = 'silicon';
        assert.deepStrictEqual(
            getNaginiServerCommandArgs(state, noExtraSettings),
            ['--server', '--ide-mode', '--verifier', 'silicon', 'nonexistent.py']
        );
    });
});

describe('getNaginiClientCommandArgs (server client)', () => {
    it('sends only the file when no selection is given', () => {
        assert.deepStrictEqual(getNaginiClientCommandArgs('file.py'), ['file.py']);
    });

    it('forwards --select when a selection is given', () => {
        assert.deepStrictEqual(getNaginiClientCommandArgs('file.py', 'Foo.bar'), ['file.py', '--select=Foo.bar']);
    });
});
