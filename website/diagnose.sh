#!/bin/bash
# Regenerable diagnostic: which public symbols still trigger TypeDoc warnings
# per entrypoint. Writes no output files (--emit none) so it never pollutes
# website/docs (TypeDoc's default --out is ./docs when unset).

echo "=== TypeDoc Diagnostic Report ==="
echo ""

declare -a entrypoints=(
    "root:../src/index.ts"
    "decorators:../src/decorators/index.ts"
    "operators:../src/public/operators.ts"
    "pipe:../src/public/pipe.ts"
    "run:../src/public/run.ts"
    "policy:../src/policy/index.ts"
    "observability:../src/observability/index.ts"
    "node:../src/node/index.ts"
    "store:../src/store/index.ts"
    "experimental:../src/experimental/index.ts"
)

total_warnings=0

for ep in "${entrypoints[@]}"; do
    IFS=':' read -r name path <<< "$ep"
    echo "--- Entrypoint: $name ($path) ---"

    output=$(npx typedoc --options typedoc.base.json --logLevel Warn --entryPoints "$path" --emit none 2>&1)

    warnings=$(echo "$output" | grep -c "\[warning\]" || true)
    echo "Warnings: $warnings"
    echo "$output" | grep "\[warning\]"

    total_warnings=$((total_warnings + warnings))
    echo ""
done

echo "=== TOTAL WARNINGS: $total_warnings ==="
