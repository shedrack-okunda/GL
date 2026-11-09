import { get, set, del, createStore } from 'idb-keyval'

// Tiny IndexedDB key-value store: survives reloads, offline restarts and app updates.
const store = createStore('guardlog', 'kv')

export const kv = {
  get: <T>(key: string) => get<T>(key, store),
  set: <T>(key: string, value: T) => set(key, value, store),
  del: (key: string) => del(key, store),
}
