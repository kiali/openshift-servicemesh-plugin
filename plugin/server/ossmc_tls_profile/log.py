"""Single-line, prefixed log records on stderr.

Never pass tokens, private keys or full API responses to these functions.
"""

from __future__ import annotations

import sys

PREFIX = "ossmc-tls-profile:"


def _quote(value: object) -> str:
    text = str(value).replace("\\", "\\\\").replace('"', '\\"')
    text = text.replace("\n", "\\n").replace("\r", "\\r")
    return f'"{text}"'


def log(level: str, msg: str, **fields: object) -> None:
    parts = [PREFIX, f"level={level}", f"msg={_quote(msg)}"]
    for key, value in fields.items():
        parts.append(f"{key}={_quote(value)}")
    line = " ".join(parts) + "\n"
    try:
        sys.stderr.write(line)
        sys.stderr.flush()
    except (OSError, ValueError):
        # stderr is gone (container teardown); logging is the last thing to fail on.
        pass


def info(msg: str, **fields: object) -> None:
    log("info", msg, **fields)


def warning(msg: str, **fields: object) -> None:
    log("warning", msg, **fields)


def error(msg: str, **fields: object) -> None:
    log("error", msg, **fields)
