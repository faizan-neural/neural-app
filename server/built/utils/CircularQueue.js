"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class CircularQueue {
    constructor(maxSize) {
        this.maxSize = maxSize;
        this.values = [];
        this.currSize = 0;
        if (!this.maxSize)
            throw new Error('invalid size of zero');
        if (this.maxSize === 1)
            throw new Error('invalid size of one');
        for (let index = 0; index < this.maxSize; index++) {
            this.values.push(undefined);
        }
    }
    push(value) {
        this.values[this.currSize % this.maxSize] = value;
        this.currSize++;
    }
    peek() {
        const nextPositionToBeOverwritten = this.currSize % this.maxSize;
        return this.values[nextPositionToBeOverwritten];
    }
}
exports.default = CircularQueue;
//# sourceMappingURL=CircularQueue.js.map