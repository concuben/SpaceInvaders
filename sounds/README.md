# Custom Sound Files

Add your custom sound files to this directory. The game expects the following audio files:

## Required Sound Files

Place your sound files in this folder with these exact names:

1. **shoot.mp3** - Player shooting sound
2. **explosion.mp3** - Enemy explosion sound
3. **enemy-shoot.mp3** - Enemy shooting sound
4. **hit.mp3** - Player getting hit sound
5. **level-up.mp3** - Level complete/victory sound
6. **game-over.mp3** - Game over sound

## Supported Formats

You can use these audio formats:
- `.mp3` (recommended for best browser compatibility)
- `.wav`
- `.ogg`

**Note:** If using a different format, update the file extensions in `game.js` (lines 61-66).

## Tips for Good Game Sounds

- Keep sounds short (0.1-0.5 seconds for effects, 1-2 seconds for events)
- Use a consistent volume level across all sounds
- The game sets volume to 30% by default (adjustable in game.js line 71)
- Classic arcade sounds work best!

## Where to Find Sound Effects

Free sound effect resources:
- [Freesound.org](https://freesound.org)
- [Zapsplat.com](https://www.zapsplat.com)
- [OpenGameArt.org](https://opengameart.org)
- [SFXR](https://sfxr.me) - Generate retro game sounds

## Current Status

The game will still work if sound files are missing - it will just log errors to the console and continue playing silently.
