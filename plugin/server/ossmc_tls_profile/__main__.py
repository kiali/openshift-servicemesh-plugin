"""Command dispatch.

  (no arguments)  supervise nginx (the container command)
  probe           readiness probe for the kubelet
  fetch           internal: one APIServer read, spawned by the supervisor
  self-check      internal: loopback TLS handshakes, spawned by the supervisor
  --self-test     image build check of the interpreter contract

Subcommand modules are imported lazily so that "probe" never loads ssl, the
resolver or the supervisor.
"""

import sys


def main() -> None:
    args = sys.argv[1:]
    if not args:
        from .supervisor import main_supervise

        sys.exit(main_supervise())
    command = args[0]
    if command == "probe":
        from .probe import main as probe_main

        sys.exit(probe_main())
    if command == "fetch":
        from .apiclient import main as fetch_main

        sys.exit(fetch_main())
    if command == "self-check":
        from .selfcheck import main as selfcheck_main

        sys.exit(selfcheck_main(args[1:]))
    if command == "--self-test":
        from .selftest import main as selftest_main

        sys.exit(selftest_main())
    sys.stderr.write(f"ossmc-tls-profile: unknown command {command!r}\n")
    sys.exit(2)


if __name__ == "__main__":
    main()
