# opencode-user-message-jumper

An OpenCode TUI plugin that adds a user-message index to the session sidebar.

The plugin helps you jump back to previous user prompts in the active session.
Clicking an item scrolls the native OpenCode transcript to that user message and
opens a detail dialog for the turn, including the original user message,
command/tool titles observed during the turn, and the final assistant reply
text.

## Features

- Adds a `User Messages` section to the OpenCode TUI session sidebar.
- Shows recent user prompts for the active session.
- Click the `▸` / `▾` indicator to the left of `User Messages` to collapse or
  expand the entire message list in the sidebar.
- Provides an `all` picker with searchable user-message titles and right-aligned timestamps.
- Scrolls the built-in transcript to the selected user message.
- Adds `/user-messages` and `/umsg` command aliases.
- Shows turn details: user message, attachments, command/tool titles, and final reply.

## Requirements

- OpenCode `>= 1.17.11`
- Bun-compatible OpenCode plugin runtime

## Install From npm

Use OpenCode's plugin installer with the npm package spec:

```sh
opencode plugin -g npm:opencode-user-message-jumper
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
        "limit": 12,
        "openDetailOnSidebarClick": true
      }
    ]
  ]
}
```

Restart the OpenCode TUI after changing the config. Do not start OpenCode with
`--pure`, because that disables external plugins.

## Configuration

`limit` controls how many recent user messages are shown in the sidebar.

`openDetailOnSidebarClick` controls whether clicking a user-message item in the
sidebar also opens the turn detail dialog. When set to `false`, sidebar clicks
only scroll the native transcript. The `all` picker still opens the detail
dialog when an item is selected.

```json
{
  "limit": 12,
  "openDetailOnSidebarClick": true
}
```

The searchable `all` picker still includes the full user-message list for the
current session.

## Usage

- Open an OpenCode session.
- Use the `User Messages` sidebar section to select a recent prompt.
- Click the `▸` / `▾` indicator next to `User Messages` to collapse or expand
  the entire message list.
- Click `all` to search all user prompts in the current session.
- Run `/user-messages` or `/umsg` from the command palette to open the picker.
- Move through the picker to preview each prompt's position in the native transcript.

## Current Limitation

OpenCode `1.17.11` exposes TUI slots, routes, dialogs, and session message
state, but it does not expose a public `scrollToMessage(messageID)` API for the
native transcript.

This plugin uses the same internal idea as OpenCode's built-in `/timeline`
command: it finds the rendered message node in the active session and scrolls
the surrounding transcript container to it. This is best-effort behavior and is
kept isolated in the implementation, so a future public scroll API can replace
it in one place.

## Development

```sh
bun install
bun run typecheck
```
