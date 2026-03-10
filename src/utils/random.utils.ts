import { randomInt } from 'crypto';

export class Random {
    static randInt(min: number, max: number, inclusive = true): number {
        return randomInt(min, inclusive ? max + 1 : max);
    }
}
