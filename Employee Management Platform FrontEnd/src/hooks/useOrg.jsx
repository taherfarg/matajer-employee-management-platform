import { createContext, useContext, useMemo } from 'react'
import { useResource } from './useResource.js'
import { fetchDepartments, fetchEntities } from '../api/endpoints.js'

const OrgContext = createContext({ entities: [], departments: [], getEntity: () => null, loading: false })

/**
 * Legal entities and departments are needed by almost every screen - for badges,
 * filters and forms - and they change rarely. Loading them once at the shell and
 * sharing them through context avoids every component refetching the same list.
 *
 * The lists are already scoped by the API: an HR admin pinned to one entity
 * receives only that entity, so entity filters are correct without any
 * client-side permission logic.
 */
export function OrgProvider({ children }) {
  const { data: entities, loading: entitiesLoading, reload: reloadEntities } = useResource(
    () => fetchEntities(),
    [],
  )
  const { data: departments, reload: reloadDepartments } = useResource(() => fetchDepartments(), [])

  const value = useMemo(() => {
    const list = entities ?? []
    const byId = new Map(list.map((entity) => [entity.id, entity]))
    return {
      entities: list,
      departments: departments ?? [],
      getEntity: (id) => byId.get(id) ?? null,
      loading: entitiesLoading,
      reload: () => {
        reloadEntities()
        reloadDepartments()
      },
    }
  }, [entities, departments, entitiesLoading, reloadEntities, reloadDepartments])

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}

export function useOrg() {
  return useContext(OrgContext)
}
