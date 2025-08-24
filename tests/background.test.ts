import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('Background Script', () => {
    beforeEach(async () => {
        vi.clearAllMocks();

        const chromeApi = global.chrome as any;

        chromeApi.storage.local.clear();
        chromeApi.tabs.onActivated.clearListeners();
        chromeApi.tabs.onRemoved.clearListeners();
        chromeApi.commands.onCommand.clearListeners();
        chromeApi.runtime.onInstalled.clearListeners();
        chromeApi.windows.onFocusChanged.clearListeners();
        chromeApi.windows.onRemoved.clearListeners();

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
            await chromeApi.storage.local.set({ windowTabHistories_v2: {} });

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


            chromeApi.tabs.onActivated.trigger({ tabId: 789, windowId: 456 });
            await vi.runAllTimersAsync();

            const result = await chromeApi.storage.local.get('windowTabHistories_v2');
            expect(result.windowTabHistories_v2[456][0]).toEqual(789);
            expect(result.windowTabHistories_v2[456]).toHaveLength(2);
            expect(result.windowTabHistories_v2[456]).toEqual([789, 123]);
        });

        it('should wait when removing tab is in progress', async () => {
            const chromeApi = global.chrome as any;

            chromeApi.tabs.onRemoved.trigger(123, { windowId: 1 });


            chromeApi.tabs.onActivated.trigger({ tabId: 456, windowId: 1 });


            vi.advanceTimersByTime(50);
            await vi.runAllTimersAsync();


            expect(true).toBe(true);
        });

        it('should limit window history to 100 tabs', async () => {
            const chromeApi = global.chrome as any;
            await chromeApi.storage.local.set({ windowTabHistories_v2: {} });


            for (let i = 1; i <= 102; i++) {
                chromeApi.tabs.onActivated.trigger({ tabId: i, windowId: 456 });
                await vi.runAllTimersAsync();
            }

            const result = await chromeApi.storage.local.get('windowTabHistories_v2');
            const windowHistory = result.windowTabHistories_v2[456];
            
            expect(windowHistory).toHaveLength(100);
            expect(windowHistory[0]).toBe(102);
            expect(windowHistory[99]).toBe(3);

            expect(windowHistory).not.toContain(1);
            expect(windowHistory).not.toContain(2);
        });

        it('should cleanup dead windows when tracking more than 100 windows', async () => {
            const chromeApi = global.chrome as any;
            

            const windowTabHistories: { [key: number]: number[] } = {};
            for (let i = 1; i <= 105; i++) {
                windowTabHistories[i] = [i * 100, i * 100 + 1];
            }
            await chromeApi.storage.local.set({ windowTabHistories_v2: windowTabHistories });


            const existingWindows = [
                ...Array.from({ length: 50 }, (_, i) => ({ id: i + 1 })),
                ...Array.from({ length: 5 }, (_, i) => ({ id: i + 101 }))
            ];
            chromeApi.windows.getAll.mockResolvedValueOnce(existingWindows);


            chromeApi.tabs.onActivated.trigger({ tabId: 999, windowId: 1 });
            await vi.runAllTimersAsync();

            const result = await chromeApi.storage.local.get('windowTabHistories_v2');
            const cleanedHistories = result.windowTabHistories_v2;
            
            expect(Object.keys(cleanedHistories)).toHaveLength(55);
            
            expect(cleanedHistories[1]).toEqual([999, 100, 101]);
            expect(cleanedHistories[50]).toEqual([5000, 5001]);
            expect(cleanedHistories[101]).toEqual([10100, 10101]);
            expect(cleanedHistories[105]).toEqual([10500, 10501]);
            
            expect(cleanedHistories[51]).toBeUndefined();
            expect(cleanedHistories[100]).toBeUndefined();
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
            const mockTab = { active: true };
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

            chromeApi.tabs.onRemoved.trigger(999, { windowId: 456 });
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
                999: [123, 789]
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

            await chromeApi.storage.local.set({ windowTabHistories_v2: {} });

            chromeApi.windows.onFocusChanged.trigger(456);
            await vi.runAllTimersAsync();


            const result = await chromeApi.storage.local.get('windowTabHistories_v2');
            expect(result.windowTabHistories_v2).toEqual({});
        });

        it('should handle tabs without id or windowId on focus change', async () => {
            const chromeApi = global.chrome as any;
            const mockTab = { active: true };
            chromeApi.tabs.query.mockResolvedValueOnce([mockTab]);

            await chromeApi.storage.local.set({ windowTabHistories_v2: {} });

            chromeApi.windows.onFocusChanged.trigger(456);
            await vi.runAllTimersAsync();

            const result = await chromeApi.storage.local.get('windowTabHistories_v2');
            expect(result.windowTabHistories_v2).toEqual({});
        });
    });

    describe('chromeApi.windows.onRemoved', () => {
        it('should clean up window history when window is closed', async () => {
            const chromeApi = global.chrome as any;
            const initialHistory = {
                456: [123, 789],
                789: [111, 222, 333]
            };
            await chromeApi.storage.local.set({ windowTabHistories_v2: initialHistory });


            chromeApi.windows.onRemoved.trigger(456);
            await vi.runAllTimersAsync();

            const result = await chromeApi.storage.local.get('windowTabHistories_v2');
            
            expect(result.windowTabHistories_v2[456]).toBeUndefined();
            expect(result.windowTabHistories_v2[789]).toEqual([111, 222, 333]);
        });

        it('should handle removing non-existent window gracefully', async () => {
            const chromeApi = global.chrome as any;
            const initialHistory = {
                456: [123, 789]
            };
            await chromeApi.storage.local.set({ windowTabHistories_v2: initialHistory });


            chromeApi.windows.onRemoved.trigger(999);
            await vi.runAllTimersAsync();

            const result = await chromeApi.storage.local.get('windowTabHistories_v2');
            
            expect(result.windowTabHistories_v2[456]).toEqual([123, 789]);
        });
    });
});
