import assert from 'node:assert/strict';
import test from 'node:test';

import {
	chooseSuggestedSymbol,
	createSampleCountLookup,
	samplePromptWeight
} from '../src/routes/tools/sample-maker/samplePrompt.js';
import type { SampleSymbol } from '../src/routes/tools/sample-maker/symbols.js';

const symbols: SampleSymbol[] = [
	{ id: 'full', displayName: 'Full' },
	{ id: 'missing', displayName: 'Missing' },
	{ id: 'low', displayName: 'Low' }
];

test('weights sample prompts toward signs with fewer stored examples', () => {
	const countsBySign = createSampleCountLookup([
		{ signId: 'full', count: 20 },
		{ signId: 'missing', count: 0 },
		{ signId: 'low', count: 5 }
	]);

	assert.equal(samplePromptWeight(symbols[0], countsBySign), 1);
	assert.equal(samplePromptWeight(symbols[1], countsBySign), 441);
	assert.equal(samplePromptWeight(symbols[2], countsBySign), 256);
});

test('chooses from weighted sample prompt ranges', () => {
	const counts = [
		{ signId: 'full', count: 20 },
		{ signId: 'missing', count: 0 },
		{ signId: 'low', count: 5 }
	];

	assert.equal(chooseSuggestedSymbol(symbols, counts, () => 0)?.id, 'full');
	assert.equal(chooseSuggestedSymbol(symbols, counts, () => 0.5)?.id, 'missing');
	assert.equal(chooseSuggestedSymbol(symbols, counts, () => 0.99)?.id, 'low');
});
