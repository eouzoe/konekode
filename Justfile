pch:
    bun src/lib/run/pch.build.ts

dev: pch
    bun --bun run dev

edit: pch
    PUBLIC_MODE=dev bun --bun run dev

build: pch
    PUBLIC_SITE_VERSION="$(git rev-parse --short HEAD)" bun --bun run build

build-dev: pch
    PUBLIC_MODE=dev PUBLIC_SITE_VERSION="$(git rev-parse --short HEAD)" bun --bun run build --outDir dist-dev
    cp -r dev-assets/fonts dist-dev/fonts

serve-dev: build-dev
    bun x wrangler dev --assets dist-dev --port 8789

preview:
    bun --bun run preview

typecheck:
    bun --bun run typecheck

lint:
    bun x oxlint --type-aware

format:
    bun x oxfmt --write .

test:
    bun test src worker

results:
    bun src/units/results.build.ts
    bun x oxfmt --write src/units/results.ts

check: typecheck lint test build
    bun x oxfmt --check .

e2e *args: build
    just e2e-run {{args}}

e2e-run *args:
    __EGL_VENDOR_LIBRARY_DIRS="$E2E_MESA/share/glvnd/egl_vendor.d" LD_LIBRARY_PATH="$E2E_GLVND/lib:$E2E_MESA/lib" LIBGL_ALWAYS_SOFTWARE=1 bun x playwright test {{args}}

deploy: check e2e
    bun x wrangler deploy

clean:
    rm -rf .astro dist dist-dev
