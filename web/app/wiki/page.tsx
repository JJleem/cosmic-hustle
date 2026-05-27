"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import * as d3 from "d3";
import Link from "next/link";
import { ArrowLeft, FolderOpen, FileText, CheckCircle2, XCircle, Loader2, Library, Network, Maximize2, Search, RefreshCw, Clock } from "lucide-react";

function formatNodeTitle(raw: string): string {
  return raw.replace(/[-_]+/g, " ").trim();
}

function stripFrontmatter(content: string): string {
  if (!content.startsWith("---")) return content;
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (!match) return content;
  return content.slice(match[0].length).trimStart();
}

function ContentRenderer({ text }: { text: string }) {
  if (!text.trim()) return <span style={{ color: "#475569", fontSize: "12px" }}>(내용 없음)</span>;
  return (
    <div>
      {text.split("\n").map((line, i) => {
        if (line.startsWith("# "))
          return <h1 key={i} style={{ fontSize: "13px", fontWeight: 700, color: "#f1f5f9", margin: "16px 0 6px", lineHeight: 1.4 }}>{line.slice(2)}</h1>;
        if (line.startsWith("## "))
          return <h2 key={i} style={{ fontSize: "11.5px", fontWeight: 600, color: "#c4b5fd", margin: "14px 0 4px" }}>{line.slice(3)}</h2>;
        if (line.startsWith("### "))
          return <h3 key={i} style={{ fontSize: "11px", fontWeight: 600, color: "#cbd5e1", margin: "10px 0 3px" }}>{line.slice(4)}</h3>;
        if (line.startsWith("- ") || line.startsWith("* "))
          return (
            <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "3px", fontSize: "11px", color: "#94a3b8" }}>
              <span style={{ color: "#8b5cf6", flexShrink: 0, marginTop: "2px" }}>·</span>
              <span>{line.slice(2)}</span>
            </div>
          );
        if (line.startsWith("|"))
          return <div key={i} style={{ fontFamily: "monospace", fontSize: "10px", color: "#64748b", marginBottom: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line}</div>;
        if (line.trim() === "" || line.trim() === "---")
          return <div key={i} style={{ height: "8px" }} />;
        return <p key={i} style={{ fontSize: "11px", color: "#94a3b8", lineHeight: 1.8, marginBottom: "2px" }}>{line}</p>;
      })}
    </div>
  );
}

const CLUSTER_COLORS = [
  "#8b5cf6",
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#a855f7",
];

type FileStatus = "pending" | "processing" | "done" | "error";

interface WikiFile {
  handle: FileSystemFileHandle;
  name: string;
  path: string;
  status: FileStatus;
  error?: string;
}

interface IngestResult {
  concept: { filename: string; content: string };
  source: { filename: string; content: string };
}

interface GraphNode {
  id: string;
  type: "concept" | "source";
  size: number;
  cluster: number;
  tags: string[];
  preview: string;
  title: string;
  parentId?: string;
  x?: number;
  y?: number;
  z?: number;
  createdAt?: string;
}

interface GraphLink {
  source: string;
  target: string;
  weight: number;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

async function readAllMdTxt(
  dir: FileSystemDirectoryHandle,
  prefix = ""
): Promise<{ handle: FileSystemFileHandle; name: string; path: string }[]> {
  const results: { handle: FileSystemFileHandle; name: string; path: string }[] = [];
  for await (const [name, entry] of dir.entries()) {
    if (entry.kind === "directory" && !name.startsWith(".")) {
      const sub = await readAllMdTxt(entry as FileSystemDirectoryHandle, prefix ? `${prefix}/${name}` : name);
      results.push(...sub);
    } else if (entry.kind === "file" && (name.endsWith(".md") || name.endsWith(".txt"))) {
      results.push({ handle: entry as FileSystemFileHandle, name, path: prefix ? `${prefix}/${name}` : name });
    }
  }
  return results;
}

async function ensureDir(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemDirectoryHandle> {
  const parts = path.split("/").filter(Boolean);
  let cur = root;
  for (const part of parts) {
    cur = await cur.getDirectoryHandle(part, { create: true });
  }
  return cur;
}

async function writeFile(dir: FileSystemDirectoryHandle, filename: string, content: string) {
  const file = await dir.getFileHandle(filename, { create: true });
  const writable = await file.createWritable();
  await writable.write(content);
  await writable.close();
}

export default function WikiPage() {
  const [activeTab, setActiveTab] = useState<"folder" | "graph">("folder");

  // 폴더 탭
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [files, setFiles] = useState<WikiFile[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const abortRef = useRef(false);

  // 그래프 탭
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const graphDimsRef = useRef({ width: 800, height: 600 }); // state 대신 ref — 리사이즈 시 D3 재렌더 방지
  const svgRef = useRef<SVGSVGElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zoomRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const containerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const simulationRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeSelRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkSelRef = useRef<any>(null);
  const [timelineDates, setTimelineDates] = useState<string[]>([]);
  const [timelineIdx, setTimelineIdx] = useState(0);
  const searchQueryRef = useRef("");
  const timelineIdxRef = useRef(0);
  const timelineDatesRef = useRef<string[]>([]);
  // 항상 최신 값 동기화
  searchQueryRef.current = searchQuery;
  timelineIdxRef.current = timelineIdx;
  timelineDatesRef.current = timelineDates;

  // 연결된 노드 목록
  const connectedNodes = useMemo(() => {
    if (!selectedNode || !graphData) return [];
    const ids = new Set<string>();
    graphData.links.forEach((l) => {
      const s = typeof l.source === "object" ? (l.source as GraphNode).id : l.source;
      const t = typeof l.target === "object" ? (l.target as GraphNode).id : l.target;
      if (s === selectedNode.id) ids.add(t);
      if (t === selectedNode.id) ids.add(s);
    });
    return graphData.nodes.filter((n) => ids.has(n.id) && n.type === "concept");
  }, [selectedNode, graphData]);

  const connectedCount = useMemo(() => {
    if (!selectedNode || !graphData) return 0;
    const sourceIds = new Set(graphData.nodes.filter(n => n.type === "source").map(n => n.id));
    return graphData.links.filter((l) => {
      const src = typeof l.source === "object" ? (l.source as GraphNode).id : l.source;
      const tgt = typeof l.target === "object" ? (l.target as GraphNode).id : l.target;
      return (src === selectedNode.id || tgt === selectedNode.id) && !sourceIds.has(src) && !sourceIds.has(tgt);
    }).length;
  }, [selectedNode, graphData]);

  const sourceDocs = useMemo(() => {
    if (!selectedNode || !graphData) return [];
    const ids = new Set<string>();
    graphData.links.forEach((l) => {
      const s = typeof l.source === "object" ? (l.source as GraphNode).id : l.source;
      const t = typeof l.target === "object" ? (l.target as GraphNode).id : l.target;
      if (s === selectedNode.id) ids.add(t);
      if (t === selectedNode.id) ids.add(s);
    });
    return graphData.nodes.filter((n) => ids.has(n.id) && n.type === "source");
  }, [selectedNode, graphData]);

  // 그래프 컨테이너 크기 — ref에만 저장해 D3 재렌더를 트리거하지 않음
  // 리사이즈 시 SVG 크기와 forceCenter만 갱신
  useEffect(() => {
    if (activeTab !== "graph") return;
    const el = graphContainerRef.current;
    if (!el) return;
    const applySize = () => {
      const w = el.offsetWidth || 800;
      const h = el.offsetHeight || 600;
      graphDimsRef.current = { width: w, height: h };
      if (svgRef.current) {
        d3.select(svgRef.current).attr("width", w).attr("height", h);
      }
      // SVG 크기만 업데이트 — 시뮬레이션 일체 건드리지 않음 (사이드 패널 열릴 때 노드 이동 방지)
    };
    const ro = new ResizeObserver(applySize);
    ro.observe(el);
    applySize();
    return () => ro.disconnect();
  }, [activeTab]);

  // 그래프 데이터 fetch
  useEffect(() => {
    if (activeTab !== "graph" || graphData !== null) return;
    setGraphLoading(true);
    setGraphError(null);
    fetch("/api/wiki/graph")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: GraphData) => setGraphData(data))
      .catch((e) => setGraphError(e.message))
      .finally(() => setGraphLoading(false));
  }, [activeTab, graphData]);

  // D3 그래프 렌더링
  useEffect(() => {
    if (!graphData || graphData.nodes.length === 0 || !svgRef.current) return;

    type SimNode = GraphNode & d3.SimulationNodeDatum;
    type SimLink = d3.SimulationLinkDatum<SimNode> & { weight: number };

    const W = graphDimsRef.current.width;
    const H = graphDimsRef.current.height;

    // 백엔드 spring_layout 좌표는 (0,0) 기준 ±280 → W/2, H/2 오프셋으로 화면 중앙 정렬
    // 이렇게 해야 줌 시 다른 노드들도 화면 안에 남음
    const sourceIdSet = new Set(graphData.nodes.filter(n => n.type === "source").map(n => n.id));
    const nodes: SimNode[] = graphData.nodes
      .filter((n) => n.type === "concept")
      .map((n) => ({
        ...n,
        x: (n.x ?? 0) + W / 2,
        y: (n.y ?? 0) + H / 2,
      }));
    const links: SimLink[] = graphData.links
      .filter((l) => !sourceIdSet.has(String(l.source)) && !sourceIdSet.has(String(l.target)))
      .map((l) => ({ ...l }));

    // 연결 수로 노드 크기 결정
    const connCount = new Map<string, number>();
    links.forEach((l) => {
      const s = String(l.source), t = String(l.target);
      connCount.set(s, (connCount.get(s) || 0) + 1);
      connCount.set(t, (connCount.get(t) || 0) + 1);
    });

    const getR = (n: SimNode) =>
      n.type === "source" ? 3 : Math.max(6, 6 + (connCount.get(n.id) || 0) * 1.2);
    const getColor = (n: SimNode) =>
      n.type === "source" ? "#1e2a3a" : CLUSTER_COLORS[n.cluster % CLUSTER_COLORS.length];

    // SVG 초기화
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("width", W).attr("height", H);

    // Defs: glow 필터
    const defs = svg.append("defs");
    CLUSTER_COLORS.forEach((_, i) => {
      const f = defs.append("filter")
        .attr("id", `glow-${i}`)
        .attr("x", "-80%").attr("y", "-80%")
        .attr("width", "260%").attr("height", "260%");
      f.append("feGaussianBlur").attr("in", "SourceGraphic").attr("stdDeviation", "6").attr("result", "blur");
      const m = f.append("feMerge");
      m.append("feMergeNode").attr("in", "blur");
      m.append("feMergeNode").attr("in", "SourceGraphic");
    });

    // Zoom — 노드 위에서 시작한 pointer 이벤트는 pan 무시, wheel만 허용
    const container = svg.append("g").attr("class", "root");
    containerRef.current = container;
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 6])
      .filter((event: Event) => {
        if (event.type === "wheel") return true;
        return !(event.target as Element).closest(".nodes");
      })
      .on("zoom", (e) => container.attr("transform", e.transform.toString()));
    svg.call(zoom).on("dblclick.zoom", null);
    zoomRef.current = zoom;

    // 배경 클릭 → 선택 해제
    svg.on("click", () => {
      setSelectedNode(null);
      container.selectAll<SVGCircleElement, SimNode>(".sel-ring").attr("stroke-opacity", 0);
    });

    // Hull 레이어 (links·nodes 아래)
    const hullG = container.append("g").attr("class", "hulls");
    const clusterIds = [...new Set(nodes.filter(n => n.type === "concept").map(n => n.cluster))].sort((a, b) => a - b);
    const hullPaths = hullG
      .selectAll<SVGPathElement, number>("path")
      .data(clusterIds)
      .join("path")
      .attr("fill-opacity", 0.055)
      .attr("stroke-opacity", 0.18)
      .attr("stroke-width", 1.5)
      .attr("stroke-linejoin", "round")
      .attr("fill", (c) => CLUSTER_COLORS[c % CLUSTER_COLORS.length])
      .attr("stroke", (c) => CLUSTER_COLORS[c % CLUSTER_COLORS.length]);

    // 링크
    const linkG = container.append("g").attr("class", "links");
    const linkSel = linkG
      .selectAll<SVGLineElement, SimLink>("line")
      .data(links)
      .join("line")
      .attr("stroke-linecap", "round")
      .attr("stroke", (d) => d.weight >= 0.75 ? "#a78bfa" : d.weight >= 0.6 ? "#7c3aed" : "#5b21b6")
      .attr("stroke-width", (d) => d.weight >= 0.75 ? 1.8 : d.weight >= 0.6 ? 1.1 : 0.7)
      .attr("stroke-opacity", 0.7);

    // 노드
    const nodeG = container.append("g").attr("class", "nodes");
    const nodeSel = nodeG
      .selectAll<SVGGElement, SimNode>("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "pointer");

    // 개념 노드 비주얼
    nodeSel.filter((d) => d.type === "concept").each(function (d) {
      const g = d3.select(this);
      const r = getR(d);
      const color = getColor(d);
      const ci = d.cluster % CLUSTER_COLORS.length;

      g.append("circle")
        .attr("r", r * 2.0)
        .attr("fill", color)
        .attr("fill-opacity", 0.09);

      g.append("circle")
        .attr("r", r)
        .attr("fill", color)
        .attr("fill-opacity", 0.88)
        .attr("filter", `url(#glow-${ci})`);

      g.append("circle")
        .attr("class", "sel-ring")
        .attr("r", r + 6)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", 1.8)
        .attr("stroke-opacity", 0)
        .attr("stroke-dasharray", "5 3")
        .attr("pointer-events", "none");

      const label = formatNodeTitle(d.title || d.id);
      const display = label.length > 24 ? label.slice(0, 22) + "…" : label;
      g.append("text")
        .attr("dy", r + 16)
        .attr("text-anchor", "middle")
        .attr("font-size", "12px")
        .attr("font-family", "'Helvetica Neue', Arial, sans-serif")
        .attr("font-weight", "600")
        .attr("paint-order", "stroke")
        .attr("stroke", "#07091a")
        .attr("stroke-width", 3.5)
        .attr("stroke-linecap", "round")
        .attr("stroke-linejoin", "round")
        .attr("fill", "#ffffff")
        .attr("pointer-events", "none")
        .text(display);
    });

    // refs 저장 (시뮬레이션 생성 전)
    nodeSelRef.current = nodeSel;
    linkSelRef.current = linkSel;

    // 호버: 연결 하이라이트
    nodeSel
      .on("mouseenter", function (_, d) {
        // 호버된 노드를 DOM 맨 뒤로 올려 z-order 최상위 → 클릭이 올바른 노드에 전달됨
        d3.select(this).raise();
        const connected = new Set([d.id]);
        links.forEach((l) => {
          const s = typeof l.source === "object" ? (l.source as SimNode).id : String(l.source);
          const t = typeof l.target === "object" ? (l.target as SimNode).id : String(l.target);
          if (s === d.id) connected.add(t);
          if (t === d.id) connected.add(s);
        });
        nodeSel.attr("opacity", (n) => connected.has(n.id) ? 1 : 0.07);
        linkSel.attr("stroke-opacity", (l) => {
          const s = typeof l.source === "object" ? (l.source as SimNode).id : String(l.source);
          const t = typeof l.target === "object" ? (l.target as SimNode).id : String(l.target);
          return s === d.id || t === d.id ? 1 : 0.03;
        });
      })
      .on("mouseleave", function () {
        const q = searchQueryRef.current.trim().toLowerCase();
        if (q) {
          nodeSel.attr("opacity", (n: SimNode) => {
            const title = (n.title || n.id).toLowerCase();
            const tagMatch = (n.tags || []).some((tag: string) => tag.toLowerCase().includes(q));
            return (title.includes(q) || tagMatch) ? 1 : 0.07;
          });
          linkSel.attr("stroke-opacity", 0.05);
        } else {
          nodeSel.attr("opacity", 1);
          linkSel.attr("stroke-opacity", 0.7);
        }
      })
      .on("click", function (event, d) {
        event.stopPropagation();
        setSelectedNode(d as GraphNode);
        container.selectAll<SVGCircleElement, SimNode>(".sel-ring").attr("stroke-opacity", 0);
        d3.select(this).select(".sel-ring").attr("stroke-opacity", 0.9);
      });

    // 드래그
    let isDragging = false;
    nodeSel.call(
      d3.drag<SVGGElement, SimNode>()
        .clickDistance(6)
        .on("start", (_, d) => {
          isDragging = false;
          d.fx = d.x; d.fy = d.y;
        })
        .on("drag", (event, d) => {
          // 실제 drag 이벤트가 왔을 때만 시뮬레이션 재시작 — 단순 클릭 시 노드 이동 방지
          if (!isDragging) { isDragging = true; if (!event.active) sim.alphaTarget(0.3).restart(); }
          d.fx = event.x; d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (isDragging && !event.active) sim.alphaTarget(0);
          d.fx = null; d.fy = null;
          isDragging = false;
        })
    );
    // Force 시뮬레이션 — 생성 시 link.source/target이 node ref로 변환됨
    const sim = d3.forceSimulation<SimNode>(nodes)
      .alphaDecay(0.05)  // default 0.0228 → ~5초, 0.05 → ~1초 내 정착
      .force(
        "link",
        d3.forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((d) => 100 + (1 - d.weight) * 70)
          .strength(0.45)
      )
      .force("charge", d3.forceManyBody<SimNode>().strength((d) => d.type === "source" ? -60 : -360))
      .force("center", d3.forceCenter(W / 2, H / 2).strength(0.06))
      .force("collision", d3.forceCollide<SimNode>().radius((d) => getR(d) + 22).strength(0.9));

    sim.on("tick", () => {
      // convex hull 업데이트
      hullPaths.attr("d", (c) => {
        const pts = nodes
          .filter(n => n.type === "concept" && n.cluster === c && n.x != null && n.y != null)
          .map(n => [n.x!, n.y!] as [number, number]);
        if (pts.length < 3) return null;
        const hull = d3.polygonHull(pts);
        if (!hull) return null;
        // centroid 기준으로 30px 바깥으로 확장
        const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length;
        const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length;
        const expanded = hull.map(([x, y]) => {
          const dx = x - cx, dy = y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          return [x + (dx / dist) * 30, y + (dy / dist) * 30] as [number, number];
        });
        return `M${expanded.map(p => p.join(",")).join("L")}Z`;
      });

      linkSel
        .attr("x1", (d) => (d.source as SimNode).x ?? 0)
        .attr("y1", (d) => (d.source as SimNode).y ?? 0)
        .attr("x2", (d) => (d.target as SimNode).x ?? 0)
        .attr("y2", (d) => (d.target as SimNode).y ?? 0);
      nodeSel.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    simulationRef.current = sim;
    return () => { sim.stop(); };
  }, [graphData]);

  // 타임라인 필터 effect
  useEffect(() => {
    const nodeSel = nodeSelRef.current;
    const linkSel = linkSelRef.current;
    if (!nodeSel || !linkSel) return;

    const hasTimeline = timelineDates.length > 0;
    const cutoff = hasTimeline && timelineIdx > 0 ? timelineDates[timelineIdx - 1] : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodeSel.attr("display", (d: any) => {
      if (hasTimeline && cutoff === null) return "none";
      if (hasTimeline && d.createdAt && d.createdAt > cutoff!) return "none";
      return null;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    linkSel.attr("display", (d: any) => {
      if (hasTimeline && cutoff === null) return "none";
      if (hasTimeline && cutoff) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sCreated = typeof d.source === "object" ? (d.source as any).createdAt : null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tCreated = typeof d.target === "object" ? (d.target as any).createdAt : null;
        if (sCreated && sCreated > cutoff) return "none";
        if (tCreated && tCreated > cutoff) return "none";
      }
      return null;
    });
  }, [timelineIdx, timelineDates, graphData]);

  // 검색 필터
  useEffect(() => {
    if (!nodeSelRef.current) return;
    if (!searchQuery.trim()) {
      nodeSelRef.current.attr("opacity", 1);
      linkSelRef.current?.attr("stroke-opacity", 0.7);
      return;
    }
    const q = searchQuery.trim().toLowerCase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodeSelRef.current.attr("opacity", (d: any) => {
      const title = (d.title || d.id).toLowerCase();
      const tagMatch = (d.tags || []).some((tag: string) => tag.toLowerCase().includes(q));
      return (title.includes(q) || tagMatch) ? 1 : 0.07;
    });
    linkSelRef.current?.attr("stroke-opacity", 0.05);
  }, [searchQuery]);

  // 타임라인 날짜 목록 계산
  useEffect(() => {
    if (!graphData) {
      setTimelineDates([]);
      setTimelineIdx(0);
      return;
    }
    const dates = [...new Set(
      graphData.nodes
        .filter((n) => n.type === "concept" && n.createdAt)
        .map((n) => n.createdAt!)
    )].sort();
    setTimelineDates(dates);
    setTimelineIdx(dates.length); // 초기: 모두 표시
  }, [graphData]);

  // 폴더 탭 핸들러
  const connectFolder = useCallback(async () => {
    setConnectError(null);
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      try {
        await ensureDir(handle, "wiki/concepts");
        await ensureDir(handle, "wiki/sources");
      } catch (e) {
        setConnectError(`폴더 생성 실패: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      let found: { handle: FileSystemFileHandle; name: string; path: string }[] = [];
      try {
        found = await readAllMdTxt(handle);
      } catch (e) {
        setConnectError(`파일 읽기 실패: ${e instanceof Error ? e.message : String(e)}`);
        return;
      }
      const filtered = found.filter((f) => !f.path.startsWith("wiki/"));
      setDirHandle(handle);
      setFiles(filtered.map((f) => ({ ...f, status: "pending" })));
      setDone(false);
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") setConnectError(e.message);
    }
  }, []);

  const startIngest = useCallback(async () => {
    if (!dirHandle || running) return;
    setRunning(true);
    abortRef.current = false;
    const wikiDir = await dirHandle.getDirectoryHandle("wiki", { create: true });
    const conceptsDir = await wikiDir.getDirectoryHandle("concepts", { create: true });
    const sourcesDir = await wikiDir.getDirectoryHandle("sources", { create: true });
    for (let i = 0; i < files.length; i++) {
      if (abortRef.current) break;
      setFiles((prev) => prev.map((f, idx) => idx === i ? { ...f, status: "processing" } : f));
      try {
        const fileObj = await files[i].handle.getFile();
        const content = await fileObj.text();
        const res = await fetch("/api/wiki/ingest-local", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: files[i].name, content }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: IngestResult = await res.json();
        await writeFile(conceptsDir, data.concept.filename, data.concept.content);
        await writeFile(sourcesDir, data.source.filename.replace("sources/", ""), data.source.content);
        setFiles((prev) => prev.map((f, idx) => idx === i ? { ...f, status: "done" } : f));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setFiles((prev) => prev.map((f, idx) => idx === i ? { ...f, status: "error", error: msg } : f));
      }
    }
    setRunning(false);
    setDone(true);
    setGraphData(null);  // 그래프 재로드
    setActiveTab("graph");  // 완료 후 그래프 탭으로 이동
  }, [dirHandle, files, running]);

  // 연결 노드 클릭 → 해당 노드로 이동 + 줌
  const handleConnectedNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(node);
    if (nodeSelRef.current) {
      nodeSelRef.current.selectAll(".sel-ring").attr("stroke-opacity", 0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodeSelRef.current.filter((d: any) => d.id === node.id).select(".sel-ring").attr("stroke-opacity", 0.9);
    }
    if (nodeSelRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodeSelRef.current.filter((d: any) => d.id === node.id).select(".sel-ring").attr("stroke-opacity", 0.9);
    }
  }, []);

  const doneCount = files.filter((f) => f.status === "done").length;
  const errorCount = files.filter((f) => f.status === "error").length;
  const conceptCount = graphData?.nodes.filter((n) => n.type === "concept").length ?? 0;
  const linkCount = graphData?.links.length ?? 0;

  const handleFitView = () => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current)
      .transition().duration(500)
      .call(zoomRef.current.transform, d3.zoomIdentity);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#07091a", color: "#e2e8f0" }}>
      {/* 헤더 */}
      <header
        className="shrink-0 px-6 py-2.5 flex items-center gap-4"
        style={{ borderBottom: "1px solid rgba(99,60,220,0.12)", background: "rgba(5,7,20,0.88)", backdropFilter: "blur(24px)" }}
      >
        <Link href="/" className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 transition-colors text-xs">
          <ArrowLeft size={12} />
          <span>오피스로</span>
        </Link>
        <div className="flex items-center gap-2">
          <Library size={14} style={{ color: "#c4b5fd" }} />
          <span className="text-sm font-semibold tracking-wide" style={{ color: "#c4b5fd" }}>개인 위키</span>
        </div>
        <div className="flex items-center gap-1 ml-4">
          <TabBtn active={activeTab === "folder"} onClick={() => setActiveTab("folder")} icon={<FolderOpen size={12} />} label="폴더" />
          <TabBtn active={activeTab === "graph"} onClick={() => setActiveTab("graph")} icon={<Network size={12} />} label="지식 그래프" />
        </div>
      </header>

      {/* 폴더 탭 */}
      {activeTab === "folder" && (
        <main className="flex-1 flex flex-col items-center justify-start px-6 py-12 max-w-2xl mx-auto w-full">
          {!dirHandle ? (
            <div className="flex flex-col items-center gap-6 text-center mt-16">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}
              >
                <FolderOpen size={32} style={{ color: "#a78bfa" }} />
              </div>
              <div>
                <h2 className="text-xl font-semibold mb-2" style={{ color: "#e2e8f0" }}>로컬 폴더를 연결하세요</h2>
                <p className="text-sm leading-relaxed" style={{ color: "#64748b" }}>
                  .md · .txt 파일이 있는 폴더를 연결하면
                  <br />
                  <span style={{ color: "#a78bfa" }}>wiki/concepts/</span>와{" "}
                  <span style={{ color: "#a78bfa" }}>wiki/sources/</span>가 자동 생성됩니다.
                </p>
              </div>
              <button
                onClick={connectFolder}
                className="flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-all"
                style={{ background: "linear-gradient(135deg, rgba(109,40,217,0.6) 0%, rgba(79,70,229,0.6) 100%)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.35)", boxShadow: "0 0 20px rgba(109,40,217,0.2)" }}
              >
                <FolderOpen size={14} />
                폴더 연결
              </button>
              {connectError && (
                <div className="w-full max-w-sm px-4 py-2.5 rounded-xl text-xs text-center" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
                  {connectError}
                </div>
              )}
              <p className="text-xs" style={{ color: "#334155" }}>파일은 로컬에만 저장됩니다. 서버 DB에 원본을 저장하지 않습니다.</p>
            </div>
          ) : (
            <div className="w-full flex flex-col gap-4">
              <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: "rgba(139,92,246,0.05)", border: "1px solid rgba(139,92,246,0.15)" }}>
                <div className="flex items-center gap-2 text-sm">
                  <FolderOpen size={14} style={{ color: "#a78bfa" }} />
                  <span style={{ color: "#a78bfa" }}>{dirHandle.name}</span>
                  <span style={{ color: "#334155" }}>·</span>
                  <span style={{ color: "#64748b" }}>{files.length}개 파일</span>
                </div>
                <div className="flex items-center gap-2">
                  {done && <span className="text-xs" style={{ color: "#34d399" }}>완료 {doneCount} / 오류 {errorCount}</span>}
                  <button onClick={connectFolder} className="text-xs px-3 py-1 rounded-full transition-all" style={{ color: "#475569", border: "1px solid rgba(255,255,255,0.07)" }}>폴더 변경</button>
                </div>
              </div>
              {files.length === 0 ? (
                <div className="text-center py-12 text-sm" style={{ color: "#334155" }}>.md / .txt 파일이 없습니다</div>
              ) : (
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.05)" }}>
                  {files.map((f) => (
                    <div
                      key={f.path}
                      className="flex items-center gap-3 px-4 py-2.5"
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        background: f.status === "processing" ? "rgba(139,92,246,0.05)" : f.status === "done" ? "rgba(52,211,153,0.03)" : f.status === "error" ? "rgba(239,68,68,0.04)" : "transparent",
                      }}
                    >
                      <StatusIcon status={f.status} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate" style={{ color: "#cbd5e1" }}>{f.name}</div>
                        {f.path !== f.name && <div className="text-[10px] truncate" style={{ color: "#334155" }}>{f.path}</div>}
                      </div>
                      {f.status === "error" && f.error && <span className="text-[10px] shrink-0" style={{ color: "#f87171" }}>{f.error}</span>}
                    </div>
                  ))}
                </div>
              )}
              {!done && files.length > 0 && (
                <button
                  onClick={startIngest}
                  disabled={running}
                  className="w-full py-3 rounded-xl text-sm font-semibold transition-all"
                  style={running
                    ? { background: "rgba(255,255,255,0.03)", color: "#334155", border: "1px solid rgba(255,255,255,0.05)" }
                    : { background: "linear-gradient(135deg, rgba(109,40,217,0.6) 0%, rgba(79,70,229,0.6) 100%)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.35)", boxShadow: "0 0 20px rgba(109,40,217,0.15)" }
                  }
                >
                  {running ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 size={14} className="animate-spin" />
                      인제스트 중…
                    </span>
                  ) : `위키로 변환 (${files.length}개)`}
                </button>
              )}
              {done && (
                <div className="text-center py-4 rounded-xl text-sm" style={{ background: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.15)", color: "#34d399" }}>
                  완료! <span style={{ color: "#64748b" }}>wiki/concepts/ 와 wiki/sources/ 를 확인하세요.</span>
                </div>
              )}
            </div>
          )}
        </main>
      )}

      {/* 그래프 탭 */}
      {activeTab === "graph" && (
        <div className="flex-1 flex overflow-hidden">
          {/* 그래프 캔버스 */}
          <div ref={graphContainerRef} className="flex-1 relative overflow-hidden">
            {graphLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 size={28} className="animate-spin" style={{ color: "#a78bfa" }} />
                  <span className="text-sm" style={{ color: "#475569" }}>그래프 로딩 중…</span>
                </div>
              </div>
            )}
            {graphError && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="px-6 py-4 rounded-2xl text-sm text-center" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
                  <p className="font-semibold mb-1">그래프 로드 실패</p>
                  <p style={{ color: "#94a3b8" }}>{graphError}</p>
                  <button onClick={() => { setGraphData(null); setGraphError(null); }} className="mt-3 text-xs px-4 py-1.5 rounded-full" style={{ border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}>재시도</button>
                </div>
              </div>
            )}
            {graphData && graphData.nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-center">
                  <Network size={40} style={{ color: "#1e293b" }} />
                  <p className="text-sm" style={{ color: "#475569" }}>아직 위키에 데이터가 없습니다</p>
                  <p className="text-xs" style={{ color: "#334155" }}>폴더 탭에서 파일을 인제스트한 후 돌아오세요</p>
                </div>
              </div>
            )}
            {graphData && graphData.nodes.length > 0 && (
              <>
                {/* 통계 */}
                <div className="absolute top-4 left-4 z-10 px-3 py-2 rounded-xl text-xs flex items-center gap-3"
                  style={{ background: "rgba(5,7,20,0.8)", border: "1px solid rgba(99,60,220,0.18)", backdropFilter: "blur(12px)" }}>
                  <span style={{ color: "#a78bfa" }}>{conceptCount}개 개념</span>
                  <span style={{ color: "#334155" }}>·</span>
                  <span style={{ color: "#475569" }}>{linkCount}개 연결</span>
                </div>

                {/* 검색 + 조작 버튼 */}
                <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
                  {/* 검색창 */}
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                    style={{ background: "rgba(5,7,20,0.85)", border: "1px solid rgba(99,60,220,0.22)", backdropFilter: "blur(12px)" }}>
                    <Search size={11} style={{ color: "#475569", flexShrink: 0 }} />
                    <input
                      type="text"
                      placeholder="노드 검색…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-transparent outline-none text-xs w-28"
                      style={{ color: "#cbd5e1", caretColor: "#a78bfa" }}
                    />
                    {searchQuery && (
                      <button onClick={() => setSearchQuery("")} style={{ color: "#475569", lineHeight: 1 }}>×</button>
                    )}
                  </div>

                  {/* 동기화 */}
                  <button
                    onClick={() => { setGraphData(null); setSearchQuery(""); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
                    style={{ background: "rgba(5,7,20,0.8)", border: "1px solid rgba(99,60,220,0.18)", backdropFilter: "blur(12px)", color: "#64748b" }}
                  >
                    <RefreshCw size={11} />
                    동기화
                  </button>

                  {/* 전체 보기 */}
                  <button
                    onClick={handleFitView}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
                    style={{ background: "rgba(5,7,20,0.8)", border: "1px solid rgba(99,60,220,0.18)", backdropFilter: "blur(12px)", color: "#64748b" }}
                  >
                    <Maximize2 size={11} />
                    전체 보기
                  </button>
                </div>

                {/* 범례 */}
                <div className="absolute bottom-4 left-4 z-10 px-3 py-2.5 rounded-xl text-xs flex flex-col gap-2"
                  style={{ background: "rgba(5,7,20,0.8)", border: "1px solid rgba(99,60,220,0.15)", backdropFilter: "blur(12px)" }}>
                  <p className="text-[10px] font-semibold mb-0.5" style={{ color: "#334155" }}>클러스터</p>
                  {Array.from(new Set(graphData.nodes.filter(n => n.type === "concept").map(n => n.cluster))).sort().slice(0, 5).map((c) => (
                    <div key={c} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CLUSTER_COLORS[c % CLUSTER_COLORS.length] }} />
                      <span style={{ color: "#475569" }}>그룹 {c + 1}</span>
                    </div>
                  ))}
                </div>

                {/* 타임라인 슬라이더 */}
                {timelineDates.length > 1 && (
                  <div
                    className="absolute bottom-4 z-10 flex items-center gap-3 px-4 py-2 rounded-xl"
                    style={{
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "rgba(5,7,20,0.82)",
                      border: "1px solid rgba(99,60,220,0.2)",
                      backdropFilter: "blur(12px)",
                    }}
                  >
                    <Clock size={11} style={{ color: "#475569" }} />
                    <span className="text-[10px] shrink-0" style={{ color: "#334155" }}>
                      {timelineDates[0]}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={timelineDates.length}
                      value={timelineIdx}
                      onChange={(e) => setTimelineIdx(Number(e.target.value))}
                      style={{ width: "160px", accentColor: "#8b5cf6", cursor: "pointer" }}
                    />
                    <span className="text-[10px] shrink-0" style={{ color: "#334155" }}>
                      {timelineDates[timelineDates.length - 1]}
                    </span>
                    <span
                      className="text-[10px] shrink-0 min-w-[72px] text-center px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(109,40,217,0.18)", color: "#a78bfa" }}
                    >
                      {timelineIdx === 0
                        ? "없음"
                        : timelineIdx === timelineDates.length
                        ? "전체"
                        : `≤ ${timelineDates[timelineIdx - 1]}`}
                    </span>
                  </div>
                )}

                <svg ref={svgRef} className="absolute inset-0" style={{ cursor: "grab" }} />
              </>
            )}
          </div>

          {/* 사이드 패널 */}
          {selectedNode && (
            <div className="w-80 shrink-0 flex flex-col overflow-hidden"
              style={{ borderLeft: "1px solid rgba(99,60,220,0.15)", background: "rgba(4,6,18,0.97)", backdropFilter: "blur(20px)" }}>
              {/* 헤더 */}
              <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3"
                style={{ borderBottom: "1px solid rgba(99,60,220,0.1)" }}>
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 mt-[3px]"
                    style={{
                      background: selectedNode.type === "source" ? "#475569" : CLUSTER_COLORS[selectedNode.cluster % CLUSTER_COLORS.length],
                      boxShadow: selectedNode.type !== "source" ? `0 0 8px ${CLUSTER_COLORS[selectedNode.cluster % CLUSTER_COLORS.length]}88` : "none",
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold leading-snug break-words" style={{ color: "#e2e8f0" }}>
                      {formatNodeTitle(selectedNode.title || selectedNode.id)}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[10px]" style={{ color: "#475569" }}>
                        {selectedNode.type === "concept" ? "개념" : "소스"}
                      </span>
                      {selectedNode.type === "concept" && (
                        <span className="text-[10px]" style={{ color: "#334155" }}>그룹 {selectedNode.cluster + 1}</span>
                      )}
                      {connectedCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                          style={{ background: "rgba(109,40,217,0.2)", color: "#a78bfa" }}>
                          {connectedCount}개 연결
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full transition-colors hover:bg-white/5"
                  style={{ color: "#475569", fontSize: "16px" }}
                >
                  ×
                </button>
              </div>

              {/* 태그 */}
              {selectedNode.tags.length > 0 && (
                <div className="px-5 py-2.5 flex flex-wrap gap-1.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  {selectedNode.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 rounded-full text-[10px]"
                      style={{ background: "rgba(109,40,217,0.12)", border: "1px solid rgba(109,40,217,0.25)", color: "#a78bfa" }}>
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* 본문 */}
              <div className="flex-1 overflow-y-auto px-5 py-4" style={{ minHeight: 0 }}>
                <ContentRenderer text={stripFrontmatter(selectedNode.preview || "")} />
              </div>

              {/* 연결된 개념 목록 */}
              {connectedNodes.length > 0 && (
                <div className="shrink-0" style={{ borderTop: "1px solid rgba(99,60,220,0.1)" }}>
                  <p className="px-5 pt-3 pb-1.5 text-[10px] font-semibold" style={{ color: "#334155" }}>
                    연결된 개념 ({connectedNodes.length})
                  </p>
                  <div className="overflow-y-auto" style={{ maxHeight: "140px" }}>
                    {connectedNodes.map((node) => (
                      <button
                        key={node.id}
                        onClick={() => handleConnectedNodeClick(node)}
                        className="w-full flex items-center gap-2.5 px-5 py-2 text-left transition-colors hover:bg-white/[0.03]"
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: CLUSTER_COLORS[node.cluster % CLUSTER_COLORS.length] }}
                        />
                        <span className="text-xs truncate" style={{ color: "#64748b" }}>
                          {formatNodeTitle(node.title || node.id)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 출처 문서 */}
              {sourceDocs.length > 0 && (
                <div className="shrink-0" style={{ borderTop: "1px solid rgba(99,60,220,0.08)" }}>
                  <p className="px-5 pt-3 pb-1.5 text-[10px] font-semibold" style={{ color: "#334155" }}>
                    출처 문서 ({sourceDocs.length})
                  </p>
                  <div className="overflow-y-auto" style={{ maxHeight: "100px" }}>
                    {sourceDocs.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-2.5 px-5 py-1.5">
                        <FileText size={10} style={{ color: "#334155", flexShrink: 0 }} />
                        <span className="text-[11px] truncate" style={{ color: "#475569" }}>
                          {formatNodeTitle(doc.title || doc.id)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 푸터 */}
              {selectedNode.parentId && (
                <div className="px-5 py-2.5 text-[10px] flex items-center gap-1.5"
                  style={{ borderTop: "1px solid rgba(99,60,220,0.08)", color: "#334155" }}>
                  <span>↑</span>
                  <span style={{ color: "#475569" }}>{formatNodeTitle(selectedNode.parentId)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: FileStatus }) {
  if (status === "done") return <CheckCircle2 size={14} style={{ color: "#34d399", flexShrink: 0 }} />;
  if (status === "error") return <XCircle size={14} style={{ color: "#f87171", flexShrink: 0 }} />;
  if (status === "processing") return <Loader2 size={14} style={{ color: "#a78bfa", flexShrink: 0 }} className="animate-spin" />;
  return <FileText size={14} style={{ color: "#334155", flexShrink: 0 }} />;
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs transition-all"
      style={active
        ? { background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.35)", color: "#c4b5fd" }
        : { background: "transparent", border: "1px solid transparent", color: "#475569" }
      }
    >
      {icon}
      {label}
    </button>
  );
}
