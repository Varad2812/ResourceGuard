/*
 * ResourceGuard - main.c
 *
 *   resourceguard                  interactive coloured menu
 *   resourceguard --json < in.json one JSON command in, one JSON object out
 *   resourceguard --load FILE      start the menu with FILE loaded
 *   resourceguard --demo           print the textbook walkthrough and exit
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>

#include "state.h"
#include "banker.h"
#include "print.h"
#include "jsonmode.h"
#include "cli.h"

static void usage(void) {
    printf("ResourceGuard - C-based deadlock avoidance simulator\n\n"
           "Usage:\n"
           "  resourceguard                     interactive menu\n"
           "  resourceguard --json < cmd.json   JSON mode (used by the web dashboard)\n"
           "  resourceguard --load <file>       interactive menu with a state preloaded\n"
           "  resourceguard --demo              textbook walkthrough (test cases 1-5)\n"
           "  resourceguard --no-color          disable ANSI colours\n"
           "  resourceguard --help | --version\n\n"
           "JSON actions: safety | request | release | complete | all_sequences |\n"
           "              detect | max_grantable | graph | validate | random\n");
}

static void demo(void) {
    static State s;
    static RequestResult rr;
    static SafetyResult sr;
    ErrorList err;
    errors_clear(&err);
    state_load_textbook(&s);
    print_state(stdout, &s);
    is_safe(&s, &sr);
    print_safety(stdout, &s, &sr);
    int r1[3] = {1, 0, 2}, r2[3] = {3, 3, 0}, r3[3] = {0, 2, 0};
    request_resources(&s, 1, r1, &rr, &err);
    print_request(stdout, &s, &rr);
    request_resources(&s, 4, r2, &rr, &err);
    print_request(stdout, &s, &rr);
    request_resources(&s, 0, r3, &rr, &err);
    print_request(stdout, &s, &rr);
    print_state(stdout, &s);
}

int main(int argc, char **argv) {
    bool json = false, color = getenv("NO_COLOR") == NULL, want_demo = false;
    const char *load = NULL;
    for (int k = 1; k < argc; k++) {
        if (strcmp(argv[k], "--json") == 0) json = true;
        else if (strcmp(argv[k], "--no-color") == 0) color = false;
        else if (strcmp(argv[k], "--demo") == 0) want_demo = true;
        else if (strcmp(argv[k], "--load") == 0 && k + 1 < argc) load = argv[++k];
        else if (strcmp(argv[k], "--help") == 0 || strcmp(argv[k], "-h") == 0) {
            usage();
            return 0;
        } else if (strcmp(argv[k], "--version") == 0) {
            printf("resourceguard 1.0.0 (C17)\n");
            return 0;
        } else {
            fprintf(stderr, "Unknown option '%s'\n\n", argv[k]);
            usage();
            return 2;
        }
    }
    if (json) return run_json_mode(stdin, stdout);
    print_set_color(color);
    if (want_demo) {
        demo();
        return 0;
    }
    if (load) {
        if (!cli_load_path(load)) return 1;
        return run_interactive(NULL, false);
    }
    return run_interactive(NULL, false);
}
