/*
 * ResourceGuard - jsonmode.h
 * `resourceguard --json < input.json` : one command in, one JSON object out.
 */
#ifndef RG_JSONMODE_H
#define RG_JSONMODE_H

#include <stdio.h>
#include <stdbool.h>
#include "state.h"
#include "json.h"

/* Returns the process exit code (0 = handled, 1 = malformed input). */
int run_json_mode(FILE *in, FILE *out);

/* Parse {"processes","resources","allocation","max","available"} into s.
 * Shape / type errors go to err. Does NOT run semantic validation. */
bool json_to_state(const JVal *st, State *s, ErrorList *err);

#endif
