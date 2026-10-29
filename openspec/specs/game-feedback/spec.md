# game-feedback Specification

## Purpose

Defines what takeover.io players see and hear: pixel-art sprites, the HUD, chiptune music, sound effects and visual effects that make every event in a match easy to notice.

## Requirements

### Requirement: Pixel-art sprites

Every AI SHALL be drawn as a pixel-art sprite tinted with its own color, with its nickname above it and a health bar below it. Data packets, prompt boxes and projectiles SHALL each have their own sprite. The player's own AI SHALL be marked so it is easy to find. If an asset is missing, the game SHALL draw a simple shape in its place instead of failing.

#### Scenario: Several AIs on screen
- **WHEN** 8 AIs are on screen
- **THEN** each one has a distinct color, its nickname and its health bar, and the player's own AI has a marker

#### Scenario: Missing asset
- **WHEN** a sprite or sound is missing from the asset file
- **THEN** the game still runs, drawing a colored shape for that sprite and staying silent for that sound

### Requirement: HUD

During a match the HUD SHALL show: the round countdown, the player's level and an XP bar to the next level, the item slot (with a tap button on touch screens), owned upgrades with levels, the leaderboard, the kill feed, and the upgrade cards when a choice is open.

#### Scenario: Holding an item
- **WHEN** the player holds Firewall
- **THEN** the item slot shows the Firewall icon and the hint "Space"

### Requirement: Music

Music SHALL start after the player's first click or tap: a menu track in the menu and a match track in a match. Each round and each new match SHALL use the next of the available match tracks, its instruments SHALL enter and drop out from one loop to the next so it never repeats identically, and the last 30 seconds of a round SHALL play the full arrangement 25% faster.

#### Scenario: Final 30 seconds
- **WHEN** the round countdown reaches 0:30
- **THEN** the music speeds up until the round ends

### Requirement: Sound effects

The game SHALL play a short synthesized sound for: firing, being hit, collecting data, leveling up, picking up and using an item, being hit by each thrown item, being deleted, rebooting, the takeover screen and menu clicks. To avoid noise, firing sounds SHALL only play for the player's own AI.

#### Scenario: Level up
- **WHEN** the player's AI levels up
- **THEN** a rising level-up sound plays

### Requirement: Music and effects volume

The menu SHALL offer separate controls for music (on/off and volume) and sound effects (volume), remembered by the browser; the N key SHALL turn only the music on or off. Music SHALL default to a lower volume than effects.

#### Scenario: Music off, effects on
- **WHEN** the player turns music off in the Audio panel or with N
- **THEN** the music stops, effects keep playing, and the choice is still set after a reload

#### Scenario: New round, new track
- **WHEN** a round ends and the next one starts
- **THEN** a different match track plays, if more than one is available

### Requirement: Mute

Pressing M or the mute button SHALL toggle all music and sound effects, and the choice SHALL be remembered by the browser for the next visit.

#### Scenario: Mute persists
- **WHEN** the player mutes, closes the tab and opens the game again
- **THEN** the game starts muted

### Requirement: Visual effects

The game SHALL show: a short screen shake when the player's AI takes damage, a particle burst when any AI is deleted, floating "+XP" text when the player gains XP, a blinking AI during reboot protection, a bubble around an AI with Firewall, a glow on an AI with GPU Boost, a "Session limit reached" label above a frozen AI, and, for a hallucinating player only, ghost AIs plus a glitch effect on their screen.

#### Scenario: Hit by Hallucination
- **WHEN** the player's AI is hit by Hallucination
- **THEN** for its duration the player's screen shows a glitch effect and ghost AIs that other players do not see

#### Scenario: Another AI deleted
- **WHEN** any AI on screen is deleted
- **THEN** a burst of particles in its color appears where it was

### Requirement: Combat numbers

Each hit the player deals or takes SHALL show a floating damage number at the hit spot: white for damage dealt, larger yellow with "!" and a quick pop for critical hits, red for damage taken.

#### Scenario: Critical hit dealt
- **WHEN** the player's projectile lands a critical hit for 20 damage
- **THEN** a larger yellow "20!" pops up over the target and floats away

#### Scenario: Damage taken
- **WHEN** the player's AI takes 10 damage
- **THEN** a red "10" floats up from the player's AI

### Requirement: Kill reward popup

When the player deletes another AI, a large gold "+N" with the XP gained SHALL appear at the deletion spot, with "DEPRECATED" (or "SHUTDOWN" for a shutdown) under it.

#### Scenario: Player gets a deletion
- **WHEN** the player deletes an AI and gains 30 XP
- **THEN** a big gold "+30" and "DEPRECATED" appear where the AI was

### Requirement: Announcer

Kill-streak and multi-kill announcements (see `arena-match`) SHALL appear as a large banner at the top center with the killer's name, held about 2 seconds; overlapping announcements SHALL queue.

#### Scenario: Shutdown banner
- **WHEN** a SHUTDOWN announcement arrives
- **THEN** a large red "SHUTDOWN" banner with the killer's name slides in, stays about 2 seconds and fades

### Requirement: Explosions and camera

Every deletion and every Chain Reaction blast SHALL show a white flash, an expanding shockwave ring and a burst of glowing particles and debris. The camera SHALL shake with a strength that falls off with distance from the player's AI (none beyond about 1300 units) and get a short kick away from the blast.

#### Scenario: Explosion nearby
- **WHEN** an AI is deleted 200 units from the player's AI
- **THEN** the screen shakes strongly and the camera is briefly pushed away from the blast

#### Scenario: Explosion far away
- **WHEN** an AI is deleted 1500 units away
- **THEN** the explosion is drawn if on screen but the camera does not shake

### Requirement: Deletion and reboot animation

A deleted AI SHALL dissolve into glitching pixel fragments and corrupted-data tokens (such as "0xDEAD", "NaN", "ERR"). While the player's own AI is deleted, a full-screen "kernel panic" overlay with glitch effects SHALL show the killer's name and a "REBOOTING… NN%" progress bar that fills over the reboot delay. On reboot, the AI SHALL reassemble from converging pixels with a boot ring.

#### Scenario: Player deleted
- **WHEN** the player's AI is deleted
- **THEN** a kernel-panic overlay with the killer's name appears and its REBOOTING progress reaches 100% as the AI reboots

#### Scenario: Reboot
- **WHEN** any visible AI reboots
- **THEN** pixels converge into it with a boot ring at its new position

### Requirement: Low health warning

While the player's AI is below 30% health, the screen edges SHALL pulse with a red vignette.

#### Scenario: Low health
- **WHEN** the player's AI drops to 25 of 100 health
- **THEN** a pulsing red vignette appears at the screen edges until it heals above 30%
