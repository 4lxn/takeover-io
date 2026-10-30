# Spec Delta

## Purpose

Saves each takeover.io player's long-term progress on their account (lifetime XP, account level, skin unlocks, stats, history and leaderboards) in a way modified clients cannot inflate in multiplayer and can only marginally inflate in single player.

## ADDED Requirements

### Requirement: Lifetime XP and account level

Each account SHALL have lifetime XP that only grows, and an account level derived from it as floor(sqrt(lifetime XP / 100)) + 1. The menu SHALL show the level, lifetime XP and progress to the next level.

#### Scenario: Level from lifetime XP
- **WHEN** an account reaches 400 lifetime XP
- **THEN** its account level is 3

### Requirement: Multiplayer XP credited by the server

For each signed-in or guest account verified in a multiplayer room, the server SHALL credit the XP the player earned during the round (the sum of XP gains, not reduced by being deleted or prompt-injected) when the round ends, or when the player leaves mid-round. A single round SHALL credit at most 3000 XP. The client SHALL show how much was saved.

#### Scenario: Round ends
- **WHEN** a verified player earned 240 XP during a round that ends
- **THEN** 240 is added to their lifetime XP and the takeover screen shows "+240 XP saved"

#### Scenario: Leaving mid-round
- **WHEN** a verified player who earned 90 XP closes the tab mid-round
- **THEN** 90 XP is added to their lifetime XP

#### Scenario: Deleted late in the round
- **WHEN** a player earned 300 XP and was deleted just before the round ended
- **THEN** 300 XP is still credited, even though their in-match XP was 0 at the end

### Requirement: Single-player XP with caps

Single player SHALL credit the XP earned in each finished or abandoned match to the account, at most 600 XP per match and 1500 XP per UTC day across all single-player matches. Matches played while the account service is unreachable SHALL NOT be credited.

#### Scenario: Daily cap
- **WHEN** a player has already been credited 1400 single-player XP today and finishes a match with 500 XP
- **THEN** only 100 XP is credited and the menu says the single-player daily limit is reached

### Requirement: Skin unlocks follow the account

Skin tiers SHALL unlock from the account's lifetime XP at 0, 150, 400, 800, 1300, 2000, 3000, 4200 and 6000 XP for tiers 1 to 9, and the selected skin SHALL be saved to the account. The server SHALL only show a skin in multiplayer if the account has unlocked it.

#### Scenario: Unlock on another device
- **WHEN** a player unlocks the tier-4 skin on their laptop and opens the game on their phone
- **THEN** the tier-4 skin is unlocked and selected on the phone too

#### Scenario: Locked skin requested
- **WHEN** a client asks to use a tier-9 skin for an account with 500 lifetime XP
- **THEN** the server shows that player with their class body instead

### Requirement: Stats and match history

The account SHALL record games played, takeovers (rounds won), deletions, times deleted and best round XP, and keep a history of the last 20 matches with mode, XP, deletions and placement. The profile screen SHALL show them.

#### Scenario: Takeover counted
- **WHEN** a verified player wins a multiplayer round
- **THEN** their takeovers count goes up by 1 and the match appears first in their history

### Requirement: Leaderboards

The menu SHALL show an all-time top 50 by lifetime XP and a weekly top 50 by XP credited in the last 7 days, with display names only, plus the player's own position when signed in.

#### Scenario: Weekly board
- **WHEN** a player earns the most credited XP over the last 7 days
- **THEN** they appear first on the weekly leaderboard

### Requirement: Import local progress once

The first time a device with progress stored by the earlier version of the game gets an account, the game SHALL import that local lifetime XP once, capped at 6000, and then stop using local storage for progress.

#### Scenario: Existing player upgrades the game
- **WHEN** a player who had 2200 lifetime XP saved in the browser opens the new version
- **THEN** their account starts with 2200 lifetime XP and the import never happens again for that account
