/*
 * ResourceGuard - cli.c
 * Interactive menu-driven front end for the terminal.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

#include "cli.h"
#include "banker.h"
#include "print.h"
#include "json.h"
#include "jsonmode.h"

static State g_state;
static bool g_loaded = false;
static int g_granted = 0, g_denied = 0;
static SafetyResult g_sr;
static RequestResult g_rr;
static DetectResult g_dr;
static GraphResult g_gr;
static int g_seqs[MAX_SEQUENCES][MAX_P];

/* Reads a line; returns false on EOF. */
static bool read_line(const char *prompt, char *buf, int n) {
    printf("%s%s%s", c_accent(), prompt, c_reset());
    fflush(stdout);
    if (!fgets(buf, n, stdin)) return false;
    size_t l = strlen(buf);
    while (l > 0 && (buf[l - 1] == '\n' || buf[l - 1] == '\r')) buf[--l] = '\0';
    return true;
}

/* Parses up to n integers from a line. Returns how many were read, -1 on junk. */
static int parse_ints(const char *line, int *out, int n) {
    int count = 0;
    const char *p = line;
    while (*p) {
        while (*p == ' ' || *p == '\t' || *p == ',') p++;
        if (!*p) break;
        char *end;
        long v = strtol(p, &end, 10);
        if (end == p) return -1;
        if (count < n) out[count] = (int)v;
        count++;
        p = end;
    }
    return count;
}

static bool read_ints(const char *prompt, int *out, int n) {
    char line[512];
    for (;;) {
        if (!read_line(prompt, line, sizeof line)) return false;
        int got = parse_ints(line, out, n);
        if (got == n) return true;
        printf("%s  Please enter exactly %d integer(s).%s\n", c_red(), n, c_reset());
    }
}

static bool read_int(const char *prompt, int *out) { return read_ints(prompt, out, 1); }

static bool need_state(void) {
    if (!g_loaded) printf("%s  No state loaded yet. Choose 1 (textbook) or 2 (manual entry).%s\n", c_yellow(), c_reset());
    return g_loaded;
}

static void banner(void) {
    printf("\n%s%s", c_accent(), c_bold());
    printf("  +------------------------------------------------------+\n");
    printf("  |  ResourceGuard  -  Deadlock Avoidance Simulator (C)  |\n");
    printf("  |  Banker's Algorithm  .  Safety  .  Detection         |\n");
    printf("  +------------------------------------------------------+%s\n", c_reset());
}

static void status_line(void) {
    if (!g_loaded) {
        printf("  %sstate: none loaded%s\n", c_dim(), c_reset());
        return;
    }
    bool safe = is_safe(&g_state, &g_sr);
    printf("  state: %dx%d  |  %s%s%s  |  granted %d  denied %d\n", g_state.P, g_state.R,
           safe ? c_green() : c_red(), safe ? "SAFE" : "UNSAFE", c_reset(), g_granted, g_denied);
}

static void menu(void) {
    printf("\n");
    status_line();
    printf("  %s 1%s Load textbook state (5x3)   %s 2%s Enter state manually\n", c_bold(), c_reset(), c_bold(), c_reset());
    printf("  %s 3%s Show matrices               %s 4%s Request resources\n", c_bold(), c_reset(), c_bold(), c_reset());
    printf("  %s 5%s Release resources           %s 6%s Complete process\n", c_bold(), c_reset(), c_bold(), c_reset());
    printf("  %s 7%s Check safety                %s 8%s All safe sequences\n", c_bold(), c_reset(), c_bold(), c_reset());
    printf("  %s 9%s Deadlock detection          %s10%s Max grantable request\n", c_bold(), c_reset(), c_bold(), c_reset());
    printf("  %s11%s Resource graph cycles       %s12%s Random safe state\n", c_bold(), c_reset(), c_bold(), c_reset());
    printf("  %s13%s Save state to file          %s14%s Load state from file\n", c_bold(), c_reset(), c_bold(), c_reset());
    printf("  %s 0%s Exit\n", c_bold(), c_reset());
}

static bool manual_entry(void) {
    State t;
    int dims[2];
    if (!read_ints("  Processes and resource types (e.g. 5 3): ", dims, 2)) return false;
    if (dims[0] < 1 || dims[0] > MAX_P || dims[1] < 1 || dims[1] > MAX_R) {
        printf("%s  Out of range (max %d processes, %d resources).%s\n", c_red(), MAX_P, MAX_R, c_reset());
        return true;
    }
    state_init(&t, dims[0], dims[1]);
    char prompt[64];
    for (int i = 0; i < t.P; i++) {
        snprintf(prompt, sizeof prompt, "  Allocation P%d (%d values): ", i, t.R);
        if (!read_ints(prompt, t.alloc[i], t.R)) return false;
    }
    for (int i = 0; i < t.P; i++) {
        snprintf(prompt, sizeof prompt, "  Max        P%d (%d values): ", i, t.R);
        if (!read_ints(prompt, t.max[i], t.R)) return false;
    }
    if (!read_ints("  Available: ", t.avail, t.R)) return false;
    ErrorList err;
    errors_clear(&err);
    if (!calculate_need(&t, &err)) {
        printf("%s  State rejected:%s\n", c_red(), c_reset());
        print_errors(stdout, &err);
        return true;
    }
    g_state = t;
    g_loaded = true;
    print_state(stdout, &g_state);
    return true;
}

static bool load_any(const char *path) {
    ErrorList err;
    errors_clear(&err);
    FILE *f = fopen(path, "r");
    if (!f) {
        printf("%s  Cannot open '%s'%s\n", c_red(), path, c_reset());
        return false;
    }
    int c;
    do c = fgetc(f);
    while (c == ' ' || c == '\n' || c == '\t' || c == '\r');
    fclose(f);
    State t;
    bool ok;
    if (c == '{') {
        /* JSON scenario file: {"state": {...}} or a bare state object */
        f = fopen(path, "r");
        if (!f) return false;
        char *buf = malloc(1 << 20);
        if (!buf) {
            fclose(f);
            return false;
        }
        size_t n = fread(buf, 1, (1 << 20) - 1, f);
        buf[n] = '\0';
        fclose(f);
        char perr[128];
        JVal *root = json_parse(buf, perr, sizeof perr);
        free(buf);
        if (!root) {
            printf("%s  JSON error: %s%s\n", c_red(), perr, c_reset());
            return false;
        }
        const JVal *st = json_get(root, "state");
        ok = json_to_state(st ? st : root, &t, &err) && calculate_need(&t, &err);
        json_free(root);
    } else {
        ok = state_load_file(&t, path, &err);
    }
    if (!ok) {
        printf("%s  Could not load state:%s\n", c_red(), c_reset());
        print_errors(stdout, &err);
        return false;
    }
    g_state = t;
    g_loaded = true;
    printf("%s  Loaded '%s'%s\n", c_green(), path, c_reset());
    print_state(stdout, &g_state);
    return true;
}

static bool do_request(void) {
    int pid, req[MAX_R] = {0};
    if (!read_int("  Process id: ", &pid)) return false;
    char prompt[64];
    snprintf(prompt, sizeof prompt, "  Request vector (%d values): ", g_state.R);
    if (!read_ints(prompt, req, g_state.R)) return false;
    ErrorList err;
    errors_clear(&err);
    RequestOutcome o = request_resources(&g_state, pid, req, &g_rr, &err);
    if (o == REQ_INVALID) {
        print_errors(stdout, &err);
        return true;
    }
    print_request(stdout, &g_state, &g_rr);
    if (o == REQ_GRANTED) g_granted++;
    else g_denied++;
    return true;
}

static bool do_release(bool complete) {
    int pid, rel[MAX_R] = {0};
    if (!read_int("  Process id: ", &pid)) return false;
    if (!complete) {
        char prompt[64];
        snprintf(prompt, sizeof prompt, "  Release vector (%d values): ", g_state.R);
        if (!read_ints(prompt, rel, g_state.R)) return false;
    }
    ErrorList err;
    errors_clear(&err);
    if (complete && pid >= 0 && pid < g_state.P)
        for (int j = 0; j < g_state.R; j++) rel[j] = g_state.alloc[pid][j];
    bool ok = complete ? complete_process(&g_state, pid, &err) : release_resources(&g_state, pid, rel, &err);
    print_release(stdout, pid, rel, g_state.R, ok);
    print_errors(stdout, &err);
    if (ok) print_state(stdout, &g_state);
    return true;
}

int run_interactive(State *initial, bool has_initial) {
    if (has_initial) {
        g_state = *initial;
        g_loaded = true;
    }
    banner();
    char line[256];
    for (;;) {
        menu();
        if (!read_line("\n  Choose an option: ", line, sizeof line)) break;
        int choice;
        if (parse_ints(line, &choice, 1) != 1) {
            printf("%s  Enter a number from the menu.%s\n", c_red(), c_reset());
            continue;
        }
        bool alive = true;
        switch (choice) {
        case 0:
            printf("  Goodbye.\n");
            return 0;
        case 1:
            state_load_textbook(&g_state);
            g_loaded = true;
            printf("%s  Loaded the textbook 5x3 state.%s\n", c_green(), c_reset());
            print_state(stdout, &g_state);
            break;
        case 2: alive = manual_entry(); break;
        case 3:
            if (need_state()) print_state(stdout, &g_state);
            break;
        case 4:
            if (need_state()) alive = do_request();
            break;
        case 5:
            if (need_state()) alive = do_release(false);
            break;
        case 6:
            if (need_state()) alive = do_release(true);
            break;
        case 7:
            if (need_state()) {
                is_safe(&g_state, &g_sr);
                print_safety(stdout, &g_state, &g_sr);
            }
            break;
        case 8:
            if (need_state()) {
                bool trunc;
                long ops;
                int n = all_safe_sequences(&g_state, g_seqs, MAX_SEQUENCES, &trunc, &ops);
                print_sequences(stdout, g_seqs, n, g_state.P, trunc);
            }
            break;
        case 9:
            if (need_state()) {
                detect_deadlock(&g_state, NULL, &g_dr);
                print_detect(stdout, &g_state, &g_dr);
            }
            break;
        case 10:
            if (need_state()) {
                printf("\n%sMaximum grantable request%s\n", c_accent(), c_reset());
                for (int i = 0; i < g_state.P; i++) {
                    MaxGrant m;
                    long ops = 0;
                    max_grantable(&g_state, i, &m, &ops, NULL);
                    print_max_grant(stdout, &g_state, i, &m);
                }
            }
            break;
        case 11:
            if (need_state()) {
                find_graph_cycles(&g_state, &g_gr);
                print_graph(stdout, &g_state, &g_gr);
            }
            break;
        case 12: {
            int dims[2];
            if (!read_ints("  Processes and resource types (e.g. 6 4): ", dims, 2)) {
                alive = false;
                break;
            }
            random_state(&g_state, dims[0], dims[1], (unsigned)(dims[0] * 7919 + dims[1] * 104729 + g_granted), true);
            g_loaded = true;
            print_state(stdout, &g_state);
            break;
        }
        case 13:
            if (need_state()) {
                if (!read_line("  File path: ", line, sizeof line)) {
                    alive = false;
                    break;
                }
                ErrorList err;
                errors_clear(&err);
                if (state_save_file(&g_state, line, &err)) printf("%s  Saved to '%s'%s\n", c_green(), line, c_reset());
                else print_errors(stdout, &err);
            }
            break;
        case 14:
            if (!read_line("  File path (.txt state or .json scenario): ", line, sizeof line)) {
                alive = false;
                break;
            }
            load_any(line);
            break;
        default: printf("%s  Unknown option %d.%s\n", c_red(), choice, c_reset());
        }
        if (!alive) break;
    }
    printf("\n");
    return 0;
}

bool cli_load_path(const char *path) { return load_any(path); }
