"""Trusted sandbox launcher; install a kernel filter before loading generated code.

This file is uploaded as data by the adapter. It is never invoked on the worker.
The filter is inherited by descendants and cannot be removed by unprivileged code.
"""

import ctypes
import ctypes.util
import runpy


def isolate():
    path = ctypes.util.find_library("seccomp")
    if not path:
        raise RuntimeError("Kernel syscall filter is required")
    lib = ctypes.CDLL(path, use_errno=True)
    lib.seccomp_init.argtypes = [ctypes.c_uint32]
    lib.seccomp_init.restype = ctypes.c_void_p
    lib.seccomp_syscall_resolve_name.argtypes = [ctypes.c_char_p]
    lib.seccomp_syscall_resolve_name.restype = ctypes.c_int
    lib.seccomp_rule_add.argtypes = [ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int, ctypes.c_uint]
    lib.seccomp_rule_add.restype = ctypes.c_int
    lib.seccomp_load.argtypes = [ctypes.c_void_p]
    lib.seccomp_load.restype = ctypes.c_int
    lib.seccomp_release.argtypes = [ctypes.c_void_p]
    context = lib.seccomp_init(0x7FFF0000)  # SCMP_ACT_ALLOW
    if not context:
        raise RuntimeError("Cannot initialize kernel syscall filter")
    try:
        for name in (
            "socket",
            "socketpair",
            "connect",
            "accept",
            "accept4",
            "bind",
            "listen",
            "sendto",
            "sendmsg",
            "sendmmsg",
            "recvfrom",
            "recvmsg",
            "recvmmsg",
            "ptrace",
            "process_vm_readv",
            "process_vm_writev",
            "pidfd_getfd",
            "bpf",
            "perf_event_open",
            "io_uring_setup",
            "io_uring_enter",
            "io_uring_register",
            "unshare",
            "setns",
            "mount",
            "umount2",
            "pivot_root",
            "chroot",
        ):
            syscall = lib.seccomp_syscall_resolve_name(name.encode())
            if syscall >= 0 and lib.seccomp_rule_add(context, 0x00050001, syscall, 0):
                raise RuntimeError("Cannot configure kernel syscall filter")
        if lib.seccomp_load(context):
            raise RuntimeError("Cannot enforce kernel syscall filter")
    finally:
        lib.seccomp_release(context)


if __name__ == "__main__":
    isolate()
    runpy.run_path("/opt/ngertiin/job.py", run_name="__main__")
