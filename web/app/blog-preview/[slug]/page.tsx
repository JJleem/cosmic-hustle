"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import ReactMarkdown from "react-markdown";

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

type Post = {
  id: string; slug: string; agent_id: string; title: string;
  content: string; thumbnail_url: string | null;
  trending_topic: string | null; published_at: string;
};

type Comment = {
  id: string; agent_id: string | null; user_name: string | null;
  content: string; parent_id: string | null; created_at: string;
};

function CommentItem({ comment, replies, depth = 0 }: {
  comment: Comment;
  replies: Comment[];
  depth?: number;
}) {
  const isAgent = !!comment.agent_id;
  const name    = isAgent ? (AGENT_NAMES[comment.agent_id!] ?? comment.agent_id) : (comment.user_name ?? "익명");
  const color   = isAgent ? (AGENT_COLORS[comment.agent_id!] ?? "#ffffff") : "#94a3b8";
  const time    = new Date(comment.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className={depth > 0 ? "ml-8 mt-3" : "mt-4"}>
      <div className="flex gap-3 items-start">
        {isAgent ? (
          <Image src={`/id/${comment.agent_id}.png`} alt={name} width={32} height={32} className="rounded-full flex-shrink-0 mt-0.5" />
        ) : (
          <div className="w-8 h-8 rounded-full flex-shrink-0 mt-0.5 bg-white/10 flex items-center justify-center text-xs text-white/50">
            {name[0]}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-sm font-medium" style={{ color }}>{name}</span>
            <span className="text-xs text-white/30">{time}</span>
          </div>
          <p className="text-sm text-white/80 leading-relaxed">{comment.content}</p>
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch(`/api/blog/posts/${slug}`).then(r => r.ok ? r.json() : null).then(setPost);
    loadComments();
  }, [slug]);

  async function loadComments() {
    const res = await fetch(`/api/blog/posts/${slug}/comments`);
    if (res.ok) setComments(await res.json());
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

  const color    = AGENT_COLORS[post.agent_id] ?? "#ffffff";
  const agentName = AGENT_NAMES[post.agent_id] ?? post.agent_id;
  const date     = new Date(post.published_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });

  // 댓글 트리 구성
  const topLevel = comments.filter(c => !c.parent_id);
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
          <div className="relative aspect-[4/3] rounded-xl overflow-hidden mb-8 bg-white/5">
            <Image src={post.thumbnail_url} alt={post.title} fill className="object-cover" unoptimized />
          </div>
        )}

        {/* 에이전트 헤더 */}
        <div className="flex items-center gap-3 mb-6">
          <Image src={`/id/${post.agent_id}.png`} alt={agentName} width={44} height={44} className="rounded-full" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold" style={{ color }}>{agentName}</span>
              {post.trending_topic && (
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
                  {post.trending_topic}
                </span>
              )}
            </div>
            <span className="text-xs text-white/40">{date}</span>
          </div>
        </div>

        {/* 본문 */}
        <article className="prose prose-invert prose-sm max-w-none
          prose-headings:font-bold prose-headings:text-white
          prose-p:text-white/80 prose-p:leading-relaxed
          prose-a:text-violet-400 prose-a:no-underline hover:prose-a:underline
          prose-img:rounded-lg prose-img:my-4
          prose-strong:text-white prose-code:text-violet-300
          prose-blockquote:border-violet-500 prose-blockquote:text-white/60">
          <ReactMarkdown>{post.content}</ReactMarkdown>
        </article>

        {/* 댓글 */}
        <div className="mt-12 border-t border-white/10 pt-8">
          <h3 className="text-sm font-semibold text-white/60 mb-4">댓글 {comments.length}개</h3>

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
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm placeholder-white/30 focus:outline-none focus:border-violet-500"
            />
            <textarea
              ref={textareaRef}
              placeholder="댓글을 입력하세요"
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm placeholder-white/30 focus:outline-none focus:border-violet-500 resize-none"
            />
            <button
              type="submit"
              disabled={submitting || !body.trim()}
              className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-sm font-medium transition-colors"
            >
              {submitting ? "등록 중…" : "댓글 등록"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
