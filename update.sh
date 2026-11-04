#!/usr/bin/env bash
# kontas.download atnaujinimas viena komanda (Linux / macOS).
#
#   bash update.sh            # atnaujina, jei paskelbta naujesne versija
#   bash update.sh --check    # tik parodo, ar yra nauja versija
#   bash update.sh --force    # idiegia paskelbta versija net jei ji ne naujesne
#
# Eiga: patikrina https://kontas.download/latest.json, atsisiuncia archyva ir patikrina jo SHA-256,
# sustabdo programa, padaro duomenu bazes kopija i backups/database/, perkelia senus programos failus
# i backups/previous-<versija>-<laikas>/, iskleidzia nauja versija, perkuria konteineri ir patikrina,
# ar programa atsako. Nepavykus grazina senus failus ir duomenu baze.
# Nekeiciama: web/prisma/ (duomenu baze), .env, docker-compose.override.yml, backups/.
# Naujos lenteles ir stulpeliai sukuriami automatiskai, kai nauja versija atidaro duomenu baze.
set -euo pipefail

FEED="${UPDATE_FEED_URL:-https://kontas.download/latest.json}"
HEALTH_URL="${KONTAS_HEALTH_URL:-http://127.0.0.1:3200/login}"
COMPOSE="${KONTAS_COMPOSE:-docker compose}"
MODE="${1:-}"

cd "$(dirname "$0")"
ROOT="$(pwd)"
log() { printf '[update] %s\n' "$*"; }
die() { printf '[update] KLAIDA: %s\n' "$*" >&2; exit 1; }

if [ -d .git ]; then
  die "sis aplankas yra git kopija. Atnaujinkite: git pull && $COMPOSE up -d --build"
fi
for tool in curl unzip; do command -v "$tool" >/dev/null || die "reikia programos: $tool"; done
if command -v sha256sum >/dev/null; then SHA() { sha256sum "$1" | cut -d' ' -f1; }
elif command -v shasum >/dev/null; then SHA() { shasum -a 256 "$1" | cut -d' ' -f1; }
else die "reikia sha256sum arba shasum"; fi

current="$(head -n1 VERSION 2>/dev/null | tr -d '\r' || true)"
[ -n "$current" ] || current="$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' web/package.json | head -n1)"
[ -n "$current" ] || die "nerasta dabartine versija (VERSION, web/package.json)"

json="$(curl -fsSL --max-time 20 "$FEED")" || die "nepavyko gauti $FEED"
field() { printf '%s' "$json" | tr -d '\n' | sed -n "s/.*\"$1\" *: *\"\([^\"]*\)\".*/\1/p"; }
latest="$(field version)"; url="$(field url)"; sum="$(field sha256)"
printf '%s' "$latest" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || die "netinkamas atnaujinimu failas"
case "$url" in https://*|http://127.0.0.1*|http://localhost*) ;; *) url="${FEED%/*}/$url" ;; esac
printf '%s' "$sum" | grep -Eq '^[0-9a-f]{64}$' || die "atnaujinimu faile nera SHA-256"

newer() { [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -t. -k1,1n -k2,2n -k3,3n | tail -n1)" = "$1" ]; }
log "idiegta: $current, paskelbta: $latest"
if [ "$MODE" = "--check" ]; then
  if newer "$latest" "$current"; then log "yra nauja versija $latest"; else log "naudojate naujausia versija"; fi
  exit 0
fi
if ! newer "$latest" "$current" && [ "$MODE" != "--force" ]; then log "atnaujinti nereikia"; exit 0; fi

stamp="$(date +%Y%m%d-%H%M%S)"
mkdir -p backups/database
work="$(mktemp -d "$ROOT/backups/.update-XXXXXX")"
trap 'rm -rf "$work"' EXIT

log "atsisiunciamas $url"
curl -fL --max-time 600 -o "$work/release.zip" "$url" || die "nepavyko atsisiusti archyvo"
[ "$(SHA "$work/release.zip")" = "$sum" ] || die "archyvo SHA-256 nesutampa, atnaujinimas nutrauktas"
unzip -q "$work/release.zip" -d "$work/new"
src="$work/new/kontas-download-$latest"
[ -f "$src/docker-compose.yml" ] && [ -d "$src/web" ] || die "archyvo turinys netiketas"

log "stabdoma programa"
$COMPOSE stop || true
db_copy=""
if [ -f web/prisma/dev.db ]; then
  db_copy="backups/database/$stamp-before-update-$latest.db"
  cp web/prisma/dev.db "$db_copy"
  for ext in -wal -shm; do [ -f "web/prisma/dev.db$ext" ] && cp "web/prisma/dev.db$ext" "$db_copy$ext"; done
  log "duomenu bazes kopija: $db_copy"
fi

prev="backups/previous-$current-$stamp"
mkdir -p "$prev/web"
keep_root() { case "$1" in .env|docker-compose.override.yml|backups|web) return 0 ;; *) return 1 ;; esac; }
for entry in .[!.]* *; do
  [ -e "$entry" ] || continue
  keep_root "$entry" || mv "$entry" "$prev/"
done
for entry in web/.[!.]* web/*; do
  [ -e "$entry" ] || continue
  [ "$entry" = "web/prisma" ] || mv "$entry" "$prev/web/"
done

rollback() {
  log "atnaujinimas nepavyko, grazinama versija $current"
  $COMPOSE stop || true
  for entry in .[!.]* *; do [ -e "$entry" ] || continue; keep_root "$entry" || rm -rf "$entry"; done
  for entry in web/.[!.]* web/*; do [ -e "$entry" ] || continue; [ "$entry" = "web/prisma" ] || rm -rf "$entry"; done
  for entry in "$prev"/web/.[!.]* "$prev"/web/*; do [ -e "$entry" ] && mv "$entry" web/; done
  rmdir "$prev/web"
  for entry in "$prev"/.[!.]* "$prev"/*; do [ -e "$entry" ] && mv "$entry" .; done
  rmdir "$prev"
  if [ -n "$db_copy" ]; then
    rm -f web/prisma/dev.db-wal web/prisma/dev.db-shm
    cp "$db_copy" web/prisma/dev.db
    for ext in -wal -shm; do [ -f "$db_copy$ext" ] && cp "$db_copy$ext" "web/prisma/dev.db$ext"; done
  fi
  $COMPOSE up -d --build || true
  die "grazinta versija $current; duomenu bazes kopija: ${db_copy:-nera}"
}

log "diegiama versija $latest"
rm -f "$src/web/prisma/.gitkeep"
( cd "$src" && tar cf - . ) | tar xf - || rollback
$COMPOSE up -d --build || rollback

log "laukiama, kol programa atsakys ($HEALTH_URL)"
for _ in $(seq 1 90); do
  if curl -fsS -o /dev/null --max-time 5 "$HEALTH_URL"; then
    log "atnaujinta iki $latest. Senoji versija: $prev"
    exit 0
  fi
  sleep 2
done
rollback
