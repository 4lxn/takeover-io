# Spec Delta

## Purpose

Keeps every takeover.io arena lively by filling it with bot AIs that play by the same rules as people, so single player has opponents and a quiet multiplayer arena never feels empty.

## ADDED Requirements

### Requirement: Arena population

Single player SHALL always have 7 bot AIs. The shared multiplayer arena SHALL keep the total number of AIs at 8 by adding bots when fewer than 8 people are connected and removing bots as people join; with 8 or more people it SHALL have no bots.

#### Scenario: One person online
- **WHEN** one person is in the shared arena
- **THEN** 7 bots are also in the arena

#### Scenario: A person joins
- **WHEN** a person joins a shared arena that has 3 people and 5 bots
- **THEN** one bot leaves and the arena has 4 people and 4 bots

#### Scenario: Busy arena
- **WHEN** 10 people are in the shared arena
- **THEN** there are no bots

### Requirement: Same rules as people

Bots SHALL follow the same rules as human AIs: same movement, automatic fire, XP, levels, upgrades, items, deletion and reboot. They SHALL have AI-style names (such as "Qubit" or "Tensor") and appear in the leaderboard and kill feed like anyone else.

#### Scenario: Bot on the leaderboard
- **WHEN** a bot has the most XP
- **THEN** it leads the leaderboard and can win the round's takeover

### Requirement: Bot behavior

A bot SHALL collect nearby data packets, chase AIs weaker than itself that come close, move away from stronger AIs that come close, pick up prompt boxes, use its item when a target is in range (self items right away), and pick a random upgrade at every level-up.

#### Scenario: Weaker AI nearby
- **WHEN** an AI with fewer levels than a bot comes within the bot's sight
- **THEN** the bot moves toward it and fires once it is in range

#### Scenario: Stronger AI nearby
- **WHEN** an AI with more levels than a bot comes within the bot's sight
- **THEN** the bot moves away from it

#### Scenario: Nothing around
- **WHEN** no other AI is within the bot's sight
- **THEN** the bot moves toward the nearest data packet or prompt box
