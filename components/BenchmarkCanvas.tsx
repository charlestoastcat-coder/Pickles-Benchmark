
import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';

export interface CanvasRef {
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
}

interface BenchmarkCanvasProps {
  width: number;
  height: number;
}

const BenchmarkCanvas = forwardRef<CanvasRef, BenchmarkCanvasProps>(({ width, height }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  // CRITICAL FIX: Use getters to ensure the parent always accesses the current values.
  // Previously, this returned null for ctx because the effect ran after the handle creation.
  useImperativeHandle(ref, () => ({
    get canvas() { return canvasRef.current; },
    get ctx() { return ctxRef.current; }
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      // Initialize context
      ctxRef.current = canvas.getContext('2d');
      if (!ctxRef.current) {
        console.error("Failed to get 2D rendering context for canvas.");
      }
    }
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="block w-full h-screen object-contain"
    ></canvas>
  );
});

export default BenchmarkCanvas;
