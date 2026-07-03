Run the oh-my-hi dashboard to visualize my AI coding usage across Claude Code and Codex.

Execute this in the shell:

    npx --yes oh-my-hi

oh-my-hi parses local harness data — `~/.claude` (Claude Code) and `$CODEX_HOME`
(Codex, defaults to `~/.codex`) — into a local dashboard: token usage, cost
estimates, sessions, and each tool's skills / memory / MCP servers. Providers
whose config dir is absent are skipped automatically.

Data selection is by config-dir discovery, independent of which tool launched
this. After it starts a local server, report the dashboard URL it prints.
