/*
 * ResourceGuard - json.h
 * Minimal JSON reader (recursive descent) and streaming writer, written
 * against stdio/stdlib/string/stdbool only.
 */
#ifndef RG_JSON_H
#define RG_JSON_H

#include <stdio.h>
#include <stdbool.h>

typedef enum { J_NULL, J_BOOL, J_NUM, J_STR, J_ARR, J_OBJ } JType;

typedef struct JVal {
    JType t;
    bool b;
    long long n;
    bool n_int; /* number had no fraction / exponent */
    char *s;
    struct JVal **items; /* array elements or object values */
    char **keys;         /* object keys (NULL for arrays) */
    int len, cap;
} JVal;

JVal *json_parse(const char *text, char *errbuf, int errlen);
void json_free(JVal *v);
const JVal *json_get(const JVal *obj, const char *key);

/* ---- writer ---- */
#define JW_MAX_DEPTH 64
typedef struct {
    FILE *f;
    int depth;
    bool first[JW_MAX_DEPTH];
    bool after_key;
} JW;

void jw_init(JW *w, FILE *f);
void jw_obj_begin(JW *w);
void jw_obj_end(JW *w);
void jw_arr_begin(JW *w);
void jw_arr_end(JW *w);
void jw_key(JW *w, const char *k);
void jw_int(JW *w, long long v);
void jw_bool(JW *w, bool v);
void jw_null(JW *w);
void jw_str(JW *w, const char *s);
void jw_str_n(JW *w, const char *s, long n);
void jw_int_array(JW *w, const int *a, int n);
void jw_bool_array(JW *w, const bool *a, int n);

#endif
