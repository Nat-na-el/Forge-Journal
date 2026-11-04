// src/pages/Notebook.jsx
import React, { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTheme } from "../Theme-provider";
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
} from "lucide-react";
import { format } from "date-fns";
import useAccent from "../hooks/useAccent";
import AccentPicker from "../components/ui/AccentPicker";
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

const NOTE_TAGS = [
  { value: "psychology", label: "Psychology", color: "indigo" },
  { value: "strategy", label: "Strategy", color: "cyan" },
  { value: "mistake", label: "Mistake", color: "rose" },
  { value: "win-review", label: "Win Review", color: "emerald" },
  { value: "idea", label: "Idea", color: "violet" },
  { value: "other", label: "Other", color: "gray" },
];

const PRIORITY_COLORS = {
  low: "gray",
  medium: "amber",
  high: "rose",
};

const MarkdownRenderer = ({ text }) => {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none break-words">
      {text.split("\n").map((line, i) => {
        if (line.startsWith("- ")) {
          return <li key={i} className="ml-4">{line.slice(2)}</li>;
        }
        if (line.startsWith("> ")) {
          return (
            <blockquote key={i} className="border-l-4 border-indigo-500 pl-3 italic opacity-90 my-2">
              {line.slice(2)}
            </blockquote>
          );
        }
        return (
          <p
            key={i}
            className="my-1"
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
  const { theme } = useTheme();
  const isDark = theme === "dark";
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
      <div className={`min-h-screen w-full p-8 flex items-center justify-center ${isDark ? "bg-gray-950" : "bg-gray-50"}`}>
        <Card className="p-8 max-w-md text-center bg-white/80 dark:bg-gray-800/60 backdrop-blur-md">
          <AlertCircle size={48} className="mx-auto text-amber-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">No Account Selected</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Please create or select an account from the sidebar to view your notes.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen w-full p-4 sm:p-6 transition-colors duration-300
        ${isDark
          ? "bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-gray-100"
          : "bg-gradient-to-br from-gray-50 via-white to-gray-100 text-gray-900"}`}
    >
      <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold bg-clip-text text-transparent"
              style={{ backgroundImage: `linear-gradient(90deg, ${ac.hex}, ${ac.hex2})` }}>
              Notebook {currentAccount ? `– ${currentAccount.name}` : ""}
            </h1>
            <p className="text-sm sm:text-base mt-1 opacity-80">
              Capture trading ideas, psychology notes, mistakes & reviews
            </p>
          </div>
          <AccentPicker accent={accent} setAccent={setAccent} />
        </div>

        {/* Feedback */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-100/80 dark:bg-rose-900/30 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-700 flex items-center gap-3">
            <AlertCircle size={20} />
            {error}
          </div>
        )}
        {successMsg && (
          <div className="p-4 rounded-xl bg-emerald-100/80 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 flex items-center gap-3">
            <Check size={20} />
            {successMsg}
          </div>
        )}

        {/* Add New Note Form */}
        <Card className="p-5 sm:p-6 bg-white/80 dark:bg-gray-800/60 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
          <div className="space-y-5">
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Write your trading thought, idea, review or lesson here..."
              className={`w-full p-4 rounded-xl border min-h-[140px] text-base resize-y focus:ring-2 focus:ring-indigo-500 outline-none ${
                isDark ? "bg-gray-800 border-gray-700 text-gray-100" : "bg-white border-gray-300 text-gray-900"
              }`}
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label className="block text-sm font-medium mb-1.5">Tag</Label>
                <select
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  className={`w-full p-3 rounded-xl border text-sm ${
                    isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                  } focus:ring-2 focus:ring-indigo-500 outline-none`}
                >
                  {NOTE_TAGS.map((tag) => (
                    <option key={tag.value} value={tag.value}>
                      {tag.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="block text-sm font-medium mb-1.5">Priority</Label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value)}
                  className={`w-full p-3 rounded-xl border text-sm ${
                    isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                  } focus:ring-2 focus:ring-indigo-500 outline-none`}
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
                  className="w-full hover:brightness-110 text-white h-11 text-base"
                >
                  {loading ? (
                    <Loader2 className="animate-spin mr-2 h-5 w-5" />
                  ) : (
                    <Plus size={18} className="mr-2" />
                  )}
                  Add Note
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Label className="block text-sm font-medium mb-2 opacity-80 flex items-center gap-2">
              <Search size={16} /> Search Notes
            </Label>
            <div className="relative">
              <Input
                type="text"
                placeholder="Search in content..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full p-3 rounded-xl border text-sm ${
                  isDark
                    ? "bg-gray-800/60 border-gray-700 text-gray-100"
                    : "bg-white/80 border-gray-300 text-gray-900"
                } focus:ring-2 focus:ring-indigo-500 outline-none`}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </div>

          <div className="w-full sm:w-48">
            <Label className="block text-sm font-medium mb-2 opacity-80 flex items-center gap-2">
              <Tag size={16} /> Filter by Tag
            </Label>
            <select
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              className={`w-full p-3 rounded-xl border text-sm ${
                isDark
                  ? "bg-gray-800/60 border-gray-700 text-gray-100"
                  : "bg-white/80 border-gray-300 text-gray-900"
              } focus:ring-2 focus:ring-indigo-500 outline-none`}
            >
              <option value="">All Tags</option>
              {NOTE_TAGS.map((tag) => (
                <option key={tag.value} value={tag.value}>
                  {tag.label}
                </option>
              ))}
            </select>
          </div>

          <div className="w-full sm:w-48">
            <Label className="block text-sm font-medium mb-2 opacity-80 flex items-center gap-2">
              <SortAsc size={16} /> Sort By
            </Label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className={`w-full p-3 rounded-xl border text-sm ${
                isDark
                  ? "bg-gray-800/60 border-gray-700 text-gray-100"
                  : "bg-white/80 border-gray-300 text-gray-900"
              } focus:ring-2 focus:ring-indigo-500 outline-none`}
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="priority">Priority (High → Low)</option>
              <option value="tag">Tag (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Notes Grid */}
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="animate-spin h-12 w-12 text-indigo-500" />
          </div>
        ) : error ? (
          <div className="text-center py-16 text-rose-400">{error}</div>
        ) : filteredNotes.length === 0 ? (
          <Card className="p-8 text-center bg-white/50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-2xl">
            <p className="text-lg sm:text-xl font-medium opacity-70 mb-3">No notes yet in {currentAccount.name}</p>
            <p className="text-sm opacity-60 mb-5">Start capturing your trading thoughts above</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {filteredNotes.map((note) => {
              const tagInfo = NOTE_TAGS.find((t) => t.value === note.tag) || NOTE_TAGS[NOTE_TAGS.length - 1];
              const prioColor = PRIORITY_COLORS[note.priority || "medium"];

              return (
                <Card
                  key={note.id}
                  className="p-4 sm:p-5 rounded-2xl bg-white/80 dark:bg-gray-800/60 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 shadow-md hover:shadow-xl transition-all duration-200 group"
                >
                  {editingId === note.id ? (
                    <div className="space-y-4">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className={`w-full p-3 rounded-xl border min-h-[140px] text-sm ${
                          isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300"
                        } focus:ring-2 focus:ring-indigo-500 outline-none`}
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <select
                          value={editTag}
                          onChange={(e) => setEditTag(e.target.value)}
                          className={`w-full p-2.5 rounded-lg border text-sm ${
                            isDark ? "bg-gray-900 border-gray-600" : "bg-white border-gray-300"
                          }`}
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
                          className={`w-full p-2.5 rounded-lg border text-sm ${
                            isDark ? "bg-gray-900 border-gray-600" : "bg-white border-gray-300"
                          }`}
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 pt-4">
                        <Button
                          onClick={saveEdit}
                          disabled={!editContent.trim()}
                          style={{ backgroundColor: ac.hex }}
                          className="flex-1 hover:brightness-110 text-white py-5 sm:py-4"
                        >
                          Save Changes
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setEditingId(null)}
                          className="flex-1 py-5 sm:py-4"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <span
                          className={`px-3 py-1 text-xs font-medium rounded-full
                            bg-${tagInfo.color}-500/20 text-${tagInfo.color}-700 dark:bg-${tagInfo.color}-900/30 dark:text-${tagInfo.color}-300`}
                        >
                          {tagInfo.label}
                        </span>

                        <span
                          className={`px-3 py-1 text-xs font-medium rounded-full
                            bg-${prioColor}-500/20 text-${prioColor}-700 dark:bg-${prioColor}-900/30 dark:text-${prioColor}-300`}
                        >
                          {note.priority?.toUpperCase() || "MEDIUM"}
                        </span>
                      </div>

                      <div className="min-h-[100px] max-h-[240px] overflow-hidden">
                        <MarkdownRenderer text={note.content} />
                      </div>

                      <div className="flex justify-between items-center pt-4 border-t border-gray-200/50 dark:border-gray-700/50">
                        <div className="text-xs opacity-60 flex items-center gap-2">
                          <Calendar size={14} />
                          {note.date
                            ? format(new Date(note.date), "dd MMM yyyy • HH:mm")
                            : "No date"}
                        </div>

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEdit(note)}
                            className="hover:bg-indigo-500/10"
                          >
                            <Edit size={16} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteNote(note.id)}
                            className="hover:bg-rose-500/10 text-rose-600 dark:text-rose-400"
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </div>
                    </div>
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
