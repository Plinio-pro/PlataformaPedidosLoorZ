# Bitácora · Arquitecturas y procesos · Plinio Loor

## Entorno
| Dato | Valor |
| --- | --- |
| Laptop (CPU, RAM) | [Escribe tu CPU y RAM aquí] |
| nucleos según /metricas | 12 |
| MAX_TRABAJADORES y MAX_COLA | 12 y 24 |
| Duración de un reporte con n=2000000 | [Escribe el tiempo base, ej: 300ms] |

## 1. Resultados
| Escenario | Latencia 50 % | Latencia máx. | Respuestas 2xx | Respuestas 503 | Timeouts | bucle.maxMs |
| --- | --- | --- | --- | --- | --- | --- |
| 1 · bloqueo (/health) | [Dato de autocannon] | 1763 ms | 65613 | 0 | [Dato de autocannon] | 1775 ms |
| 2 · worker sin límite | [Dato de autocannon] | 598.8 ms | 2406 | 0 | [Dato de autocannon] | 141 ms |
| 3 · pool con límite | [Dato de autocannon] | 525.2 ms | 2057 | 17800 | [Dato de autocannon] | 81 ms |

*(Nota: En el escenario 3, las respuestas 2xx se dedujeron restando las 17,800 rechazadas de las 19,857 peticiones procesadas en total).*

### Salidas de /metricas

**Escenario 1 (Bloqueo):**
```json
{
    "umbralLentaMs": 1000,
    "rutas": [
        {
            "ruta": "GET /health",
            "peticiones": 65613,
            "promedioMs": 0.11676844567389529,
            "maxMs": 5.037386999989394,
            "lentas": 0
        },
        {
            "ruta": "GET /favicon.ico",
            "peticiones": 1,
            "promedioMs": 1.7566810000007536,
            "maxMs": 1.7566810000007536,
            "lentas": 0
        },
        {
            "ruta": "GET /metricas",
            "peticiones": 1,
            "promedioMs": 2.1102799999935087,
            "maxMs": 2.1102799999935087,
            "lentas": 0
        },
        {
            "ruta": "GET /reporte/bloqueante",
            "peticiones": 3,
            "promedioMs": 1742.3236990000198,
            "maxMs": 1763.7094050000305,
            "lentas": 3
        }
    ],
    "bucle": {
        "p50Ms": 10,
        "p99Ms": 11,
        "maxMs": 1775
    },
    "nucleos": 12,
    "pool": {
        "maxTrabajadores": 12,
        "activos": 0,
        "enCola": 0,
        "maxCola": 24,
        "rechazadas": 0
    }
}

**Escenario 2 (Worker sin límite):**
{
    "umbralLentaMs": 1000,
    "rutas": [
        {
            "ruta": "GET /reporte/worker",
            "peticiones": 2406,
            "promedioMs": 367.721823697007,
            "maxMs": 598.8104180000009,
            "lentas": 0
        }
    ],
    "bucle": {
        "p50Ms": 10,
        "p99Ms": 66,
        "maxMs": 141
    },
    "nucleos": 12,
    "pool": {
        "maxTrabajadores": 12,
        "activos": 0,
        "enCola": 0,
        "maxCola": 24,
        "rechazadas": 0
    }
}

**Escenario 3 (Pool con límite)**
{
    "umbralLentaMs": 1000,
    "rutas": [
        {
            "ruta": "GET /reporte/pool",
            "peticiones": 19857,
            "promedioMs": 35.89732530059943,
            "maxMs": 525.2491059999993,
            "lentas": 0
        }
    ],
    "bucle": {
        "p50Ms": 10,
        "p99Ms": 38,
        "maxMs": 81
    },
    "nucleos": 12,
    "pool": {
        "maxTrabajadores": 12,
        "activos": 0,
        "enCola": 0,
        "maxCola": 24,
        "rechazadas": 17800
    }
}
2. Análisis
1. En el escenario 1, ¿qué valor tuvo bucle.maxMs y cuál fue el maxMs de GET /health en rutas? ¿Por qué uno ve el bloqueo y el otro no?
El valor de bucle.maxMs fue 1775 ms, mientras que el maxMs de /health en rutas fue de 5.03 ms. perf_hooks (el monitor del bucle) detecta el bloqueo porque su medición opera a nivel de sistema operativo y registra el tiempo real que el hilo de Node estuvo congelado por las tareas síncronas. En contraste, el interceptor de Express usa performance.now() justo cuando el middleware se ejecuta, lo cual solo ocurre cuando el bucle ya se liberó e ignora toda la larga espera de la petición en la red.

2. En el escenario 2, ¿cuántas peticiones se completaron y cuántas terminaron en timeout? Si un reporte solo tarda menos de un segundo, ¿por qué con 50 a la vez pasa eso?
Se completaron 2406 peticiones (completar timeouts con dato de autocannon). Si bien un reporte es rápido, al enviar 50 peticiones simultáneas, el servidor levanta 50 hilos OS sin ningún límite. Esto obliga a la CPU a realizar un masivo y constante context switching para intentar intercalar y atender a todos los hilos a la vez. Ninguno recibe tiempo continuo de procesamiento, lo que dilata el tiempo de resolución para todos, provocando que venzan los timeouts del cliente antes de terminar la tarea.

3. En el escenario 3, ¿cuántas respuestas fueron 2xx y cuántas 503? Para el cliente, ¿qué diferencia hay entre un 503 inmediato con Retry-After y un timeout? Usa los modelos de fallo.
Las respuestas 2xx procesadas fueron 2057 y las respuestas 503 rechazadas fueron 17800. Un 503 inmediato es un modelo de fallo Fail-Fast (o Load Shedding): el servidor rechaza peticiones que no puede manejar para proteger sus recursos y el cliente puede abortar enseguida. Por el contrario, un timeout es un modelo incierto de Fail-Stop: el cliente no recibe confirmación rápida, gastando sockets en un estado de espera y sin saber si el servidor falló, procesa lento, o el mensaje de retorno se perdió.

4. autocannon ignora Retry-After y reintenta enseguida. ¿Qué efecto tuvo eso en el servidor y qué debería hacer un cliente bien diseñado?
El efecto inmediato de ignorar la cabecera fue bombardear al servidor con tráfico inútil, disparando en milisegundos las peticiones rechazadas del pool a 17800 intentos descartados. Un cliente bien diseñado debe aplicar el mecanismo de Backoff Exponencial con Jitter, respetando los segundos impuestos por el Retry-After para dar oxígeno al servidor y permitir que sus workers drenen los reportes que actualmente están en cola.

5. Las métricas y la cola viven en la memoria del proceso. Con 3 réplicas de Pedidos detrás de un balanceador, ¿qué mostraría /metricas y cuántos reportes simultáneos habría en total? ¿Qué cambiarías?
Si existen 3 réplicas detrás del balanceador, /metricas únicamente mostraría el mapa de memoria (porRuta y estadoPool) de la instancia específica que fue consultada, ignorando las otras dos. En cuanto a concurrencia, habría hasta 36 reportes simultáneos en el clúster entero (12 trabajadores activos * 3). Para unificar esto, cambiaría la cola local a un sistema de mensajería distribuido externo (como RabbitMQ o Redis), y utilizaría Prometheus con Grafana para raspar métricas centralizadas.

3. Problemas encontrados
Ninguno relevante durante la ejecución.

4. Uso declarado de IA
Utilicé asistencia de IA para modelar el despachador de workers limitados en el archivo pool.ts y para contrastar mi comprensión sobre el Event Loop y perf_hooks al redactar el análisis técnico.