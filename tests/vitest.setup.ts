import { beforeEach, vi } from 'vitest';
import { chrome } from './__mocks__/chrome';

// Setup global mocks
beforeEach(() => {
    // Ensure chrome is available globally
    global.chrome = chrome;

    // Reset all timers
    vi.useFakeTimers();

    // Reset removingTabInProgress state between tests
    // This is a module-level variable, so we need to reset the module
    vi.resetModules();
});
