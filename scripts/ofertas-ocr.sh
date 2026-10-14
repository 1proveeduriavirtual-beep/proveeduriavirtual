#!/usr/bin/env bash
# Lee el texto de cada página de las revistas con Tesseract (gratis).
# Rápido: 200 dpi, varias páginas a la vez (una por núcleo) y un tope de tiempo total.
# Si se acaba el tiempo, se queda con lo que ya leyó (no se pierde la corrida).
# Deja por página: palabras con posición y confianza (.tsv), texto (.txt) y una vista previa chica (.jpg).
set -u
mkdir -p ofertas/paginas ofertas/png
TOPE=${TOPE_MIN:-30}        # minutos máximos leyendo
MAXPAG=${MAX_PAGINAS:-60}   # páginas máximas por revista
# 1) Pasar todo a imágenes
for f in ofertas/raw/*/*; do
  [ -f "$f" ] || continue
  tienda=$(basename "$(dirname "$f")"); base=$(basename "$f"); base=${base%.*}
  if [[ "$f" == *.pdf ]]; then timeout 120 pdftoppm -r 200 -l "$MAXPAG" -png "$f" "ofertas/png/${tienda}-${base}" || true
  else magick "$f" "ofertas/png/${tienda}-${base}-1.png" || true; fi
done
echo "Páginas para leer: $(ls ofertas/png/*.png 2>/dev/null | wc -l)"
# 2) Leer en paralelo
leer() {
  img="$1"; out="ofertas/paginas/$(basename "$img" .png)"
  [ -f "$out.tsv" ] && return
  magick "$img" -colorspace Gray -normalize -sharpen 0x1 "$img.g.png" &&
  OMP_THREAD_LIMIT=1 timeout 90 tesseract "$img.g.png" "$out" -l spa --psm 11 txt tsv >/dev/null 2>&1
  magick "$img" -resize 900x -quality 55 "$out.jpg" 2>/dev/null
  rm -f "$img.g.png"; echo "leída $out"
}
export -f leer
ls ofertas/png/*.png 2>/dev/null | timeout "${TOPE}m" xargs -P "$(nproc)" -I{} bash -c 'leer "$@"' _ {} || echo "Se terminó el tiempo: sigo con lo que ya leí."
rm -rf ofertas/png
echo "Páginas leídas: $(ls ofertas/paginas/*.tsv 2>/dev/null | wc -l)"
exit 0
