export const AEROFORM_SIGN_ID = 'aeroform';

const AEROFORM_ALIASES = new Set(['aeroform', 'aeroforms', 'aeriform', 'aeriforms']);

export const AEROFORM_SIGN_ID_FILTER_VALUES = [
	'aeroform',
	'Aeroform',
	'aeroforms',
	'Aeroforms',
	'aeriform',
	'Aeriform',
	'aeriforms',
	'Aeriforms'
] as const;

/** Canonical sample/dictionary id for legacy Aeroform spellings and plural forms. */
export function canonicalizeSignId(signId: string): string {
	const normalized = signId.trim().toLowerCase();
	return AEROFORM_ALIASES.has(normalized) ? AEROFORM_SIGN_ID : signId;
}
