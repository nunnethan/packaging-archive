#!/bin/sh
# Makes the two web images for one item from an original photo.
# Usage: scripts/add-image.sh path/to/original.jpg MCDPKG0123
# Writes images/MCDPKG0123-1200.webp and images/MCDPKG0123-600.webp
# (longest edge 1,200px and 600px, WebP quality 80). The original is not changed.
# Needs cwebp: brew install webp
set -e

src="$1"
id="$2"
if [ -z "$src" ] || [ -z "$id" ]; then
  echo "Usage: scripts/add-image.sh path/to/original.jpg MCDPKG0123" >&2
  exit 1
fi

cd "$(dirname "$0")/.."
w=$(sips -g pixelWidth "$src" | awk '/pixelWidth/{print $2}')
h=$(sips -g pixelHeight "$src" | awk '/pixelHeight/{print $2}')

for size in 1200 600; do
  if [ "$w" -ge "$h" ]; then dims="$(( w < size ? w : size )) 0"; else dims="0 $(( h < size ? h : size ))"; fi
  cwebp -quiet -q 80 -metadata none -resize $dims "$src" -o "images/$id-$size.webp"
  echo "Wrote images/$id-$size.webp"
done
