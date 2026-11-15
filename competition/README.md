# Parallel build competition

UzHack 2026 / ShifoHalqa MVP will be implemented in three isolated lanes before the final merge:

| Lane | Harness / agent | Branch | Worktree |
|---|---|---|---|
| OpenCode | OpenCode | `agent/opencode` | `~/Projects/uzhack-agent-opencode` |
| Pi | Pi | `agent/pi` | `~/Projects/uzhack-agent-pi` |
| Antigravity | Antigravity CLI | `agent/antigravity` | `~/Projects/uzhack-agent-antigravity` |

Rules:
- Each lane starts from the same `main` commit and the same spec.
- Each lane owns its worktree only; do not edit `main` directly.
- Agents may propose better implementation details in `competition/<lane>.md`, but must not silently change the product contract.
- Final selection is based on a rubric: end-to-end workflow, spec coverage, code quality, tests, deployability, safety/honesty.
