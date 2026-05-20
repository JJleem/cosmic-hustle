"use client";

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Environment, Stars } from "@react-three/drei";
import { AGENTS } from "@/lib/agents";
import { useAgentStore } from "@/lib/stores/agentStore";
import AgentPlaceholder from "./AgentPlaceholder";

function buildPositions(count: number): [number, number, number][] {
  const cols = Math.ceil(count / 3);
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = (col - (cols - 1) / 2) * 2.2;
    const z = (row - 1) * 2.2;
    return [x, 0, z];
  });
}

function Scene() {
  const agentStatus = useAgentStore((s) => s.status);
  const positions = useMemo(() => buildPositions(AGENTS.length), []);

  return (
    <>
      {/* lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[8, 12, 6]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight position={[0, 8, 0]} intensity={0.6} color="#6366f1" />

      {/* stars */}
      <Stars radius={60} depth={30} count={800} factor={3} saturation={0} fade />

      {/* floor grid */}
      <Grid
        args={[30, 30]}
        cellSize={1}
        cellThickness={0.4}
        cellColor="#1e293b"
        sectionSize={5}
        sectionThickness={0.8}
        sectionColor="#334155"
        fadeDistance={20}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid
        position={[0, -0.31, 0]}
      />

      {/* floor plane for shadows */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.32, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#080c18" roughness={0.9} />
      </mesh>

      {/* agents */}
      {AGENTS.map((agent, i) => (
        <AgentPlaceholder
          key={agent.id}
          agent={agent}
          position={positions[i]}
          status={agentStatus[agent.id] ?? "idle"}
        />
      ))}

      {/* camera controls */}
      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        minDistance={3}
        maxDistance={25}
        maxPolarAngle={Math.PI / 2.1}
        target={[0, 0, 0]}
      />

      <Environment preset="night" />
    </>
  );
}

export default function OfficeScene() {
  return (
    <div style={{ width: "100%", height: "100%", background: "#080c18" }}>
      <Canvas
        shadows
        camera={{ position: [0, 8, 12], fov: 50 }}
        gl={{ antialias: true, alpha: false }}
        style={{ width: "100%", height: "100%" }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </div>
  );
}
