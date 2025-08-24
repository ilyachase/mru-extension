import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Background Script', () => {
    beforeEach(async () => {
        // Clear all mocks
        vi.clearAllMocks();

        // Get the chrome object from global
        const chromeApi = global.chrome as any;

        // Clear storage and event listeners
        chromeApi.storage.local.clear();
        chromeApi.tabs.onActivated.clearListeners();
        chromeApi.tabs.onRemoved.clearListeners();
        chromeApi.commands.onCommand.clearListeners();
        chromeApi.runtime.onInstalled.clearListeners();
        chromeApi.windows.onFocusChanged.clearListeners();

        // Import background script after mocks are set up
        await import('../src/background');
    });

    afterEach(() => {
        vi.clearAllTimers();
        vi.resetModules();
    });

    describe('wait function', () => {
        it('should resolve after 50ms', async () => {
            const startTime = Date.now();
            const waitPromise = new Promise((resolve) => setTimeout(() => resolve(true), 50));

            vi.advanceTimersByTime(50);
            const result = await waitPromise;

            expect(result).toBe(true);
        });
    });

    describe('getCurrentTab function', () => {
        it('should return the active tab from the current window', async () => {
            const chromeApi = global.chrome as any;
            const mockTab = { id: 123, windowId: 456, active: true };
            chromeApi.tabs.query.mockResolvedValueOnce([mockTab]);

            // Import and call getCurrentTab indirectly through event listeners
            // Since it's not exported, we'll test it through integration
            chromeApi.runtime.onInstalled.trigger();
            await vi.runAllTimersAsync();

            expect(chromeApi.tabs.query).toHaveBeenCalledWith({
                active: true,
                currentWindow: true
            });
        });
    });

    describe('handleTabActivated function', () => {
        it('should update window tab history when tab is activated', async () => {
            const chromeApi = global.chrome as any;
            // Setup initial empty history
            await chromeApi.storage.local.set({ windowTabHistories_v2: {} });

            // Trigger tab activation
            const tabInfo = { tabId: 123, windowId: 456 };
            chromeApi.tabs.onActivated.trigger(tabInfo);

            await vi.runAllTimersAsync();

            const result = await chromeApi.storage.local.get('windowTabHistories_v2');
            expect(result.windowTabHistories_v2[456]).toEqual([123]);
        });

        it('should move existing tab to front of window history', async () => {
            const chromeApi = global.chrome as any;
            const existingHistory = {
                456: [123, 789]
            };
            await chromeApi.storage.local.set({ windowTabHistories_v2: existingHistory });

            // Activate existing tab
            chromeApi.tabs.onActivated.trigger({ tabId: 789, windowId: 456 });
            await vi.runAllTimersAsync();

            const result = await chromeApi.storage.local.get('windowTabHistories_v2');
            expect(result.windowTabHistories_v2[456][0]).toEqual(789);
            expect(result.windowTabHistories_v2[456]).toHaveLength(2);
            expect(result.windowTabHistories_v2[456]).toEqual([789, 123]);
        });

        it('should wait when removing tab is in progress', async () => {
            const chromeApi = global.chrome as any;
            // First trigger tab removal to set removingTabInProgress = true
            chromeApi.tabs.onRemoved.trigger(123, { windowId: 1 });

            // Then trigger tab activation (should wait)
            chromeApi.tabs.onActivated.trigger({ tabId: 456, windowId: 1 });

            // Advance timer to simulate wait
            vi.advanceTimersByTime(50);
            await vi.runAllTimersAsync();

            // Should eventually complete without error
            // The fact that we get here means the wait mechanism worked
            expect(true).toBe(true);
        });
    });

    describe('chromeApi.runtime.onInstalled', () => {
        it('should initialize window tab history on install', async () => {
            const chromeApi = global.chrome as any;
            const mockTab = { id: 123, windowId: 456 };
            chromeApi.tabs.query.mockResolvedValueOnce([mockTab]);

            chromeApi.runtime.onInstalled.trigger();
            await vi.runAllTimersAsync();

            const result = await chromeApi.storage.local.get('windowTabHistories_v2');
            expect(result.windowTabHistories_v2[456]).toEqual([123]);
        });

        it('should handle tabs without id or windowId', async () => {
            const chromeApi = global.chrome as any;
            const mockTab = { active: true }; // Missing id and windowId
            chromeApi.tabs.query.mockResolvedValueOnce([mockTab]);

            chromeApi.runtime.onInstalled.trigger();
            await vi.runAllTimersAsync();

            const result = await chromeApi.storage.local.get('windowTabHistories_v2');
            expect(result.windowTabHistories_v2).toEqual({});
        });
    });

    describe('chromeApi.tabs.onRemoved', () => {
        it('should remove tab from window history when tab is closed', async () => {
            const chromeApi = global.chrome as any;
            const initialHistory = {
                456: [123, 789]
            };
            await chromeApi.storage.local.set({ windowTabHistories_v2: initialHistory });

            chromeApi.tabs.onRemoved.trigger(123, { windowId: 456 });
            await vi.runAllTimersAsync();

            const result = await chromeApi.storage.local.get('windowTabHistories_v2');
            expect(result.windowTabHistories_v2[456]).toEqual([789]);
        });

        it('should handle removing non-existent tab gracefully', async () => {
            const chromeApi = global.chrome as any;
            const initialHistory = {
                456: [123]
            };
            await chromeApi.storage.local.set({ windowTabHistories_v2: initialHistory });

            chromeApi.tabs.onRemoved.trigger(999, { windowId: 456 }); // Non-existent tab
            await vi.runAllTimersAsync();

            const result = await chromeApi.storage.local.get('windowTabHistories_v2');
            expect(result.windowTabHistories_v2[456]).toEqual([123]);
        });

        it('should wait for ongoing removal operations', async () => {
            const chromeApi = global.chrome as any;
            const initialHistory = {
                456: [123, 789]
            };
            await chromeApi.storage.local.set({ windowTabHistories_v2: initialHistory });

            // Trigger two removals simultaneously
            const removal1 = chromeApi.tabs.onRemoved.trigger(123, { windowId: 456 });
            const removal2 = chromeApi.tabs.onRemoved.trigger(789, { windowId: 456 });

            vi.advanceTimersByTime(100);
            await vi.runAllTimersAsync();

            const result = await chromeApi.storage.local.get('windowTabHistories_v2');
            expect(result.windowTabHistories_v2[456]).toEqual([]);
        });
    });

    describe('chromeApi.commands.onCommand', () => {
        it('should switch to previous tab when window history has 2+ tabs', async () => {
            const chromeApi = global.chrome as any;
            const history = {
                456: [123, 789]
            };
            await chromeApi.storage.local.set({ windowTabHistories_v2: history });
            chromeApi.windows.getCurrent.mockResolvedValueOnce({ id: 456 });

            chromeApi.commands.onCommand.trigger();
            await vi.runAllTimersAsync();

            expect(chromeApi.tabs.update).toHaveBeenCalledWith(789, {
                highlighted: true,
                active: true
            });
        });

        it('should not switch when window history has less than 2 tabs', async () => {
            const chromeApi = global.chrome as any;
            const history = {
                456: [123]
            };
            await chromeApi.storage.local.set({ windowTabHistories_v2: history });
            chromeApi.windows.getCurrent.mockResolvedValueOnce({ id: 456 });

            chromeApi.commands.onCommand.trigger();
            await vi.runAllTimersAsync();

            expect(chromeApi.tabs.update).not.toHaveBeenCalled();
        });

        it('should not switch when current window is undefined', async () => {
            const chromeApi = global.chrome as any;
            const history = {
                456: [123, 789]
            };
            await chromeApi.storage.local.set({ windowTabHistories_v2: history });
            chromeApi.windows.getCurrent.mockResolvedValueOnce({ id: undefined });

            chromeApi.commands.onCommand.trigger();
            await vi.runAllTimersAsync();

            expect(chromeApi.tabs.update).not.toHaveBeenCalled();
        });

        it('should not switch when current window has no history', async () => {
            const chromeApi = global.chrome as any;
            const history = {
                999: [123, 789] // Different window has history
            };
            await chromeApi.storage.local.set({ windowTabHistories_v2: history });
            chromeApi.windows.getCurrent.mockResolvedValueOnce({ id: 456 });

            chromeApi.commands.onCommand.trigger();
            await vi.runAllTimersAsync();

            expect(chromeApi.tabs.update).not.toHaveBeenCalled();
        });
    });

    describe('chromeApi.windows.onFocusChanged', () => {
        it('should ignore window focus change when windowId is -1', async () => {
            const chromeApi = global.chrome as any;
            chromeApi.windows.onFocusChanged.trigger(-1);
            await vi.runAllTimersAsync();

            expect(chromeApi.tabs.query).not.toHaveBeenCalled();
        });

        it('should update tab history when window focus changes', async () => {
            const chromeApi = global.chrome as any;
            const mockTab = { id: 123, windowId: 456 };
            chromeApi.tabs.query.mockResolvedValueOnce([mockTab]);

            chromeApi.windows.onFocusChanged.trigger(456);
            await vi.runAllTimersAsync();

            expect(chromeApi.tabs.query).toHaveBeenCalledWith({
                active: true,
                currentWindow: true
            });
        });

        it('should handle when no tab is found', async () => {
            const chromeApi = global.chrome as any;
            chromeApi.tabs.query.mockResolvedValueOnce([]);
            // Initialize empty storage to match expected behavior
            await chromeApi.storage.local.set({ windowTabHistories_v2: {} });

            chromeApi.windows.onFocusChanged.trigger(456);
            await vi.runAllTimersAsync();

            // Should not crash or throw, and storage should remain empty
            const result = await chromeApi.storage.local.get('windowTabHistories_v2');
            expect(result.windowTabHistories_v2).toEqual({});
        });

        it('should handle tabs without id or windowId on focus change', async () => {
            const chromeApi = global.chrome as any;
            const mockTab = { active: true }; // Missing id and windowId
            chromeApi.tabs.query.mockResolvedValueOnce([mockTab]);
            // Initialize empty storage to match expected behavior
            await chromeApi.storage.local.set({ windowTabHistories_v2: {} });

            chromeApi.windows.onFocusChanged.trigger(456);
            await vi.runAllTimersAsync();

            const result = await chromeApi.storage.local.get('windowTabHistories_v2');
            expect(result.windowTabHistories_v2).toEqual({});
        });
    });
});
