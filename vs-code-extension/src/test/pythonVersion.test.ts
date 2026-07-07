/**
  * Copyright (c) 2026 ETH Zurich
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  */

import * as assert from 'assert';
import { isSupportedPythonVersion } from '../commands';

describe('isSupportedPythonVersion', () => {
    it('accepts the supported range 3.12–3.14', () => {
        assert.ok(isSupportedPythonVersion({ major: 3, minor: 12 }));
        assert.ok(isSupportedPythonVersion({ major: 3, minor: 13 }));
        assert.ok(isSupportedPythonVersion({ major: 3, minor: 14 }));
    });

    it('rejects versions below the supported range', () => {
        assert.strictEqual(isSupportedPythonVersion({ major: 3, minor: 11 }), false);
        assert.strictEqual(isSupportedPythonVersion({ major: 2, minor: 7 }), false);
    });

    it('rejects versions above the supported range', () => {
        assert.strictEqual(isSupportedPythonVersion({ major: 3, minor: 15 }), false);
        assert.strictEqual(isSupportedPythonVersion({ major: 4, minor: 0 }), false);
    });
});
