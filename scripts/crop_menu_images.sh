#!/usr/bin/env bash
set -euo pipefail

SRC="attached_assets"
OUT="frontend/public/menu-images"
mkdir -p "$OUT"

IMG1="$SRC/Screenshot_2026-04-29_090404_1777424715180.png"
IMG2="$SRC/Screenshot_2026-04-29_090409_1777424723938.png"
IMG5="$SRC/Screenshot_2026-04-29_090428_1777424729914.png"
IMG6="$SRC/Screenshot_2026-04-29_090435_1777424731520.png"

crop() {
  local x="$1" y="$2" w="$3" h="$4" src="$5" dest="$6"
  magick "$src" -crop "${w}x${h}+${x}+${y}" +repage -strip -resize "480x" -quality 82 "$dest"
}

# IMG1 - Farm's Menu page 1 (557x788) - 3 rows x 2 circles
# Captions start ~y=255 / y=455 / y=650, so use h=130 to stay above text
crop 120 120 145 130 "$IMG1" "$OUT/kocha-char-koay-teow.jpg"
crop 295 120 145 130 "$IMG1" "$OUT/spaghetti-stir-fried.jpg"
crop 120 320 145 130 "$IMG1" "$OUT/kampung-eggs.jpg"
crop 295 320 145 130 "$IMG1" "$OUT/farm-herbal-soup.jpg"
crop 120 515 145 130 "$IMG1" "$OUT/meesua-herbal-soup.jpg"
crop 295 515 145 130 "$IMG1" "$OUT/small-bites-hummus.jpg"

# IMG2 - Farm's Menu page 2 (555x789)
crop 150 110 135 135 "$IMG2" "$OUT/papa-sandwich.jpg"
crop 325 110 135 135 "$IMG2" "$OUT/mushroom-soup.jpg"
crop  55 320 130 125 "$IMG2" "$OUT/jacket-potato.jpg"
crop 210 320 130 125 "$IMG2" "$OUT/mummy-farm-salad.jpg"
crop 365 320 130 125 "$IMG2" "$OUT/farm-herbal-fried-rice.jpg"
crop 150 505 135 135 "$IMG2" "$OUT/ah-ma-curry.jpg"
crop 325 505 135 135 "$IMG2" "$OUT/spaghetti-carbonara.jpg"

# IMG5 - Enzyme Drinks (555x787) - bottle photo only, exclude price pill
crop  15 240 130 130 "$IMG5" "$OUT/d-passion.jpg"
crop 275 240 130 130 "$IMG5" "$OUT/le-mulberry.jpg"
crop  15 425 130 130 "$IMG5" "$OUT/nutmeg-fantasy.jpg"
crop 275 425 130 130 "$IMG5" "$OUT/tropicana.jpg"
crop  15 610 130 130 "$IMG5" "$OUT/rising-sun.jpg"
crop 275 610 130 130 "$IMG5" "$OUT/colour-of-night.jpg"

# IMG6 - Steamboat: just the pot, avoid title text and side panel
crop 140 410 220 175 "$IMG6" "$OUT/vegetarian-herbal-steamboat.jpg"

echo "Done."
