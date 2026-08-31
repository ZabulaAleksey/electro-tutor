from electro_tutor_api.request_id import accepted_request_id


def test_accepts_safe_request_id() -> None:
    assert accepted_request_id("client:request-01") == "client:request-01"


def test_replaces_invalid_control_or_oversized_request_id() -> None:
    result = accepted_request_id("bad\nvalue")
    assert result != "bad\nvalue"
    assert len(result) == 32
    assert accepted_request_id("x" * 129) != "x" * 129
