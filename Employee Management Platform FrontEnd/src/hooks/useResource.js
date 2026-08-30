import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Loads data from the API and exposes the three states every screen needs:
 * loading, error and data.
 *
 * Two details that matter:
 *
 *  - Responses are tagged with a request sequence number, so a slow earlier
 *    request can never overwrite a newer one. Without it, typing quickly in the
 *    directory search box can leave stale results on screen.
 *  - `refreshing` is separate from `loading`, so a background reload after a
 *    mutation does not blank out a table the user is already reading.
 *
 * @param loader   async function returning the data
 * @param deps     dependency list; the loader re-runs when these change
 * @param options  { enabled } - skip fetching until a prerequisite exists
 */
export function useResource(loader, deps = [], options = {}) {
  const { enabled = true } = options

  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(enabled)
  const [refreshing, setRefreshing] = useState(false)

  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const sequenceRef = useRef(0)
  const mountedRef = useRef(true)
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const run = useCallback(async () => {
    if (!enabled) {
      setLoading(false)
      return
    }

    const sequence = sequenceRef.current + 1
    sequenceRef.current = sequence

    if (hasLoadedRef.current) setRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      const result = await loaderRef.current()
      // Ignore anything that is no longer the newest request.
      if (!mountedRef.current || sequence !== sequenceRef.current) return
      setData(result)
      hasLoadedRef.current = true
    } catch (caught) {
      if (!mountedRef.current || sequence !== sequenceRef.current) return
      setError(caught)
    } finally {
      if (mountedRef.current && sequence === sequenceRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [enabled])

  useEffect(() => {
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller-supplied deps
  }, [run, ...deps])

  return { data, error, loading, refreshing, reload: run, setData }
}

/** Debounces a rapidly changing value, used for the directory search input. */
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timeout)
  }, [value, delay])

  return debounced
}
