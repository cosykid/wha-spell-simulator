/**
 * @file Pointer dismissal for native modal dialogs.
 *
 * `showModal()` hands a dialog Escape for free but never a way out with the
 * pointer, so the dim area around a modal swallows the clicks a reader aims at
 * it. Escape is also not a gesture a touch reader has at all. This gives the
 * backdrop the same meaning the drawers' backdrop already carries: click off
 * the panel and it closes.
 */
import type { Attachment } from 'svelte/attachments';

/**
 * Closes a native `<dialog>` when a click lands on the backdrop around it.
 *
 * A backdrop click names the dialog itself as its target, so the target alone
 * cannot tell it apart from a click on the dialog's own padding. The pointer's
 * position is measured against the dialog's box instead. Both ends of the click
 * are checked so a selection drag that starts on the form and finishes outside
 * does not pull the dialog out from under the reader's hand.
 *
 * Pairs with `onclose`, which is where the dialog's open state belongs.
 *
 * @example
 * ```svelte
 * <dialog bind:this={dialog} {@attach lightDismiss()} onclose={() => (open = false)}>
 * ```
 */
export function lightDismiss(): Attachment<HTMLDialogElement> {
	return (dialog) => {
		let pressedOutside = false;

		function isOutside(event: MouseEvent): boolean {
			const box = dialog.getBoundingClientRect();
			return (
				event.clientX < box.left ||
				event.clientX > box.right ||
				event.clientY < box.top ||
				event.clientY > box.bottom
			);
		}

		function onPointerDown(event: PointerEvent) {
			pressedOutside = isOutside(event);
		}

		function onClick(event: MouseEvent) {
			// A button activated by keyboard reports no clicks and a (0, 0) point,
			// which reads as the far corner of the backdrop. Only a real press
			// dismisses.
			if (event.detail > 0 && pressedOutside && isOutside(event)) {
				dialog.close();
			}
			pressedOutside = false;
		}

		dialog.addEventListener('pointerdown', onPointerDown);
		dialog.addEventListener('click', onClick);

		return () => {
			dialog.removeEventListener('pointerdown', onPointerDown);
			dialog.removeEventListener('click', onClick);
		};
	};
}
