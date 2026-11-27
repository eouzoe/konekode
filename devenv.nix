{ pkgs, lib, config, ... }: {
  stdenv = pkgs.stdenvNoCC;

  languages.javascript = {
    enable = true;
    bun = {
      enable = true;
      install.enable = true;
    };
  };

  packages = with pkgs; [
    gh
    jaq
    just
    vim
  ];

  env.PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
  env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
  env.ASTRO_DEV_BACKGROUND = "0";
  env.PLAYWRIGHT_DRIVER_VERSION = pkgs.playwright-driver.version;
  env.E2E_MESA = lib.optionalString pkgs.stdenv.isLinux "${pkgs.mesa}";
  env.E2E_GLVND = lib.optionalString pkgs.stdenv.isLinux "${pkgs.libglvnd}";

  dotenv.enable = false;

  processes.dev = {
    exec = "bun --bun run dev";
    ready.http.get = {
      port = 4321;
      path = "/";
    };
  };

  processes.e2e = {
    start.enable = false;
    restart.on = "never";
    ports.http.allocate = 20000;
    exec = "bun e2e/fresh.ts && exec bun x alchemy dev --stage e2e --no-input";
    env = {
      BUN_OPTIONS = "--conditions=distilled-lazy";
      KONEKODE_LOCAL = "1";
      SITE_PORT = toString config.processes.e2e.ports.http.value;
    };
    ready = {
      http.get = {
        port = config.processes.e2e.ports.http.value;
        path = "/learn/start/";
      };
      period = 1;
      failure_threshold = 90;
    };
  };

  tasks."site:e2e" = {
    exec = ''just e2e-direct $(jaq -r '.args // ""' <<< "$DEVENV_TASK_INPUT")'';
    after = [ "devenv:processes:e2e@ready" ];
    env.E2E_PORT = toString config.processes.e2e.ports.http.value;
  };

  enterShell = ''
    echo "site"
    echo "  bun:   $(bun --version)"
    echo "  run:   just dev"
    echo "  check: just check"
  '';
}
