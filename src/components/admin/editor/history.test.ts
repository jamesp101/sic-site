import { describe, expect, it } from 'vite-plus/test';
import { History } from './history';

describe('History', () => {
    it('undoes and redoes in order', () => {
        const history = new History('a');
        history.push('b', null, 0);
        history.push('c', null, 0);
        expect(history.undo()).toBe('b');
        expect(history.undo()).toBe('a');
        expect(history.undo()).toBeNull();
        expect(history.redo()).toBe('b');
        expect(history.present).toBe('b');
        expect(history.canRedo).toBe(true);
    });

    it('drops the redo stack on a new edit', () => {
        const history = new History(1);
        history.push(2, null, 0);
        history.undo();
        history.push(3, null, 0);
        expect(history.canRedo).toBe(false);
        expect(history.undo()).toBe(1);
    });

    it('merges rapid pushes that share a key', () => {
        const history = new History('');
        history.push('h', 'text', 0);
        history.push('he', 'text', 100);
        history.push('hel', 'text', 200);
        expect(history.undo()).toBe('');
        expect(history.canUndo).toBe(false);
    });

    it('does not merge across keys or after the window', () => {
        const history = new History('');
        history.push('a', 'one', 0);
        history.push('ab', 'two', 100);
        history.push('abc', 'two', 5000);
        expect(history.undo()).toBe('ab');
        expect(history.undo()).toBe('a');
        expect(history.undo()).toBe('');
    });

    it('ignores identical snapshots and caps its size', () => {
        const history = new History(0, 3);
        history.push(0, null, 0);
        expect(history.canUndo).toBe(false);
        for (let i = 1; i <= 10; i++) history.push(i, null, 0);
        let steps = 0;
        while (history.undo() !== null) steps++;
        expect(steps).toBe(3);
    });
});
