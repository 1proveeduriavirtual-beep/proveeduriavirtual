#!/usr/bin/env bash
# Lee el texto de cada página de las revistas con Tesseract (gratis).
# Antes de leer: alta resolución, blanco y negro, más contraste y nitidez (menos errores con los números).
# Deja por página: texto (.txt), palabras con posición y confianza (.tsv) y una vista previa chica (.jpg).
set -u
mkdir -p ofertas/paginas
for f in ofertas/raw/*/*; do
  [ -f "$f" ] || continue
  tienda=$(basename "$(dirname "$f")"); base=$(basename "$f"); base=${base%.*}
  tmp=$(mktemp -d)
  if [[ "$f" == *.pdf ]]; then pdftoppm -r 300 -png "$f" "$tmp/p" || { rm -rf "$tmp"; continue; }
  else magick "$f" "$tmp/p-1.png"; fi
  for img in "$tmp"/p*.png; do
    pag=$(basename "$img" .png); pag=${pag#p-}
    out="ofertas/paginas/${tienda}-${base}-${pag}"
    magick "$img" -colorspace Gray -resize 150% -normalize -sharpen 0x1 "$tmp/limpia.png"
    tesseract "$tmp/limpia.png" "$out" -l spa --psm 11 txt tsv >/dev/null 2>&1
    magick "$img" -resize 900x -quality 55 "$out.jpg"
    echo "leída $out"
  done
  rm -rf "$tmp"
done
