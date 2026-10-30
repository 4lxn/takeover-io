# Spec Delta

## REMOVED Requirements

### Requirement: One shared arena

**Reason**: The server now runs many rooms (see `game-rooms`), so there is no longer exactly one shared arena.

**Migration**: Joining mid-round in a room behaves the same way, as defined in `game-rooms` ("Separate rooms") and `game-modes` ("Multiplayer joins the shared arena").

### Requirement: Capacity

**Reason**: Capacity is now per room: 40 people in public rooms (matchmaking opens a new room when all are full) and 120 in private or event rooms, as defined in `game-rooms`.

**Migration**: A full private room shows the same "full" message; a full public room is never reported to the player because matchmaking opens another.
