#!/usr/bin/env bash
# Corre las pruebas de punta a punta DENTRO del contenedor oficial de Playwright (Linux), igual que el CI.
# Lo llama scripts/e2e.bat. Copia el repo (sin node_modules de Windows), instala, construye y prueba.
# El reporte HTML queda en /salida (playwright-report/ del repo).
set -euo pipefail
mkdir -p /work
tar -C /src --exclude=./node_modules --exclude=./dist --exclude=./.git \
  --exclude=./playwright-report --exclude=./test-results -cf - . | tar -C /work -xf -
cd /work
npm ci --no-audit --no-fund
npm run build
set +e
npx playwright test "$@"
codigo=$?
set -e
cp -r playwright-report/. /salida/ 2>/dev/null || true
exit "$codigo"
