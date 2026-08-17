import React from "react";
import { createRoot } from "react-dom/client";
import { nanoid, NodeApi } from "platejs";
import {
  ParagraphPlugin,
  Plate,
  PlateContent,
  PlateElement,
  PlateLeaf,
  createPlatePlugin,
  toTPlatePlugin,
  useEditorPlugin,
  useEditorRef,
  usePlateEditor,
  usePluginOption,
} from "platejs/react";
import {
  BlockquotePlugin,
  BoldPlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  H4Plugin,
  H5Plugin,
  H6Plugin,
  ItalicPlugin,
  UnderlinePlugin,
} from "@platejs/basic-nodes/react";
import {
  BaseCommentPlugin,
  getCommentCount,
  getCommentKey,
  getDraftCommentKey,
} from "@platejs/comment";
import { CommentPlugin } from "@platejs/comment/react";
import { LinkPlugin } from "@platejs/link/react";
import {
  BulletedListPlugin,
  ListItemContentPlugin,
  ListItemPlugin,
  ListPlugin,
  NumberedListPlugin,
} from "@platejs/list-classic/react";
import {
  REVIEW_ACTIONS,
  normalizeReviewActions,
  reviveDiscussions,
  serializableDiscussions,
  slugifyReviewId,
  toggleReviewAction,
} from "./review-state.js";

const ACTION_LABELS = {
  revise: "Revise",
  expand: "Expand",
  "touch-up": "Touch up",
  remove: "Remove",
  verify: "Verify",
};

function el(tag, className) {
  return function Element(props) {
    return <PlateElement {...props} as={tag} className={className}>{props.children}</PlateElement>;
  };
}

const ParagraphElement = el("p", "hr-p");
const H1Element = el("h1", "hr-h1");
const H2Element = el("h2", "hr-h2");
const H3Element = el("h3", "hr-h3");
const H4Element = el("h4", "hr-h4");
const H5Element = el("h5", "hr-h5");
const H6Element = el("h6", "hr-h6");
const BlockquoteElement = el("blockquote", "hr-blockquote");
const BulletedListElement = el("ul", "hr-list");
const NumberedListElement = el("ol", "hr-list");
const ListItemElement = el("li", "hr-list-item");
const ListItemContentElement = el("div", "hr-list-content");

function LinkElement(props) {
  return (
    <PlateElement
      {...props}
      as="a"
      className="hr-link"
      href={props.element.url || props.element.href || "#"}
      target="_blank"
      rel="noreferrer"
    >
      {props.children}
    </PlateElement>
  );
}

function getDiscussionClickTarget(target, selector) {
  const element = target instanceof HTMLElement ? target : target instanceof Node ? target.parentElement : null;
  return element?.closest(selector) || null;
}

function CommentLeaf(props) {
  const { api, setOption } = useEditorPlugin(commentPlugin);
  const activeId = usePluginOption(commentPlugin, "activeId");
  const hoverId = usePluginOption(commentPlugin, "hoverId");
  const currentId = api.comment.nodeId(props.leaf);
  const overlapping = getCommentCount(props.leaf) > 1;
  return (
    <PlateLeaf
      {...props}
      className="hr-comment-mark"
      data-active={activeId === currentId || hoverId === currentId || undefined}
      data-overlapping={overlapping || undefined}
      attributes={{
        ...props.attributes,
        onClick: () => setOption("activeId", currentId || null),
        onMouseEnter: () => setOption("hoverId", currentId || null),
        onMouseLeave: () => setOption("hoverId", null),
      }}
    >
      {props.children}
    </PlateLeaf>
  );
}

const commentPlugin = toTPlatePlugin(BaseCommentPlugin, {
  handlers: {
    onClick: ({ api, event, setOption, type }) => {
      const target = getDiscussionClickTarget(event.target, `.slate-${type}`);
      if (!target) {
        setOption("activeId", null);
        return;
      }
      const entry = api.comment?.node();
      setOption("activeId", entry ? api.comment?.nodeId(entry[0]) ?? null : null);
    },
  },
  options: {
    activeId: null,
    commentingBlock: null,
    hoverId: null,
  },
})
  .extendTransforms(({ editor, setOption, tf: { comment: { setDraft } } }) => ({
    setDraft: () => {
      if (editor.api.isCollapsed()) {
        const block = editor.api.block();
        if (block) editor.tf.select(block[1]);
      }
      setDraft();
      editor.tf.collapse();
      setOption("activeId", getDraftCommentKey());
      setOption("commentingBlock", editor.selection?.focus.path.slice(0, 1) || null);
    },
  }))
  .configure({
    node: { component: CommentLeaf },
    shortcuts: { setDraft: { keys: "mod+shift+m" } },
  });

const discussionPlugin = createPlatePlugin({
  key: "discussion",
  options: {
    currentUserId: "reviewer",
    discussions: [],
    users: { reviewer: { id: "reviewer", name: "Reviewer" } },
  },
}).configure({ render: { aboveNodes: BlockDiscussion } });

function setDiscussions(editor, update) {
  const current = editor.getOption(discussionPlugin, "discussions") || [];
  editor.setOption(discussionPlugin, "discussions", typeof update === "function" ? update(current) : update);
}

function markDiscussionResolved(editor, id, remove = false) {
  setDiscussions(editor, (items) =>
    remove ? items.filter((item) => item.id !== id) : items.map((item) => item.id === id ? { ...item, isResolved: true } : item)
  );
  try {
    editor.getTransforms(commentPlugin).comment.unsetMark({ id });
  } catch {}
  editor.setOption(commentPlugin, "activeId", null);
}

function CommentCard({ comment }) {
  return (
    <div className="hr-comment">
      <div className="hr-comment-meta">
        Reviewer · {new Date(comment.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
      </div>
      <div className="hr-comment-body">{NodeApi.string({ type: "p", children: comment.contentRich || [] })}</div>
    </div>
  );
}

function CommentComposer({ onSubmit, placeholder = "Add comment…", autoFocus = false }) {
  const [text, setText] = React.useState("");
  const submit = () => {
    const value = text.trim();
    if (!value) return;
    onSubmit([{ type: "p", children: [{ text: value }] }]);
    setText("");
  };
  return (
    <div className="hr-comment-compose" contentEditable={false}>
      <textarea
        autoFocus={autoFocus}
        value={text}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
      />
      <button className="hr-btn" type="button" onClick={submit}>Add</button>
    </div>
  );
}

function DiscussionThread({ discussion, editor }) {
  return (
    <div className="hr-thread" contentEditable={false}>
      <div className="hr-thread-head">
        <strong>Discussion</strong>
        <span>{discussion.comments.length}</span>
        <span className="spacer" />
        <button className="hr-btn" type="button" onClick={() => markDiscussionResolved(editor, discussion.id)}>Resolve</button>
        <button className="hr-btn" type="button" onClick={() => markDiscussionResolved(editor, discussion.id, true)}>Delete</button>
      </div>
      {discussion.comments.map((comment) => <CommentCard key={comment.id} comment={comment} />)}
      <CommentComposer
        placeholder="Reply…"
        onSubmit={(contentRich) => {
          const next = {
            id: nanoid(),
            contentRich,
            createdAt: new Date(),
            discussionId: discussion.id,
            isEdited: false,
            userId: "reviewer",
          };
          setDiscussions(editor, (items) => items.map((item) => item.id === discussion.id ? { ...item, comments: [...item.comments, next] } : item));
        }}
      />
    </div>
  );
}

function BlockDiscussion(_pluginProps) {
  return function BlockDiscussionWrapper(props) {
    const { children, element } = props;
    const editor = useEditorRef();
    const discussions = usePluginOption(discussionPlugin, "discussions") || [];
    const activeId = usePluginOption(commentPlugin, "activeId");
    const commentingBlock = usePluginOption(commentPlugin, "commentingBlock");
    const blockPath = editor.api.findPath(element) || [];
    const topLevel = blockPath.length === 1 && element.type === "review_section";
    if (!topLevel) return <>{children}</>;

    const commentsApi = editor.getApi(CommentPlugin).comment;
    const draftNode = commentsApi.node({ at: blockPath, isDraft: true });
    const commentNodes = commentsApi.nodes({ at: blockPath }) || [];
    const ids = [...new Set(commentNodes.map(([node]) => commentsApi.nodeId(node)).filter(Boolean))];
    const related = discussions.filter((item) => ids.includes(item.id) && !item.isResolved);
    const active = related.find((item) => item.id === activeId) || related[0] || null;
    const draftActive = activeId === getDraftCommentKey() && !!draftNode;
    const commentingHere = Array.isArray(commentingBlock) ? commentingBlock[0] === blockPath[0] : false;
    const [open, setOpen] = React.useState(false);
    const visible = open || !!active || (draftActive && commentingHere);

    const createFirstComment = (contentRich) => {
      const draftEntries = commentsApi.nodes({ at: blockPath, isDraft: true }) || [];
      if (!draftEntries.length) return;
      const id = nanoid();
      const documentContent = draftEntries.map(([node]) => node.text || "").join("");
      const discussion = {
        id,
        comments: [{ id: nanoid(), contentRich, createdAt: new Date(), discussionId: id, isEdited: false, userId: "reviewer" }],
        createdAt: new Date(),
        documentContent,
        isResolved: false,
        userId: "reviewer",
      };
      setDiscussions(editor, (items) => [...items, discussion]);
      for (const [, path] of draftEntries) {
        editor.tf.setNodes({ [getCommentKey(id)]: true }, { at: path, split: true });
        editor.tf.unsetNodes([getDraftCommentKey()], { at: path });
      }
      editor.setOption(commentPlugin, "activeId", id);
      editor.setOption(commentPlugin, "commentingBlock", null);
      setOpen(true);
    };

    return (
      <div className="hr-discussion-wrap">
        {children}
        {(related.length > 0 || draftNode) && (
          <button
            type="button"
            className="hr-discussion-trigger"
            contentEditable={false}
            onClick={() => setOpen((value) => !value)}
            aria-label="Open block discussion"
          >
            {related.length || "+"}
          </button>
        )}
        {visible && draftActive && commentingHere && (
          <div className="hr-thread" contentEditable={false}>
            <div className="hr-thread-head"><strong>New comment</strong></div>
            <CommentComposer autoFocus onSubmit={createFirstComment} />
          </div>
        )}
        {visible && !draftActive && active && <DiscussionThread discussion={active} editor={editor} />}
      </div>
    );
  };
}

function ReviewSectionElement(props) {
  const editor = useEditorRef();
  const path = editor.api.findPath(props.element);
  const actions = normalizeReviewActions(props.element.reviewActions);
  const label = props.element.label || props.element.reviewId || "Section";
  const toggle = (action) => {
    if (!path) return;
    editor.tf.setNodes({ reviewActions: toggleReviewAction(actions, action) }, { at: path });
  };
  return (
    <PlateElement
      {...props}
      as="section"
      className="hr-section"
      data-review-section={props.element.reviewId}
      data-container={label}
      data-review-actions={actions.join(",") || undefined}
    >
      <div className="hr-section-head" contentEditable={false}>
        <span className="hr-section-name">{label}</span>
        {REVIEW_ACTIONS.map((action) => (
          <button
            key={action}
            type="button"
            className={`hr-btn hr-action ${action === "remove" ? "hr-btn-danger" : ""}`}
            data-active={actions.includes(action)}
            onClick={() => toggle(action)}
          >
            {ACTION_LABELS[action]}
          </button>
        ))}
      </div>
      {props.children}
    </PlateElement>
  );
}

const ReviewSectionPlugin = createPlatePlugin({
  key: "review_section",
  node: { isElement: true, component: ReviewSectionElement },
});

const plugins = [
  ReviewSectionPlugin,
  ParagraphPlugin.withComponent(ParagraphElement),
  H1Plugin.withComponent(H1Element),
  H2Plugin.withComponent(H2Element),
  H3Plugin.withComponent(H3Element),
  H4Plugin.withComponent(H4Element),
  H5Plugin.withComponent(H5Element),
  H6Plugin.withComponent(H6Element),
  BlockquotePlugin.withComponent(BlockquoteElement),
  BoldPlugin,
  ItalicPlugin,
  UnderlinePlugin,
  LinkPlugin.withComponent(LinkElement),
  ListPlugin,
  BulletedListPlugin.withComponent(BulletedListElement),
  NumberedListPlugin.withComponent(NumberedListElement),
  ListItemPlugin.withComponent(ListItemElement),
  ListItemContentPlugin.withComponent(ListItemContentElement),
  commentPlugin,
  discussionPlugin,
];

function sourceSections(sourceHtml) {
  const document = new DOMParser().parseFromString(`<main id="hr-source-root">${sourceHtml || ""}</main>`, "text/html");
  const root = document.getElementById("hr-source-root");
  const explicit = [...root.querySelectorAll("[data-review-section]")].filter((node) => !node.parentElement?.closest("[data-review-section]"));
  if (explicit.length) {
    return explicit.map((node, index) => ({
      id: node.getAttribute("data-review-section") || node.id || `section-${index + 1}`,
      label: node.getAttribute("data-container") || node.querySelector("h1,h2,h3,h4,h5,h6")?.textContent?.trim() || `Section ${index + 1}`,
      actions: normalizeReviewActions(node.getAttribute("data-review-actions")),
      html: node.innerHTML,
    }));
  }

  const groups = [];
  let current = null;
  const start = (label) => {
    const base = slugifyReviewId(label, `section-${groups.length + 1}`);
    let id = base;
    let suffix = 2;
    while (groups.some((group) => group.id === id)) id = `${base}-${suffix++}`;
    current = { id, label: label || `Section ${groups.length + 1}`, actions: [], nodes: [] };
    groups.push(current);
  };

  for (const node of [...root.childNodes]) {
    if (node.nodeType === Node.ELEMENT_NODE && /^(H1|H2)$/.test(node.tagName)) start(node.textContent.trim());
    if (!current) start("Overview");
    current.nodes.push(node.cloneNode(true));
  }

  return groups.map((group) => {
    const holder = document.createElement("div");
    for (const node of group.nodes) holder.appendChild(node);
    return { ...group, html: holder.innerHTML };
  });
}

function buildInitialDocument(editor, sourceHtml) {
  return sourceSections(sourceHtml).map((section) => {
    const children = editor.api.html.deserialize({ element: section.html });
    return {
      type: "review_section",
      reviewId: section.id,
      label: section.label,
      reviewActions: section.actions,
      children: children.length ? children : [{ type: "p", children: [{ text: "" }] }],
    };
  });
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function downloadArtifact(editor, setStatus) {
  const bootstrapElement = document.getElementById("hr-bootstrap");
  const bootstrap = JSON.parse(bootstrapElement.textContent || "{}");
  const state = {
    ...bootstrap,
    version: 1,
    editor: "plate",
    sourceHtml: null,
    document: editor.children,
    discussions: serializableDiscussions(editor.getOption(discussionPlugin, "discussions") || []),
    savedAt: new Date().toISOString(),
  };
  const clone = document.documentElement.cloneNode(true);
  const app = clone.querySelector("#hr-app");
  if (app) app.replaceChildren();
  const stateNode = clone.querySelector("#hr-bootstrap");
  if (stateNode) stateNode.textContent = safeJson(state);
  const html = `<!doctype html>\n${clone.outerHTML}\n`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const base = String(bootstrap.artifactName || "planning.review.html").replace(/\.review(?:ed)?\.html$/i, "");
  anchor.href = href;
  anchor.download = `${base}.reviewed.html`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  setStatus("Reviewed artifact saved");
}

function Toolbar({ status, setStatus }) {
  const editor = useEditorRef();
  return (
    <div className="hr-topbar" contentEditable={false}>
      <span className="hr-title">Plate planning review</span>
      <button className="hr-btn" type="button" onClick={() => editor.tf.bold.toggle()}>Bold</button>
      <button className="hr-btn" type="button" onClick={() => editor.tf.italic.toggle()}>Italic</button>
      <button className="hr-btn" type="button" onClick={() => editor.tf.underline.toggle()}>Underline</button>
      <button
        className="hr-btn"
        type="button"
        onClick={() => {
          try {
            editor.getTransforms(commentPlugin).comment.setDraft();
            setStatus("Comment selection opened");
          } catch {
            setStatus("Select text before adding a comment");
          }
        }}
      >
        Comment
      </button>
      <span className="spacer" />
      <span className="hr-status">{status}</span>
      <button className="hr-btn" type="button" onClick={() => downloadArtifact(editor, setStatus)}>Save reviewed HTML</button>
    </div>
  );
}

function App() {
  const bootstrap = React.useMemo(() => JSON.parse(document.getElementById("hr-bootstrap")?.textContent || "{}"), []);
  const [status, setStatus] = React.useState(bootstrap.document ? "Review restored" : "Ready for review");
  const editor = usePlateEditor({
    plugins,
    value: Array.isArray(bootstrap.document) && bootstrap.document.length
      ? bootstrap.document
      : [{ type: "p", children: [{ text: "Loading…" }] }],
  });
  const initialized = React.useRef(false);

  React.useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    editor.setOption(discussionPlugin, "discussions", reviveDiscussions(bootstrap.discussions));
    if (!Array.isArray(bootstrap.document) || !bootstrap.document.length) {
      const value = buildInitialDocument(editor, bootstrap.sourceHtml || "");
      editor.tf.setValue(value.length ? value : [{ type: "review_section", reviewId: "overview", label: "Overview", reviewActions: [], children: [{ type: "p", children: [{ text: "" }] }] }]);
    }
  }, [bootstrap, editor]);

  return (
    <Plate editor={editor}>
      <div className="hr-shell">
        <Toolbar status={status} setStatus={setStatus} />
        <PlateContent className="hr-editor" aria-label="Planning document editor" />
      </div>
    </Plate>
  );
}

createRoot(document.getElementById("hr-app")).render(<App />);
