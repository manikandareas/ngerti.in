/* Fixed ABI boundary: openat's mode is variadic, including on Apple arm64. */
extern int openat(int directory, const char *path, int flags, ...);

int workspace_openat(int directory, const char *path, int flags, int mode) {
    return openat(directory, path, flags, mode);
}
