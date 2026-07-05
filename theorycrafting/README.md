# Witch Hat Atelier Theorycrafting

This repository contains theorycrafting and calculations for a spell simulator based on the Witch Hat Atelier series.

Input data:

- `wiki` contains pages scraped from the Witch Hat Atelier community wiki. You can find here all the reference material from the canon, including spell mechanics & a dictionary of all known spells.
- `notes.png` is a custom-made diagram that shows some additional information about the column sign (already implemented).
- `icons` contains images of all the signs & sigils in `.svg` format, which can be used to render them in the simulator.

Output data:

- All the actual simulator logic goes into `sim/`. See the `sim/README.md` for more information.
- Theorycrafting notes goes into `.md` files at the root of the repository or in a dedicated `theorycrafting/` folder. See the `GROUND_TRUTH.md` file for a start.

## Scope

The scope of this project is to start small, with a bottom-up approach to spell mechanics. First thing first, I'll be considering just the basic elemental sigils for now, that is fire, earth, wind, water, crystal and light. No repetition shenanigans (yet).

To start simple, let's focus just on the "beginner-friendly spells", which consists of a single sigil + one or more signs.

I'll also be treating the elements are all fundamentally equivalent to each other, that is if I draw a spell with fire, then change the sigil to water leaving the rest of the signs the same, I would expect the effect to be roughly the same (just with a different element). To make a specific example, if you take the "light beam" spell (https://witchhatatelier.telepedia.net/wiki/Light_Beam) and substitute fire for light, I'd expect to get... well, a fire beam.
This is quite the assumption, because clearly elements have their peculiarities (you can weave crystal but not air probably). But, I would argue that there are lots of signs that are very general too, and we should start from those.

For this opening chapter, I'm targeting these and only these signs:

- Column / Dispersion (I'll argue that "dispersion" is in fact just a variant of "column").
- Region
- Levitation
- Pull

These signs are the ones that are almost "universal". They act just as forces to push/pull the element, so they only move and not modify. They don't require no "chemistry". For instance, if you look at crush, you'll see that it is a sign that actively breaks apart a material (kinda like introducing a repulsive force between all bits of that element). For that, we would need some kind of "chemistry system", so you can simulate reactions that alter the elements: earth becomes sand, water becomes mist. I would like to avoid this for now.

My approach for understanding is "bottom-up". I'm starting with a blank ring, and then add one symbol at a time, and try to understand what would happen. If we can derive a behavior that is sufficiently specific, we can turn that into maths and a physical simulator. Then,your imagination is the limit.

A list of spells this early theorycrafting should support:

- Rising wave
- Rising platform of water
- Crystal shard
- Flame shot
- Grasping wind
- Light beam
- Pyreball
- Skysoaring
- Watershot
