import express, {Request, Response} from "express";
import { error } from "node:console";
import { randomUUID } from "node:crypto"; //Para valores aleatorios

const PORT= Number (process.env.PORT??3000);
const INVENTARIO_URL= process.env.INVENTARIO_URL ?? "http://localhost:3001";
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 2000);

interface Pedido {
    id: string;
    sku: string;
    cantidad: number;
    creadoEn: string;
}

const pedidos: Pedido []=[];
const app= express();
app.use(express.json());

app.get("/health",(_req: Request, res: Response)=>{
    res.json({status:"ok", servicio: "pedidos"});
});

app.get("/health/ready", async (_req: Request, res: Response)=>{
    const inicio = performance.now();
    try{
        const r = await fetch(`${INVENTARIO_URL}/health`,{signal: AbortSignal.timeout(1000)});
        const ms = Math.round(performance.now() - inicio);
        if(!r.ok){
            res.status(503).json({status:"no-listo", inventario:"respondió HTTP "+r.status, ms});
            return;
        }
        res.json({status:"listo", inventario:"ok", ms});
    }catch(error){
        const ms = Math.round(performance.now() - inicio);
        const e = error as Error & {cause?: {code?: string}};
        const motivo = e.name === "TimeoutError"
            ? "timeout: no contestó en 1000ms"
            : "no se pudo conectar ("+(e.cause?.code ?? e.message)+")";
        res.status(503).json({status:"no-listo", inventario: motivo, ms});
    }
});

app.get("/pedidos",(_req: Request, res: Response)=>{
    res.json(pedidos);
});

app.post("/pedidos", async(req:Request, res:Response)=>{
    const {sku, cantidad} = req.body??{};
    if(typeof sku !== "string" || typeof cantidad !== "number" || cantidad <=0){
        res.status(400).json ({error: " tipos de datos incorrectos o cantidad negativa"});
        return;
    }
    const inicio = performance.now(); // pa tomar el tiempo de inicio

    try{
        const r= await fetch(`${INVENTARIO_URL}/stock/${encodeURIComponent(sku)}/reservar`,{
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({cantidad}),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if(r.status===404){
            res.status(404).json({error: "sku no existe en inventario"});
            return;
        };
        if(r.status===409){
            const detalle = await r.json().catch(()=>null);
            res.status(409).json({error: "stock insuficiente", detalle});
            return;
        };
        if(!r.ok){
            const detalle = await r.json().catch(()=>null);
            res.status(r.status).json({error: "inventario rechazó la reserva", detalle});
            return;
        };
        const pedido: Pedido = {id: randomUUID(), sku, cantidad, creadoEn: new Date().toISOString()};
        pedidos.push(pedido);
        res.status(201).json(pedido);
    } catch(error){
        const duracionMS= Math.round( performance.now() - inicio);
        const e = error as Error & { cause?: {code?: string}};
        const motivo = e.name=== "TimeOutError" ? "Inventario no contestó en "+ TIMEOUT_MS+"ms": " NO SE PUDO CONECTAR CON INVENTARIO"+ (e.cause);
        console.error (pedidos +" "+motivo);
        res.status(503).json({error: "inventario no disponible "+motivo, duracionMS});
    }
})

app.listen(PORT,()=>{
    console.log("servicio depedidos escuchando en el puerto: "+PORT+" inventario: "+INVENTARIO_URL+" timeout: "+TIMEOUT_MS+"ms")
});