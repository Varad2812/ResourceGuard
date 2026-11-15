/*
 * ResourceGuard - cli.h
 * Interactive coloured terminal menu.
 */
#ifndef RG_CLI_H
#define RG_CLI_H

#include <stdbool.h>
#include "state.h"

int run_interactive(State *initial, bool has_initial);
/* Load a .txt state file or .json scenario into the interactive session. */
bool cli_load_path(const char *path);

#endif
