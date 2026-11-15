import { Request, Response, NextFunction } from "express";
import { monitorEventLoopDelay } from "node:perf_hooks";
import os from "node:os";

// Monitor del Bucle de Eventos
const retardoBucle = monitorEventLoopDelay({ resolution: 10 });
retardoBucle.enable();

const UMBRAL_LENTA_MS = Number(process.env.UMBRAL_LENTA_MS ?? 1000);

interface Estadistica {
  peticiones: number;
  totalMs: number;
  maxMs: number;
  lentas: number;
}

const porRuta = new Map<string, Estadistica>();

export function medirLatencia(req: Request, res: Response, next: NextFunction): void {
  const inicio = performance.now();
  res.on("finish", () => {
    const duracion = performance.now() - inicio;
    const clave = `${req.method} ${req.path}`;
    const est = porRuta.get(clave) ?? { peticiones: 0, totalMs: 0, maxMs: 0, lentas: 0 };
    
    est.peticiones++;
    est.totalMs += duracion;
    if (duracion > est.maxMs) est.maxMs = duracion;
    if (duracion > UMBRAL_LENTA_MS) est.lentas++;
    
    porRuta.set(clave, est);
  });
  next();
}

export function resumenMetricas() {
  const rutas = [...porRuta.entries()].map(([ruta, e]) => ({
    ruta,
    peticiones: e.peticiones,
    promedioMs: e.totalMs / e.peticiones,
    maxMs: e.maxMs,
    lentas: e.lentas
  }));

  // Extraemos las métricas del Event Loop convirtiendo de nanosegundos a ms
  const p50Ms = Math.round(retardoBucle.percentile(50) / 1e6);
  const p99Ms = Math.round(retardoBucle.percentile(99) / 1e6);
  const maxMs = Math.round(retardoBucle.max / 1e6);

  return {
    umbralLentaMs: UMBRAL_LENTA_MS,
    rutas,
    bucle: { p50Ms, p99Ms, maxMs },
    nucleos: os.availableParallelism()
  };
}