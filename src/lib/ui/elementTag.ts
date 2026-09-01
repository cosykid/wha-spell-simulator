/**
 * When a glyph's element is worth showing beside its name.
 *
 * Shared by the dictionary cards and the shape palette so both drop the same
 * redundant tags. The tetrad sigils are named for their element, so repeating it
 * says nothing; the variants are not, so it says everything.
 *
 * @packageDocumentation
 */

/**
 * The element to show beside `name`, or `null` when the name already carries it.
 *
 * @example
 * elementTag('Fire', 'fire'); // null
 * elementTag('Wind (Directs Air)', 'wind'); // null
 * elementTag('Crystal', 'earth'); // 'earth'
 */
export function elementTag(name: string, element?: string | null): string | null {
	if (!element) return null;
	return name.toLowerCase().includes(element.toLowerCase()) ? null : element;
}
