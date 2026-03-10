"""
Tests for _safe_merge_markers: export safe-merge marker behaviour without touching disk.
"""
from __future__ import annotations

import pytest


BEGIN = "# --- BEGIN ESPHOME_TOUCH_DESIGNER GENERATED ---"
END = "# --- END ESPHOME_TOUCH_DESIGNER GENERATED ---"


def _generated_block(content: str = "# generated") -> str:
    return f"{BEGIN}\n{content}\n{END}\n"


def test_insert_into_empty_file():
    """Empty existing text: generated block is appended with newline."""
    from custom_components.esphome_touch_designer.api.views import _safe_merge_markers

    merged = _safe_merge_markers("", _generated_block())
    assert BEGIN in merged and END in merged
    assert merged.strip().endswith(END.strip())


def test_insert_after_existing_content():
    """Existing content without markers: block appended after newline."""
    from custom_components.esphome_touch_designer.api.views import _safe_merge_markers

    existing = "esphome:\n  name: test\n"
    merged = _safe_merge_markers(existing, _generated_block("yaml: 1"))
    assert merged.startswith("esphome:")
    assert BEGIN in merged and END in merged
    assert "yaml: 1" in merged


def test_replace_single_marker_block():
    """Existing text with one marker pair: content between markers is replaced."""
    from custom_components.esphome_touch_designer.api.views import _safe_merge_markers

    existing = f"before\n{BEGIN}\nold\n{END}\nafter\n"
    new_block = _generated_block("new")
    merged = _safe_merge_markers(existing, new_block)
    assert "before" in merged and "after" in merged
    assert "old" not in merged
    assert "new" in merged


def test_generated_block_must_contain_markers():
    """Generated block without both markers raises ValueError."""
    from custom_components.esphome_touch_designer.api.views import _safe_merge_markers

    with pytest.raises(ValueError, match="generated_block_missing_markers"):
        _safe_merge_markers("", "no markers here")


def test_duplicate_markers_raise():
    """Existing text with duplicate begin/end markers raises ValueError."""
    from custom_components.esphome_touch_designer.api.views import _safe_merge_markers

    dup = f"{BEGIN}\nA\n{END}\n{BEGIN}\nB\n{END}\n"
    with pytest.raises(ValueError, match="marker_count_mismatch"):
        _safe_merge_markers(dup, _generated_block())


def test_marker_order_invalid_raises():
    """End marker before begin marker raises ValueError."""
    from custom_components.esphome_touch_designer.api.views import _safe_merge_markers

    wrong_order = f"{END}\n{BEGIN}\n"
    with pytest.raises(ValueError, match="marker_order_invalid"):
        _safe_merge_markers(wrong_order, _generated_block())
