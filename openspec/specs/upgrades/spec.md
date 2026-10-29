# upgrades Specification

## Purpose

Lets each AI grow stronger during a round by picking AI-themed upgrades at every level-up, so that different combinations make different builds.

## Requirements

### Requirement: Upgrade choice

For each upgrade choice an AI receives, the game SHALL offer 3 different upgrades picked at random from those not yet at their maximum level, or fewer if fewer remain. The player SHALL pick one with keys 1, 2 or 3 or by clicking or tapping its card; the match SHALL keep running while the choice is open. Unused choices SHALL wait in a queue and be offered one at a time.

#### Scenario: Pick with a key
- **WHEN** the player has an open choice showing Overclock, Low Latency and Alignment and presses 2
- **THEN** Low Latency gains one level and the cards close, or the next queued choice appears

#### Scenario: Choices pile up
- **WHEN** the player levels up three times without picking
- **THEN** one set of 3 cards is shown with a badge saying 3 choices are waiting

#### Scenario: Everything at maximum
- **WHEN** every upgrade is at its maximum level and the AI levels up
- **THEN** no cards are shown and the level still counts toward XP and size

### Requirement: Offense upgrades

Each level SHALL improve the AI as follows: **Overclock** fires faster; **Bigger Model** deals more damage per projectile; **Parallelism** adds one projectile per shot, spread in a fan, up to 2 levels; **Context Window** extends the range for firing and for thrown items. All but Parallelism go up to 5 levels.

#### Scenario: Overclock
- **WHEN** an AI picks Overclock
- **THEN** the time between its shots gets shorter

#### Scenario: Parallelism
- **WHEN** an AI with Parallelism at level 2 fires
- **THEN** it fires 3 projectiles at once in a fan aimed at the target

### Requirement: Defense and mobility upgrades

Each level SHALL improve the AI as follows, up to 5 levels each: **Redundancy** raises maximum health and health regeneration; **Low Latency** raises movement speed; **Alignment** shortens Hallucination and Session Limit on this AI and reduces what Prompt Injection steals from it.

#### Scenario: Low Latency
- **WHEN** an AI picks Low Latency
- **THEN** it moves faster than before

#### Scenario: Redundancy
- **WHEN** an AI picks Redundancy
- **THEN** its maximum health rises, its current health rises by the same amount, and it regenerates health faster while not being hit

#### Scenario: Alignment
- **WHEN** an AI with Alignment level 3 is hit by Session Limit
- **THEN** the effect lasts noticeably shorter than on an AI without Alignment

### Requirement: Upgrades shown in the HUD

The HUD SHALL show the player's upgrades with their current levels.

#### Scenario: Owned upgrades
- **WHEN** the player has Overclock 2 and Context Window 1
- **THEN** the HUD shows both upgrades with 2 and 1 filled pips respectively

### Requirement: Augments

Every third level (3, 6, 9…) SHALL offer 3 augments instead of upgrades, picked the same way (keys 1, 2, 3 or tap). Each card's rarity SHALL be rolled as silver 60%, gold 30% or prismatic 10%, and an AI SHALL never be offered an augment it already owns. Augments SHALL be lost on deletion, like upgrades.

#### Scenario: Level 3
- **WHEN** an AI reaches level 3
- **THEN** it is offered 3 augment cards showing their rarity instead of upgrade cards

#### Scenario: Owned augment
- **WHEN** an AI that owns Overfit is offered augments
- **THEN** Overfit is not among them

### Requirement: Silver and gold augments

Augment effects SHALL be: silver **Vampiric Weights** (heal 20% of damage dealt), **Critical Thinking** (+20% crit chance), **Data Hoarder** (data packets give double XP), **Adversarial Training** (reflect 30% of damage taken); gold **Chain Reaction** (your deletions explode for 40 damage around them), **Overfit** (crits deal triple damage), **Piercing Tokens** (projectiles pass through one extra target), **Bounty Hunter** (double XP from deletions).

#### Scenario: Chain Reaction
- **WHEN** an AI with Chain Reaction deletes an AI standing next to a third AI
- **THEN** an explosion at that spot deals 40 damage to the third AI

#### Scenario: Data Hoarder
- **WHEN** an AI with Data Hoarder collects a data packet worth 1 XP
- **THEN** it gains 2 XP

### Requirement: Prismatic augments

Prismatic augment effects SHALL be: **Mixture of Experts** (+2 projectiles per shot, beyond the Parallelism limit), **Checkpoint** (once per life, a fatal hit leaves the AI at 50% health with 2 seconds of protection instead of deleting it), **Glass Cannon** (+75% damage, -35% maximum health).

#### Scenario: Checkpoint
- **WHEN** an AI with Checkpoint takes a fatal hit for the first time since it rebooted
- **THEN** it survives at half health, protected for 2 seconds, and the kill feed says it was restored from checkpoint

#### Scenario: Glass Cannon
- **WHEN** an AI picks Glass Cannon
- **THEN** its maximum health drops by about a third and its projectiles deal 75% more damage
