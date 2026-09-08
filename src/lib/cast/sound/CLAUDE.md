# src/lib/cast/sound

The cast heard. The same `SpellScore` the cells perform, performed as audio:
one layer of synthesized sound per sustaining track, one impact for R-01's
strike, and the grains a substance throws off while it is loud, all scheduled on
the cast clock. There are no audio files. Everything is coloured noise through
resonances, a few oscillators, and a room, so the app ships nothing and a table
of numbers is the whole difference between fire and water.

```
SpellIR -> compileScore -> SpellScore -> cues.ts -> SoundScore -> perform.ts -> speakers
                                            voices/ (one row per substance)
```

It sits beside `stage/` and `classic/`, not under either. Both engines gate on
`isCasting` and count from `activatedAt`, and R-01's beats are the ruled
timeline, so a cast sounds the same whichever engine draws it and neither
engine knows this directory exists.

## File map

**When**, the pure half, unit-tested where the score is:

- [`cues.ts`](cues.ts) — `compileSoundScore`: a `SpellScore` as a `SoundScore`.
- [`layers.ts`](layers.ts) — a track as a `SoundLayer`: its envelope sampled as
  loudness, the coast past its window, and the motion its kind gives it.
- [`grains.ts`](grains.ts) — the seeded schedules: what a substance throws off
  while it burns, and the far denser scatter the landing itself throws.

**What**, the data:

- [`voice.ts`](voice.ts) — the `VoiceRow` contract, data only.
- [`voices.ts`](voices.ts) — `VOICES` and `voiceRow`, which resolves sigil then
  element then inert the way `looks/table.ts` does.
- [`voices/`](voices/) — the eight rows, one substance per file, as
  [`looks/`](../looks/) keeps its own.

**How**, the synth, which needs a browser:

- [`perform.ts`](perform.ts) — `performSoundScore`: the wiring, and nothing else.
- [`bodies.ts`](bodies.ts) — one sustaining layer, from its noise to where it
  sits in the field.
- [`impacts.ts`](impacts.ts) — everything that hits: the strike, the seal tick,
  and each grain as the event its kind physically is.
- [`noise.ts`](noise.ts) — the three noise colours and the wander, seeded.
- [`space.ts`](space.ts) — the room, as a seeded impulse response.
- [`graph.ts`](graph.ts) — the clock mapping, the loudness curve, the one-shot
  envelope, the saturator, the LFO.

**Host:**

- [`castSound.ts`](castSound.ts) — `CastSound`, what a host holds beside its
  `CastEngine`: the audio context, the master chain, the unlock gesture, and
  the running cast keyed on `signature|activatedAt` exactly as the stage keys
  its own.

## What makes a sound read as real

Every rule below is a thing the first cut got wrong, so none of them is
decoration.

**Noise has a colour.** Flat white noise is a hiss and nothing in the world is
one. Moving air and water fall about 3dB an octave and anything with the mass
to roar falls about 6, so a row picks `white`, `pink` or `brown` and the rest of
its body is carved out of that.

**A source has more than one resonance.** One band-pass is a synthesizer and
three are a thing. A row's `formants` are ratios of its body's centre, and
`bodies.ts` equalizes each one for its own width and its colour's tilt, so a
`level` in a row means the same at 90Hz and at 4kHz. `formantGain` is that
correction and it was checked by rendering one formant per colour per octave.

**Nothing holds a rate.** A sine tremolo is the loudest tell in synthesized
sound. A row's `flutter` is a wander instead, played out of a seeded buffer in
`noise.ts`, and only motion that really is periodic (a held mass bobbing, a
vortex turning) gets an oscillator.

**Everything is heard twice.** A dry cast reads as fake however good the source
is. `space.ts` builds a room and a row's `space` says how much of it reaches
the ear off the walls instead of straight.

**Highs die first.** What separates a struck thing from a beep is that its
modes decay at different rates. Every `Mode` carries its own `decayMs`, and the
long ones are doubled a few cents apart so they beat.

**Small events are events.** A grain is modelled as what it is: a `crackle` is
a resonance let go of, a `bubble` climbs in pitch as it collapses (which is
most of what water actually is), `grit` bounces more than once, a `chime` is
inharmonic, a `spark` blooms.

## How it works

**Compile.** `compileSoundScore(score)` walks the score's tracks. Every
sustaining track becomes a layer whose loudness is `shapeOf` its own emission
envelope (its drive, for a `hold`, because the grip does not let go at the
release), scaled by how much of its kind's full rate it reached and sampled
every `SAMPLE_MS` on the cast clock. The burst becomes the `strike` cue, which
carries its own scatter. R-01's charge, which no track carries, is designed
here as a swell over the charge beat. The row's grains are then drawn against
the manifested layers.

**Perform.** `performSoundScore(ctx, out, sound, clock)` schedules all of it in
one pass into a dry bus and a room. Every source is given its own stop time. A
cast left alone ends itself, and a hidden tab or a stalled frame loop cannot
make it late.

**Host.** `CastSound.render(spellIR, ring, timestamp)` is called every frame
beside `engine.render`. A new key starts a performance from wherever the cast
clock already is, the same key lets it play, and a spell that is gone fades it
and detaches its bus. A cast that reached its own end is let go over `TAIL_S`
rather than `FADE_S`, which is the difference between an ending and a cut: the
room behind it gets to finish. Mute is a ramp on the master, so a cast is
scheduled whether or not it is heard and unmuting lands mid-cast.

## Invariants and gotchas

**Nothing here reads a clock or calls `Math.random`.** The sound score is a
pure function of the score, the grains draw from the cast's `Rng` seeded off the
score signature, and the noise, wander and room buffers are all seeded, so an
offline render of a cast is the same file every time. The stage's rule holds one
layer over: the only timestamp is the one the host passes in.

**R-01 is structural.** A manifested layer's loudness is its track's envelope,
and no envelope but the medium's opens before the strike. Both grain schedules
run from the strike on. `tests/castSound.test.ts` walks every lab preset and
asserts the charge holds only the swell and the medium.

**R-02 is inherited, coast included.** A layer's window is its envelope's, so
only the body stretches. Past the window it coasts along the score's own `decay`
curve for one release beat and is cooled to zero through the afterglow, so every
layer's last sample is zero and none outlives `totalMs`.

**A cast joined late starts where it is.** The audio clock refuses events in its
past, so `AudioClock.fromMs` is the earliest cast millisecond anything may be
scheduled at and every schedule skips what came before it. This is what a style
swap, a resumed context and the frame after activation all rely on.

**The context is created on a gesture, never on load.** Browsers refuse audio
until the page has been touched. `mount()` listens for the first pointer, key or
touch and resumes the context inside it. A cast that arrives before the context
runs asks it to resume and joins on a later frame. Everything here is a no-op
where `AudioContext` does not exist.

**Sources are never stopped twice.** A source may be stopped once, so every one
is stopped at its own natural end when it is created and a cut cast is faded
through its bus and detached instead. The sources play silently into nothing for
at most a cast's length.

**`connect` returns the destination, not the source.** Building a trim as
`gainNode(ctx, x).connect(dest)` and passing the result along hands the next
stage `dest` and leaves the trim dangling with nothing in it. Two mix trims were
silently out of the path this way. Name the node, connect it, then pass it.

**Drive is a timbre and not a level.** `saturator` divides its curve back down
by its own slope at the origin, so a row that turns drive up folds its peaks and
does not get louder. A shaper that changed the level would make the rows tuned
against each other rather than described.

**Rows are data and set no motion.** A row says what a substance is made of. How
a layer moves comes from its kind in `layers.ts`, and a row that could reach
that would be an art fix arriving as a physics term, the thing the look table
exists to kill.

**The library's replay is silent.** A book wall can hold several previews at
once, and several casts sounding together is noise. The simulator and the Spell
Effect Lab are the two hosts that hear.

## Extending

- **New sound for a substance:** edit its file in `voices/`. Nothing else may
  change. Argue the row from the sigil's dictionary `sourceNotes` and its look
  row's material, the way the eight rows do.
- **New sigil row:** add a file and one line in `VOICES`. Keying is by sigil id,
  so it takes precedence over the element row underneath it automatically.
- **New kind:** a case in `motionFor` and a level in `LAYER_LEVEL` in
  `layers.ts`, and `FULL_RATE` stops type-checking until the kind's rate is
  named. The synth needs no change: every layer is the same graph.
- **New grain kind:** a case in `performGrain`, and `PITCH_SCATTER` in
  `grains.ts` stops type-checking until it is scattered.
- **Audition it:** `/tools/spell-effect-lab`, with its Sound checkbox on. Pick a
  sigil and a preset and the live loop plays the row.
- **Measure it without ears:** a Playwright page can import the Vite-served
  modules and render a cast through an `OfflineAudioContext` with the same
  master chain `CastSound` builds. Peak and RMS per R-01 beat, energy in four
  bands and crest factor are enough to tell a roar from a hiss and to keep the
  strike the loudest instant of every cast.

## Related

- [`../CLAUDE.md`](../CLAUDE.md) — the cast and its layers ·
  [`../score/`](../score/compileScore.ts) — the timeline this performs ·
  [`../looks/`](../looks/table.ts) — the resolution rule this copies.
- [`../../ui/simulator/CLAUDE.md`](../../ui/simulator/CLAUDE.md) — the host
  that holds one of these beside its engine.
- [`../../../../tests/castSound.test.ts`](../../../../tests/castSound.test.ts)
  — the laws above, pinned.
