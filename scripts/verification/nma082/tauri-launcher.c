/* A disposable app bundle selects one remote profile without changing installed profiles. */
#include <limits.h>
#include <mach-o/dyld.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#ifndef NGERTIIN_PROFILE_HOME
#error "Build with an explicit private remote profile path."
#endif

int main(void) {
  char executable[PATH_MAX];
  uint32_t size = sizeof(executable);
  if (_NSGetExecutablePath(executable, &size) != 0) return 1;
  char *separator = strrchr(executable, '/');
  if (!separator) return 1;
  separator[1] = '\0';
  if (strlcat(executable, "ngertiin-desktop", sizeof(executable)) >= sizeof(executable)) return 1;
  if (setenv("NGERTIIN_DESKTOP_HOME", NGERTIIN_PROFILE_HOME, 1) != 0) return 1;
  execl(executable, executable, (char *)NULL);
  return 1;
}
