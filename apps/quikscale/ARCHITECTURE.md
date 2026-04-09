# Architecture

## Overview

Goals is a Python-based goal tracking application with a layered architecture.

## Structure

```
src/
  models.py   - Data models and business logic
  store.py    - Persistence layer (JSON file storage)
  cli.py      - Command-line interface
tests/
  test_models.py  - Model unit tests
  test_store.py   - Store integration tests
  test_cli.py     - CLI integration tests
```

## Layers

1. **Models** (`models.py`) - Core data structures (`Goal`, `GoalStatus`, `GoalPriority`) with validation and serialization
2. **Store** (`store.py`) - `GoalStore` handles CRUD operations with JSON file persistence
3. **CLI** (`cli.py`) - User-facing command-line interface using argparse

## Data Flow

```
CLI --> GoalStore --> JSON File
         |
       Goal Model
```

## Branch Strategy

```
dev (development) --> uat (staging) --> main (production)
```

- All automated changes land on `dev`
- Validated changes are promoted to `uat`
- Production releases go through PR review from `uat` to `main`

---

*Last updated: 2026-04-04*
