pch:
    bun src/lib/run/pch.build.ts

dev: pch
    bun --bun run dev

edit: pch
    PUBLIC_MODE=dev bun --bun run dev

lean := "BUN_OPTIONS=--conditions=distilled-lazy"

version := `git rev-parse --short HEAD` + `test -z "$(git status --porcelain)" || printf %s -dirty`

build: pch
    PUBLIC_SITE_VERSION="{{ version }}" bun --bun run build

build-dev: pch
    PUBLIC_MODE=dev PUBLIC_SITE_VERSION="{{ version }}" bun --bun run build --outDir dist-dev
    cp -r dev-assets/fonts dist-dev/fonts

preview:
    bun --bun run preview

typecheck:
    bun --bun run typecheck

lint:
    bun x oxlint

format:
    bun x oxfmt --write .

test:
    bun test src backend packages

engine-verify:
    bun src/lib/learner/engine.verify.ts

results:
    bun packages/course/src/results.build.ts
    bun x oxfmt --write packages/course/src/results.ts

check: typecheck lint test build
    bun x oxfmt --check .

e2e *args: build
    just e2e-run {{args}}

e2e-run *args:
    devenv tasks run --show-output site:e2e --input 'args={{args}}'

e2e-direct *args:
    __EGL_VENDOR_LIBRARY_DIRS="$E2E_MESA/share/glvnd/egl_vendor.d" LD_LIBRARY_PATH="$E2E_GLVND/lib:$E2E_MESA/lib" LIBGL_ALWAYS_SOFTWARE=1 bun x playwright test {{args}}

e2e-stage stage *args:
    KONEKODE_E2E_BASE="$(bun -e "import { outputsOf } from './backend/check-stage'; console.log((await outputsOf('{{ stage }}')).site)")" just e2e-direct {{args}}

deploy stage: check e2e
    SITE_VERSION="{{ version }}" {{ lean }} secretspec run -- bun x alchemy deploy --stage {{stage}}

check-stage stage version="":
    bun backend/check-stage.ts '{{ stage }}' '{{ version }}'

cpu stage minutes="60":
    bun backend/cpu.ts '{{ stage }}' '{{ minutes }}'

migration name:
    bun backend/migration.ts '{{ name }}'

preview-clean:
    {{ lean }} secretspec run -- bun backend/stages.ts

clean:
    rm -rf .astro dist dist-dev
