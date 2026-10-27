# Spec Delta

## Purpose

Defines how people join, play in and leave the one shared online takeover.io arena, and how the server protects the match from untrusted input.

## ADDED Requirements

### Requirement: One shared arena

The server SHALL run exactly one shared arena. A person joining SHALL enter it at once with their nickname, at level 1 and a random position, in whatever round is in progress.

#### Scenario: Join mid-round
- **WHEN** a person joins with 2 minutes left in the round
- **THEN** their AI appears at level 1 and the HUD shows the same 2-minute countdown as everyone else

### Requirement: Capacity

The shared arena SHALL accept at most 20 people at once. Anyone trying to join a full arena SHALL be turned away with a message.

#### Scenario: Full arena
- **WHEN** a 21st person tries to join
- **THEN** they see "The datacenter is full. Try Single player or come back later." and return to the start menu

### Requirement: Leaving

When a person disconnects or leaves to the menu, their AI SHALL disappear from the arena at once without dropping data, and bots SHALL top the arena back up as defined in `bots`.

#### Scenario: Closing the tab
- **WHEN** a person closes the browser tab
- **THEN** their AI vanishes from everyone's screen within about a second

### Requirement: Server decides every outcome

The server SHALL decide all positions, hits, health, XP, levels, upgrades, items and round results. A client SHALL only send its pointer direction, item use, upgrade pick, dash and focus target, and SHALL show what the server reports.

#### Scenario: Tampered client
- **WHEN** a modified client sends a message claiming a position, health or XP
- **THEN** the server ignores those fields and the AI's state does not change

### Requirement: Validate untrusted input

The server SHALL ignore any message that is not valid JSON, has an unknown type, or has values out of range (for example a pointer direction longer than 1, an upgrade pick other than 0, 1 or 2, a dash that is not a boolean, or a focus that is not a non-negative integer). A connection that sends a message larger than 512 bytes or more than 60 messages per second SHALL be closed. Nicknames SHALL have control characters removed and be cut to 16 characters.

#### Scenario: Malformed message
- **WHEN** a client sends text that is not valid JSON
- **THEN** the server ignores it and the connection stays open

#### Scenario: Message flood
- **WHEN** a client sends 200 messages in one second
- **THEN** the server closes that connection and removes its AI

#### Scenario: Strange nickname
- **WHEN** a client joins with a nickname containing line breaks and 40 characters
- **THEN** the line breaks are removed and the name is cut to 16 characters

### Requirement: Smooth updates

Each client SHALL receive state updates at least 10 times per second and SHALL show the other AIs moving smoothly between updates.

#### Scenario: Watching another AI
- **WHEN** another AI crosses the screen at full speed
- **THEN** it moves smoothly, without visible jumps, on a normal home connection
