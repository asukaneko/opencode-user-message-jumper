/** @jsxImportSource @opentui/solid */

import type { MouseEvent } from "@opentui/core"
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"
import type { AssistantMessage, Message, Part, UserMessage } from "@opencode-ai/sdk/v2"
import { For, Show, createMemo, createSignal, onCleanup } from "solid-js"

type Api = Parameters<TuiPlugin>[0]

type Options = {
  limit?: unknown
}

type UserMessageItem = {
  id: string
  sessionID: string
  created: number
  index: number
  title: string
  preview: string
  body: string
  attachments: string[]
}

type ProcessCommand = {
  title: string
  status: string
}

type UserTurnDetail = UserMessageItem & {
  commands: ProcessCommand[]
  finalReply: string
  assistantIDs: string[]
}

const id = "user-message-jumper"
const detailRoute = `${id}.message`
const commandOpen = `${id}.open`

const maxPreview = 72
const maxDialogTitle = 120

const asLimit = (value: unknown) => {
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.max(1, Math.min(50, Math.trunc(parsed)))
  }

  if (typeof value !== "number" || !Number.isFinite(value)) return 12
  return Math.max(1, Math.min(50, Math.trunc(value)))
}

const asString = (value: unknown) => (typeof value === "string" ? value : undefined)

const normalize = (value: string) => value.replace(/\s+/g, " ").trim()

const clip = (value: string, max: number) => {
  if (value.length <= max) return value
  return `${value.slice(0, Math.max(0, max - 3)).trimEnd()}...`
}

const onPrimaryClick =
  (callback: () => void) =>
  (event: MouseEvent) => {
    if (event.type !== "up" || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    callback()
  }

const formatTime = (time: number) => {
  if (!Number.isFinite(time)) return "--:--"
  return new Date(time).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })
}

const isUserMessage = (message: Message): message is UserMessage => message.role === "user"

const isAssistantMessage = (message: Message): message is AssistantMessage => message.role === "assistant"

const getText = (parts: readonly Part[]) =>
  parts
    .filter((part): part is Extract<Part, { type: "text" }> => part.type === "text")
    .filter((part) => !part.synthetic && !part.ignored)
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim()

const getAttachments = (parts: readonly Part[]) =>
  parts
    .filter((part): part is Extract<Part, { type: "file" | "agent" }> => part.type === "file" || part.type === "agent")
    .map((part) => {
      if (part.type === "agent") return `@${part.name}`
      if (part.filename) return part.filename
      if (part.source?.type === "file" || part.source?.type === "symbol") return part.source.path
      if (part.source?.type === "resource") return part.source.uri
      return part.url
    })
    .filter((value): value is string => Boolean(value))

const getCommandTitle = (part: Part): ProcessCommand | undefined => {
  if (part.type === "tool") {
    const title = "title" in part.state && typeof part.state.title === "string" ? part.state.title.trim() : ""
    return {
      title: title || part.tool,
      status: part.state.status,
    }
  }

  if (part.type === "subtask") {
    return {
      title: part.command || part.description || part.prompt,
      status: "subtask",
    }
  }

  return undefined
}

const buildItem = (api: Api, message: UserMessage, index: number): UserMessageItem => {
  const parts = api.state.part(message.id)
  const body = getText(parts)
  const attachments = getAttachments(parts)
  const fallback = attachments.length > 0 ? attachments.join(", ") : "Empty user message"
  const title = normalize(message.summary?.title ?? body) || fallback

  return {
    id: message.id,
    sessionID: message.sessionID,
    created: message.time.created,
    index,
    title,
    preview: clip(normalize(title), maxPreview),
    body,
    attachments,
  }
}

const getUserMessages = (api: Api, sessionID: string) =>
  api.state.session
    .messages(sessionID)
    .filter(isUserMessage)
    .map((message, index) => buildItem(api, message, index + 1))

const getAssistantMessagesForUser = (messages: readonly Message[], userMessage: UserMessage) => {
  const direct = messages.filter(isAssistantMessage).filter((message) => message.parentID === userMessage.id)
  if (direct.length > 0) return direct.sort((a, b) => a.time.created - b.time.created)

  const start = messages.findIndex((message) => message.id === userMessage.id)
  if (start < 0) return []

  const fallback: AssistantMessage[] = []
  for (const message of messages.slice(start + 1)) {
    if (isUserMessage(message)) break
    if (isAssistantMessage(message)) fallback.push(message)
  }

  return fallback.sort((a, b) => a.time.created - b.time.created)
}

const getTurnDetail = (api: Api, sessionID: string, messageID: string): UserTurnDetail | undefined => {
  const messages = api.state.session.messages(sessionID)
  const userMessages = messages.filter(isUserMessage)
  const userIndex = userMessages.findIndex((message) => message.id === messageID)
  const userMessage = userMessages[userIndex]
  if (!userMessage) return undefined

  const base = buildItem(api, userMessage, userIndex + 1)
  const assistants = getAssistantMessagesForUser(messages, userMessage)
  const assistantParts = assistants.map((assistant) => api.state.part(assistant.id))
  const commands = assistantParts
    .flatMap((parts) => parts.map(getCommandTitle))
    .filter((command): command is ProcessCommand => Boolean(command))

  const finalReply =
    assistantParts
      .map((parts) => getText(parts))
      .filter(Boolean)
      .at(-1) ?? ""

  return {
    ...base,
    commands,
    finalReply,
    assistantIDs: assistants.map((assistant) => assistant.id),
  }
}

const currentSessionID = (api: Api) => {
  const current = api.route.current
  if (current.name !== "session") return undefined
  return asString(current.params?.sessionID)
}

const openMessage = (api: Api, item: UserMessageItem) => {
  api.ui.dialog.clear()
  api.route.navigate(detailRoute, {
    sessionID: item.sessionID,
    messageID: item.id,
  })
}

const openPicker = (api: Api, sessionID = currentSessionID(api)) => {
  if (!sessionID) {
    api.ui.toast({
      variant: "warning",
      title: "User messages",
      message: "Open a session before using the user-message index.",
    })
    return
  }

  const items = getUserMessages(api, sessionID)
  if (items.length === 0) {
    api.ui.toast({
      variant: "info",
      title: "User messages",
      message: "This session has no user messages yet.",
    })
    return
  }

  const DialogSelect = api.ui.DialogSelect<UserMessageItem>
  api.ui.dialog.setSize("large")
  api.ui.dialog.replace(() => (
    <DialogSelect
      title="User Messages"
      placeholder="Filter messages"
      options={items
        .slice()
        .reverse()
        .map((item) => ({
          title: clip(normalize(item.title), maxDialogTitle),
          value: item,
          description: `#${item.index}  ${formatTime(item.created)}${item.attachments.length > 0 ? `  ${item.attachments.length} attachment(s)` : ""}`,
          footer: item.attachments.length > 0 ? item.attachments.join(", ") : undefined,
        }))}
      onSelect={(option) => openMessage(api, option.value)}
    />
  ))
}

const isMessageEventForSession = (sessionID: string, event: { properties: { sessionID?: string } }) =>
  event.properties.sessionID === sessionID

const Sidebar = (props: { api: Api; sessionID: string; limit: number }) => {
  const [version, setVersion] = createSignal(0)

  const refresh = () => setVersion((value) => value + 1)
  const disposes = [
    props.api.event.on("message.updated", (event) => {
      if (isMessageEventForSession(props.sessionID, event)) refresh()
    }),
    props.api.event.on("message.removed", (event) => {
      if (isMessageEventForSession(props.sessionID, event)) refresh()
    }),
    props.api.event.on("message.part.updated", (event) => {
      if (isMessageEventForSession(props.sessionID, event)) refresh()
    }),
    props.api.event.on("message.part.removed", (event) => {
      if (isMessageEventForSession(props.sessionID, event)) refresh()
    }),
  ]

  onCleanup(() => {
    for (const dispose of disposes) dispose()
  })

  const items = createMemo(() => {
    version()
    return getUserMessages(props.api, props.sessionID).slice(-props.limit).reverse()
  })

  const select = (item: UserMessageItem) => {
    openMessage(props.api, item)
  }

  const theme = props.api.theme.current

  return (
    <box width="100%" flexDirection="column" paddingTop={1} rowGap={1}>
      <box width="100%" flexDirection="row" justifyContent="space-between">
        <text fg={theme.textMuted} truncate>
          User Messages
        </text>
        <text fg={theme.textMuted} truncate onMouseUp={onPrimaryClick(() => openPicker(props.api, props.sessionID))}>
          all
        </text>
      </box>

      <Show
        when={items().length > 0}
        fallback={
          <text fg={theme.textMuted} wrapMode="word">
            No user messages yet.
          </text>
        }
      >
        <For each={items()}>
          {(item) => (
            <box
              width="100%"
              flexDirection="column"
              paddingX={1}
              paddingY={0}
              border={false}
              focusable
              backgroundColor={theme.backgroundElement}
              onMouseUp={onPrimaryClick(() => select(item))}
            >
              <text fg={theme.text} truncate>
                #{item.index} {item.preview}
              </text>
              <text fg={theme.textMuted} truncate>
                {formatTime(item.created)}
                {item.attachments.length > 0 ? `  ${item.attachments.length} attachment(s)` : ""}
              </text>
            </box>
          )}
        </For>
      </Show>
    </box>
  )
}

const MessageDetail = (props: { api: Api; sessionID?: string; messageID?: string }) => {
  const [version, setVersion] = createSignal(0)
  const refresh = () => setVersion((value) => value + 1)
  const disposes = props.sessionID
    ? [
        props.api.event.on("message.updated", (event) => {
          if (props.sessionID && isMessageEventForSession(props.sessionID, event)) refresh()
        }),
        props.api.event.on("message.removed", (event) => {
          if (props.sessionID && isMessageEventForSession(props.sessionID, event)) refresh()
        }),
        props.api.event.on("message.part.updated", (event) => {
          if (props.sessionID && isMessageEventForSession(props.sessionID, event)) refresh()
        }),
        props.api.event.on("message.part.removed", (event) => {
          if (props.sessionID && isMessageEventForSession(props.sessionID, event)) refresh()
        }),
      ]
    : []

  onCleanup(() => {
    for (const dispose of disposes) dispose()
  })

  const item = createMemo(() => {
    version()
    if (!props.sessionID || !props.messageID) return undefined
    return getTurnDetail(props.api, props.sessionID, props.messageID)
  })

  const theme = props.api.theme.current
  const back = () => {
    if (!props.sessionID) return
    props.api.route.navigate("session", { sessionID: props.sessionID })
  }

  return (
    <box width="100%" height="100%" flexDirection="column" paddingX={2} paddingY={1} rowGap={1}>
      <box width="100%" flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} truncate>
          User Turn
        </text>
        <text fg={theme.textMuted} truncate onMouseUp={onPrimaryClick(back)}>
          back
        </text>
      </box>

      <Show
        when={item()}
        fallback={
          <box flexGrow={1} border borderColor={theme.border} padding={1}>
            <text fg={theme.warning} wrapMode="word">
              Message not found. It may have been removed or compacted.
            </text>
          </box>
        }
      >
        {(entry) => (
          <>
            <text fg={theme.textMuted} truncate>
              #{entry().index}  {formatTime(entry().created)}  {entry().id}
            </text>
            <scrollbox flexGrow={1} border borderColor={theme.border} padding={1}>
              <text fg={theme.textMuted}>User Message</text>
              <Show
                when={entry().body}
                fallback={
                  <text fg={theme.textMuted} wrapMode="word">
                    This user message has no text body.
                  </text>
                }
              >
                <text fg={theme.text} wrapMode="word">
                  {entry().body}
                </text>
              </Show>
              <Show when={entry().attachments.length > 0}>
                <box flexDirection="column" paddingTop={1}>
                  <text fg={theme.textMuted}>Attachments</text>
                  <For each={entry().attachments}>{(attachment) => <text fg={theme.textMuted}>- {attachment}</text>}</For>
                </box>
              </Show>
              <box flexDirection="column" paddingTop={1}>
                <text fg={theme.textMuted}>Commands</text>
                <Show
                  when={entry().commands.length > 0}
                  fallback={
                    <text fg={theme.textMuted} wrapMode="word">
                      No command or tool titles found for this turn.
                    </text>
                  }
                >
                  <For each={entry().commands}>
                    {(command) => (
                      <text fg={theme.text} wrapMode="word">
                        - {command.title} [{command.status}]
                      </text>
                    )}
                  </For>
                </Show>
              </box>
              <box flexDirection="column" paddingTop={1}>
                <text fg={theme.textMuted}>Final Reply</text>
                <Show
                  when={entry().finalReply}
                  fallback={
                    <text fg={theme.textMuted} wrapMode="word">
                      No assistant reply text found yet.
                    </text>
                  }
                >
                  <text fg={theme.text} wrapMode="word">
                    {entry().finalReply}
                  </text>
                </Show>
              </box>
            </scrollbox>
          </>
        )}
      </Show>
    </box>
  )
}

const tui: TuiPlugin = async (api, options) => {
  const limit = asLimit((options as Options | undefined)?.limit)

  api.route.register([
    {
      name: detailRoute,
      render(input) {
        return (
          <MessageDetail
            api={api}
            sessionID={asString(input.params?.sessionID)}
            messageID={asString(input.params?.messageID)}
          />
        )
      },
    },
  ])

  api.slots.register({
    order: 325,
    slots: {
      sidebar_content(_ctx, props) {
        return <Sidebar api={api} sessionID={props.session_id} limit={limit} />
      },
    },
  })

  const disposeCommand = api.command?.register(() => [
    {
      title: "Open user messages",
      value: commandOpen,
      description: "Open an index of user prompts in the current session",
      category: "Plugin",
      slash: {
        name: "user-messages",
        aliases: ["umsg"],
      },
      onSelect(dialog) {
        dialog?.clear()
        openPicker(api)
      },
    },
  ])

  if (disposeCommand) {
    api.lifecycle.onDispose(disposeCommand)
  }
}

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
}

export default plugin
