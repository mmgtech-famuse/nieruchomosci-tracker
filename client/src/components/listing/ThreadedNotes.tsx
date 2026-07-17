import { useMemo, useState } from "react";
import { MessageSquare, Reply, Send, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserBadge } from "./UserBadge";
import type { NoteEntry } from "@shared/types";

function formatTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "przed chwilą";
  if (diffMin < 60) return `${diffMin} min temu`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} godz. temu`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD} dn. temu`;
  return date.toLocaleDateString("pl-PL", { day: "numeric", month: "short", year: "numeric" });
}

/** Build a thread tree: top-level notes with replies attached. */
function buildThreads(notes: NoteEntry[]): { note: NoteEntry; replies: NoteEntry[] }[] {
  const topLevel = notes.filter(n => !n.parentId);
  return topLevel.map(note => ({
    note,
    replies: notes.filter(n => n.parentId === note.id),
  }));
}

function NoteItem({
  note,
  isReply = false,
  onReply,
  onDelete,
  currentUserName,
}: {
  note: NoteEntry;
  isReply?: boolean;
  onReply?: (parentId: number) => void;
  onDelete: (id: number) => void;
  currentUserName: string | null;
}) {
  return (
    <div className={`group flex gap-2 ${isReply ? "ml-6 mt-1.5" : "mt-2 first:mt-0"}`}>
      <UserBadge name={note.userName ?? "?"} size={18} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold text-slate-600">{note.userName ?? "Anonim"}</span>
          <span className="text-[10px] text-slate-400">{formatTime(note.createdAt)}</span>
          {!isReply && onReply && (
            <button
              className="opacity-0 group-hover:opacity-100 text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-0.5 transition-opacity"
              onClick={e => { e.stopPropagation(); onReply(note.id); }}
              title="Odpowiedz"
            >
              <Reply className="w-2.5 h-2.5" /> Odpowiedz
            </button>
          )}
          {currentUserName && note.userName === currentUserName && (
            <button
              className="opacity-0 group-hover:opacity-100 text-[10px] text-slate-300 hover:text-red-500 transition-opacity"
              onClick={e => { e.stopPropagation(); onDelete(note.id); }}
              title="Usuń notatkę"
            >
              <Trash2 className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
        <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">{note.content}</p>
      </div>
    </div>
  );
}

/**
 * Threaded discussion for a single listing. Rendered inside the expansion modal.
 */
export function NotesThread({
  listingId,
  notes,
  onAdd,
  onDelete,
  currentUserName,
}: {
  listingId: number;
  notes: NoteEntry[];
  onAdd: (listingId: number, content: string, parentId: number | null) => Promise<void>;
  onDelete: (id: number) => void;
  currentUserName: string | null;
}) {
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const threads = useMemo(() => buildThreads(notes), [notes]);
  const replyTarget = replyTo !== null ? notes.find(n => n.id === replyTo) : null;

  async function submit() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      await onAdd(listingId, content, replyTo);
      setDraft("");
      setReplyTo(null);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="max-h-72 overflow-y-auto pr-1">
        {threads.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-3 text-center">Brak notatek — rozpocznij dyskusję poniżej</p>
        ) : (
          threads.map(({ note, replies }) => (
            <div key={note.id} className="pb-1.5 border-b border-slate-50 last:border-0">
              <NoteItem note={note} onReply={setReplyTo} onDelete={onDelete} currentUserName={currentUserName} />
              {replies.map(r => (
                <NoteItem key={r.id} note={r} isReply onDelete={onDelete} currentUserName={currentUserName} />
              ))}
            </div>
          ))
        )}
      </div>

      {replyTarget && (
        <div className="flex items-center gap-1.5 text-[10px] text-blue-600 bg-blue-50 border border-blue-100 rounded px-2 py-1">
          <Reply className="w-2.5 h-2.5" />
          Odpowiadasz: {replyTarget.userName ?? "Anonim"} — „{replyTarget.content.slice(0, 40)}{replyTarget.content.length > 40 ? "…" : ""}"
          <button className="ml-auto text-slate-400 hover:text-slate-600" onClick={() => setReplyTo(null)}>✕</button>
        </div>
      )}

      <div className="flex gap-2 items-end">
        <textarea
          className="flex-1 text-xs border border-slate-200 rounded-md p-2 resize-none bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
          rows={2}
          placeholder={replyTo ? "Napisz odpowiedź…" : "Dodaj notatkę…"}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(); }}
          onClick={e => e.stopPropagation()}
        />
        <Button
          size="sm"
          className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white flex-shrink-0"
          disabled={!draft.trim() || sending}
          onClick={e => { e.stopPropagation(); submit(); }}
          title="Wyślij (Ctrl+Enter)"
        >
          <Send className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Compact inline cell for the table: shows legacy note + latest threaded notes
 * with author avatars; click opens modal with full threaded discussion.
 */
export function ThreadedNotesCell({
  listingId,
  legacyNotes,
  notes,
  onAdd,
  onDelete,
  currentUserName,
  listingLabel,
}: {
  listingId: number;
  legacyNotes: string | null;
  notes: NoteEntry[];
  onAdd: (listingId: number, content: string, parentId: number | null) => Promise<void>;
  onDelete: (id: number) => void;
  currentUserName: string | null;
  listingLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const count = notes.length;
  const latest = count > 0 ? notes[count - 1] : null;

  return (
    <>
      <div
        className="text-xs text-slate-500 cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5 min-h-[20px] transition-colors group"
        style={{ whiteSpace: "pre-wrap", lineHeight: "1.4", minWidth: "100px" }}
        onClick={e => { e.stopPropagation(); setOpen(true); }}
        title="Kliknij aby otworzyć dyskusję"
      >
        {legacyNotes && (
          <div className="text-slate-500 mb-0.5">{legacyNotes.length > 90 ? legacyNotes.slice(0, 87) + "…" : legacyNotes}</div>
        )}
        {latest ? (
          <div className="flex items-start gap-1">
            <UserBadge name={latest.userName ?? "?"} size={14} />
            <span className="flex-1 text-slate-600">
              {latest.content.length > 70 ? latest.content.slice(0, 67) + "…" : latest.content}
            </span>
          </div>
        ) : !legacyNotes ? (
          <span className="text-slate-300 italic group-hover:text-blue-400 transition-colors">+ dodaj notatkę</span>
        ) : null}
        {count > 0 && (
          <div className="flex items-center gap-1 mt-0.5 text-[10px] text-blue-500">
            <MessageSquare className="w-2.5 h-2.5" />
            {count} {count === 1 ? "notatka" : count < 5 ? "notatki" : "notatek"}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" onClick={e => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <MessageSquare className="w-4 h-4 text-blue-600" />
              Notatki — {listingLabel}
            </DialogTitle>
          </DialogHeader>
          {legacyNotes && (
            <div className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-md p-2 whitespace-pre-wrap">
              <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium block mb-0.5">Wcześniejsza notatka</span>
              {legacyNotes}
            </div>
          )}
          <NotesThread
            listingId={listingId}
            notes={notes}
            onAdd={onAdd}
            onDelete={onDelete}
            currentUserName={currentUserName}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
