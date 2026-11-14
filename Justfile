dev:
    bun --bun run dev

build:
    bun --bun run build

preview:
    bun --bun run preview

typecheck:
    bun --bun run typecheck

lint:
    bun x oxlint --type-aware

format:
    bun x oxfmt --write .

test:
    bun test src

check: typecheck lint test build
    bun x oxfmt --check .

e2e *args: build
    __EGL_VENDOR_LIBRARY_DIRS="$E2E_MESA/share/glvnd/egl_vendor.d" LD_LIBRARY_PATH="$E2E_GLVND/lib:$E2E_MESA/lib" LIBGL_ALWAYS_SOFTWARE=1 bun x playwright test {{args}}

deploy: check e2e
    bun x wrangler deploy

clean:
    rm -rf .astro dist
