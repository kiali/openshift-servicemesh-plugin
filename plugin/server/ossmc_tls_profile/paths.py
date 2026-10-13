# Fixed locations shared by the supervisor and the readiness probe.
# Keep this module free of imports: the probe imports it on every kubelet probe.

HELPER = "/usr/local/bin/ossmc-tls-profile"

STATE_DIR = "/tmp/ossmc"
TLS_CONF = STATE_DIR + "/tls.conf"
STATE_FILE = STATE_DIR + "/state"
CLIENT_OPENSSL_CONF = STATE_DIR + "/openssl-client.cnf"
SELFCHECK_OPENSSL_CONF = STATE_DIR + "/openssl-selfcheck.cnf"

LISTEN_HOST = "127.0.0.1"
LISTEN_PORT = 9443

SA_DIR = "/var/run/secrets/kubernetes.io/serviceaccount"
SA_TOKEN = SA_DIR + "/token"
SA_CA = SA_DIR + "/ca.crt"

SERVING_CERT = "/var/serving-cert/tls.crt"
SERVING_KEY = "/var/serving-cert/tls.key"

NGINX = "/usr/sbin/nginx"
NGINX_CONF = "/etc/nginx/nginx.conf"
S2I_RUN = "/usr/libexec/s2i/run"
OPENSSL = "/usr/bin/openssl"
SYSTEM_OPENSSL_CNF = "/etc/pki/tls/openssl.cnf"
FIPS_ENABLED = "/proc/sys/crypto/fips_enabled"

SERVICE_ACCOUNT_NAME = "ossmconsole-service-account"
CLUSTER_ROLE_NAME = "ossmconsole-tls"
