/*
 * ResourceGuard - state.c
 * State construction, validation, Need computation, snapshot / restore and
 * plain-text persistence.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

#include "state.h"

static char g_scratch_err[RG_ERR_LEN];

void errors_clear(ErrorList *e) {
    if (!e) return;
    e->count = 0;
}

char *errors_slot(ErrorList *e) {
    if (!e || e->count >= RG_MAX_ERRORS) return g_scratch_err;
    char *slot = e->msg[e->count++];
    slot[0] = '\0';
    return slot;
}

void errors_add(ErrorList *e, const char *msg) {
    snprintf(errors_slot(e), RG_ERR_LEN, "%s", msg);
}

void state_init(State *s, int P, int R) {
    memset(s, 0, sizeof *s);
    s->P = P;
    s->R = R;
}

void state_snapshot(const State *s, State *snap) {
    memcpy(snap, s, sizeof *snap);
}

void state_restore(State *s, const State *snap) {
    memcpy(s, snap, sizeof *s);
}

bool state_equal(const State *a, const State *b) {
    return memcmp(a, b, sizeof *a) == 0;
}

bool validate_state(const State *s, ErrorList *err) {
    bool ok = true;
    if (s->P < 1 || s->P > MAX_P) {
        snprintf(errors_slot(err), RG_ERR_LEN,
                 "Process count %d out of range (1..%d)", s->P, MAX_P);
        return false;
    }
    if (s->R < 1 || s->R > MAX_R) {
        snprintf(errors_slot(err), RG_ERR_LEN,
                 "Resource count %d out of range (1..%d)", s->R, MAX_R);
        return false;
    }
    for (int j = 0; j < s->R; j++) {
        if (s->avail[j] < 0) {
            snprintf(errors_slot(err), RG_ERR_LEN,
                     "Available[R%d] = %d is negative", j, s->avail[j]);
            ok = false;
        } else if (s->avail[j] > RG_VALUE_LIMIT) {
            snprintf(errors_slot(err), RG_ERR_LEN,
                     "Available[R%d] = %d exceeds limit %d", j, s->avail[j],
                     RG_VALUE_LIMIT);
            ok = false;
        }
    }
    for (int i = 0; i < s->P; i++) {
        for (int j = 0; j < s->R; j++) {
            int a = s->alloc[i][j], m = s->max[i][j];
            if (a < 0) {
                snprintf(errors_slot(err), RG_ERR_LEN,
                         "Allocation[P%d][R%d] = %d is negative", i, j, a);
                ok = false;
            }
            if (m < 0) {
                snprintf(errors_slot(err), RG_ERR_LEN,
                         "Max[P%d][R%d] = %d is negative", i, j, m);
                ok = false;
            }
            if (a > RG_VALUE_LIMIT || m > RG_VALUE_LIMIT) {
                snprintf(errors_slot(err), RG_ERR_LEN,
                         "Cell [P%d][R%d] exceeds limit %d", i, j,
                         RG_VALUE_LIMIT);
                ok = false;
            }
            if (a >= 0 && m >= 0 && a > m) {
                snprintf(errors_slot(err), RG_ERR_LEN,
                         "Allocation[P%d][R%d] = %d exceeds Max = %d", i, j,
                         a, m);
                ok = false;
            }
        }
    }
    return ok;
}

bool calculate_need(State *s, ErrorList *err) {
    if (!validate_state(s, err)) return false;
    for (int i = 0; i < s->P; i++)
        for (int j = 0; j < s->R; j++)
            s->need[i][j] = s->max[i][j] - s->alloc[i][j];
    return true;
}

void state_totals(const State *s, int total[MAX_R]) {
    for (int j = 0; j < MAX_R; j++) total[j] = 0;
    for (int j = 0; j < s->R; j++) {
        total[j] = s->avail[j];
        for (int i = 0; i < s->P; i++) total[j] += s->alloc[i][j];
    }
}

void state_load_textbook(State *s) {
    static const int A[5][3] = {{0, 1, 0}, {2, 0, 0}, {3, 0, 2}, {2, 1, 1}, {0, 0, 2}};
    static const int M[5][3] = {{7, 5, 3}, {3, 2, 2}, {9, 0, 2}, {2, 2, 2}, {4, 3, 3}};
    static const int V[3] = {3, 3, 2};
    state_init(s, 5, 3);
    for (int i = 0; i < 5; i++)
        for (int j = 0; j < 3; j++) {
            s->alloc[i][j] = A[i][j];
            s->max[i][j] = M[i][j];
        }
    for (int j = 0; j < 3; j++) s->avail[j] = V[j];
    calculate_need(s, NULL);
}

bool state_save_file(const State *s, const char *path, ErrorList *err) {
    FILE *f = fopen(path, "w");
    if (!f) {
        snprintf(errors_slot(err), RG_ERR_LEN, "Cannot open '%s' for writing", path);
        return false;
    }
    fprintf(f, "# ResourceGuard state file\n# P R, then Allocation rows, Max rows, Available\n");
    fprintf(f, "%d %d\n", s->P, s->R);
    for (int i = 0; i < s->P; i++) {
        for (int j = 0; j < s->R; j++) fprintf(f, "%d%s", s->alloc[i][j], j + 1 < s->R ? " " : "\n");
    }
    for (int i = 0; i < s->P; i++) {
        for (int j = 0; j < s->R; j++) fprintf(f, "%d%s", s->max[i][j], j + 1 < s->R ? " " : "\n");
    }
    for (int j = 0; j < s->R; j++) fprintf(f, "%d%s", s->avail[j], j + 1 < s->R ? " " : "\n");
    fclose(f);
    return true;
}

/* Reads the next integer, skipping whitespace and '#' comments. */
static bool read_int(FILE *f, int *out) {
    int c;
    for (;;) {
        c = fgetc(f);
        if (c == EOF) return false;
        if (c == '#') {
            while ((c = fgetc(f)) != EOF && c != '\n') {}
            continue;
        }
        if (c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == ',') continue;
        break;
    }
    ungetc(c, f);
    return fscanf(f, "%d", out) == 1;
}

bool state_load_file(State *s, const char *path, ErrorList *err) {
    FILE *f = fopen(path, "r");
    if (!f) {
        snprintf(errors_slot(err), RG_ERR_LEN, "Cannot open '%s'", path);
        return false;
    }
    State t;
    int P = 0, R = 0;
    if (!read_int(f, &P) || !read_int(f, &R)) {
        fclose(f);
        errors_add(err, "File must start with: <processes> <resources>");
        return false;
    }
    if (P < 1 || P > MAX_P || R < 1 || R > MAX_R) {
        fclose(f);
        snprintf(errors_slot(err), RG_ERR_LEN, "Dimensions %dx%d out of range (max %dx%d)", P, R, MAX_P, MAX_R);
        return false;
    }
    state_init(&t, P, R);
    bool ok = true;
    for (int i = 0; i < P && ok; i++)
        for (int j = 0; j < R && ok; j++) ok = read_int(f, &t.alloc[i][j]);
    for (int i = 0; i < P && ok; i++)
        for (int j = 0; j < R && ok; j++) ok = read_int(f, &t.max[i][j]);
    for (int j = 0; j < R && ok; j++) ok = read_int(f, &t.avail[j]);
    fclose(f);
    if (!ok) {
        errors_add(err, "Unexpected end of file or non-integer value");
        return false;
    }
    if (!calculate_need(&t, err)) return false;
    *s = t;
    return true;
}
