# Spec Delta

## Purpose

Lets a player choose how to play takeover.io: alone against bot AIs in the browser, or online in one shared arena with strangers.

## ADDED Requirements

### Requirement: Start menu

The game SHALL open on a start menu with a nickname field, a Single player button and a Multiplayer button. The nickname SHALL be trimmed and limited to 16 characters; an empty nickname SHALL be replaced with a random AI-style name.

#### Scenario: Player opens the game
- **WHEN** a player opens the game URL
- **THEN** the start menu shows a nickname field and the Single player and Multiplayer buttons

#### Scenario: Empty nickname
- **WHEN** the player leaves the nickname empty and starts either mode
- **THEN** the player's AI gets a random AI-style name such as "Unit-42"

#### Scenario: Long nickname
- **WHEN** the player types a nickname longer than 16 characters
- **THEN** only the first 16 characters are used

### Requirement: Single player runs in the browser

Single player SHALL run the whole match in the player's browser against bot AIs, with the same rules and round length as multiplayer, and SHALL NOT need a connection to the game server.

#### Scenario: Start single player
- **WHEN** the player presses Single player
- **THEN** a match starts immediately with the player's AI and 7 bot AIs

#### Scenario: Game server unavailable
- **WHEN** the game server is asleep or unreachable and the player presses Single player
- **THEN** the match starts and plays normally

### Requirement: Single player pause

In single player, pressing P or Escape SHALL pause and resume the match; while paused nothing in the arena moves and the round timer stops.

#### Scenario: Pause and resume
- **WHEN** the player presses P during a single-player match and presses P again
- **THEN** the arena freezes with a "Paused" message, then continues from the same state and timer

### Requirement: Multiplayer joins the shared arena

Multiplayer SHALL connect to the game server and place the player's AI in the one shared online arena. While the connection is being made, the game SHALL show a waiting message, because a free server may take up to about a minute to wake.

#### Scenario: Server awake
- **WHEN** the player presses Multiplayer and the server is running
- **THEN** the player's AI appears in the shared arena within a few seconds

#### Scenario: Server waking up
- **WHEN** the player presses Multiplayer and the server is asleep
- **THEN** the game shows "Waking up the datacenter…" until the connection opens, then joins the arena

#### Scenario: Server unreachable
- **WHEN** the connection cannot be opened after 90 seconds or is refused
- **THEN** the game returns to the start menu with a message suggesting Single player

### Requirement: Return to menu

During a match, the player SHALL be able to leave to the start menu; leaving multiplayer SHALL close the connection.

#### Scenario: Leave a match
- **WHEN** the player presses the Menu button or key Q during a match
- **THEN** the match view closes and the start menu appears, keeping the nickname

### Requirement: Touch controls

On phones and tablets, each finger SHALL be tracked separately. In joystick mode (the default), the first touch on the left part of the screen SHALL become a floating joystick that moves the AI, while big Dash and Item buttons on the right fire instantly; a tap on an enemy SHALL focus it. A Controls setting SHALL switch to follow mode, where the first finger steers like the mouse.

#### Scenario: Joystick and dash at once
- **WHEN** the player holds the joystick with the left thumb and taps Dash with the right thumb
- **THEN** the AI dashes while the joystick keeps steering it

#### Scenario: Tap to focus
- **WHEN** the player, holding the joystick, taps an enemy AI with another finger
- **THEN** that enemy becomes the focus target and the joystick is not interrupted

#### Scenario: Follow mode
- **WHEN** the player switches touch movement to "Follow finger" in Controls and touches the screen
- **THEN** the AI moves toward that finger, and a second finger does not take over steering
