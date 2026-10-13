"""OSSMC TLS profile helper.

Reads the OpenShift cluster TLS security profile, renders an nginx include from
it, and supervises nginx. Standard library only; runs on the Python 3.9
interpreter shipped in the base image.

This module must stay import-free so that the readiness probe stays cheap.
"""
