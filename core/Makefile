# ResourceGuard C engine
CC      ?= gcc
CSTD    := -std=c17
WARN    := -Wall -Wextra -Werror -pedantic
CFLAGS  ?= -O2
CFLAGS  += $(CSTD) $(WARN) -Iinclude
DBGFLAGS := -O0 -g -DRG_DEBUG

SRC     := src/state.c src/banker.c src/json.c src/print.c src/jsonmode.c src/cli.c
OBJ     := $(SRC:src/%.c=build/%.o)
BIN     := build/resourceguard
TESTBIN := build/test_banker

.PHONY: all test debug clean run demo

all: $(BIN)

build:
	@mkdir -p build

build/%.o: src/%.c include/*.h | build
	$(CC) $(CFLAGS) -c $< -o $@

$(BIN): $(OBJ) build/main.o
	$(CC) $(CFLAGS) $^ -o $@

build/main.o: src/main.c include/*.h | build
	$(CC) $(CFLAGS) -c $< -o $@

# Tests are built with RG_DEBUG so rollback memcmp checks abort on mismatch.
$(TESTBIN): tests/test_banker.c $(SRC) include/*.h | build
	$(CC) $(CSTD) $(WARN) -Iinclude $(DBGFLAGS) tests/test_banker.c $(SRC) -o $@

test: $(TESTBIN)
	./$(TESTBIN)

debug: CFLAGS := -O0 -g -DRG_DEBUG
debug: clean all

run: $(BIN)
	./$(BIN)

demo: $(BIN)
	./$(BIN) --demo

clean:
	rm -rf build
