'use client';

import { cn } from '@/lib/utils';
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface DottedSurfaceProps extends Omit<React.ComponentProps<'div'>, 'ref'> {
	/** Dot color as [r, g, b] 0-255. Default: [200, 200, 200] (light dots for dark bg) */
	dotColor?: [number, number, number];
	/** Dot opacity 0-1. Default: 0.6 */
	dotOpacity?: number;
}

export function DottedSurface({
	className,
	children,
	dotColor = [200, 200, 200],
	dotOpacity = 0.6,
	...props
}: DottedSurfaceProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const sceneRef = useRef<{
		scene: THREE.Scene;
		camera: THREE.PerspectiveCamera;
		renderer: THREE.WebGLRenderer;
		animationId: number;
	} | null>(null);

	useEffect(() => {
		if (!containerRef.current) return;

		const SEPARATION = 150;
		const AMOUNTX = 40;
		const AMOUNTY = 60;

		const scene = new THREE.Scene();

		const camera = new THREE.PerspectiveCamera(
			60,
			window.innerWidth / window.innerHeight,
			1,
			10000,
		);
		camera.position.set(0, 355, 1220);

		const renderer = new THREE.WebGLRenderer({
			alpha: true,
			antialias: true,
		});
		renderer.setPixelRatio(window.devicePixelRatio);
		renderer.setSize(window.innerWidth, window.innerHeight);
		renderer.setClearColor(0x000000, 0);

		containerRef.current.appendChild(renderer.domElement);

		const positions: number[] = [];
		const colors: number[] = [];
		const geometry = new THREE.BufferGeometry();

		for (let ix = 0; ix < AMOUNTX; ix++) {
			for (let iy = 0; iy < AMOUNTY; iy++) {
				const x = ix * SEPARATION - (AMOUNTX * SEPARATION) / 2;
				const z = iy * SEPARATION - (AMOUNTY * SEPARATION) / 2;
				positions.push(x, 0, z);
				colors.push(dotColor[0], dotColor[1], dotColor[2]);
			}
		}

		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

		const material = new THREE.PointsMaterial({
			size: 8,
			vertexColors: true,
			transparent: true,
			opacity: dotOpacity,
			sizeAttenuation: true,
		});

		const points = new THREE.Points(geometry, material);
		scene.add(points);

		let count = 0;
		let animationId: number = 0;

		const animate = () => {
			animationId = requestAnimationFrame(animate);
			const posAttr = geometry.attributes.position;
			const arr = posAttr.array as Float32Array;

			let i = 0;
			for (let ix = 0; ix < AMOUNTX; ix++) {
				for (let iy = 0; iy < AMOUNTY; iy++) {
					arr[i * 3 + 1] =
						Math.sin((ix + count) * 0.3) * 50 +
						Math.sin((iy + count) * 0.5) * 50;
					i++;
				}
			}
			posAttr.needsUpdate = true;
			renderer.render(scene, camera);
			count += 0.1;
		};

		const handleResize = () => {
			camera.aspect = window.innerWidth / window.innerHeight;
			camera.updateProjectionMatrix();
			renderer.setSize(window.innerWidth, window.innerHeight);
		};
		window.addEventListener('resize', handleResize);
		animate();

		sceneRef.current = { scene, camera, renderer, animationId };

		return () => {
			window.removeEventListener('resize', handleResize);
			if (sceneRef.current) {
				cancelAnimationFrame(sceneRef.current.animationId);
				sceneRef.current.scene.traverse((object) => {
					if (object instanceof THREE.Points) {
						object.geometry.dispose();
						if (Array.isArray(object.material)) {
							object.material.forEach((m) => m.dispose());
						} else {
							object.material.dispose();
						}
					}
				});
				sceneRef.current.renderer.dispose();
				if (containerRef.current && sceneRef.current.renderer.domElement) {
					containerRef.current.removeChild(sceneRef.current.renderer.domElement);
				}
			}
		};
	}, [dotColor, dotOpacity]);

	return (
		<div className={cn('pointer-events-none fixed inset-0 -z-10', className)} {...props}>
			<div ref={containerRef} className="h-full w-full" />
			{children}
		</div>
	);
}
