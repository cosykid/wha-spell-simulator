import type { Dictionary, SigilEntry, SignEntry, SampleSpell } from "../types.js";

async function readJson(url: URL | string): Promise<any> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to load ${url}: ${response.status}`);
  }
  return response.json();
}

export async function loadDictionary(): Promise<Dictionary> {
  const [sigils, signs, sampleSpells] = await Promise.all([
    readJson(new URL("./sigils.json", import.meta.url)),
    readJson(new URL("./signs.json", import.meta.url)),
    readJson(new URL("./sample-spells.json", import.meta.url))
  ]);

  return {
    sigils: sigils as SigilEntry[],
    signs: signs as SignEntry[],
    sampleSpells: sampleSpells as SampleSpell[]
  };
}
