/*
 * ResourceGuard - state.h
 * System state for the Banker's Algorithm: matrices, vectors, validation,
 * snapshot / restore helpers.
 */
#ifndef RG_STATE_H
#define RG_STATE_H

#include <stdbool.h>

#define MAX_P 20
#define MAX_R 10
#define RG_VALUE_LIMIT 1000000 /* sanity bound for any single matrix cell */

typedef struct {
    int P, R;
    int alloc[MAX_P][MAX_R];
    int max[MAX_P][MAX_R];
    int need[MAX_P][MAX_R];
    int avail[MAX_R];
} State;

/* Error list without <stdarg.h>: callers snprintf into errors_slot(). */
#define RG_MAX_ERRORS 48
#define RG_ERR_LEN 160
typedef struct {
    int count;
    char msg[RG_MAX_ERRORS][RG_ERR_LEN];
} ErrorList;

void errors_clear(ErrorList *e);
/* Returns a buffer of RG_ERR_LEN bytes for the next message. When the list is
 * full a scratch buffer is returned (message silently dropped). */
char *errors_slot(ErrorList *e);
void errors_add(ErrorList *e, const char *msg);

/* Zero every byte (including unused cells) then set dimensions. */
void state_init(State *s, int P, int R);
/* Deep copy (State contains only fixed arrays, so struct copy is deep). */
void state_snapshot(const State *s, State *snap);
void state_restore(State *s, const State *snap);
/* Byte-level equality (memcmp). */
bool state_equal(const State *a, const State *b);

/* Validates dimensions, negatives and Allocation <= Max. */
bool validate_state(const State *s, ErrorList *err);
/* Need = Max - Allocation. Validates first; on failure Need is untouched and
 * false is returned with descriptive errors. */
bool calculate_need(State *s, ErrorList *err);

/* Total instances of each resource = Available + sum of Allocation column. */
void state_totals(const State *s, int total[MAX_R]);

/* The classic 5x3 textbook state (Silberschatz). */
void state_load_textbook(State *s);

/* Text file format:  P R / P rows Allocation / P rows Max / Available */
bool state_save_file(const State *s, const char *path, ErrorList *err);
bool state_load_file(State *s, const char *path, ErrorList *err);

#endif
