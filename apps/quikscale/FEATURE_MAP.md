# Feature Map

## Overview

This document tracks all features and their implementation status.

## Features

### Goal Management (v0.1.0)

| Feature | Status | Module |
|---------|--------|--------|
| Create goals with title, description, priority, tags | Implemented | src/models.py |
| Goal status tracking (not_started, in_progress, completed, abandoned) | Implemented | src/models.py |
| Progress percentage tracking (0-100) | Implemented | src/models.py |
| JSON file persistence | Implemented | src/store.py |
| List/filter goals by status and priority | Implemented | src/store.py |
| Search goals by title/description | Implemented | src/store.py |
| Goal statistics | Implemented | src/store.py |
| CLI interface (add, list, update, delete, search, stats) | Implemented | src/cli.py |

---

*Last updated: 2026-04-04*
