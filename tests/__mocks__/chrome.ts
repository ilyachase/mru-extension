import { vi } from 'vitest';

// Chrome API mocks for testing

export interface MockTab {
    id?: number;
    windowId?: number;
    active?: boolean;
    url?: string;
    title?: string;
}

export interface MockWindow {
    id?: number;
    focused?: boolean;
}

class MockStorage {
    private data: Record<string, any> = {};

    get(key: string): Promise<Record<string, any>> {
        return Promise.resolve({ [key]: this.data[key] || [] });
    }

    set(items: Record<string, any>): Promise<void> {
        Object.assign(this.data, items);
        return Promise.resolve();
    }

    clear(): void {
        this.data = {};
    }
}

class MockEventTarget<T extends (...args: any[]) => void> {
    private listeners: T[] = [];

    addListener(callback: T): void {
        this.listeners.push(callback);
    }

    removeListener(callback: T): void {
        const index = this.listeners.indexOf(callback);
        if (index > -1) {
            this.listeners.splice(index, 1);
        }
    }

    trigger(...args: Parameters<T>): void {
        this.listeners.forEach((listener) => listener(...args));
    }

    getListeners(): T[] {
        return [...this.listeners];
    }

    clearListeners(): void {
        this.listeners = [];
    }
}

// Mock chrome API
const mockStorage = new MockStorage();

export const chrome = {
    tabs: {
        query: vi.fn().mockResolvedValue([{ id: 1, windowId: 1, active: true }]),
        update: vi.fn().mockResolvedValue(undefined),
        onActivated: new MockEventTarget<(activeInfo: { tabId: number; windowId: number }) => void>(),
        onRemoved: new MockEventTarget<(tabId: number) => void>()
    },
    windows: {
        getCurrent: vi.fn().mockResolvedValue({ id: 1, focused: true }),
        update: vi.fn().mockResolvedValue(undefined),
        onFocusChanged: new MockEventTarget<(windowId: number, filters?: any) => void>()
    },
    storage: {
        local: mockStorage
    },
    runtime: {
        onInstalled: new MockEventTarget<() => void>()
    },
    commands: {
        onCommand: new MockEventTarget<() => void>()
    }
};

// Global chrome object for tests
global.chrome = chrome;
