# opencode-user-message-jumper

An OpenCode TUI plugin that adds a user-message index to the session sidebar.

The plugin helps you jump back to previous user prompts in the active session.
Clicking an item opens a detail view for that turn, including the original user
message, command/tool titles observed during the turn, and the final assistant
reply text.

## Features

- Adds a `User Messages` section to the OpenCode TUI session sidebar.
- Shows recent user prompts for the active session.
- Provides an `all` picker with searchable user-message titles.
- Adds `/user-messages` and `/umsg` command aliases.
- Shows turn details: user message, attachments, command/tool titles, and final reply.

## Requirements

- OpenCode `>= 1.17.11`
- Bun-compatible OpenCode plugin runtime

## Install From GitHub

Use OpenCode's plugin installer with the GitHub npm package spec:

```sh
opencode plugin -g github:asukaneko/opencode-user-message-jumper
```

Restart the OpenCode TUI after installing.

## Local Development Install

Clone the repository and install dependencies:

```sh
git clone https://github.com/asukaneko/opencode-user-message-jumper.git
cd opencode-user-message-jumper
bun install
```

Then add the local checkout path to `~/.config/opencode/tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    [
      "/absolute/path/to/opencode-user-message-jumper",
      {
        "limit": 12
      }
    ]
  ]
}
```

Restart the OpenCode TUI after changing the config. Do not start OpenCode with
`--pure`, because that disables external plugins.

## Configuration

`limit` controls how many recent user messages are shown in the sidebar.

```json
{
  "limit": 12
}
```

The searchable `all` picker still includes the full user-message list for the
current session.

## Usage

- Open an OpenCode session.
- Use the `User Messages` sidebar section to select a recent prompt.
- Click `all` to search all user prompts in the current session.
- Run `/user-messages` or `/umsg` from the command palette to open the picker.

## Current Limitation

OpenCode `1.17.11` exposes TUI slots, routes, dialogs, and session message
state, but it does not expose a public `scrollToMessage(messageID)` API for the
native transcript. For now, selecting an item opens this plugin's turn detail
view instead of scrolling the built-in transcript to that message.

The navigation behavior is isolated in the implementation, so a future native
scroll API can replace it in one place.

## Development

```sh
bun install
bun run typecheck
```
