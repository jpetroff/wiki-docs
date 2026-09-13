BUILD_DIR ?= /home/eugene/www
PORT ?= 8080

.PHONY: build start status stop reload serena

build:
	bash scripts/build.sh "$(BUILD_DIR)" "$(PORT)"

start status stop reload:
	bash scripts/instance.sh "$@" "$(BUILD_DIR)" "$(PORT)"

serena:
	uvx --from git+https://github.com/oraios/serena serena start-mcp-server --transport streamable-http --port 9121 --project-from-cwd --context codex
