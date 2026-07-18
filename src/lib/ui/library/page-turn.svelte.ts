/**
 * @file Page-turn state for the library book. A book of N leaves shows spread
 * `s` when the first `s` leaves are flipped. Turning is just changing how many
 * leaves are flipped: CSS transitions animate each leaf, and jumps of several
 * spreads stagger the flips so the pages fan. Under reduced motion the CSS
 * transition is disabled, so every jump lands instantly.
 */

/** Delay between successive leaf flips when fanning across multiple spreads. */
const FAN_STAGGER_MS = 70;

export class PageTurner {
	/** How many leaves are currently flipped over to the left. */
	flippedCount = $state(0);
	/** The spread index the book is heading to. Equals flippedCount when idle. */
	target = $state(0);
	/** Leaf index currently mid-flight, for z-order boosting. */
	turningLeaf = $state<number | null>(null);

	#timeouts: ReturnType<typeof setTimeout>[] = [];

	get spread(): number {
		return this.target;
	}

	/** Flips toward the given spread, fanning one leaf at a time. */
	turnTo(spread: number, leafCount: number): void {
		const clamped = Math.max(0, Math.min(spread, leafCount));
		this.cancel();
		this.target = clamped;
		const stepOnce = () => {
			if (this.flippedCount === clamped) {
				const settle = setTimeout(() => {
					this.turningLeaf = null;
				}, 700);
				this.#timeouts.push(settle);
				return;
			}
			// Forward turns flip the leaf at the current count. Backward turns
			// unflip the one just before it.
			const forward = clamped > this.flippedCount;
			this.turningLeaf = forward ? this.flippedCount : this.flippedCount - 1;
			this.flippedCount += forward ? 1 : -1;
			this.#timeouts.push(setTimeout(stepOnce, FAN_STAGGER_MS));
		};
		stepOnce();
	}

	next(leafCount: number): void {
		this.turnTo(this.target + 1, leafCount);
	}

	previous(leafCount: number): void {
		this.turnTo(this.target - 1, leafCount);
	}

	/** Snaps home without animation bookkeeping, for section switches. */
	reset(): void {
		this.cancel();
		this.flippedCount = 0;
		this.target = 0;
		this.turningLeaf = null;
	}

	cancel(): void {
		for (const timeout of this.#timeouts) {
			clearTimeout(timeout);
		}
		this.#timeouts = [];
	}
}
