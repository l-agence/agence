# Agence Testing Framework

This directory contains all tests for the Agence project, organized by category.

## Directory Structure

```
tests/
  unit/          - Unit tests (individual components, functions, modules)
  integration/   - Integration tests (multi-component workflows, aisession lifecycle)
  guardrails/    - Guardrails & safety verification tests
  fixtures/      - Test data, mock responses, test fixtures (when added)
  README.md      - This file
```

## Running Tests

### Unit Tests

Run individual unit tests:

```bash
# Test symlink creation and repair
bash tests/unit/test-symlinks.sh

# Run all unit tests (future expansion)
bash tests/run-unit-tests.sh
```

### Integration Tests

```bash
# Test aisession creation and lifecycle
bash tests/integration/test-aisessions.sh

# Test agent routing with actual LLM
bash tests/integration/test-agent-routing.sh
```

### Guardrails Tests

```bash
# Test execution limits and safety constraints
bash tests/guardrails/test-execution-limits.sh

# Test permission enforcement
bash tests/guardrails/test-permissions.sh
```

## Test Naming Conventions

- `test-*.sh` - Bash test scripts
- Executable: `chmod +x tests/**/*.sh`
- Self-documenting output with test names and pass/fail status
- Exit code 0 on success, non-zero on failure

## Current Tests

### Unit Tests

- **test-symlinks.sh** - Validates symlink creation on Windows git-bash
  - Tests git tracking of symlinks (120000 mode)
  - Tests mklink function availability
  - Tests git checkout symlink restoration
  - Purpose: Ensure cross-platform symlink compatibility

### Integration Tests

(To be implemented)

- `test-aisessions.sh` - Aisession creation, tracking, environment variables
- `test-agent-routing.sh` - Agent selection, prefix parsing, env var propagation
- `test-shell-launch.sh` - Bash/PowerShell launch with profiles

### Guardrails Tests

(To be implemented)

- `test-execution-limits.sh` - Verify timeouts, resource limits
- `test-permissions.sh` - Verify file/directory permission enforcement
- `test-exit-codes.sh` - Verify proper exit codes for all modes

## Adding New Tests

1. Create test file in appropriate subdirectory
2. Follow naming: `test-<component>.sh`
3. Include self-documenting output (echo with section headers)
4. Return exit code 0 on success, non-zero on failure
5. Update this README with test description

## Test Patterns

All tests should follow this pattern:

```bash
#!/bin/bash

echo "=============================================="
echo "  TEST NAME"
echo "=============================================="
echo ""

# Setup
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AGENCE_ROOT="$(dirname "$(dirname "$(dirname "$SCRIPT_DIR")")")"

# Run tests
test1_description() {
  echo "TEST 1: Description"
  # assertions...
  if [[ condition ]]; then
    echo "✓ PASS"
    return 0
  else
    echo "✗ FAIL"
    return 1
  fi
}

# Execute and track results
test1_description || exit 1

echo ""
echo "=============================================="
echo "  ALL TESTS PASSED"
echo "=============================================="
```

## CI/CD Integration

(To be implemented)

These tests will be integrated into GitHub Actions workflow:
- Run on every push to main
- Run on pull requests
- Generate test reports
- Block merges if tests fail
