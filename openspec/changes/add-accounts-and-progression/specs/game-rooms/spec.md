# Spec Delta

## Purpose

Runs many takeover.io matches at once in separate rooms, so traffic spreads out, friends can play together with a code, and live events get their own room.

## ADDED Requirements

### Requirement: Separate rooms

The server SHALL run any number of rooms at the same time, each with its own arena, round timer, bots, leaderboard and kill feed. Players SHALL only see and interact with players in their own room.

#### Scenario: Two rooms
- **WHEN** one player is in room A and another in room B
- **THEN** neither appears on the other's screen, leaderboard or kill feed

### Requirement: Matchmaking into public rooms

"Play online" SHALL place the player in the public room with the most people that still has space, holding at most 40 people, and SHALL open a new public room when all are full.

#### Scenario: Busiest room with space
- **WHEN** public rooms have 12 and 39 people and a player presses Play online
- **THEN** they join the room with 39 people

#### Scenario: All full
- **WHEN** every public room has 40 people
- **THEN** a new public room opens and the player joins it

### Requirement: Private rooms with a code

A player SHALL be able to create a private room and get a 5-character code (letters and digits without look-alikes such as O/0 or I/1) to share; others SHALL join with that code from the menu or a link with ?room=CODE. Private rooms SHALL hold up to 120 people and never take matchmaking players.

#### Scenario: Join friends
- **WHEN** a player creates a room and shares the code K7XQP
- **THEN** a friend who enters K7XQP joins the same room

#### Scenario: Wrong code
- **WHEN** a player enters a code that does not match an open room
- **THEN** the menu says the room was not found

#### Scenario: Full private room
- **WHEN** a 121st person tries to join a private room
- **THEN** they see "This room is full." and return to the start menu

### Requirement: Event lobby room

The event lobby screen SHALL create or reuse a private room and show its code, and its QR code SHALL open the game straight into that room. The lobby SHALL list only that room's players.

#### Scenario: Scan to join the event
- **WHEN** someone scans the lobby's QR code
- **THEN** the game opens, joins the event room, and their name appears on the lobby screen

### Requirement: Closing empty rooms

A room SHALL close 60 seconds after its last person leaves; a closed private code SHALL then be reported as not found.

#### Scenario: Everyone left
- **WHEN** the last person leaves a private room and nobody rejoins within 60 seconds
- **THEN** the room closes and its code no longer works
