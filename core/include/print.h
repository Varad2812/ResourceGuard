/*
 * ResourceGuard - print.h
 * Human-readable terminal tables and decision traces.
 */
#ifndef RG_PRINT_H
#define RG_PRINT_H

#include <stdio.h>
#include <stdbool.h>
#include "state.h"
#include "banker.h"

void print_set_color(bool on);
bool print_color_enabled(void);

/* colour helpers ("" when colour is off) */
const char *c_reset(void);
const char *c_bold(void);
const char *c_dim(void);
const char *c_green(void);
const char *c_red(void);
const char *c_yellow(void);
const char *c_cyan(void);
const char *c_accent(void);

void print_vector(FILE *f, const int *v, int n);
void print_state(FILE *f, const State *s);
void print_errors(FILE *f, const ErrorList *e);
void print_safety(FILE *f, const State *s, const SafetyResult *r);
void print_request(FILE *f, const State *after, const RequestResult *r);
void print_release(FILE *f, int pid, const int *rel, int R, bool ok);
void print_sequences(FILE *f, int (*seqs)[MAX_P], int count, int P, bool truncated);
void print_detect(FILE *f, const State *s, const DetectResult *d);
void print_max_grant(FILE *f, const State *s, int pid, const MaxGrant *m);
void print_graph(FILE *f, const State *s, const GraphResult *g);

#endif
