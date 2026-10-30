# Spec Delta

## Purpose

Gives every takeover.io player an account, starting as an automatic guest and upgradable with Apple, Google or email, so progress is saved and follows them across devices.

## ADDED Requirements

### Requirement: Automatic guest account

On first launch the game SHALL create a guest account without asking anything, so progress is saved from the first match. The game SHALL stay fully playable when the account service is unreachable; in that case progress is simply not saved.

#### Scenario: First launch
- **WHEN** a new player opens the game for the first time
- **THEN** a guest account is created in the background and the menu shows "Guest" with a "Save your progress" prompt

#### Scenario: Account service down
- **WHEN** the account service cannot be reached
- **THEN** single player and multiplayer still work, and the menu says progress is not being saved right now

### Requirement: Upgrade a guest account

A guest SHALL be able to upgrade their account with Sign in with Apple, Google sign-in or an email code, keeping all their progress on the same account.

#### Scenario: Upgrade with Google
- **WHEN** a guest with 900 lifetime XP signs in with Google from the menu
- **THEN** the account now shows the Google identity and still has 900 lifetime XP

#### Scenario: Upgrade with an email code
- **WHEN** a guest enters their email and then the 6-digit code they received
- **THEN** the account is linked to that email and keeps its progress

### Requirement: Sign in on another device

A player SHALL be able to sign in to an existing account with Apple, Google or an email code on any device and get their progress. If the device's guest account has 100 or more lifetime XP, the game SHALL warn that the guest progress will be left behind before switching.

#### Scenario: Second device
- **WHEN** a player signs in on a new phone with the Google account they used on their laptop
- **THEN** their lifetime XP, account level, unlocked skins and selected skin appear on the phone

#### Scenario: Guest progress at stake
- **WHEN** a guest with 300 lifetime XP chooses to sign in to a different existing account
- **THEN** the game warns that the 300 guest XP will not be carried over and asks to confirm

### Requirement: Stay signed in and sign out

The game SHALL keep the player signed in between visits and SHALL offer a sign-out that returns the device to a new guest account.

#### Scenario: Coming back
- **WHEN** a signed-in player closes the game and opens it the next day
- **THEN** they are still signed in

#### Scenario: Sign out
- **WHEN** the player signs out
- **THEN** the device starts a fresh guest account and the previous account's progress is no longer shown

### Requirement: Display name

Each account SHALL have a display name of 1 to 16 characters, without control characters and not on a blocklist of offensive words, used as the default nickname in matches and on leaderboards. Names do not have to be unique.

#### Scenario: Change name
- **WHEN** the player changes their display name to "NeoCore"
- **THEN** it is saved to the account and prefilled as their nickname on every device

#### Scenario: Blocked name
- **WHEN** the player tries a name containing a blocked word
- **THEN** the name is rejected with a message and the previous name is kept

### Requirement: Delete account

A signed-in player SHALL be able to delete their account from the game. Deletion SHALL remove the account, profile, progression and match history permanently, after an explicit confirmation.

#### Scenario: Delete
- **WHEN** the player chooses Delete account and confirms by typing DELETE
- **THEN** all their data is removed, they no longer appear on leaderboards, and the device starts a fresh guest account

### Requirement: Verified identity in multiplayer

When joining multiplayer, the client SHALL send its access token and the server SHALL verify it before attributing any progress. A missing, expired or invalid token SHALL let the player play as an unverified guest who earns no account progress.

#### Scenario: Forged token
- **WHEN** a client joins with a made-up token claiming another user's id
- **THEN** the server rejects the token, the player can still play, and no XP is credited to anyone

#### Scenario: Valid token
- **WHEN** a signed-in player joins
- **THEN** the server attributes that player's round results to their account
