#!/usr/bin/env bash
# Lee el texto de cada página de las revistas con Tesseract (gratis).
# Rápido: 200 dpi, varias páginas a la vez (una por núcleo) y un tope de tiempo total.
# Si se acaba el tiempo, se queda con lo que ya leyó (no se pierde la corrida).
# Deja por página: palabras con posición y confianza (.tsv), texto (.txt) y una vista previa chica (.jpg).
set -u
mkdir -p ofertas/paginas ofertas/png
TOPE=${TOPE_MIN:-15}        # minutos máximos leyendo
MAXPAG=${MAX_PAGINAS:-60}   # páginas máximas por revista
# 1) Pasar todo a imágenes
for f in ofertas/raw/*/*; do
  [ -f "$f" ] || continue
  tienda=$(basename "$(dirname "$f")"); base=$(basename "$f"); base=${base%.*}
  if [[ "$f" == *.pdf ]]; then
    # primero el texto que trae el PDF (exacto); solo las páginas sin texto pasan a imagen para Tesseract
    # con IA (clave de Gemini) leemos TODAS las páginas con IA: muchos PDF traen texto suelto pero los productos son fotos
    hechas=""; [ -z "${GEMINI_API_KEY:-}" ] && hechas=$(node "$(dirname "$0")/pdf-texto.mjs" "$f" "ofertas/paginas/${tienda}-${base}" 2>/dev/null)
    [ -n "$hechas" ] && echo "$tienda $base: páginas con texto propio: $hechas"
    timeout 120 pdftoppm -r 200 -l "$MAXPAG" -png "$f" "ofertas/png/${tienda}-${base}" || true
    for n in $hechas; do
      for img in ofertas/png/${tienda}-${base}-*.png; do
        [ "$((10#$(basename "$img" .png | sed 's/.*-//')))" = "$n" ] || continue
        magick "$img" -resize 900x -quality 55 "ofertas/paginas/${tienda}-${base}-${n}.jpg" 2>/dev/null; rm -f "$img"
      done
    done
  else magick "$f" "ofertas/png/${tienda}-${base}-1.png" || true; fi
done
echo "Páginas que son foto: $(ls ofertas/png/*.png 2>/dev/null | wc -l)"
# 2a) Las fotos las lee la inteligencia artificial gratis de GitHub (entiende las revistas mucho mejor)
timeout 45m node "$(dirname "$0")/ofertas-ia.mjs" || true
echo "Páginas para el lector común: $(ls ofertas/png/*.png 2>/dev/null | wc -l)"
# 2b) Lo que quede, con Tesseract en paralelo
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
