import { Request, Response, NextFunction } from "express";

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
    // TODO 1: calcula la duración en ms
    const duracion = performance.now() - inicio;
    
    // TODO 2: busca la estadística (créala si no existe)
    const clave = `${req.method} ${req.path}`;
    const est = porRuta.get(clave) ?? { peticiones: 0, totalMs: 0, maxMs: 0, lentas: 0 };
    
    // TODO 3: actualiza peticiones, totalMs, maxMs y lentas
    est.peticiones++;
    est.totalMs += duracion;
    if (duracion > est.maxMs) est.maxMs = duracion;
    if (duracion > UMBRAL_LENTA_MS) est.lentas++;
    
    porRuta.set(clave, est);
  });
  next(); // sin next(), la petición nunca llega a la ruta
}

export function resumenMetricas() {
  // TODO 4: devuelve el resumen
  const rutas = [...porRuta.entries()].map(([ruta, e]) => ({
    ruta,
    peticiones: e.peticiones,
    promedioMs: e.totalMs / e.peticiones,
    maxMs: e.maxMs,
    lentas: e.lentas
  }));

  return { umbralLentaMs: UMBRAL_LENTA_MS, rutas };
}