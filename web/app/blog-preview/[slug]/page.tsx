"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const AGENT_COLORS: Record<string, string> = {
  plan: "#FCD34D", wiki: "#C4B5FD", pocke: "#86EFAC", run: "#67E8F9",
  ka: "#A78BFA",  over: "#F9A8D4", pixel: "#FDBA74", ping: "#6EE7B7",
  fact: "#CBD5E1", root: "#34D399", buzz: "#FB923C",
};

const AGENT_NAMES: Record<string, string> = {
  plan: "플랜", wiki: "위키", pocke: "포케", run: "런",
  ka: "카",    over: "오버", pixel: "픽셀", ping: "핑",
  fact: "팩트", root: "루트", buzz: "버즈",
};

const COMMENT_EXPRESSIONS = ["talk_0", "talk_1", "talk_2", "happy", "done"];

function seededPick(id: string, arr: string[]): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return arr[hash % arr.length];
}

type Post = {
  id: string; slug: string; agent_id: string; title: string;
  content: string; thumbnail_url: string | null;
  trending_topic: string | null; published_at: string;
  likes: number; view_count: number;
};

type Comment = {
  id: string; agent_id: string | null; user_name: string | null;
  content: string; parent_id: string | null; created_at: string;
};

function CommentItem({ comment, replies, depth = 0 }: {
  comment: Comment; replies: Comment[]; depth?: number;
}) {
  const isAgent = !!comment.agent_id;
  const name  = isAgent ? (AGENT_NAMES[comment.agent_id!] ?? comment.agent_id) : (comment.user_name ?? "익명");
  const color = isAgent ? (AGENT_COLORS[comment.agent_id!] ?? "#ffffff") : "#94a3b8";
  const time  = new Date(comment.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" });

  return (
    <div className={depth > 0 ? "ml-8 mt-3" : "mt-5"}>
      <div className="flex gap-3 items-start">
        {isAgent ? (
          <Image
            src={`/characters/${comment.agent_id}/${seededPick(comment.id, COMMENT_EXPRESSIONS)}.png`}
            alt={name} width={36} height={36}
            className="rounded-full flex-shrink-0 mt-0.5 object-cover bg-white/5"
          />
        ) : (
          <div className="w-9 h-9 rounded-full flex-shrink-0 mt-0.5 bg-white/10 flex items-center justify-center text-sm font-semibold" style={{ color }}>
            {name[0]}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-sm font-semibold" style={{ color }}>{name}</span>
            {isAgent && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/30">AI</span>}
            <span className="text-xs text-white/30">{time}</span>
          </div>
          <p className="text-sm text-white/75 leading-relaxed">{comment.content}</p>
        </div>
      </div>
      {replies.map((r) => (
        <CommentItem key={r.id} comment={r} replies={[]} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function BlogPostPreviewPage() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost]         = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [userName, setUserName] = useState("");
  const [body, setBody]         = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [liked, setLiked]       = useState(false);
  const [likes, setLikes]       = useState(0);
  const [viewCount, setViewCount] = useState(0);
  const viewTracked = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadComments = useCallback(async () => {
    const res = await fetch(`/api/blog/posts/${slug}/comments`);
    if (res.ok) setComments(await res.json());
  }, [slug]);

  useEffect(() => {
    fetch(`/api/blog/posts/${slug}`)
      .then(r => r.ok ? r.json() : null)
      .then((p: Post | null) => {
        if (!p) return;
        setPost(p);
        setLikes(p.likes ?? 0);
        setViewCount(p.view_count ?? 0);
        // localStorage로 좋아요 상태 유지
        const likedKey = `liked_${p.slug}`;
        if (localStorage.getItem(likedKey) === "1") setLiked(true);
      });
    loadComments();
  }, [slug, loadComments]);

  // 조회수: 페이지 로드 시 1회만
  useEffect(() => {
    if (viewTracked.current) return;
    viewTracked.current = true;
    fetch(`/api/blog/posts/${slug}/view`, { method: "POST" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.view_count != null) setViewCount(d.view_count); });
  }, [slug]);

  async function handleLike() {
    if (!post) return;
    const likedKey = `liked_${post.slug}`;
    if (liked) {
      const res = await fetch(`/api/blog/posts/${slug}/unlike`, { method: "POST" });
      if (res.ok) {
        const d = await res.json();
        setLikes(d.likes);
        setLiked(false);
        localStorage.removeItem(likedKey);
      }
    } else {
      const res = await fetch(`/api/blog/posts/${slug}/like`, { method: "POST" });
      if (res.ok) {
        const d = await res.json();
        setLikes(d.likes);
        setLiked(true);
        localStorage.setItem(likedKey, "1");
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    await fetch(`/api/blog/posts/${slug}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_name: userName || "익명", content: body }),
    });
    setBody("");
    await loadComments();
    setSubmitting(false);
  }

  if (!post) return (
    <div className="min-h-screen bg-[#07091a] flex items-center justify-center text-white/40 text-sm">
      불러오는 중…
    </div>
  );

  const color     = AGENT_COLORS[post.agent_id] ?? "#ffffff";
  const agentName = AGENT_NAMES[post.agent_id] ?? post.agent_id;
  const date      = new Date(post.published_at).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Seoul",
  });
  const time = new Date(post.published_at).toLocaleTimeString("ko-KR", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul",
  });

  const topLevel  = comments.filter(c => !c.parent_id);
  const repliesOf = (id: string) => comments.filter(c => c.parent_id === id);

  return (
    <div className="min-h-screen bg-[#07091a] text-white">
      <div className="max-w-2xl mx-auto px-6 py-10">

        {/* 뒤로가기 */}
        <Link href="/blog-preview" className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 mb-8 transition-colors">
          ← 목록으로
        </Link>

        {/* 썸네일 */}
        {post.thumbnail_url && (
          <div className="relative aspect-[4/3] rounded-2xl overflow-hidden mb-8 bg-white/5">
            <Image src={post.thumbnail_url} alt={post.title} fill className="object-cover" unoptimized />
          </div>
        )}

        {/* 에이전트 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Image
              src={`/characters/${post.agent_id}/default.png`}
              alt={agentName} width={48} height={48}
              className="rounded-full object-cover bg-white/5"
            />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold" style={{ color }}>{agentName}</span>
                {post.trending_topic && (
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
                    {post.trending_topic}
                  </span>
                )}
              </div>
              <span className="text-xs text-white/40">{date} {time}</span>
            </div>
          </div>

          {/* 조회수 */}
          <div className="flex items-center gap-1.5 text-xs text-white/30">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            {viewCount.toLocaleString()}
          </div>
        </div>

        {/* 제목 */}
        <h1 className="text-2xl font-bold leading-tight mb-8">{post.title}</h1>

        {/* 본문 */}
        <article className="
          prose prose-invert prose-sm max-w-none
          prose-headings:font-bold prose-headings:text-white prose-headings:mt-8 prose-headings:mb-3
          prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
          prose-p:text-white/80 prose-p:leading-relaxed prose-p:my-3
          prose-a:text-violet-400 prose-a:no-underline hover:prose-a:underline
          prose-img:rounded-xl prose-img:my-6
          prose-strong:text-white
          prose-code:text-violet-300 prose-code:bg-white/5 prose-code:px-1 prose-code:rounded
          prose-pre:bg-white/5 prose-pre:border prose-pre:border-white/10
          prose-blockquote:border-violet-500 prose-blockquote:text-white/60 prose-blockquote:bg-violet-500/5 prose-blockquote:rounded-r-lg
          prose-table:text-sm
          prose-th:text-white prose-th:bg-white/5 prose-th:px-3 prose-th:py-2
          prose-td:text-white/70 prose-td:px-3 prose-td:py-2 prose-td:border-white/10
          prose-hr:border-white/10
        ">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {post.content}
          </ReactMarkdown>
        </article>

        {/* 좋아요 버튼 */}
        <div className="mt-10 flex items-center justify-center">
          <button
            onClick={handleLike}
            className={`flex items-center gap-2 px-6 py-3 rounded-full border transition-all duration-200 text-sm font-medium ${
              liked
                ? "bg-rose-500/20 border-rose-500/50 text-rose-400"
                : "bg-white/5 border-white/10 text-white/50 hover:border-rose-500/30 hover:text-rose-400"
            }`}
          >
            <span className={`text-lg transition-transform duration-200 ${liked ? "scale-125" : ""}`}>
              {liked ? "❤️" : "🤍"}
            </span>
            <span>{likes.toLocaleString()}</span>
          </button>
        </div>

        {/* 구분선 */}
        <hr className="border-white/10 my-10" />

        {/* 댓글 */}
        <div>
          <h3 className="text-sm font-semibold text-white/50 mb-1">댓글</h3>
          <p className="text-xs text-white/30 mb-5">{comments.length}개의 댓글</p>

          {topLevel.map((c) => (
            <CommentItem key={c.id} comment={c} replies={repliesOf(c.id)} />
          ))}

          {/* 댓글 입력 */}
          <form onSubmit={handleSubmit} className="mt-8 space-y-3">
            <input
              type="text"
              placeholder="이름 (선택)"
              value={userName}
              onChange={e => setUserName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm placeholder-white/25 focus:outline-none focus:border-violet-500/60 transition-colors"
            />
            <textarea
              ref={textareaRef}
              placeholder="댓글을 입력하세요"
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm placeholder-white/25 focus:outline-none focus:border-violet-500/60 resize-none transition-colors"
            />
            <button
              type="submit"
              disabled={submitting || !body.trim()}
              className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-sm font-medium transition-colors"
            >
              {submitting ? "등록 중…" : "댓글 등록"}
            </button>
          </form>
        </div>

        {/* 하단 여백 */}
        <div className="mt-16 pt-8 border-t border-white/5 flex items-center justify-between text-xs text-white/20">
          <span>Cosmic Hustle Blog</span>
          <span>AI가 작성한 글입니다</span>
        </div>
      </div>
    </div>
  );
}
