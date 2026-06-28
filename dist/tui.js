import { effect as _$effect } from "@opentui/solid";
import { createTextNode as _$createTextNode } from "@opentui/solid";
import { insertNode as _$insertNode } from "@opentui/solid";
import { insert as _$insert } from "@opentui/solid";
import { memo as _$memo } from "@opentui/solid";
import { setProp as _$setProp } from "@opentui/solid";
import { createElement as _$createElement } from "@opentui/solid";
import { createComponent as _$createComponent } from "@opentui/solid";
/** @jsxImportSource @opentui/solid */

import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";
const id = "user-message-jumper";
const detailRoute = `${id}.message`;
const commandOpen = `${id}.open`;
const maxPreview = 72;
const maxDialogTitle = 120;
const asLimit = value => {
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(1, Math.min(50, Math.trunc(parsed)));
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return 12;
  return Math.max(1, Math.min(50, Math.trunc(value)));
};
const asBoolean = (value, fallback) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
};
const asString = value => typeof value === "string" ? value : undefined;
const normalize = value => value.replace(/\s+/g, " ").trim();
const clip = (value, max) => {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
};
const onPrimaryClick = callback => event => {
  if (event.type !== "up" || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  callback();
};
const formatTime = time => {
  if (!Number.isFinite(time)) return "--:--";
  return new Date(time).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
};
const isUserMessage = message => message.role === "user";
const isAssistantMessage = message => message.role === "assistant";
const getText = parts => parts.filter(part => part.type === "text").filter(part => !part.synthetic && !part.ignored).map(part => part.text.trim()).filter(Boolean).join("\n\n").trim();
const getAttachments = parts => parts.filter(part => part.type === "file" || part.type === "agent").map(part => {
  if (part.type === "agent") return `@${part.name}`;
  if (part.filename) return part.filename;
  if (part.source?.type === "file" || part.source?.type === "symbol") return part.source.path;
  if (part.source?.type === "resource") return part.source.uri;
  return part.url;
}).filter(value => Boolean(value));
const getCommandTitle = part => {
  if (part.type === "tool") {
    const title = "title" in part.state && typeof part.state.title === "string" ? part.state.title.trim() : "";
    return {
      title: title || part.tool,
      status: part.state.status
    };
  }
  if (part.type === "subtask") {
    return {
      title: part.command || part.description || part.prompt,
      status: "subtask"
    };
  }
  return undefined;
};
const buildItem = (api, message, index) => {
  const parts = api.state.part(message.id);
  const body = getText(parts);
  const attachments = getAttachments(parts);
  const fallback = attachments.length > 0 ? attachments.join(", ") : "Empty user message";
  const title = normalize(message.summary?.title ?? body) || fallback;
  return {
    id: message.id,
    sessionID: message.sessionID,
    created: message.time.created,
    index,
    title,
    preview: clip(normalize(title), maxPreview),
    body,
    attachments
  };
};
const getUserMessages = (api, sessionID) => api.state.session.messages(sessionID).filter(isUserMessage).map((message, index) => buildItem(api, message, index + 1));
const getAssistantMessagesForUser = (messages, userMessage) => {
  const direct = messages.filter(isAssistantMessage).filter(message => message.parentID === userMessage.id);
  if (direct.length > 0) return direct.sort((a, b) => a.time.created - b.time.created);
  const start = messages.findIndex(message => message.id === userMessage.id);
  if (start < 0) return [];
  const fallback = [];
  for (const message of messages.slice(start + 1)) {
    if (isUserMessage(message)) break;
    if (isAssistantMessage(message)) fallback.push(message);
  }
  return fallback.sort((a, b) => a.time.created - b.time.created);
};
const getTurnDetail = (api, sessionID, messageID) => {
  const messages = api.state.session.messages(sessionID);
  const userMessages = messages.filter(isUserMessage);
  const userIndex = userMessages.findIndex(message => message.id === messageID);
  const userMessage = userMessages[userIndex];
  if (!userMessage) return undefined;
  const base = buildItem(api, userMessage, userIndex + 1);
  const assistants = getAssistantMessagesForUser(messages, userMessage);
  const assistantParts = assistants.map(assistant => api.state.part(assistant.id));
  const commands = assistantParts.flatMap(parts => parts.map(getCommandTitle)).filter(command => Boolean(command));
  const finalReply = assistantParts.map(parts => getText(parts)).filter(Boolean).at(-1) ?? "";
  return {
    ...base,
    commands,
    finalReply,
    assistantIDs: assistants.map(assistant => assistant.id)
  };
};
const getChildren = node => {
  try {
    return node.getChildren?.() ?? [];
  } catch {
    return [];
  }
};
const ownsChild = (node, target) => getChildren(node).includes(target) || (node.content?.getChildren?.() ?? []).includes(target);
const findScrollForChild = (root, target) => {
  const stack = [root];
  const seen = new Set();
  while (stack.length > 0) {
    const node = stack.pop();
    if (seen.has(node)) continue;
    seen.add(node);
    if (typeof node.scrollBy === "function" && ownsChild(node, target)) return node;
    stack.push(...getChildren(node));
  }
  return undefined;
};
const scrollNativeToMessage = (api, messageID) => {
  const root = api.renderer.root;
  const child = root.findDescendantById?.(messageID);
  if (!child || child.isDestroyed) return false;
  const scroll = findScrollForChild(root, child);
  if (!scroll || scroll.isDestroyed) return false;
  if (typeof child.y === "number" && typeof scroll.y === "number" && typeof scroll.scrollBy === "function") {
    scroll.scrollBy(child.y - scroll.y - 1);
    return true;
  }
  if (typeof scroll.scrollChildIntoView === "function" && child.id) {
    scroll.scrollChildIntoView(child.id);
    return true;
  }
  return false;
};
const currentSessionID = api => {
  const current = api.route.current;
  if (current.name !== "session") return undefined;
  return asString(current.params?.sessionID);
};
const openMessage = (api, item) => {
  scrollNativeToMessage(api, item.id);
  api.route.navigate(detailRoute, {
    sessionID: item.sessionID,
    messageID: item.id
  });
};
const openPicker = (api, sessionID = currentSessionID(api)) => {
  if (!sessionID) {
    api.ui.toast({
      variant: "warning",
      title: "User messages",
      message: "Open a session before using the user-message index."
    });
    return;
  }
  const items = getUserMessages(api, sessionID);
  if (items.length === 0) {
    api.ui.toast({
      variant: "info",
      title: "User messages",
      message: "This session has no user messages yet."
    });
    return;
  }
  const DialogSelect = api.ui.DialogSelect;
  api.ui.dialog.setSize("large");
  api.ui.dialog.replace(() => _$createComponent(DialogSelect, {
    title: "User Messages",
    placeholder: "Filter messages",
    get options() {
      return items.slice().reverse().map(item => ({
        title: clip(normalize(item.title), maxDialogTitle),
        value: item,
        description: `#${item.index}${item.attachments.length > 0 ? `  ${item.attachments.length} attachment(s)` : ""}`,
        footer: formatTime(item.created)
      }));
    },
    onMove: option => scrollNativeToMessage(api, option.value.id),
    onSelect: option => openMessage(api, option.value)
  }));
};
const isMessageEventForSession = (sessionID, event) => event.properties.sessionID === sessionID;
const Sidebar = props => {
  const [version, setVersion] = createSignal(0);
  const [collapsed, setCollapsed] = createSignal(false);
  const refresh = () => setVersion(value => value + 1);
  const disposes = [props.api.event.on("message.updated", event => {
    if (isMessageEventForSession(props.sessionID, event)) refresh();
  }), props.api.event.on("message.removed", event => {
    if (isMessageEventForSession(props.sessionID, event)) refresh();
  }), props.api.event.on("message.part.updated", event => {
    if (isMessageEventForSession(props.sessionID, event)) refresh();
  }), props.api.event.on("message.part.removed", event => {
    if (isMessageEventForSession(props.sessionID, event)) refresh();
  })];
  onCleanup(() => {
    for (const dispose of disposes) dispose();
  });
  const items = createMemo(() => {
    version();
    return getUserMessages(props.api, props.sessionID).slice(-props.limit).reverse();
  });
  const toggleCollapsed = () => setCollapsed(value => !value);
  const select = item => {
    if (props.openDetailOnClick) {
      openMessage(props.api, item);
      return;
    }
    scrollNativeToMessage(props.api, item.id);
  };
  const theme = props.api.theme.current;
  return (() => {
    var _el$ = _$createElement("box"),
      _el$2 = _$createElement("box"),
      _el$3 = _$createElement("box"),
      _el$4 = _$createElement("text"),
      _el$5 = _$createElement("text"),
      _el$7 = _$createElement("text");
    _$insertNode(_el$, _el$2);
    _$setProp(_el$, "width", "100%");
    _$setProp(_el$, "flexDirection", "column");
    _$setProp(_el$, "paddingTop", 1);
    _$setProp(_el$, "rowGap", 1);
    _$insertNode(_el$2, _el$3);
    _$insertNode(_el$2, _el$7);
    _$setProp(_el$2, "width", "100%");
    _$setProp(_el$2, "flexDirection", "row");
    _$setProp(_el$2, "justifyContent", "space-between");
    _$insertNode(_el$3, _el$4);
    _$insertNode(_el$3, _el$5);
    _$setProp(_el$3, "flexDirection", "row");
    _$setProp(_el$3, "columnGap", 1);
    _$setProp(_el$4, "truncate", true);
    _$insert(_el$4, () => collapsed() ? "▸" : "▾");
    _$insertNode(_el$5, _$createTextNode(`User Messages`));
    _$setProp(_el$5, "truncate", true);
    _$insertNode(_el$7, _$createTextNode(`all`));
    _$setProp(_el$7, "truncate", true);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return !collapsed();
      },
      get children() {
        return _$createComponent(Show, {
          get when() {
            return items().length > 0;
          },
          get fallback() {
            return (() => {
              var _el$9 = _$createElement("text");
              _$insertNode(_el$9, _$createTextNode(`No user messages yet.`));
              _$setProp(_el$9, "wrapMode", "word");
              _$effect(_$p => _$setProp(_el$9, "fg", theme.textMuted, _$p));
              return _el$9;
            })();
          },
          get children() {
            return _$createComponent(For, {
              get each() {
                return items();
              },
              children: item => (() => {
                var _el$1 = _$createElement("box"),
                  _el$10 = _$createElement("box"),
                  _el$11 = _$createElement("text"),
                  _el$12 = _$createTextNode(`#`),
                  _el$13 = _$createElement("text"),
                  _el$14 = _$createElement("text");
                _$insertNode(_el$1, _el$10);
                _$insertNode(_el$1, _el$14);
                _$setProp(_el$1, "width", "100%");
                _$setProp(_el$1, "flexDirection", "column");
                _$setProp(_el$1, "paddingX", 1);
                _$setProp(_el$1, "paddingY", 0);
                _$setProp(_el$1, "border", false);
                _$setProp(_el$1, "focusable", true);
                _$insertNode(_el$10, _el$11);
                _$insertNode(_el$10, _el$13);
                _$setProp(_el$10, "flexDirection", "row");
                _$setProp(_el$10, "columnGap", 1);
                _$insertNode(_el$11, _el$12);
                _$setProp(_el$11, "truncate", true);
                _$insert(_el$11, () => item.index, null);
                _$setProp(_el$13, "truncate", true);
                _$insert(_el$13, () => item.preview);
                _$setProp(_el$14, "truncate", true);
                _$insert(_el$14, () => formatTime(item.created), null);
                _$insert(_el$14, (() => {
                  var _c$ = _$memo(() => item.attachments.length > 0);
                  return () => _c$() ? `  ${item.attachments.length} attachment(s)` : "";
                })(), null);
                _$effect(_p$ => {
                  var _v$6 = theme.backgroundElement,
                    _v$7 = onPrimaryClick(() => select(item)),
                    _v$8 = theme.warning,
                    _v$9 = theme.text,
                    _v$0 = theme.textMuted;
                  _v$6 !== _p$.e && (_p$.e = _$setProp(_el$1, "backgroundColor", _v$6, _p$.e));
                  _v$7 !== _p$.t && (_p$.t = _$setProp(_el$1, "onMouseUp", _v$7, _p$.t));
                  _v$8 !== _p$.a && (_p$.a = _$setProp(_el$11, "fg", _v$8, _p$.a));
                  _v$9 !== _p$.o && (_p$.o = _$setProp(_el$13, "fg", _v$9, _p$.o));
                  _v$0 !== _p$.i && (_p$.i = _$setProp(_el$14, "fg", _v$0, _p$.i));
                  return _p$;
                }, {
                  e: undefined,
                  t: undefined,
                  a: undefined,
                  o: undefined,
                  i: undefined
                });
                return _el$1;
              })()
            });
          }
        });
      }
    }), null);
    _$effect(_p$ => {
      var _v$ = onPrimaryClick(toggleCollapsed),
        _v$2 = theme.textMuted,
        _v$3 = theme.textMuted,
        _v$4 = theme.textMuted,
        _v$5 = onPrimaryClick(() => openPicker(props.api, props.sessionID));
      _v$ !== _p$.e && (_p$.e = _$setProp(_el$3, "onMouseUp", _v$, _p$.e));
      _v$2 !== _p$.t && (_p$.t = _$setProp(_el$4, "fg", _v$2, _p$.t));
      _v$3 !== _p$.a && (_p$.a = _$setProp(_el$5, "fg", _v$3, _p$.a));
      _v$4 !== _p$.o && (_p$.o = _$setProp(_el$7, "fg", _v$4, _p$.o));
      _v$5 !== _p$.i && (_p$.i = _$setProp(_el$7, "onMouseUp", _v$5, _p$.i));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined,
      o: undefined,
      i: undefined
    });
    return _el$;
  })();
};
const MessageDetail = props => {
  const [version, setVersion] = createSignal(0);
  const refresh = () => setVersion(value => value + 1);
  const disposes = props.sessionID ? [props.api.event.on("message.updated", event => {
    if (props.sessionID && isMessageEventForSession(props.sessionID, event)) refresh();
  }), props.api.event.on("message.removed", event => {
    if (props.sessionID && isMessageEventForSession(props.sessionID, event)) refresh();
  }), props.api.event.on("message.part.updated", event => {
    if (props.sessionID && isMessageEventForSession(props.sessionID, event)) refresh();
  }), props.api.event.on("message.part.removed", event => {
    if (props.sessionID && isMessageEventForSession(props.sessionID, event)) refresh();
  })] : [];
  onCleanup(() => {
    for (const dispose of disposes) dispose();
  });
  const item = createMemo(() => {
    version();
    if (!props.sessionID || !props.messageID) return undefined;
    return getTurnDetail(props.api, props.sessionID, props.messageID);
  });
  const theme = props.api.theme.current;
  const back = () => {
    if (props.onClose) {
      props.onClose();
      return;
    }
    if (!props.sessionID) return;
    props.api.route.navigate("session", {
      sessionID: props.sessionID
    });
  };
  return (() => {
    var _el$15 = _$createElement("box"),
      _el$16 = _$createElement("box"),
      _el$17 = _$createElement("text"),
      _el$19 = _$createElement("text");
    _$insertNode(_el$15, _el$16);
    _$setProp(_el$15, "width", "100%");
    _$setProp(_el$15, "height", "100%");
    _$setProp(_el$15, "flexDirection", "column");
    _$setProp(_el$15, "paddingX", 2);
    _$setProp(_el$15, "paddingY", 1);
    _$setProp(_el$15, "rowGap", 1);
    _$insertNode(_el$16, _el$17);
    _$insertNode(_el$16, _el$19);
    _$setProp(_el$16, "width", "100%");
    _$setProp(_el$16, "flexDirection", "row");
    _$setProp(_el$16, "justifyContent", "space-between");
    _$insertNode(_el$17, _$createTextNode(`User Turn`));
    _$setProp(_el$17, "truncate", true);
    _$insertNode(_el$19, _$createTextNode(`back`));
    _$setProp(_el$19, "truncate", true);
    _$insert(_el$15, _$createComponent(Show, {
      get when() {
        return item();
      },
      get fallback() {
        return (() => {
          var _el$21 = _$createElement("box"),
            _el$22 = _$createElement("text");
          _$insertNode(_el$21, _el$22);
          _$setProp(_el$21, "flexGrow", 1);
          _$setProp(_el$21, "border", true);
          _$setProp(_el$21, "padding", 1);
          _$insertNode(_el$22, _$createTextNode(`Message not found. It may have been removed or compacted.`));
          _$setProp(_el$22, "wrapMode", "word");
          _$effect(_p$ => {
            var _v$12 = theme.border,
              _v$13 = theme.warning;
            _v$12 !== _p$.e && (_p$.e = _$setProp(_el$21, "borderColor", _v$12, _p$.e));
            _v$13 !== _p$.t && (_p$.t = _$setProp(_el$22, "fg", _v$13, _p$.t));
            return _p$;
          }, {
            e: undefined,
            t: undefined
          });
          return _el$21;
        })();
      },
      children: entry => [(() => {
        var _el$24 = _$createElement("text"),
          _el$25 = _$createTextNode(`#`),
          _el$26 = _$createTextNode(` `),
          _el$27 = _$createTextNode(` `);
        _$insertNode(_el$24, _el$25);
        _$insertNode(_el$24, _el$26);
        _$insertNode(_el$24, _el$27);
        _$setProp(_el$24, "truncate", true);
        _$insert(_el$24, () => entry().index, _el$26);
        _$insert(_el$24, () => formatTime(entry().created), _el$27);
        _$insert(_el$24, () => entry().id, null);
        _$effect(_$p => _$setProp(_el$24, "fg", theme.textMuted, _$p));
        return _el$24;
      })(), (() => {
        var _el$28 = _$createElement("scrollbox"),
          _el$29 = _$createElement("text"),
          _el$35 = _$createElement("box"),
          _el$36 = _$createElement("text"),
          _el$38 = _$createElement("box"),
          _el$39 = _$createElement("text");
        _$insertNode(_el$28, _el$29);
        _$insertNode(_el$28, _el$35);
        _$insertNode(_el$28, _el$38);
        _$setProp(_el$28, "flexGrow", 1);
        _$setProp(_el$28, "border", true);
        _$setProp(_el$28, "padding", 1);
        _$insertNode(_el$29, _$createTextNode(`User Message`));
        _$insert(_el$28, _$createComponent(Show, {
          get when() {
            return entry().body;
          },
          get fallback() {
            return (() => {
              var _el$42 = _$createElement("text");
              _$insertNode(_el$42, _$createTextNode(`This user message has no text body.`));
              _$setProp(_el$42, "wrapMode", "word");
              _$effect(_$p => _$setProp(_el$42, "fg", theme.textMuted, _$p));
              return _el$42;
            })();
          },
          get children() {
            var _el$31 = _$createElement("text");
            _$setProp(_el$31, "wrapMode", "word");
            _$insert(_el$31, () => entry().body);
            _$effect(_$p => _$setProp(_el$31, "fg", theme.text, _$p));
            return _el$31;
          }
        }), _el$35);
        _$insert(_el$28, _$createComponent(Show, {
          get when() {
            return entry().attachments.length > 0;
          },
          get children() {
            var _el$32 = _$createElement("box"),
              _el$33 = _$createElement("text");
            _$insertNode(_el$32, _el$33);
            _$setProp(_el$32, "flexDirection", "column");
            _$setProp(_el$32, "paddingTop", 1);
            _$insertNode(_el$33, _$createTextNode(`Attachments`));
            _$insert(_el$32, _$createComponent(For, {
              get each() {
                return entry().attachments;
              },
              children: attachment => (() => {
                var _el$44 = _$createElement("text"),
                  _el$45 = _$createTextNode(`- `);
                _$insertNode(_el$44, _el$45);
                _$insert(_el$44, attachment, null);
                _$effect(_$p => _$setProp(_el$44, "fg", theme.textMuted, _$p));
                return _el$44;
              })()
            }), null);
            _$effect(_$p => _$setProp(_el$33, "fg", theme.textMuted, _$p));
            return _el$32;
          }
        }), _el$35);
        _$insertNode(_el$35, _el$36);
        _$setProp(_el$35, "flexDirection", "column");
        _$setProp(_el$35, "paddingTop", 1);
        _$insertNode(_el$36, _$createTextNode(`Commands`));
        _$insert(_el$35, _$createComponent(Show, {
          get when() {
            return entry().commands.length > 0;
          },
          get fallback() {
            return (() => {
              var _el$46 = _$createElement("text");
              _$insertNode(_el$46, _$createTextNode(`No command or tool titles found for this turn.`));
              _$setProp(_el$46, "wrapMode", "word");
              _$effect(_$p => _$setProp(_el$46, "fg", theme.textMuted, _$p));
              return _el$46;
            })();
          },
          get children() {
            return _$createComponent(For, {
              get each() {
                return entry().commands;
              },
              children: command => (() => {
                var _el$48 = _$createElement("text"),
                  _el$49 = _$createTextNode(`- `),
                  _el$50 = _$createTextNode(` [`),
                  _el$51 = _$createTextNode(`]`);
                _$insertNode(_el$48, _el$49);
                _$insertNode(_el$48, _el$50);
                _$insertNode(_el$48, _el$51);
                _$setProp(_el$48, "wrapMode", "word");
                _$insert(_el$48, () => command.title, _el$50);
                _$insert(_el$48, () => command.status, _el$51);
                _$effect(_$p => _$setProp(_el$48, "fg", theme.text, _$p));
                return _el$48;
              })()
            });
          }
        }), null);
        _$insertNode(_el$38, _el$39);
        _$setProp(_el$38, "flexDirection", "column");
        _$setProp(_el$38, "paddingTop", 1);
        _$insertNode(_el$39, _$createTextNode(`Final Reply`));
        _$insert(_el$38, _$createComponent(Show, {
          get when() {
            return entry().finalReply;
          },
          get fallback() {
            return (() => {
              var _el$52 = _$createElement("text");
              _$insertNode(_el$52, _$createTextNode(`No assistant reply text found yet.`));
              _$setProp(_el$52, "wrapMode", "word");
              _$effect(_$p => _$setProp(_el$52, "fg", theme.textMuted, _$p));
              return _el$52;
            })();
          },
          get children() {
            var _el$41 = _$createElement("text");
            _$setProp(_el$41, "wrapMode", "word");
            _$insert(_el$41, () => entry().finalReply);
            _$effect(_$p => _$setProp(_el$41, "fg", theme.text, _$p));
            return _el$41;
          }
        }), null);
        _$effect(_p$ => {
          var _v$14 = theme.border,
            _v$15 = theme.textMuted,
            _v$16 = theme.textMuted,
            _v$17 = theme.textMuted;
          _v$14 !== _p$.e && (_p$.e = _$setProp(_el$28, "borderColor", _v$14, _p$.e));
          _v$15 !== _p$.t && (_p$.t = _$setProp(_el$29, "fg", _v$15, _p$.t));
          _v$16 !== _p$.a && (_p$.a = _$setProp(_el$36, "fg", _v$16, _p$.a));
          _v$17 !== _p$.o && (_p$.o = _$setProp(_el$39, "fg", _v$17, _p$.o));
          return _p$;
        }, {
          e: undefined,
          t: undefined,
          a: undefined,
          o: undefined
        });
        return _el$28;
      })()]
    }), null);
    _$effect(_p$ => {
      var _v$1 = theme.text,
        _v$10 = theme.textMuted,
        _v$11 = onPrimaryClick(back);
      _v$1 !== _p$.e && (_p$.e = _$setProp(_el$17, "fg", _v$1, _p$.e));
      _v$10 !== _p$.t && (_p$.t = _$setProp(_el$19, "fg", _v$10, _p$.t));
      _v$11 !== _p$.a && (_p$.a = _$setProp(_el$19, "onMouseUp", _v$11, _p$.a));
      return _p$;
    }, {
      e: undefined,
      t: undefined,
      a: undefined
    });
    return _el$15;
  })();
};
const tui = async (api, options) => {
  const pluginOptions = options;
  const limit = asLimit(pluginOptions?.limit);
  const openDetailOnSidebarClick = asBoolean(pluginOptions?.openDetailOnSidebarClick, true);
  api.route.register([{
    name: detailRoute,
    render(input) {
      return _$createComponent(MessageDetail, {
        api: api,
        get sessionID() {
          return asString(input.params?.sessionID);
        },
        get messageID() {
          return asString(input.params?.messageID);
        }
      });
    }
  }]);
  api.slots.register({
    order: 325,
    slots: {
      sidebar_content(_ctx, props) {
        const slotProps = props;
        const sessionID = asString(slotProps?.session_id) ?? asString(slotProps?.sessionID);
        if (!sessionID) return null;
        return _$createComponent(Sidebar, {
          api: api,
          sessionID: sessionID,
          limit: limit,
          openDetailOnClick: openDetailOnSidebarClick
        });
      }
    }
  });
  const disposeCommand = api.command?.register(() => [{
    title: "Open user messages",
    value: commandOpen,
    description: "Open an index of user prompts in the current session",
    category: "Plugin",
    slash: {
      name: "user-messages",
      aliases: ["umsg"]
    },
    onSelect(dialog) {
      dialog?.clear();
      openPicker(api);
    }
  }]);
  if (disposeCommand) {
    api.lifecycle.onDispose(disposeCommand);
  }
};
const plugin = {
  id,
  tui
};
export default plugin;
