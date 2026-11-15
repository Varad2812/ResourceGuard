/*
 * ResourceGuard - json.c
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

#include "json.h"

/* ------------------------------------------------------------------ */
/* Reader                                                              */
/* ------------------------------------------------------------------ */
typedef struct {
    const char *p;
    const char *start;
    char *err;
    int errlen;
    bool failed;
    int depth;
} JP;

static void jp_fail(JP *jp, const char *msg) {
    if (jp->failed) return;
    jp->failed = true;
    if (jp->err) snprintf(jp->err, (size_t)jp->errlen, "%s at offset %ld", msg, (long)(jp->p - jp->start));
}

static void jp_ws(JP *jp) {
    while (*jp->p == ' ' || *jp->p == '\t' || *jp->p == '\n' || *jp->p == '\r') jp->p++;
}

static JVal *jv_new(JType t) {
    JVal *v = calloc(1, sizeof *v);
    if (v) v->t = t;
    return v;
}

static bool jv_push(JVal *v, char *key, JVal *item) {
    if (v->len == v->cap) {
        int nc = v->cap ? v->cap * 2 : 8;
        JVal **ni = realloc(v->items, sizeof(JVal *) * (size_t)nc);
        if (!ni) return false;
        v->items = ni;
        if (v->t == J_OBJ) {
            char **nk = realloc(v->keys, sizeof(char *) * (size_t)nc);
            if (!nk) return false;
            v->keys = nk;
        }
        v->cap = nc;
    }
    v->items[v->len] = item;
    if (v->t == J_OBJ) v->keys[v->len] = key;
    v->len++;
    return true;
}

static JVal *jp_value(JP *jp);

static char *jp_string(JP *jp) {
    if (*jp->p != '"') {
        jp_fail(jp, "Expected string");
        return NULL;
    }
    jp->p++;
    size_t cap = 32, n = 0;
    char *out = malloc(cap);
    if (!out) return NULL;
    while (*jp->p && *jp->p != '"') {
        char c = *jp->p++;
        if (c == '\\') {
            char e = *jp->p++;
            switch (e) {
            case 'n': c = '\n'; break;
            case 't': c = '\t'; break;
            case 'r': c = '\r'; break;
            case 'b': c = '\b'; break;
            case 'f': c = '\f'; break;
            case '/': c = '/'; break;
            case '\\': c = '\\'; break;
            case '"': c = '"'; break;
            case 'u':
                /* keep it simple: skip 4 hex digits, emit '?' */
                for (int k = 0; k < 4 && *jp->p; k++) jp->p++;
                c = '?';
                break;
            default:
                jp_fail(jp, "Bad escape");
                free(out);
                return NULL;
            }
        }
        if (n + 2 > cap) {
            cap *= 2;
            char *no = realloc(out, cap);
            if (!no) {
                free(out);
                return NULL;
            }
            out = no;
        }
        out[n++] = c;
    }
    if (*jp->p != '"') {
        jp_fail(jp, "Unterminated string");
        free(out);
        return NULL;
    }
    jp->p++;
    out[n] = '\0';
    return out;
}

static JVal *jp_number(JP *jp) {
    JVal *v = jv_new(J_NUM);
    if (!v) return NULL;
    bool neg = false;
    if (*jp->p == '-') {
        neg = true;
        jp->p++;
    }
    if (*jp->p < '0' || *jp->p > '9') {
        jp_fail(jp, "Bad number");
        free(v);
        return NULL;
    }
    long long n = 0;
    while (*jp->p >= '0' && *jp->p <= '9') {
        if (n < 1000000000000LL) n = n * 10 + (*jp->p - '0');
        jp->p++;
    }
    v->n_int = true;
    if (*jp->p == '.') {
        jp->p++;
        bool nonzero = false;
        while (*jp->p >= '0' && *jp->p <= '9') {
            if (*jp->p != '0') nonzero = true;
            jp->p++;
        }
        if (nonzero) v->n_int = false;
    }
    if (*jp->p == 'e' || *jp->p == 'E') {
        jp->p++;
        if (*jp->p == '+' || *jp->p == '-') jp->p++;
        while (*jp->p >= '0' && *jp->p <= '9') jp->p++;
        v->n_int = false;
    }
    v->n = neg ? -n : n;
    return v;
}

static JVal *jp_value(JP *jp) {
    if (++jp->depth > 64) {
        jp_fail(jp, "Nesting too deep");
        return NULL;
    }
    jp_ws(jp);
    JVal *v = NULL;
    char c = *jp->p;
    if (c == '{') {
        jp->p++;
        v = jv_new(J_OBJ);
        if (!v) return NULL;
        jp_ws(jp);
        if (*jp->p == '}') {
            jp->p++;
        } else {
            for (;;) {
                jp_ws(jp);
                char *k = jp_string(jp);
                if (!k) break;
                jp_ws(jp);
                if (*jp->p != ':') {
                    free(k);
                    jp_fail(jp, "Expected ':'");
                    break;
                }
                jp->p++;
                JVal *item = jp_value(jp);
                if (!item) {
                    free(k);
                    break;
                }
                if (!jv_push(v, k, item)) {
                    free(k);
                    json_free(item);
                    jp_fail(jp, "Out of memory");
                    break;
                }
                jp_ws(jp);
                if (*jp->p == ',') {
                    jp->p++;
                    continue;
                }
                if (*jp->p == '}') {
                    jp->p++;
                    break;
                }
                jp_fail(jp, "Expected ',' or '}'");
                break;
            }
        }
    } else if (c == '[') {
        jp->p++;
        v = jv_new(J_ARR);
        if (!v) return NULL;
        jp_ws(jp);
        if (*jp->p == ']') {
            jp->p++;
        } else {
            for (;;) {
                JVal *item = jp_value(jp);
                if (!item) break;
                if (!jv_push(v, NULL, item)) {
                    json_free(item);
                    jp_fail(jp, "Out of memory");
                    break;
                }
                jp_ws(jp);
                if (*jp->p == ',') {
                    jp->p++;
                    continue;
                }
                if (*jp->p == ']') {
                    jp->p++;
                    break;
                }
                jp_fail(jp, "Expected ',' or ']'");
                break;
            }
        }
    } else if (c == '"') {
        char *s = jp_string(jp);
        if (s) {
            v = jv_new(J_STR);
            if (v) v->s = s;
            else free(s);
        }
    } else if (c == '-' || (c >= '0' && c <= '9')) {
        v = jp_number(jp);
    } else if (strncmp(jp->p, "true", 4) == 0) {
        jp->p += 4;
        v = jv_new(J_BOOL);
        if (v) v->b = true;
    } else if (strncmp(jp->p, "false", 5) == 0) {
        jp->p += 5;
        v = jv_new(J_BOOL);
    } else if (strncmp(jp->p, "null", 4) == 0) {
        jp->p += 4;
        v = jv_new(J_NULL);
    } else {
        jp_fail(jp, "Unexpected character");
    }
    jp->depth--;
    if (jp->failed && v) {
        json_free(v);
        return NULL;
    }
    return v;
}

JVal *json_parse(const char *text, char *errbuf, int errlen) {
    JP jp = {text, text, errbuf, errlen, false, 0};
    if (errbuf && errlen > 0) errbuf[0] = '\0';
    JVal *v = jp_value(&jp);
    if (v) {
        jp_ws(&jp);
        if (*jp.p != '\0') {
            jp_fail(&jp, "Trailing characters");
            json_free(v);
            return NULL;
        }
    } else if (!jp.failed) {
        jp_fail(&jp, "Parse error");
    }
    return v;
}

void json_free(JVal *v) {
    if (!v) return;
    for (int i = 0; i < v->len; i++) {
        json_free(v->items[i]);
        if (v->keys) free(v->keys[i]);
    }
    free(v->items);
    free(v->keys);
    free(v->s);
    free(v);
}

const JVal *json_get(const JVal *obj, const char *key) {
    if (!obj || obj->t != J_OBJ) return NULL;
    for (int i = 0; i < obj->len; i++)
        if (strcmp(obj->keys[i], key) == 0) return obj->items[i];
    return NULL;
}

/* ------------------------------------------------------------------ */
/* Writer                                                              */
/* ------------------------------------------------------------------ */
void jw_init(JW *w, FILE *f) {
    memset(w, 0, sizeof *w);
    w->f = f;
    w->first[0] = true;
}

static void jw_prefix(JW *w) {
    if (w->after_key) {
        w->after_key = false;
        return;
    }
    if (!w->first[w->depth]) fputc(',', w->f);
    w->first[w->depth] = false;
}

static void jw_open(JW *w, char c) {
    jw_prefix(w);
    fputc(c, w->f);
    if (w->depth < JW_MAX_DEPTH - 1) w->depth++;
    w->first[w->depth] = true;
}

void jw_obj_begin(JW *w) { jw_open(w, '{'); }
void jw_arr_begin(JW *w) { jw_open(w, '['); }
void jw_obj_end(JW *w) {
    fputc('}', w->f);
    if (w->depth > 0) w->depth--;
}
void jw_arr_end(JW *w) {
    fputc(']', w->f);
    if (w->depth > 0) w->depth--;
}

static void jw_escaped(FILE *f, const char *s, long n) {
    fputc('"', f);
    for (long i = 0; n < 0 ? s[i] != '\0' : i < n; i++) {
        unsigned char c = (unsigned char)s[i];
        switch (c) {
        case '"': fputs("\\\"", f); break;
        case '\\': fputs("\\\\", f); break;
        case '\n': fputs("\\n", f); break;
        case '\r': fputs("\\r", f); break;
        case '\t': fputs("\\t", f); break;
        default:
            if (c < 0x20) fprintf(f, "\\u%04x", c);
            else fputc(c, f);
        }
    }
    fputc('"', f);
}

void jw_key(JW *w, const char *k) {
    jw_prefix(w);
    jw_escaped(w->f, k, -1);
    fputc(':', w->f);
    w->after_key = true;
}

void jw_int(JW *w, long long v) {
    jw_prefix(w);
    fprintf(w->f, "%lld", v);
}

void jw_bool(JW *w, bool v) {
    jw_prefix(w);
    fputs(v ? "true" : "false", w->f);
}

void jw_null(JW *w) {
    jw_prefix(w);
    fputs("null", w->f);
}

void jw_str(JW *w, const char *s) {
    jw_prefix(w);
    jw_escaped(w->f, s, -1);
}

void jw_str_n(JW *w, const char *s, long n) {
    jw_prefix(w);
    jw_escaped(w->f, s, n);
}

void jw_int_array(JW *w, const int *a, int n) {
    jw_arr_begin(w);
    for (int i = 0; i < n; i++) jw_int(w, a[i]);
    jw_arr_end(w);
}

void jw_bool_array(JW *w, const bool *a, int n) {
    jw_arr_begin(w);
    for (int i = 0; i < n; i++) jw_bool(w, a[i]);
    jw_arr_end(w);
}
