# src/lib/cast/sound

The cast heard. The same `SpellScore` the cells perform, performed as audio:
one layer of synthesized sound per sustaining track, one strike for R-01's
impulse, and the grains a substance throws off while it is loud, all scheduled
on the cast clock. There are no audio files. Everything is band-passed noise
and a few oscillators, so the app ships nothing and a row of numbers is the
whole difference between fire and water.

```
SpellIR -> compileScore -> SpellScore -> cues.ts -> SoundScore -> perform.ts -> speakers
                                            voices.ts (one row per substance)
```

It sits beside `stage/` and `classic/`, not under either. Both engines gate on
`isCasting` and count from `activatedAt`, and R-01's beats are the ruled
timeline, so a cast sounds the same whichever engine draws it and neither
engine knows this directory exists.

## File map

- [`castSound.ts`](castSound.ts) — `CastSound`, what a host holds beside its
  `CastEngine`: the audio context, the master chain, the unlock gesture, and
  the running cast keyed on `signature|activatedAt` exactly as the stage keys
  its own.
- [`cues.ts`](cues.ts) — `compileSoundScore`: a `SpellScore` as a
  `SoundScore`. Pure, and the whole of what the unit suite asserts on.
- [`layers.ts`](layers.ts) — a track as a `SoundLayer`: its envelope sampled
  as loudness, the coast past its window, and the motion its kind gives it.
- [`grains.ts`](grains.ts) — the seeded schedule of crackle, bubbles, twinkles
  and tinkles, drawn against the layers' own loudness.
- [`voice.ts`](voice.ts) — the `VoiceRow` contract, data only.
- [`voices.ts`](voices.ts) — `VOICES`, eight rows, and `voiceRow`, which
  resolves sigil then element then inert the way `looks/table.ts` does.
- [`perform.ts`](perform.ts) — `performSoundScore`: a `SoundScore` as a Web
  Audio graph, on a live or an offline context.
- [`graph.ts`](graph.ts) — the building blocks: the one seeded noise buffer,
  the loudness curve on the cast clock, the one-shot envelope, the LFO.

## How it works

**Compile.** `compileSoundScore(score)` walks the score's tracks. Every
sustaining track becomes a layer whose loudness is `shapeOf` its own emission
envelope (its drive, for a `hold`, because the grip does not let go at the
release), scaled by how much of its kind's full rate it reached and sampled
every `SAMPLE_MS` on the cast clock. The burst becomes the `strike` cue. R-01's
charge, which no track carries, is designed here as a swell over the charge
beat. The row's grains are then drawn against the manifested layers.

**Perform.** `performSoundScore(ctx, out, sound, clock)` schedules all of it in
one pass. A layer is noise through the row's band, mixed with the row's tone by
the kind, a rumble floor under both, the row's wobble and the kind's sweep on
the band, the kind's spin on a panner and its tremolo on a gain, and the
sampled loudness written onto the layer's gain with `setValueCurveAtTime`.
Every source is given its own stop time. A cast left alone ends itself, and a
hidden tab or a stalled frame loop cannot make it late.

**Host.** `CastSound.render(spellIR, ring, timestamp)` is called every frame
beside `engine.render`. A new key starts a performance from wherever the cast
clock already is, the same key lets it play, and a spell that is gone fades it
over `FADE_S` and detaches its bus. Mute is a ramp on the master, so a cast is
scheduled whether or not it is heard and unmuting lands mid-cast.

## Invariants and gotchas

**Nothing here reads a clock or calls `Math.random`.** The sound score is a
pure function of the score, the grains draw from the cast's `Rng` seeded off
the score signature, and even the noise buffer is seeded, so an offline render
of a cast is the same file every time. The stage's rule holds one layer over:
the only timestamp is the one the host passes in.

**R-01 is structural.** A manifested layer's loudness is its track's envelope,
and no envelope but the medium's opens before the strike. Grains are drawn
from the strike on. `tests/castSound.test.ts` walks every lab preset and
asserts the charge holds only the swell and the medium.

**R-02 is inherited, coast included.** A layer's window is its envelope's, so
only the body stretches. Past the window it coasts along the score's own
`decay` curve for one release beat and is cooled to zero through the afterglow,
so every layer's last sample is zero and none outlives `totalMs`.

**A cast joined late starts where it is.** The audio clock refuses events in
its past, so `AudioClock.fromMs` is the earliest cast millisecond anything may
be scheduled at and every schedule skips what came before it. This is what a
style swap, a resumed context and the frame after activation all rely on.

**The context is created on a gesture, never on load.** Browsers refuse audio
until the page has been touched. `mount()` listens for the first pointer, key
or touch and resumes the context inside it. A cast that arrives before the
context runs asks it to resume and joins on a later frame. Everything here is
a no-op where `AudioContext` does not exist.

**Sources are never stopped twice.** A source may be stopped once, so every
one is stopped at its own natural end when it is created and a cut cast is
faded through its bus and detached instead. The sources play silently into
nothing for at most a cast's length.

**Rows are data and set no motion.** A row says what a substance is made of.
How a layer moves comes from its kind in `layers.ts`, and a row that could
reach that would be an art fix arriving as a physics term, the thing the look
table exists to kill.

**The library's replay is silent.** A book wall can hold several previews at
once, and several casts sounding together is noise. The simulator and the
Spell Effect Lab are the two hosts that hear.

## Extending

- **New sound for a substance:** edit its row in `voices.ts`. Nothing else may
  change. Argue the row from the sigil's dictionary `sourceNotes` and its look
  row's material, the way the eight rows do.
- **New sigil row:** add a row and one line in `VOICES`. Keying is by sigil id,
  so it takes precedence over the element row underneath it automatically.
- **New kind:** a case in `motionFor` and a level in `LAYER_LEVEL` in
  `layers.ts`, and `FULL_RATE` stops type-checking until the kind's rate is
  named. The synth needs no change: every layer is the same graph.
- **New grain kind:** a case in `performGrain`, and `PITCH_SCATTER` in
  `grains.ts` stops type-checking until it is scattered.
- **Audition it:** `/tools/spell-effect-lab`, with its Sound checkbox on. Pick
  a sigil and a preset and the live loop plays the row.

## Related

- [`../CLAUDE.md`](../CLAUDE.md) — the cast and its layers ·
  [`../score/`](../score/compileScore.ts) — the timeline this performs ·
  [`../looks/`](../looks/table.ts) — the resolution rule this copies.
- [`../../ui/simulator/CLAUDE.md`](../../ui/simulator/CLAUDE.md) — the host
  that holds one of these beside its engine.
- [`../../../../tests/castSound.test.ts`](../../../../tests/castSound.test.ts)
  — the laws above, pinned.
