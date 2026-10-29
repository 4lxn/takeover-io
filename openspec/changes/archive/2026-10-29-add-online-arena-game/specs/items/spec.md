# Spec Delta

## Purpose

Adds AI-themed items that create swings and funny moments in a match: buffs for yourself, decoys, and attacks such as Hallucination, Session Limit and Prompt Injection thrown at other AIs.

## ADDED Requirements

### Requirement: Prompt boxes

The arena SHALL hold up to 8 prompt boxes at random positions (6 at round start), adding a new one every 6 seconds while there are fewer than 8. An AI with an empty item slot that touches a prompt box SHALL collect it and receive one random item; an AI whose slot is full SHALL pass over boxes without collecting them.

#### Scenario: Collect with an empty slot
- **WHEN** an AI with no item touches a prompt box
- **THEN** the box disappears and the AI's slot holds one random item

#### Scenario: Slot already full
- **WHEN** an AI holding an item touches a prompt box
- **THEN** the box stays in the arena and the AI keeps its item

#### Scenario: Session Limit is rare
- **WHEN** many prompt boxes are collected over a round
- **THEN** Session Limit comes out less often than any other item

### Requirement: Using an item

The player SHALL use their item with Space or by tapping the item button. Self items SHALL take effect at once. Thrown items SHALL fly as a fast homing projectile at the nearest other AI within the player's range; if no AI is within range, the item SHALL stay in the slot and the HUD SHALL say "No target in range".

#### Scenario: Throw at a target
- **WHEN** the player holds Hallucination, another AI is within range, and the player presses Space
- **THEN** the slot empties and a homing projectile flies to that AI

#### Scenario: No target
- **WHEN** the player presses Space holding a thrown item and no AI is within range
- **THEN** the item stays in the slot and "No target in range" is shown briefly

### Requirement: Self items

The self items SHALL be: **GPU Boost** (doubles fire rate for 6 seconds), **Firewall** (no damage and no thrown-item effects for 5 seconds) and **Fork()** (two decoy copies of the AI for 6 seconds).

#### Scenario: Firewall blocks an attack
- **WHEN** an AI with an active Firewall is hit by projectiles or by a thrown item
- **THEN** it loses no health and the thrown item has no effect

#### Scenario: Fork() decoys
- **WHEN** the player uses Fork()
- **THEN** two copies with the same look and name appear next to the AI, wander nearby without firing, attract fire from other AIs and bots, and each disappears after one hit or after 6 seconds

### Requirement: Hallucination

Hallucination SHALL make the target's projectiles fly in random directions for 4 seconds, and show ghost AIs and a glitch effect on the target's screen only.

#### Scenario: Hallucination hits
- **WHEN** Hallucination hits an AI
- **THEN** for 4 seconds that AI's projectiles fly in random directions and its player sees ghost AIs and a glitch effect

### Requirement: Session Limit

Session Limit SHALL stop the target from moving, firing and using items for 2.5 seconds, with a "Session limit reached" label above it.

#### Scenario: Session Limit hits
- **WHEN** Session Limit hits an AI
- **THEN** for 2.5 seconds it cannot move, fire or use items and shows "Session limit reached"

### Requirement: Prompt Injection

Prompt Injection SHALL instantly move 25% of the target's XP, rounded down, to the user. The target SHALL keep its levels and upgrades.

#### Scenario: Prompt Injection hits
- **WHEN** Prompt Injection hits an AI holding 60 XP
- **THEN** the target drops to 45 XP, the user gains 15 XP, and the target keeps its level

### Requirement: Protection from thrown items

Alignment SHALL shorten Hallucination and Session Limit and reduce Prompt Injection as defined in `upgrades`. An AI protected after reboot SHALL ignore thrown items.

#### Scenario: Thrown item on a rebooting AI
- **WHEN** Session Limit hits an AI within 2 seconds of its reboot
- **THEN** it has no effect

### Requirement: No endless lock

After Hallucination or Session Limit wears off, the same AI SHALL be immune to that same item for 3 seconds.

#### Scenario: Chained Session Limits
- **WHEN** a second Session Limit hits an AI 1 second after its first one ended
- **THEN** the second one has no effect

### Requirement: Items in the kill feed

Each successful thrown item SHALL add a line to the kill feed naming the user and the target.

#### Scenario: Feed line
- **WHEN** Unit-07 hits Qubit with Prompt Injection that takes 12 XP
- **THEN** the kill feed shows "Unit-07 prompt-injected Qubit (-12 XP)"
