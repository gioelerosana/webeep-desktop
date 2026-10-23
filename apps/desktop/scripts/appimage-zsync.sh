#!/usr/bin/env bash
# Rende l'AppImage aggiornabile dai manager zsync (AppImageUpdate, Gear Lever, AppImageLauncher).
#
# electron-builder 26 non incorpora le "update information" e non genera il file .zsync:
# lo facciamo qui. L'AppImage appena costruita viene estratta (--appimage-extract, senza FUSE)
# e reimpacchettata con appimagetool, che scrive le update information nel runtime e genera
# il .zsync accanto al file. Il contenuto dell'app non cambia.
#
# Il repack cambia sha512 e dimensione del file: latest-linux.yml va riscritto, altrimenti
# l'app che legge quel manifest vedrebbe una somma diversa da quella dell'AppImage pubblicata.
# Il blockmap incorporato da electron-builder va perso con il repack: `blockMapSize` si toglie
# dal manifest, così i client non cercano un blockmap che non c'è più.
#
# Uso: appimage-zsync.sh [cartella release]   (default: apps/desktop/release)
# Variabili: APPIMAGETOOL (percorso di appimagetool; default `appimagetool` nel PATH).
set -euo pipefail

# Il glob deve corrispondere al nome che electron-builder dà all'AppImage (arch x86_64) e
# al .zsync pubblicato accanto. Il formato gh-releases-zsync cerca l'asset in `latest`.
readonly UPDATE_INFO='gh-releases-zsync|gioelerosana|webeep-desktop|latest|WeBeep-Desktop-*-x86_64.AppImage.zsync'
readonly APPIMAGE_GLOB='WeBeep-Desktop-*-x86_64.AppImage'
readonly LATEST_MANIFEST='latest-linux.yml'

die() {
  echo "appimage-zsync: $*" >&2
  exit 1
}

release_dir="${1:-apps/desktop/release}"

mapfile -t images < <(find "$release_dir" -maxdepth 1 -name "$APPIMAGE_GLOB" -type f)
# Più AppImage nella stessa cartella significherebbe un repack alla cieca: meglio fermarsi.
[[ ${#images[@]} -eq 1 ]] || die "attesa una sola AppImage in $release_dir, trovate ${#images[@]}"

src="$(realpath "${images[0]}")"
name="$(basename "$src")"
manifest="$release_dir/$LATEST_MANIFEST"
[[ -f "$manifest" ]] || die "manca $manifest"

tool_name="${APPIMAGETOOL:-appimagetool}"
command -v "$tool_name" >/dev/null || die "appimagetool non trovato (vedi docs/UPDATES.md)"
# Percorso assoluto: il comando gira dentro una sottocartella, un percorso relativo si romperebbe.
tool="$(realpath "$(command -v "$tool_name")")"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

cp "$src" "$work/original.AppImage"
chmod +x "$work/original.AppImage"
(cd "$work" && ./original.AppImage --appimage-extract >/dev/null)
[[ -d "$work/squashfs-root" ]] || die "estrazione dell'AppImage fallita"

# appimagetool scrive il .zsync nella cartella corrente, quindi lo si lancia dentro `out/`.
mkdir "$work/out"
(
  cd "$work/out"
  # Senza FUSE (runner CI) appimagetool va eseguito in modalità estrazione.
  APPIMAGE_EXTRACT_AND_RUN=1 ARCH=x86_64 "$tool" -u "$UPDATE_INFO" "$work/squashfs-root" "$name"
)

repacked="$work/out/$name"
zsync="$repacked.zsync"
# Il controllo sull'exit code non basta: senza zsyncmake appimagetool va a buon fine lo stesso.
[[ -f "$repacked" && -f "$zsync" ]] || die "appimagetool non ha prodotto $name e $name.zsync (zsyncmake manca?)"
grep -q -F -a -- "$UPDATE_INFO" "$repacked" || die "update information non incorporate in $name"
"$repacked" --appimage-version >/dev/null || die "il nuovo $name non parte"

mv -f "$repacked" "$release_dir/$name"
mv -f "$zsync" "$release_dir/$name.zsync"

sha512="$(openssl dgst -sha512 -binary "$release_dir/$name" | base64 -w 0)"
size="$(stat -c %s "$release_dir/$name")"
sed -i -E \
  -e "s#^(\s*sha512: ).*#\1$sha512#" \
  -e "s#^(\s*size: ).*#\1$size#" \
  -e '/^\s*blockMapSize:/d' \
  "$manifest"
grep -q -F "sha512: $sha512" "$manifest" || die "sha512 non aggiornato in $manifest"
grep -q -F "size: $size" "$manifest" || die "size non aggiornata in $manifest"

echo "appimage-zsync: $name reimpacchettata con update information e $name.zsync (size $size)"
