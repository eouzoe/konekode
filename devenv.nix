{ pkgs, ... }: {
  stdenv = pkgs.stdenvNoCC;

  languages.javascript.bun.enable = true;

  packages = with pkgs; [
    bun
    jujutsu
    just
    wrangler
  ];

  cachix.pull = [ "devenv" ];

  git-hooks.enable = false;

  dotenv.enable = false;

  processes.dev = {
    exec = "bun --bun run dev";
    ready.http.get = {
      port = 4321;
      path = "/";
    };
  };

  tasks."deps:install" = {
    exec = "bun install";
    execIfModified = [ "bun.lock" ];
    before = [ "devenv:enterShell" ];
  };

  enterShell = ''
    echo "site"
    echo "  bun:   $(bun --version)"
    echo "  run:   just dev"
    echo "  check: just check"
  '';
}
