import { Worker } from "node:worker_threads";
import path from "node:path";
import os from "node:os";

const MAX_TRABAJADORES = Number(process.env.MAX_TRABAJADORES ?? os.availableParallelism());
const MAX_COLA = Number(process.env.MAX_COLA ?? MAX_TRABAJADORES * 2);

interface Trabajo {
    n: number;
    resolve: (primos: number) => void;
    reject: (error: Error) => void;
}

const cola: Trabajo[] = [];
let activos = 0;
let rechazadas = 0;

function despachar() {
    // Si ya llegamos al máximo de workers o no hay trabajo, salir
    if (activos >= MAX_TRABAJADORES || cola.length === 0) return;
    
    const trabajo = cola.shift();
    if (!trabajo) return;

    activos++;
    const archivo = path.join(__dirname, "worker-reporte.js");
    const w = new Worker(archivo, { workerData: { n: trabajo.n } });

    w.once("message", (primos: number) => {
        trabajo.resolve(primos);
        w.terminate();
        activos--;
        despachar(); // Revisamos la cola por si hay más
    });

    w.once("error", (err: Error) => {
        trabajo.reject(err);
        w.terminate();
        activos--;
        despachar();
    });
}

export function contarPrimosEnPool(n: number): Promise<number> {
    return new Promise((resolve, reject) => {
        if (cola.length >= MAX_COLA) {
            rechazadas++;
            const error = new Error("Pool lleno");
            error.name = "PoolLleno";
            return reject(error);
        }
        cola.push({ n, resolve, reject });
        despachar();
    });
}

export function estadoPool() {
    return { maxTrabajadores: MAX_TRABAJADORES, activos, enCola: cola.length, maxCola: MAX_COLA, rechazadas };
}