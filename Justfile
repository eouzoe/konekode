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

clean:
    rm -rf .astro dist
