// src/pages/Notebook.jsx
import React, { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import useAccent from "../hooks/useAccent";
import AccentPicker from "../components/ui/AccentPicker";
import {
  Trash2,
  Search,
  Edit,
  X,
  Tag,
  AlertCircle,
  Loader2,
  Plus,
  Check,
  Calendar,
  SortAsc,
  FileText,
} from "lucide-react";
import { format } from "date-fns";
import { db, auth } from "../firebase";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import {
  MUTED,
  HEAD,
  DIVIDER,
  CARD,
  FIELD,
  FOCUS,
} from "../lib/uiTokens";

const NOTE_TAGS = [
  { value: "psychology", label: "Psychology" },
  { value: "strategy", label: "Strategy" },
  { value: "mistake", label: "Mistake" },
  { value: "win-review", label: "Win Review" },
  { value: "idea", label: "Idea" },
  { value: "other", label: "Other" },
];

const PRIORITY_STYLE = {
  high: "text-[#d93a57] dark:text-[#ff6b86] border-[#f2556e]/40 bg-[#f2556e]/10",
  medium: "text-[#b45309] dark:text-[#fbbf24] border-amber-500/40 bg-amber-500/10",
  low: "text-[#6b7090] dark:text-[#8a8fb5] border-[#e6e8f2] dark:border-[#262645] bg-[#f7f8fc] dark:bg-[#101024]",
};

const MarkdownRenderer = ({ text, accent }) => {
  return (
    <div className="max-w-none break-words space-y-1.5 text-sm leading-relaxed">
      {text.split("\n").map((line, i) => {
        if (line.startsWith("- ")) {
          return (
            <div key={i} className="flex gap-2">
              <span style={{ color: accent }}>•</span>
              <span>{line.slice(2)}</span>
            </div>
          );
        }
        if (line.startsWith("> ")) {
          return (
            <blockquote
              key={i}
              className="my-2 border-l-2 pl-3 italic opacity-90"
              style={{ borderColor: accent }}
            >
              {line.slice(2)}
            </blockquote>
          );
        }
        return (
          <p
            key={i}
            dangerouslySetInnerHTML={{
              __html: line
                .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                .replace(/\*(.*?)\*/g, "<em>$1</em>"),
            }}
          />
        );
      })}
    </div>
  );
};

export default function Notebook({ currentAccount }) {
  const { accent, setAccent, ac } = useAccent();

  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [newNote, setNewNote] = useState("");
  const [newTag, setNewTag] = useState("other");
  const [newPriority, setNewPriority] = useState("medium");

  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState("");
  const [editTag, setEditTag] = useState("other");
  const [editPriority, setEditPriority] = useState("medium");

  const [searchQuery, setSearchQuery] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [user, setUser] = useState(null);

  // ─── Auth listener ─────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((authUser) => {
      setUser(authUser);
      if (!authUser) {
        setNotes([]);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  // ─── Fetch notes when account is ready ────────────────────────────
  const refreshNotes = async () => {
    if (!user || !currentAccount?.id) {
      setNotes([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const q = query(
        collection(db, "users", user.uid, "accounts", currentAccount.id, "notes"),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(q);
      const loadedNotes = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setNotes(loadedNotes);
    } catch (err) {
      console.error("❌ Notes fetch error:", err);
      setError("Failed to load notes: " + (err.message || "Check connection"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && currentAccount) {
      refreshNotes();
    } else {
      setNotes([]);
      setLoading(false);
    }
  }, [currentAccount, user]);

  // ─── Add new note ──────────────────────────────────────────────────
  const addNote = async () => {
    if (!newNote.trim()) return;
    if (!user || !currentAccount?.id) {
      setError("Please log in and select an account");
      return;
    }

    try {
      await addDoc(
        collection(db, "users", user.uid, "accounts", currentAccount.id, "notes"),
        {
          content: newNote.trim(),
          tag: newTag,
          priority: newPriority,
          date: new Date().toISOString(),
          isPinned: false,
          createdAt: serverTimestamp(),
        }
      );
      setNewNote("");
      setNewTag("other");
      setNewPriority("medium");
      setSuccessMsg("Note added successfully!");
      setTimeout(() => setSuccessMsg(null), 3000);
      await refreshNotes();
    } catch (err) {
      console.error("Add note error:", err);
      setError("Failed to add note");
    }
  };

  // ─── Start editing ─────────────────────────────────────────────────
  const startEdit = (note) => {
    setEditingId(note.id);
    setEditContent(note.content || "");
    setEditTag(note.tag || "other");
    setEditPriority(note.priority || "medium");
  };

  // ─── Save edited note ──────────────────────────────────────────────
  const saveEdit = async () => {
    if (!editContent.trim() || !editingId) return;
    if (!user || !currentAccount?.id) return;

    try {
      const noteRef = doc(
        db,
        "users",
        user.uid,
        "accounts",
        currentAccount.id,
        "notes",
        editingId
      );
      await updateDoc(noteRef, {
        content: editContent.trim(),
        tag: editTag,
        priority: editPriority,
        updatedAt: serverTimestamp(),
      });
      setEditingId(null);
      setSuccessMsg("Note updated successfully!");
      setTimeout(() => setSuccessMsg(null), 3000);
      await refreshNotes();
    } catch (err) {
      console.error("Edit note error:", err);
      setError("Failed to update note");
    }
  };

  // ─── Delete note ───────────────────────────────────────────────────
  const deleteNote = async (id) => {
    if (!user || !currentAccount?.id) return;

    try {
      await deleteDoc(
        doc(db, "users", user.uid, "accounts", currentAccount.id, "notes", id)
      );
      setSuccessMsg("Note deleted successfully!");
      setTimeout(() => setSuccessMsg(null), 3000);
      await refreshNotes();
    } catch (err) {
      console.error("Delete note error:", err);
      setError("Failed to delete note");
    }
  };

  // ─── Filtered & sorted notes ───────────────────────────────────────
  const filteredNotes = useMemo(() => {
    let result = notes;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((n) => n.content?.toLowerCase().includes(q));
    }

    if (filterTag) {
      result = result.filter((n) => n.tag === filterTag);
    }

    result = [...result].sort((a, b) => {
      if (sortBy === "newest") return new Date(b.createdAt?.toDate?.() || b.date) - new Date(a.createdAt?.toDate?.() || a.date);
      if (sortBy === "oldest") return new Date(a.createdAt?.toDate?.() || a.date) - new Date(b.createdAt?.toDate?.() || b.date);
      if (sortBy === "priority") {
        const prio = { high: 2, medium: 1, low: 0 };
        return prio[b.priority || "medium"] - prio[a.priority || "medium"];
      }
      if (sortBy === "tag") return (a.tag || "").localeCompare(b.tag || "");
      return 0;
    });

    return result;
  }, [notes, searchQuery, filterTag, sortBy]);

  // ─── If no account selected ────────────────────────────────────────
  if (!currentAccount) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#f4f5fa] p-8 dark:bg-[#0b0b19]">
        <Card className={`${CARD} max-w-md p-8 text-center`}>
          <AlertCircle size={40} className="mx-auto mb-4 text-amber-500" />
          <h2 className={`mb-2 text-xl font-bold ${HEAD}`}>No account selected</h2>
          <p className={`text-sm ${MUTED}`}>
            Please create or select an account from the sidebar to view your notes.
          </p>
        </Card>
      </div>
    );
  }

  const tagLabel = (value) =>
    (NOTE_TAGS.find((t) => t.value === value) || NOTE_TAGS[NOTE_TAGS.length - 1]).label;

  const selectClass = `${FIELD} appearance-none pr-8`;

  return (
    <div
      className={`min-h-screen w-full bg-[#f4f5fa] p-3 text-[#14142b] dark:bg-[#0b0b19] dark:text-[#e8e9f7] sm:p-6 lg:p-8`}
    >
      <div className="mx-auto max-w-[1600px] space-y-4">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <h1 className={`text-2xl font-bold tracking-tight sm:text-3xl ${HEAD}`}>Notebook</h1>
            <p className={`mt-1 text-sm ${MUTED}`}>
              {currentAccount.name} · Capture ideas, psychology notes, mistakes & reviews
            </p>
          </div>
          <AccentPicker accent={accent} setAccent={setAccent} />
        </div>

        {/* Feedback */}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-3 rounded-lg border border-[#f2556e]/30 bg-[#f2556e]/10 px-4 py-3 text-sm font-medium text-[#d93a57] dark:text-[#ff6b86]"
          >
            <AlertCircle size={16} className="shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss">
              <X size={15} />
            </button>
          </div>
        )}
        {successMsg && (
          <div
            role="status"
            className="flex items-center gap-3 rounded-lg border border-[#22c493]/30 bg-[#22c493]/10 px-4 py-3 text-sm font-medium text-[#0e9f77] dark:text-[#2dd4a0]"
          >
            <Check size={16} className="shrink-0" />
            {successMsg}
          </div>
        )}

        {/* Composer */}
        <Card className={`${CARD} p-0`}>
          <div className={`flex items-center gap-2 border-b px-4 py-3 ${DIVIDER}`}>
            <FileText size={16} style={{ color: ac.hex }} />
            <h2 className={`text-[15px] font-semibold ${HEAD}`}>New note</h2>
          </div>

          <div className="space-y-4 p-4 sm:p-5">
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Write your trading thought, idea, review or lesson here..."
              className={`${FIELD} min-h-[120px] resize-y py-3`}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Tag</Label>
                <select
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  className={selectClass}
                >
                  {NOTE_TAGS.map((tag) => (
                    <option key={tag.value} value={tag.value}>
                      {tag.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className={`mb-1.5 block text-xs font-semibold ${MUTED}`}>Priority</Label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value)}
                  className={selectClass}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div className="flex items-end">
                <Button
                  onClick={addNote}
                  disabled={!newNote.trim() || loading}
                  style={{ backgroundColor: ac.hex }}
                  className="h-10 w-full font-semibold text-white hover:brightness-110"
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus size={16} className="mr-2" />
                  )}
                  Add note
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Filters */}
        <Card className={`${CARD} p-3 sm:p-4`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className={`flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 ${DIVIDER} bg-white dark:bg-[#101024]`}>
              <Search size={15} className={MUTED} />
              <input
                type="text"
                placeholder="Search notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-sm outline-none"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} aria-label="Clear search" className={MUTED}>
                  <X size={14} />
                </button>
              )}
            </div>

            <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${DIVIDER} bg-white dark:bg-[#101024]`}>
              <Tag size={15} className={MUTED} />
              <select
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
                className="bg-transparent text-sm outline-none"
              >
                <option value="">All tags</option>
                {NOTE_TAGS.map((tag) => (
                  <option key={tag.value} value={tag.value}>
                    {tag.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${DIVIDER} bg-white dark:bg-[#101024]`}>
              <SortAsc size={15} className={MUTED} />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-transparent text-sm outline-none"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="priority">Priority</option>
                <option value="tag">Tag A–Z</option>
              </select>
            </div>

            <span className={`text-xs font-medium lg:ml-auto ${MUTED}`}>
              {filteredNotes.length} {filteredNotes.length === 1 ? "note" : "notes"}
            </span>
          </div>
        </Card>

        {/* Notes grid */}
        {loading ? (
          <div className="flex h-72 items-center justify-center">
            <div
              className="h-10 w-10 animate-spin rounded-full border-2 border-[#e6e8f2] dark:border-[#262645]"
              style={{ borderTopColor: ac.hex }}
              role="progressbar"
              aria-label="Loading notes"
            />
          </div>
        ) : filteredNotes.length === 0 ? (
          <Card className={`${CARD} p-10 text-center`}>
            <FileText size={36} className={`mx-auto mb-3 opacity-40 ${MUTED}`} />
            <p className={`text-lg font-semibold ${HEAD}`}>No notes yet</p>
            <p className={`mt-1 text-sm ${MUTED}`}>
              {searchQuery || filterTag
                ? "No notes match your filters. Try clearing them."
                : "Start capturing your trading thoughts above."}
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredNotes.map((note) => {
              const prio = note.priority || "medium";
              const isEditing = editingId === note.id;

              return (
                <Card key={note.id} className={`${CARD} flex flex-col p-0`}>
                  {isEditing ? (
                    <div className="space-y-4 p-4">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className={`${FIELD} min-h-[140px] resize-y py-3`}
                      />

                      <div className="grid grid-cols-2 gap-3">
                        <select
                          value={editTag}
                          onChange={(e) => setEditTag(e.target.value)}
                          className={selectClass}
                        >
                          {NOTE_TAGS.map((tag) => (
                            <option key={tag.value} value={tag.value}>
                              {tag.label}
                            </option>
                          ))}
                        </select>

                        <select
                          value={editPriority}
                          onChange={(e) => setEditPriority(e.target.value)}
                          className={selectClass}
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          onClick={saveEdit}
                          disabled={!editContent.trim()}
                          style={{ backgroundColor: ac.hex }}
                          className="flex-1 font-semibold text-white hover:brightness-110"
                        >
                          Save changes
                        </Button>
                        <Button variant="outline" onClick={() => setEditingId(null)} className="flex-1">
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className={`flex flex-wrap items-center gap-2 border-b px-4 py-3 ${DIVIDER}`}>
                        <span
                          className="rounded-md px-2 py-1 text-[11px] font-semibold"
                          style={{ backgroundColor: `${ac.hex}1f`, color: ac.hex }}
                        >
                          {tagLabel(note.tag)}
                        </span>
                        <span
                          className={`rounded-md border px-2 py-1 text-[11px] font-semibold uppercase ${PRIORITY_STYLE[prio] || PRIORITY_STYLE.medium}`}
                        >
                          {prio}
                        </span>
                        <span className={`ml-auto inline-flex items-center gap-1.5 text-[11px] ${MUTED}`}>
                          <Calendar size={12} />
                          {note.date ? format(new Date(note.date), "d MMM yyyy") : "No date"}
                        </span>
                      </div>

                      <div className="min-h-[110px] flex-1 overflow-hidden px-4 py-3">
                        <MarkdownRenderer text={note.content || ""} accent={ac.hex} />
                      </div>

                      <div className={`flex items-center justify-between border-t px-4 py-2.5 ${DIVIDER}`}>
                        <span className={`text-[11px] ${MUTED}`}>
                          {note.date ? format(new Date(note.date), "HH:mm") : ""}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => startEdit(note)}
                            aria-label="Edit note"
                            className={`rounded-md p-1.5 transition-colors ${MUTED} hover:bg-[#f1f2f8] hover:text-[#14142b] dark:hover:bg-[#1e1e3a] dark:hover:text-white ${FOCUS}`}
                          >
                            <Edit size={15} />
                          </button>
                          <button
                            onClick={() => deleteNote(note.id)}
                            aria-label="Delete note"
                            className={`rounded-md p-1.5 text-[#d93a57] transition-colors hover:bg-[#f2556e]/10 dark:text-[#ff6b86] ${FOCUS}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
