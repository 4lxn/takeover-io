# Spec Delta

## MODIFIED Requirements

### Requirement: Multiplayer joins the shared arena

Multiplayer SHALL connect to the game server and place the player's AI in an online room: "Play online" matchmakes into a public room, and a room code (typed in the menu or from a ?room= link) joins that private room, as defined in `game-rooms`. While the connection is being made, the game SHALL show a waiting message, because a free server may take up to about a minute to wake.

#### Scenario: Server awake
- **WHEN** the player presses Multiplayer and the server is running
- **THEN** the player's AI appears in a public room within a few seconds

#### Scenario: Server waking up
- **WHEN** the player presses Multiplayer and the server is asleep
- **THEN** the game shows "Waking up the datacenter…" until the connection opens, then joins a room

#### Scenario: Server unreachable
- **WHEN** the connection keeps failing or being refused for 90 seconds (it retries every 2 seconds meanwhile, because a sleeping server refuses connections while it wakes)
- **THEN** the game returns to the start menu with a message suggesting Single player

#### Scenario: Opened from a room link
- **WHEN** the game is opened with ?room=K7XQP for an open room
- **THEN** after the menu's nickname step it joins room K7XQP instead of matchmaking
