// src/pages/Spaces.jsx
// Community feed: share trade ideas and setups with other traders.
// Posts are stored in a shared `spaces` collection so anyone can see them.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  addDoc,
  doc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { useTheme } from "../Theme-provider";
import useAccent from "../hooks/useAccent";
import AccentPicker from "../components/ui/AccentPicker";
import {
  Share2,
  ThumbsUp,
  MessageCircle,
  User,
  Clock,
  Plus,
} from "lucide-react";
import {
  MUTED,
  HEAD,
  DIVIDER,
  CARD,
  FIELD,
  POS_T,
} from "../lib/uiTokens";

const POSTS_PER_PAGE = 20;

export default function Spaces({ currentAccount }) {
  const { accent, setAccent, ac } = useAccent();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [posting, setPosting] = useState(false);
  const [liking, setLiking] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const q = query(
          collection(db, "spaces"),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        if (!cancelled) {
          setPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
      } catch (err) {
        console.warn("Spaces feed may not be available yet:", err?.message || err);
        if (!cancelled) setPosts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const user = auth.currentUser;
  const userId = user ? user.uid : null;

  const createPost = async () => {
    const content = input.trim();
    if (!content || !user) return;
    setPosting(true);
    setError("");
    try {
      await addDoc(collection(db, "spaces"), {
        content,
        userId,
        userName: user.displayName || user.email || "A trader",
        createdAt: serverTimestamp(),
        likes: 0,
        likedBy: [],
      });
      setInput("");
    } catch (err) {
      setError(err?.message || "Could not post. Try again.");
    } finally {
      setPosting(false);
    }
  };

  const toggleLike = async (post) => {
    if (!user) return;
    const alreadyLiked = (post.likedBy || []).includes(userId);
    setLiking(new Set([...liking, post.id]));
    try {
      const postRef = doc(db, "spaces", post.id);
      if (alreadyLiked) {
        await updateDoc(postRef, {
          likes: Math.max(0, (post.likes || 0) - 1),
          likedBy: (post.likedBy || []).filter((id) => id !== userId),
        });
      } else {
        await updateDoc(postRef, {
          likes: (post.likes || 0) + 1,
          likedBy: [...(post.likedBy || []), userId],
        });
      }
      // Optimistically refresh
      setPosts(posts.map((p) => {
        if (p.id !== post.id) return p;
        const likedBy = alreadyLiked
          ? (p.likedBy || []).filter((id) => id !== userId)
          : [...(p.likedBy || []), userId];
        return {
          ...p,
          likes: alreadyLiked ? Math.max(0, (p.likes || 0) - 1) : (p.likes || 0) + 1,
          likedBy,
        };
      }));
    } catch (err) {
      console.error("Like failed:", err);
    } finally {
      setLiking(new Set([...liking].filter((id) => id !== post.id)));
    }
  };

  const formatTime = (iso) => {
    try {
      return new Date(iso).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "\u2014";
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f5fa] dark:bg-[#0b0b19]">
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-[#e6e8f2] dark:border-[#262645]"
          style={{ borderTopColor: ac.hex }}
          role="progressbar"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#f4f5fa] p-3 text-[#14142b] dark:bg-[#0b0b19] dark:text-[#e8e9f7] sm:p-6 lg:p-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div className="min-w-0">
            <h1 className={"text-2xl font-bold tracking-tight sm:text-3xl " + HEAD}>
              Spaces
            </h1>
            <p className={"mt-1 text-sm " + MUTED}>
              Share trade ideas and setups with the community.
            </p>
          </div>
          <AccentPicker accent={accent} setAccent={setAccent} className="mr-1" />
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-[#f2556e]/40 bg-[#f2556e]/[0.06] px-4 py-3 text-xs font-medium text-[#d93a57] dark:text-[#ff6b86]">
            {error}
          </div>
        )}

        {/* Composer */}
        <Card className={CARD + " mb-5 p-0"}>
          <div className={"border-b " + DIVIDER + " px-4 py-3"}>
            <h2 className={"text-[15px] font-semibold " + HEAD}>Share an idea</h2>
          </div>
          <div className="p-4 sm:p-5">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="What are you watching? Share a setup, a chart observation, or a lesson learned…"
              rows={3}
              className={FIELD + " min-h-[80px] resize-y"}
            />
            <div className="mt-3 flex items-center justify-between">
              <span className={"text-xs " + MUTED}>
                {input.length} / 280
              </span>
              <Button
                onClick={createPost}
                disabled={posting || !input.trim() || !user}
                style={{ backgroundColor: ac.hex }}
                className="font-semibold text-white hover:brightness-110 disabled:opacity-50"
              >
                {posting ? "Posting…" : "Post"}
              </Button>
            </div>
          </div>
        </Card>

        {/* Feed */}
        <div className="space-y-3">
          {posts.length === 0 ? (
            <Card className={CARD + " p-10 text-center"}>
              <Share2 size={36} className={"mx-auto mb-3 opacity-40 " + MUTED} />
              <p className={"text-lg font-semibold " + HEAD}>No posts yet</p>
              <p className={"mx-auto mb-5 mt-1 max-w-md text-sm " + MUTED}>
                Be the first to share a trade idea. Posts are public to everyone using Forge Journal.
              </p>
            </Card>
          ) : (
            posts.map((post) => {
              const likedBy = post.likedBy || [];
              const isLiked = userId ? likedBy.includes(userId) : false;
              const isLiking = liking.has(post.id);
              return (
                <Card
                  key={post.id}
                  className={CARD + " p-0"}
                >
                  <div className={"px-4 py-3 border-b " + DIVIDER}>
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-black/10 dark:bg-white/10">
                        <User size={14} />
                      </div>
                      <div>
                        <div className={"text-sm font-semibold " + HEAD}>
                          {post.userName || "A trader"}
                        </div>
                        <div className={"text-[10px] " + MUTED}>
                          {formatTime(post.createdAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                    <p className={"text-sm leading-relaxed " + HEAD}>
                      {post.content}
                    </p>
                  </div>
                  <div className={"border-t " + DIVIDER + " px-4 py-2.5"}>
                    <div className="flex items-center gap-4">
                      <Button
                        type="button"
                        onClick={() => toggleLike(post)}
                        disabled={isLiking || !user}
                        variant="outline"
                        className={
                          "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold " +
                          DIVIDER +
                          " " +
                          (isLiked ? "text-[#d93a57] border-[#f2556e]/40 hover:bg-[#f2556e]/10 dark:text-[#ff6b86]" : "")
                        }
                      >
                        <ThumbsUp size={14} />
                        <span>{(post.likes || 0)}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className={"flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold " + DIVIDER}
                      >
                        <MessageCircle size={14} />
                        <span>Comment</span>
                      </Button>
                      <span className={"ml-auto text-[10px] " + MUTED}>
                        Public post
                      </span>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>

        <p className={"mt-6 text-center text-xs " + MUTED}>
          Posts are public. Don&apos;t share personal account details or financial advice.
        </p>
      </div>
    </div>
  );
}
