"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Billboard } from "@react-three/drei";
import * as THREE from "three";
import type { AgentDef, AgentStatus } from "@/lib/agents";

type Props = {
  agent: AgentDef;
  position: [number, number, number];
  status: AgentStatus;
};

export default function AgentPlaceholder({ agent, position, status }: Props) {
  const meshRef = useRef<THREE.Mesh>(null);
  const isActive = status === "active";
  const isDone = status === "done";

  const hex = agent.color;
  const color = new THREE.Color(hex);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    if (isActive) {
      meshRef.current.rotation.y += delta * 1.2;
      const s = 1 + Math.sin(Date.now() * 0.003) * 0.06;
      meshRef.current.scale.setScalar(s);
    } else {
      meshRef.current.rotation.y += delta * 0.2;
      meshRef.current.scale.setScalar(1);
    }
  });

  return (
    <group position={position}>
      {/* glow point light for active agents */}
      {isActive && (
        <pointLight
          color={hex}
          intensity={3}
          distance={3}
          decay={2}
        />
      )}

      {/* agent body — box for idle/done, icosahedron for active */}
      <mesh ref={meshRef} castShadow>
        {isActive ? (
          <icosahedronGeometry args={[0.35, 1]} />
        ) : (
          <boxGeometry args={[0.5, 0.5, 0.5]} />
        )}
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isActive ? 0.6 : isDone ? 0.25 : 0.08}
          roughness={0.3}
          metalness={0.6}
          transparent
          opacity={status === "disabled" ? 0.25 : 1}
          wireframe={isActive}
        />
      </mesh>

      {/* base ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.3, 0]} receiveShadow>
        <ringGeometry args={[0.28, 0.38, 32]} />
        <meshBasicMaterial
          color={hex}
          transparent
          opacity={isActive ? 0.6 : 0.15}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* name label */}
      <Billboard follow lockX={false} lockY lockZ={false}>
        <Html
          position={[0, 0.75, 0]}
          center
          distanceFactor={6}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          <div
            style={{
              background: "rgba(5,7,20,0.85)",
              border: `1px solid ${hex}${isActive ? "90" : "30"}`,
              borderRadius: 6,
              padding: "2px 7px",
              whiteSpace: "nowrap",
              backdropFilter: "blur(4px)",
              boxShadow: isActive ? `0 0 8px ${agent.glow}` : "none",
            }}
          >
            <span
              style={{
                color: isActive ? hex : isDone ? `${hex}bb` : "#94a3b8",
                fontSize: 11,
                fontWeight: 600,
                fontFamily: "system-ui, sans-serif",
                letterSpacing: "0.04em",
              }}
            >
              {agent.name}
            </span>
          </div>
        </Html>
      </Billboard>
    </group>
  );
}
