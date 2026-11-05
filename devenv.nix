{ pkgs, lib, config, ... }:

# One-command workflows:
#   devenv up     -> MariaDB, install deps, render schema, migrate, seed (first run), start astro dev
#   devenv test   -> full check suite (lint/format/types, unit tests, build, e2e) on a throwaway SQLite file
#   devenv shell  -> node 24 + pnpm + vp + prisma engines + playwright browsers + mariadb client
{
  dotenv.enable = true;

  packages = [ pkgs.sqlite pkgs.mariadb_114 ];

  # Local MariaDB for `devenv up` (DATABASE_URL=mysql://sic:sic@127.0.0.1:3306/sic in .env.example).
  # Data lives in .devenv/state/mysql. The `sic` user may create databases: `prisma migrate dev` needs a
  # shadow database and e2e runs create their own `sic_e2e_<port>` database.
  services.mysql = lib.mkIf (!config.devenv.isTesting) {
    enable = true;
    package = pkgs.mariadb_114;
    settings.mysqld = {
      bind-address = "127.0.0.1";
      port = 3306;
      character-set-server = "utf8mb4";
      collation-server = "utf8mb4_unicode_ci";
    };
    initialDatabases = [ { name = "sic"; } ];
    ensureUsers = [
      {
        name = "sic";
        password = "sic";
        ensurePermissions = { "*.*" = "ALL PRIVILEGES"; };
      }
    ];
  };

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
    after = [ "devenv:mysql:configure" ];
    before = [ "devenv:processes:astro" ];
  };

  processes = lib.mkIf (!config.devenv.isTesting) {
    astro.exec = "pnpm exec vp run dev";
  };

  # CI stays on SQLite: a throwaway file, independent of the MariaDB DATABASE_URL in .env.
  enterTest = ''
    set -euo pipefail
    export DATABASE_URL="file:./storage/ci.db"
    pnpm install --frozen-lockfile
    pnpm exec vp run setup
    pnpm exec vp run ci
  '';
}
