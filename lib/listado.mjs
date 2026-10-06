// Lista de todos los pedidos (más nuevos primero)
import { getStore } from "@netlify/blobs";
export async function todosLosPedidos() {
  const store = getStore("pedidos");
  const { blobs } = await store.list();
  const all = await Promise.all(blobs.map(b => store.get(b.key, { type: "json" })));
  return all.filter(Boolean).sort((a, b) => b.fecha.localeCompare(a.fecha));
}
