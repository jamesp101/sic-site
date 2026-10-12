{ pkgs, lib, config, ... }:

# One-command workflows:
#   devenv up     -> install deps, render schema, migrate, seed (first run), start astro dev
#   devenv test   -> full check suite (lint/format/types, unit tests, build, e2e)
#   devenv shell  -> node 24 + pnpm + vp + prisma engines + playwright browsers
{
  dotenv.enable = true;

  packages = [ pkgs.sqlite ];

  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_24;
    pnpm = {
      enable = true;
      install.enable = true;
    };
  };

  env = {
    # NixOS has no precompiled Prisma engines; use the matching nixpkgs build.
    # Keep prisma-engines_7 in step with the `prisma` devDependency version.
    PRISMA_SCHEMA_ENGINE_BINARY = "${pkgs.prisma-engines_7}/bin/schema-engine";
    # Playwright browsers from nixpkgs; keep @playwright/test pinned to this version.
    PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
    PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
  };

  enterShell = ''
    [ -f .env ] || cp .env.example .env
    echo "node $(node --version) | pnpm $(pnpm --version) | prisma engines ${pkgs.prisma-engines_7.version} | playwright ${pkgs.playwright-driver.version}"
  '';

  # The dev server is for `devenv up` only; `devenv test` builds and serves its own instance (Playwright webServer).
  tasks."app:setup" = lib.mkIf (!config.devenv.isTesting) {
    exec = "pnpm install && pnpm exec vp run setup";
    before = [ "devenv:processes:astro" ];
  };

  processes = lib.mkIf (!config.devenv.isTesting) {
    astro.exec = "pnpm exec vp run dev";
  };

  enterTest = ''
    set -euo pipefail
    pnpm install --frozen-lockfile
    pnpm exec vp run setup
    pnpm exec vp run ci
  '';
}
