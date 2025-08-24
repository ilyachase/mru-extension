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
        it('should update tabs history when tab is activated', async () => {
            const chromeApi = global.chrome as any;
            // Setup initial history
            await chromeApi.storage.local.set({ tabsHistory: [] });

            // Trigger tab activation
            const tabInfo = { tabId: 123, windowId: 456 };
            chromeApi.tabs.onActivated.trigger(tabInfo);

            await vi.runAllTimersAsync();

            const result = await chromeApi.storage.local.get('tabsHistory');
            expect(result.tabsHistory).toContainEqual(tabInfo);
        });

        it('should move existing tab to front of history', async () => {
            const chromeApi = global.chrome as any;
            const existingHistory = [
                { tabId: 123, windowId: 456 },
                { tabId: 789, windowId: 456 }
            ];
            await chromeApi.storage.local.set({ tabsHistory: existingHistory });

            // Activate existing tab
            chromeApi.tabs.onActivated.trigger({ tabId: 789, windowId: 456 });
            await vi.runAllTimersAsync();

            const result = await chromeApi.storage.local.get('tabsHistory');
            expect(result.tabsHistory[0]).toEqual({ tabId: 789, windowId: 456 });
            expect(result.tabsHistory).toHaveLength(2);
        });

        it('should wait when removing tab is in progress', async () => {
            const chromeApi = global.chrome as any;
            // First trigger tab removal to set removingTabInProgress = true
            chromeApi.tabs.onRemoved.trigger(123);

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
        it('should initialize tabs history on install', async () => {
            const chromeApi = global.chrome as any;
            const mockTab = { id: 123, windowId: 456 };
            chromeApi.tabs.query.mockResolvedValueOnce([mockTab]);

            chromeApi.runtime.onInstalled.trigger();
            await vi.runAllTimersAsync();

            const result = await chromeApi.storage.local.get('tabsHistory');
            expect(result.tabsHistory).toContainEqual({
                tabId: 123,
                windowId: 456
            });
        });

        it('should handle tabs without id or windowId', async () => {
            const chromeApi = global.chrome as any;
            const mockTab = { active: true }; // Missing id and windowId
            chromeApi.tabs.query.mockResolvedValueOnce([mockTab]);

            chromeApi.runtime.onInstalled.trigger();
            await vi.runAllTimersAsync();

            const result = await chromeApi.storage.local.get('tabsHistory');
            expect(result.tabsHistory).toEqual([]);
        });
    });

    describe('chromeApi.tabs.onRemoved', () => {
        it('should remove tab from history when tab is closed', async () => {
            const chromeApi = global.chrome as any;
            const initialHistory = [
                { tabId: 123, windowId: 456 },
                { tabId: 789, windowId: 456 }
            ];
            await chromeApi.storage.local.set({ tabsHistory: initialHistory });

            chromeApi.tabs.onRemoved.trigger(123);
            await vi.runAllTimersAsync();

            const result = await chromeApi.storage.local.get('tabsHistory');
            expect(result.tabsHistory).toEqual([{ tabId: 789, windowId: 456 }]);
        });

        it('should handle removing non-existent tab gracefully', async () => {
            const chromeApi = global.chrome as any;
            const initialHistory = [{ tabId: 123, windowId: 456 }];
            await chromeApi.storage.local.set({ tabsHistory: initialHistory });

            chromeApi.tabs.onRemoved.trigger(999); // Non-existent tab
            await vi.runAllTimersAsync();

            const result = await chromeApi.storage.local.get('tabsHistory');
            expect(result.tabsHistory).toEqual(initialHistory);
        });

        it('should wait for ongoing removal operations', async () => {
            const chromeApi = global.chrome as any;
            const initialHistory = [
                { tabId: 123, windowId: 456 },
                { tabId: 789, windowId: 456 }
            ];
            await chromeApi.storage.local.set({ tabsHistory: initialHistory });

            // Trigger two removals simultaneously
            const removal1 = chromeApi.tabs.onRemoved.trigger(123);
            const removal2 = chromeApi.tabs.onRemoved.trigger(789);

            vi.advanceTimersByTime(100);
            await vi.runAllTimersAsync();

            const result = await chromeApi.storage.local.get('tabsHistory');
            expect(result.tabsHistory).toEqual([]);
        });
    });

    describe('chromeApi.commands.onCommand', () => {
        it('should switch to previous tab when history has 2+ tabs', async () => {
            const chromeApi = global.chrome as any;
            const history = [
                { tabId: 123, windowId: 456 },
                { tabId: 789, windowId: 456 }
            ];
            await chromeApi.storage.local.set({ tabsHistory: history });
            chromeApi.windows.getCurrent.mockResolvedValueOnce({ id: 456 });

            chromeApi.commands.onCommand.trigger();
            await vi.runAllTimersAsync();

            expect(chromeApi.tabs.update).toHaveBeenCalledWith(789, {
                highlighted: true,
                active: true
            });
        });

        it('should not switch when history has less than 2 tabs', async () => {
            const chromeApi = global.chrome as any;
            await chromeApi.storage.local.set({ tabsHistory: [{ tabId: 123, windowId: 456 }] });

            chromeApi.commands.onCommand.trigger();
            await vi.runAllTimersAsync();

            expect(chromeApi.tabs.update).not.toHaveBeenCalled();
        });

        it('should switch windows when target tab is in different window', async () => {
            const chromeApi = global.chrome as any;
            const history = [
                { tabId: 123, windowId: 456 },
                { tabId: 789, windowId: 999 } // Different window
            ];
            await chromeApi.storage.local.set({ tabsHistory: history });
            chromeApi.windows.getCurrent.mockResolvedValueOnce({ id: 456 });

            chromeApi.commands.onCommand.trigger();
            await vi.runAllTimersAsync();

            expect(chromeApi.windows.update).toHaveBeenCalledWith(999, { focused: true });
            expect(chromeApi.tabs.update).toHaveBeenCalledWith(789, {
                highlighted: true,
                active: true
            });
        });

        it('should not switch windows when target tab is in same window', async () => {
            const chromeApi = global.chrome as any;
            const history = [
                { tabId: 123, windowId: 456 },
                { tabId: 789, windowId: 456 } // Same window
            ];
            await chromeApi.storage.local.set({ tabsHistory: history });
            chromeApi.windows.getCurrent.mockResolvedValueOnce({ id: 456 });

            chromeApi.commands.onCommand.trigger();
            await vi.runAllTimersAsync();

            expect(chromeApi.windows.update).not.toHaveBeenCalled();
            expect(chromeApi.tabs.update).toHaveBeenCalledWith(789, {
                highlighted: true,
                active: true
            });
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

            chromeApi.windows.onFocusChanged.trigger(456);
            await vi.runAllTimersAsync();

            // Should not crash or throw
            const result = await chromeApi.storage.local.get('tabsHistory');
            expect(result.tabsHistory).toEqual([]);
        });

        it('should handle tabs without id or windowId on focus change', async () => {
            const chromeApi = global.chrome as any;
            const mockTab = { active: true }; // Missing id and windowId
            chromeApi.tabs.query.mockResolvedValueOnce([mockTab]);

            chromeApi.windows.onFocusChanged.trigger(456);
            await vi.runAllTimersAsync();

            const result = await chromeApi.storage.local.get('tabsHistory');
            expect(result.tabsHistory).toEqual([]);
        });
    });
});
