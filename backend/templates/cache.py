"""Module-level caches shared by main.py:lifespan and api/routes.py.

Populated at app startup by `lifespan`; read by `/api/templates` and
`/api/templates/{name}/validate` route handlers.
"""
from __future__ import annotations


template_meta_cache: dict[str, dict] = {}
template_validation_cache: dict[str, dict] = {}
