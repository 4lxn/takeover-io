# arena-match Specification

## Purpose

Defines the core loop of a takeover.io match: AIs move around a datacenter arena, collect data, fire at each other, get deleted and reboot, and compete for the most XP before the round ends.

## Requirements

### Requirement: Arena and camera

A match SHALL take place in a square arena larger than the screen, bounded by walls that no AI can cross. Each player's view SHALL follow their own AI.

#### Scenario: Reaching the edge
- **WHEN** an AI moves into the arena wall
- **THEN** it stops at the wall and stays inside the arena

#### Scenario: Camera follows
- **WHEN** the player's AI moves
- **THEN** the view scrolls so the AI stays at the center of the screen, except near the walls where the view stays inside the arena

### Requirement: Pointer movement

An AI SHALL move toward the player's pointer (mouse or touch) at its current speed; when the pointer is over the AI itself, the AI SHALL stop. AIs SHALL pass through each other without colliding.

#### Scenario: Steer with the mouse
- **WHEN** the player holds the pointer to the right of their AI
- **THEN** the AI moves right until the pointer is moved or placed over it

#### Scenario: Steer with touch
- **WHEN** the player touches and drags on a phone screen
- **THEN** the AI moves toward the touch point

### Requirement: Data packets

The arena SHALL keep a steady supply of data packets scattered at random positions. An AI that touches a data packet SHALL collect it and gain 1 XP, and a new packet SHALL appear elsewhere so the supply stays constant.

#### Scenario: Collect a packet
- **WHEN** an AI touches a data packet
- **THEN** the packet disappears, the AI gains 1 XP and a new packet appears at a random position

### Requirement: Levels and size

XP SHALL raise an AI's level, each level needing more XP than the previous one. Every level gained SHALL grant one upgrade choice, or an augment choice on every third level (see `upgrades`), and make the AI visibly larger, which also makes it easier to hit.

#### Scenario: Level up
- **WHEN** an AI's XP reaches the threshold for the next level
- **THEN** its level increases by 1, its size grows and it receives one upgrade choice

#### Scenario: Several levels at once
- **WHEN** an AI gains enough XP for two levels at once
- **THEN** it gains both levels and receives two upgrade choices, offered one after the other

### Requirement: Automatic fire

An AI SHALL fire automatically at the nearest other AI within its range, at its current fire rate. Projectiles SHALL travel in a straight line, damage the first other AI they touch, and disappear on a hit or at the end of their range. An AI SHALL never be hit by its own projectiles and SHALL NOT fire when no other AI is within range.

#### Scenario: Enemy in range
- **WHEN** another AI is within the player's range
- **THEN** the player's AI fires at it repeatedly at its fire rate

#### Scenario: Nobody in range
- **WHEN** no other AI is within range
- **THEN** the AI does not fire

#### Scenario: Projectile hits
- **WHEN** a projectile touches another AI
- **THEN** that AI loses health equal to the shooter's damage and the projectile disappears

### Requirement: Deletion and reboot

An AI whose health reaches 0 SHALL be deleted. The AI that dealt the final hit SHALL gain 10 XP plus half of the deleted AI's XP, plus 10 XP per streak kill when the deleted AI had a streak of 3 or more (a shutdown); the other half of the deleted AI's XP SHALL drop as data packets. The deleted AI SHALL lose all XP, levels, upgrades, augments and its item, then reboot after 3 seconds at a random position with full health and 2 seconds of protection.

#### Scenario: Delete another AI
- **WHEN** the player's projectile brings an AI holding 40 XP to 0 health
- **THEN** the player gains 30 XP (10 + 20), about 20 XP worth of data packets drop at that spot and the kill feed shows the deletion

#### Scenario: Shutdown bounty
- **WHEN** the player deletes an AI with 0 XP that was on a streak of 4
- **THEN** the player gains 50 XP (10 + 0 + 4 × 10) and the deletion counts as a shutdown

#### Scenario: Get deleted
- **WHEN** the player's AI is deleted
- **THEN** a reboot screen with a progress bar shows for 3 seconds (see `game-feedback`), then the AI reappears at level 1 with 0 XP, blinking while protected for 2 seconds

#### Scenario: Protected after reboot
- **WHEN** a projectile hits an AI within 2 seconds of its reboot
- **THEN** the AI takes no damage

### Requirement: Critical hits

Each projectile SHALL have a 10% base chance to be a critical hit that deals double damage. Augments may raise the chance or the multiplier (see `upgrades`).

#### Scenario: Critical hit
- **WHEN** a critical projectile from an AI that deals 10 damage hits another AI
- **THEN** the target loses 20 health and the hit is reported as a crit

### Requirement: Kill streaks and announcements

An AI's streak SHALL count its deletions since it last rebooted. A deletion SHALL be announced to everyone with the killer's name and, in priority order: SHUTDOWN (victim streak 3+), MASS DEPRECATION, TRIPLE DELETE or DOUBLE DELETE (4+, 3 or 2 deletions within 5 seconds of each other), FIRST BREACH (first deletion of the round), or ROGUE PROCESS, UNSTOPPABLE, SINGULARITY (streak of 3, 5, 7).

#### Scenario: Double delete
- **WHEN** an AI deletes two AIs within 5 seconds
- **THEN** every player sees "DOUBLE DELETE" with that AI's name

#### Scenario: Streak reset
- **WHEN** an AI on a streak of 4 is deleted
- **THEN** its streak returns to 0 and its killer gets a SHUTDOWN announcement

### Requirement: Dash

A player SHALL dash with Shift, the right mouse button or the Dash button: a 0.22-second burst at 3.5 times their speed in the movement direction, then a 3-second cooldown. While dashing, the AI SHALL take no damage and ignore thrown items. A projectile or thrown item that reaches a dashing AI SHALL count as a perfect dodge and reset the dash cooldown.

#### Scenario: Dash through a shot
- **WHEN** a projectile reaches the player's AI during its dash
- **THEN** the AI takes no damage, the shot passes through, "PERFECT DODGE" is shown and the dash is ready again

#### Scenario: Cooldown
- **WHEN** the player dashes and presses Shift again 1 second later without a perfect dodge
- **THEN** nothing happens until the 3-second cooldown ends

### Requirement: Focus target

Clicking or tapping an enemy AI SHALL make it the player's focus target: automatic fire SHALL shoot at it whenever it is within range, and at the nearest AI otherwise. Clicking empty ground SHALL clear the focus.

#### Scenario: Focus a farther enemy
- **WHEN** the player focuses an enemy within range while another enemy is closer
- **THEN** the player's AI fires at the focused enemy

#### Scenario: Clear focus
- **WHEN** the player clicks empty ground
- **THEN** automatic fire goes back to the nearest AI

### Requirement: Rounds and takeover

Each round SHALL last 5 minutes, shown as a countdown. When it ends, the AI with the most XP SHALL win, with ties going to the AI with more deletions. A takeover screen SHALL show the winner and the top 3 for 10 seconds while nothing moves; then a new round SHALL start with every AI reset to level 1, 0 XP, no upgrades, no item, at a random position.

#### Scenario: Round ends
- **WHEN** the round countdown reaches 0
- **THEN** the screen shows "TAKEOVER: <winner> controls the datacenter" with the top 3, and after 10 seconds a new round starts with everything reset

#### Scenario: Joining during the takeover screen
- **WHEN** a player joins the shared arena while the takeover screen is showing
- **THEN** they see the takeover screen and enter the new round when it starts

### Requirement: Leaderboard and kill feed

The HUD SHALL show a live leaderboard of the top 5 AIs by XP, plus the player's own rank if they are not in the top 5, and a kill feed of the last 4 notable events with AI verbs (for example "Unit-07 deprecated Qubit").

#### Scenario: Outside the top 5
- **WHEN** the player is 9th by XP
- **THEN** the leaderboard shows the top 5 and a separate line "9. <nickname> <xp>"

#### Scenario: Deletion in the feed
- **WHEN** any AI deletes another
- **THEN** a line naming both AIs appears at the top of the kill feed and fades out after about 6 seconds
