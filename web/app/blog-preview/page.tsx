"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

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
  thumbnail_url: string | null; trending_topic: string | null;
  published_at: string; likes: number; view_count: number;
};

export default function BlogPreviewPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/blog/posts");
    if (res.ok) setPosts(await res.json());
  }

  useEffect(() => { load(); }, []);

  async function handleGenerate() {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/blog/generate", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail ?? "생성 실패");
      } else {
        await load();
      }
    } catch {
      setError("백엔드 연결 실패");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#07091a] text-white p-8">
      <div className="max-w-5xl mx-auto">

        {/* 헤더 */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">블로그 프리뷰</h1>
            <p className="text-white/40 text-sm mt-1">생성된 포스트를 확인하는 내부 페이지입니다</p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-sm font-medium transition-colors"
          >
            {generating ? "생성 중…" : "오늘 포스트 생성"}
          </button>
        </div>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-lg bg-red-900/40 border border-red-700 text-red-300 text-sm">
            {error}
          </div>
        )}

        {posts.length === 0 && !generating && (
          <div className="text-center text-white/30 py-24 text-sm">
            아직 생성된 포스트가 없습니다. 위 버튼으로 오늘 포스트를 생성해보세요.
          </div>
        )}

        {/* 포스트 그리드 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {posts.map((post) => {
            const color = AGENT_COLORS[post.agent_id] ?? "#ffffff";
            const name  = AGENT_NAMES[post.agent_id] ?? post.agent_id;
            const date  = new Date(post.published_at).toLocaleDateString("ko-KR", {
              month: "long", day: "numeric", timeZone: "Asia/Seoul",
            });
            return (
              <Link key={post.id} href={`/blog-preview/${post.slug}`} className="group block rounded-xl overflow-hidden border border-white/10 hover:border-white/25 bg-white/5 transition-colors">
                {/* 썸네일 */}
                <div className="relative aspect-[4/3] bg-white/5">
                  {post.thumbnail_url ? (
                    <Image src={post.thumbnail_url} alt={post.title} fill className="object-cover" unoptimized />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Image src={`/characters/${post.agent_id}/default.png`} alt={name} width={80} height={80} className="opacity-40 object-cover" />
                    </div>
                  )}
                  {/* 에이전트 배지 */}
                  <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium"
                    style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}>
                    <Image src={`/characters/${post.agent_id}/default.png`} alt={name} width={16} height={16} className="rounded-full object-cover" />
                    {name}
                  </div>
                </div>
                {/* 내용 */}
                <div className="p-4">
                  <p className="text-xs text-white/40 mb-1">{date}</p>
                  <h2 className="font-semibold text-sm leading-snug group-hover:text-violet-300 transition-colors line-clamp-2">{post.title}</h2>
                  {post.trending_topic && (
                    <p className="text-xs text-white/30 mt-2 truncate">{post.trending_topic}</p>
                  )}
                  <div className="flex items-center gap-3 mt-3 text-xs text-white/25">
                    <span>🤍 {post.likes ?? 0}</span>
                    <span>👁 {(post.view_count ?? 0).toLocaleString()}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
