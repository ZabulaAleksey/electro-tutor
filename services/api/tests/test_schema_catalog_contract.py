"""Database-free shape and safe-diagnostic regressions for ADR-028."""

import pytest

from electro_tutor_api.adapters.database import expected_revision
from electro_tutor_api.schema_catalog_contract import (
    CATEGORIES,
    CatalogDriftError,
    catalog_differences,
    compare_catalog,
    load_manifest,
)


def test_committed_manifest_is_head_pinned_and_complete() -> None:
    manifest = load_manifest()
    assert manifest["revision"] == expected_revision()
    objects = manifest["objects"]
    assert isinstance(objects, dict)
    assert set(objects) == set(CATEGORIES)
    assert len(objects["table_acl"]) == 15


def test_diagnostics_never_expose_unexpected_live_identifier_or_body() -> None:
    actual = {category: {"known": "a" * 64} for category in CATEGORIES}
    expected = {category: {"known": "a" * 64} for category in CATEGORIES}
    manifest: dict[str, object] = {"objects": expected}
    assert catalog_differences(actual, manifest) == {}
    compare_catalog(actual, manifest)

    actual["functions"]["known"] = "b" * 64
    actual["functions"]["secret-bearing-extra-identifier"] = "c" * 64
    differences = catalog_differences(actual, manifest)
    assert differences == {
        "functions": {
            "missing_expected": [],
            "changed_expected": ["known"],
            "unexpected_count": 1,
        }
    }
    assert "secret-bearing-extra-identifier" not in str(differences)
    assert "b" * 64 not in str(differences)
    with pytest.raises(CatalogDriftError) as error:
        compare_catalog(actual, manifest)
    assert "secret-bearing-extra-identifier" not in str(error.value)
