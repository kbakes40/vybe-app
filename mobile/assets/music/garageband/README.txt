GarageBand export drop folder (Vybe home "Vinyls" carousel).

Pair each stem or bounce with cover art using the SAME basename:
  my_song.m4a   (or .mp3)
  my_song.jpg   (high-res / 4K cover — list + background decode downscaled via expo-image)

Then register BOTH files in:
  mobile/src/constants/garagebandLibrary.ts
using require() for each (Metro cannot discover files at runtime).

Optional extra Home tiles (no bundled demos): set `GARAGEBAND_SHOWCASE_DECK` in
`mobile/src/constants/garagebandShowcaseDeck.ts` from your own API when ready.
Resolved `GARAGEBAND_VINYLS` assets always list first; showcase entries append after.
